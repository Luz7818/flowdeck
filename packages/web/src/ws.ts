import { Plan } from '@flowdeck/core';

export type ConnState =
  | 'connecting'
  | 'connected'
  | 'done'
  | 'cancelled'
  | 'not-found'
  | 'error';

interface Handlers {
  onPlan: (plan: Plan) => void;
  onState: (state: ConnState) => void;
}

const TERMINAL: ConnState[] = ['done', 'cancelled'];
const MAX_BACKOFF_MS = 15_000;
const MAX_ATTEMPTS = 5;

/** WebSocket bridge between the canvas page and the FlowDeck MCP host process. */
export class CanvasClient {
  /** fires before each automatic reconnect (1-based attempt number) */
  onReconnecting?: (attempt: number) => void;
  private ws: WebSocket | null = null;
  private state: ConnState = 'connecting';
  /** set after the first init — later reconnects must not clobber local edits */
  private gotPlan = false;
  private sessionId: string | null = null;
  private retryTimer: number | null = null;
  private attempt = 0;

  constructor(private readonly handlers: Handlers) {}

  connect(sessionId: string): void {
    this.clearRetry();
    this.sessionId = sessionId;
    this.attempt = 0;
    this.open();
  }

  /** explicit user retry: reset the backoff ladder */
  retry(): void {
    if (this.sessionId) this.connect(this.sessionId);
  }

  confirm(plan: Plan): boolean {
    return this.send({ type: 'confirm', plan });
  }

  cancel(): boolean {
    return this.send({ type: 'cancel' });
  }

  private send(msg: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private open(): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }
    this.setAndNotify('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(
      `${proto}://${location.host}/ws?id=${encodeURIComponent(this.sessionId ?? '')}`,
    );
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.setAndNotify('connected');
    };
    ws.onmessage = (ev) => {
      let msg: { type?: string; plan?: Plan };
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.type === 'init' && msg.plan) {
        // a fresh page load has no plan yet; a history round-trip already has one — keep it
        if (this.gotPlan) return;
        this.gotPlan = true;
        this.handlers.onPlan(msg.plan);
        this.setAndNotify('connected');
      } else if (msg.type === 'confirmed') {
        this.setAndNotify('done');
      } else if (msg.type === 'cancelled') {
        this.setAndNotify('cancelled');
      }
    };
    ws.onclose = (ev) => {
      if (TERMINAL.includes(this.state)) return;
      if (ev.code === 4404) {
        // session gone on the host — reconnecting can never succeed
        this.setAndNotify('not-found');
        return;
      }
      this.setAndNotify('error');
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      if (!TERMINAL.includes(this.state)) this.setAndNotify('error');
    };
  }

  /** exponential backoff: 1s, 2s, 4s … capped; stops after MAX_ATTEMPTS so the
   * user gets the stable error banner + manual retry instead of endless churn */
  private scheduleReconnect(): void {
    if (!this.sessionId || this.attempt >= MAX_ATTEMPTS) return;
    this.clearRetry();
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    this.attempt += 1;
    this.retryTimer = window.setTimeout(() => {
      if (TERMINAL.includes(this.state)) return;
      this.onReconnecting?.(this.attempt);
      this.open();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private setAndNotify(state: ConnState): void {
    this.state = state;
    this.handlers.onState(state);
  }
}
