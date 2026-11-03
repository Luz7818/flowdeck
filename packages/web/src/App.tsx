import { useCallback, useEffect, useRef, useState } from 'react';
import { Plan } from '@flowdeck/core';
import { CanvasClient, ConnState } from './ws.js';
import { detectLang, getDict, Lang, saveLang } from './i18n.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { HistoryPage } from './components/HistoryPage.js';
import { FlowView } from './flow/FlowView.js';

function getSessionId(): string | null {
  const m = location.pathname.match(/^\/s\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(location.search).get('id');
}

export default function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const dict = getDict(lang);
  const [route, setRoute] = useState(location.hash);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [state, setState] = useState<ConnState>('connecting');
  const [waiting, setWaiting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [sendStalled, setSendStalled] = useState(false);
  const [hostVersion, setHostVersion] = useState<string | null>(null);
  /** header chips — the canvas (single editing surface) reports as it is edited */
  const [stats, setStats] = useState({ steps: 0, open: 0 });
  /** true after 确认方案 is pressed — plays the sequential confirmation wave */
  const [confirming, setConfirming] = useState(false);
  /** holds the canvas on screen so the wave finishes before the Splash lands */
  const [revealDone, setRevealDone] = useState(false);
  /** one-shot pulse when the last open question gets answered */
  const [ctaReady, setCtaReady] = useState(false);
  /** soft gate: first 确认方案 press with open questions arms a reminder instead of sending */
  const [confirmOpenArmed, setConfirmOpenArmed] = useState(false);
  const stallTimer = useRef<number | null>(null);
  const prevOpen = useRef<number | null>(null);
  const clientRef = useRef<CanvasClient | null>(null);
  const flowCommitRef = useRef<(() => Plan) | null>(null);
  const sessionId = useRef(getSessionId()).current;

  const registerCommit = useCallback((fn: (() => Plan) | null) => {
    flowCommitRef.current = fn;
  }, []);
  const onStats = useCallback((s: { steps: number; open: number }) => setStats(s), []);
  const onAutosave = useCallback((p: Plan) => {
    clientRef.current?.autosave(p);
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // keep the document chrome in step with the UI language and loaded plan
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);
  useEffect(() => {
    document.title = plan?.title ? `${plan.title} · FlowDeck` : 'FlowDeck';
  }, [plan?.title]);

  useEffect(() => {
    if (route === '#/history') return;
    if (!sessionId) {
      setState('not-found');
      return;
    }
    // reuse one client across route changes so local edits survive history round-trips
    if (!clientRef.current) {
      const client = new CanvasClient({ onPlan: setPlan, onState: setState });
      client.onReconnecting = (n) => setReconnectAttempt(n);
      clientRef.current = client;
    }
    clientRef.current.connect(sessionId);
  }, [sessionId, route]);

  // terminal states end any pending send-timeout; a healthy connection resets the ladder
  useEffect(() => {
    if (state === 'done' || state === 'cancelled') {
      if (stallTimer.current) clearTimeout(stallTimer.current);
      setSendStalled(false);
    }
    if (state === 'connected') setReconnectAttempt(0);
  }, [state]);

  // let the confirmation wave play out on the canvas before the Splash lands
  useEffect(() => {
    if (state !== 'done') {
      setRevealDone(false);
      return;
    }
    const t = window.setTimeout(() => setRevealDone(true), 950);
    return () => clearTimeout(t);
  }, [state]);

  // last open question answered → celebrate the "ready to confirm" moment once
  useEffect(() => {
    if (!plan) {
      prevOpen.current = null;
      return;
    }
    const prev = prevOpen.current;
    prevOpen.current = stats.open;
    if (prev !== null && prev > 0 && stats.open === 0) {
      setCtaReady(true);
      const t = window.setTimeout(() => setCtaReady(false), 1100);
      return () => clearTimeout(t);
    }
  }, [plan, stats.open]);

  // answering the last question also disarms the soft confirm gate
  useEffect(() => {
    if (stats.open === 0) setConfirmOpenArmed(false);
  }, [stats.open]);

  /* ---------- active-session switcher (header): the host may be holding several
     confirmations at once (parallel agent calls); /sessions lists them and this
     dropdown hops between their canvases. Poll keeps the count fresh as
     sessions settle or appear. ---------- */
  const [sessionCount, setSessionCount] = useState(1);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string }> | null>(null);
  const sessionSwitchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const load = () =>
      fetch('/sessions')
        .then((r) => r.json())
        .then((d: Record<string, { title?: string }>) => setSessionCount(Object.keys(d).length))
        .catch(() => {});
    load();
    const t = window.setInterval(load, 15000);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => {
    if (!sessionsOpen) return;
    fetch('/sessions')
      .then((r) => r.json())
      .then((d: Record<string, { title?: string }>) =>
        setSessions(Object.entries(d).map(([id, v]) => ({ id, title: v?.title ?? '(untitled)' }))),
      )
      .catch(() => setSessions([]));
    const onDown = (e: MouseEvent) => {
      if (sessionSwitchRef.current && !sessionSwitchRef.current.contains(e.target as globalThis.Node)) setSessionsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSessionsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [sessionsOpen]);

  const toggleLang = () =>
    setLang((l) => {
      const next = l === 'zh' ? 'en' : 'zh';
      saveLang(next);
      return next;
    });

  const onConfirm = () => {
    if (waiting) return;
    // footer popovers are mutually exclusive — arming the reminder closes the cancel one
    setConfirmCancel(false);
    // unanswered questions get one soft gate: sending is still allowed, the
    // reminder just makes the skipped decisions visible before they harden
    if (stats.open > 0 && !confirmOpenArmed) {
      setConfirmOpenArmed(true);
      return;
    }
    setConfirmOpenArmed(false);
    // the canvas owns the graph state — pull the linearized plan from it
    const base = flowCommitRef.current?.();
    if (!base) return;
    // collapsed is pure UI state — don't leak it into the plan the agent receives
    const cleaned: Plan = {
      ...base,
      modules: base.modules.map((m) => (m.type === 'group' ? { ...m, collapsed: undefined } : m)),
    };
    const sent = clientRef.current?.confirm(cleaned) ?? false;
    if (!sent) {
      setSendStalled(true);
      return;
    }
    setWaiting(true);
    setConfirming(true);
    stallTimer.current = window.setTimeout(() => setSendStalled(true), 10000);
  };
  const onCancel = () => {
    if (waiting) return;
    setConfirmOpenArmed(false);
    setConfirmCancel(true);
  };
  const doCancel = () => {
    setConfirmCancel(false);
    const sent = clientRef.current?.cancel() ?? false;
    if (!sent) {
      setSendStalled(true);
      return;
    }
    setWaiting(true);
  };

  /* cancel confirmation popover: Esc / click-outside dismisses */
  const cancelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirmCancel) return;
    const onDown = (e: MouseEvent) => {
      if (cancelRef.current && !cancelRef.current.contains(e.target as globalThis.Node)) setConfirmCancel(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmCancel(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [confirmCancel]);

  /* open-question reminder popover: Esc / click-outside disarms it */
  const confirmOpenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirmOpenArmed) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as globalThis.Node;
      if (confirmOpenRef.current && !confirmOpenRef.current.contains(t)) setConfirmOpenArmed(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmOpenArmed(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [confirmOpenArmed]);

  /* ---------- terminal / error states ---------- */
  if (state === 'not-found') {
    return <Splash title={dict.notFound} tone="muted" />;
  }
  if (state === 'done' && revealDone) {
    return <Splash title={dict.doneTitle} body={dict.doneBody} tone="ok" />;
  }
  if (state === 'cancelled') {
    return <Splash title={dict.cancelledTitle} body={dict.cancelledBody} tone="muted" />;
  }

  const showHistory = route === '#/history';

  return (
    <div className="relative h-full">
      {/* canvas stays mounted under the history overlay — its graph state is the
          only copy of the user's edits, unmounting would drop them */}
      <div className={`flex h-full flex-col ${showHistory ? 'invisible' : 'visible'}`}>
      {/* header */}
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/75">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3">
          <span
            aria-hidden
            title={dict.connecting}
            className={`h-2 w-2 shrink-0 rounded-full ${state === 'connected' ? 'bg-emerald-500' : state === 'error' ? 'bg-red-400' : 'bg-amber-400'}`}
          />
          {/* brand mark: four tiles as nodes, an X of wires through a center dot —
              the whole product in one 30×30 stamp */}
          <div className="hidden shrink-0 rounded-[10px] border border-zinc-200 bg-white p-1.5 shadow-card sm:block dark:border-zinc-700 dark:bg-zinc-900">
            <svg viewBox="0 0 30 30" className="h-7 w-7" aria-hidden>
              <rect x="2" y="2" width="12" height="12" rx="3.5" fill="#2563eb" />
              <rect x="16" y="2" width="12" height="12" rx="3.5" fill="#a855f7" />
              <rect x="2" y="16" width="12" height="12" rx="3.5" fill="#10b981" />
              <rect x="16" y="16" width="12" height="12" rx="3.5" fill="#f59e0b" />
              <path d="M9.4 9.4 20.6 20.6M20.6 9.4 9.4 20.6" stroke="rgb(255 255 255 / 0.9)" strokeWidth="1.6" />
              <circle cx="15" cy="15" r="2.6" fill="#fff" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight">
              {plan?.title ?? 'FlowDeck'}
            </div>
            <div className="text-2xs text-zinc-500 dark:text-zinc-400">
              {dict.tagline}
              {plan && ` · ${stats.steps} ${dict.step}${lang === 'zh' ? '' : 's'}`}
              {plan && stats.open > 0 && ` · ${stats.open} ${dict.question}`}
            </div>
          </div>
          <div className="relative shrink-0" ref={sessionSwitchRef}>
            {sessionCount > 1 && (
              <>
                <div
                  className={`fd-pop absolute right-0 top-[calc(100%+8px)] z-30 w-72 origin-top-right rounded-xl border border-zinc-200 bg-white p-1 shadow-overlay dark:border-zinc-700 dark:bg-zinc-900 ${sessionsOpen ? 'fd-pop-open' : ''}`}
                >
                  {sessions?.length ? (
                    sessions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSessionsOpen(false);
                          if (s.id !== sessionId) location.assign(`/s/${s.id}`);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${
                          s.id === sessionId ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.id === sessionId ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                        />
                        <span className="min-w-0 flex-1 truncate text-xs text-zinc-700 dark:text-zinc-200">{s.title}</span>
                        {s.id === sessionId && <span className="shrink-0 text-3xs text-zinc-400 dark:text-zinc-500">{dict.sessionsCurrent}</span>}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-2xs text-zinc-400 dark:text-zinc-500">{dict.sessionsEmpty}</p>
                  )}
                </div>
                <button
                  onClick={() => setSessionsOpen((v) => !v)}
                  aria-expanded={sessionsOpen}
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-2xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  {dict.sessions} · {sessionCount}
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => (location.hash = '#/history')}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-2xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            {dict.history}
          </button>
          <ThemeToggle dict={dict} />
          <button
            onClick={toggleLang}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-2xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            {dict.lang}
          </button>
        </div>
      </header>

      {/* connection banner — grid-rows shell so it glides in/out instead of
          shoving the layout around (same trick as the overview panel) */}
      <div
        className={`relative z-10 grid transition-[grid-template-rows] duration-300 ease-out-expo ${
          sendStalled || state === 'error' || (state === 'connecting' && reconnectAttempt > 0) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          {(sendStalled || state === 'error' || (state === 'connecting' && reconnectAttempt > 0)) && (
            <div className="flex items-center justify-center gap-3 border-b border-orange-200 bg-orange-50 px-5 py-1.5 text-xs text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
              {sendStalled ? (
                <>
                  <span>{dict.sendStalled}</span>
                  <button
                    onClick={() => {
                      setSendStalled(false);
                      clientRef.current?.retry();
                    }}
                    className="rounded-md border border-orange-300 bg-white px-2 py-0.5 text-2xs font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-transparent dark:text-orange-300 dark:hover:bg-orange-500/20"
                  >
                    {dict.retry}
                  </button>
                </>
              ) : state === 'error' ? (
                <>
                  <span>{dict.disconnected}</span>
                  <button
                    onClick={() => clientRef.current?.retry()}
                    className="rounded-md border border-orange-300 bg-white px-2 py-0.5 text-2xs font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-transparent dark:text-orange-300 dark:hover:bg-orange-500/20"
                  >
                    {dict.retry}
                  </button>
                </>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="fd-spin" aria-hidden />
                  {dict.reconnecting} · {reconnectAttempt}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* body — the canvas is the only editing surface */}
      <main className="relative flex-1">
        {plan ? (
          <FlowView
            plan={plan}
            dict={dict}
            lang={lang}
            hostVersion={hostVersion}
            confirming={confirming}
            registerCommit={registerCommit}
            onStats={onStats}
            onAutosave={onAutosave}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Splash inline title={dict.connecting} />
          </div>
        )}
      </main>

      {/* footer actions */}
      {plan && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-3 px-5 py-3">
            <div className="relative" ref={cancelRef}>
              <div
                className={`fd-pop absolute bottom-[calc(100%+10px)] right-0 w-60 origin-bottom-right rounded-xl border border-zinc-200 bg-white p-3 shadow-overlay dark:border-zinc-700 dark:bg-zinc-900 ${confirmCancel ? 'fd-pop-open' : ''}`}
              >
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">{dict.confirmCancelTitle}</p>
                <p className="mt-1 text-2xs leading-relaxed text-zinc-500 dark:text-zinc-400">{dict.confirmCancelBody}</p>
                <div className="mt-2.5 flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="rounded-md px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    {dict.confirmCancelNo}
                  </button>
                  <button
                    onClick={doCancel}
                    className="rounded-md bg-red-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600"
                  >
                    {dict.confirmCancelYes}
                  </button>
                </div>
              </div>
              <button
                onClick={onCancel}
                disabled={waiting}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-600 shadow-card hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                {dict.cancel}
              </button>
            </div>
            <div className="relative" ref={confirmOpenRef}>
              <div
                className={`fd-pop absolute bottom-[calc(100%+10px)] right-0 w-64 origin-bottom-right rounded-xl border border-amber-200 bg-white p-3 shadow-overlay dark:border-amber-500/30 dark:bg-zinc-900 ${confirmOpenArmed ? 'fd-pop-open' : ''}`}
              >
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">{dict.confirmOpenTitle}</p>
                <p className="mt-1 text-2xs leading-relaxed text-zinc-500 dark:text-zinc-400">{dict.confirmOpenBody}</p>
                <div className="mt-2.5 flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmOpenArmed(false)}
                    className="rounded-md px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    {dict.confirmOpenNo}
                  </button>
                  <button
                    onClick={onConfirm}
                    className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {dict.confirmOpenYes}
                  </button>
                </div>
              </div>
              <button
                onClick={onConfirm}
                disabled={waiting}
                className={`fd-cta flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white ${ctaReady ? 'fd-cta-ready' : ''}`}
              >
                {waiting ? (
                  <span className="fd-spin" aria-hidden />
                ) : (
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                    <path d="M14.2 1.8 7.3 8.8M14.2 1.8 9.9 14.2 7.3 8.8 1.8 6.3 14.2 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {stats.open > 0 ? `${dict.confirm} (${stats.open})` : dict.confirm}
              </button>
            </div>
          </div>
        </footer>
      )}
      </div>

      {/* history overlay: slides over the canvas instead of replacing it, so the
          canvas keeps its edits for the round-trip back */}
      {showHistory && (
        <div className="absolute inset-0 z-40 animate-slide-up overflow-y-auto bg-zinc-50 duration-300 dark:bg-zinc-950">
          <HistoryPage dict={dict} lang={lang} />
        </div>
      )}
    </div>
  );
}

function Splash({
  title,
  body,
  tone = 'muted',
  inline = false,
}: {
  title: string;
  body?: string;
  tone?: 'ok' | 'muted';
  inline?: boolean;
}) {
  const inner = (
    <div className={`text-center ${inline ? 'py-10 text-sm text-zinc-400' : ''}`}>
      {!inline && (
        <div className="mb-4 flex animate-slide-up justify-center">
          {tone === 'ok' ? (
            <div className="relative flex h-12 w-12 animate-pop-in items-center justify-center rounded-2xl bg-emerald-500 shadow-lift shadow-emerald-500/30">
              <span aria-hidden className="fd-ring-burst absolute inset-0 rounded-2xl border-2 border-emerald-400" />
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-white">
                <path
                  d="M5 12.5 10 17 19 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="24"
                  strokeDashoffset="24"
                  style={{ animation: 'check-draw 0.45s 0.15s var(--ease-out-expo) forwards' }}
                />
              </svg>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {[
                'bg-zinc-300 dark:bg-zinc-700',
                'bg-zinc-200 dark:bg-zinc-700',
                'bg-zinc-200 dark:bg-zinc-700',
                'bg-zinc-100 dark:bg-zinc-800',
              ].map((c, i) => (
                <span
                  key={i}
                  className={`h-4 w-4 animate-splash-pop rounded-md ${c}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {inline && (
        <div className="mb-3 grid grid-cols-2 justify-center gap-1">
          {['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500'].map((c, i) => (
            <span key={i} className={`h-2.5 w-2.5 animate-splash-pop rounded-[3px] ${c}`} style={{ animationDelay: `${i * 45}ms` }} />
          ))}
        </div>
      )}
      <p className={`animate-slide-up font-medium ${inline ? 'text-zinc-400 dark:text-zinc-500' : 'text-lg text-zinc-800 dark:text-zinc-100'}`}>{title}</p>
      {body && (
        <p className="mt-2 animate-slide-up text-sm text-zinc-500 dark:text-zinc-400 [animation-delay:80ms]">{body}</p>
      )}
    </div>
  );
  if (inline) return inner;
  return <div className="flex h-full items-center justify-center px-6">{inner}</div>;
}
