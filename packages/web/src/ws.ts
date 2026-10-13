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

/** WebSocket bridge between the canvas page and the FlowDeck MCP host process. */
export class CanvasClient {
  private ws: WebSocket | null = null;
  private state: ConnState = 'connecting';

  constructor(private readonly handlers: Handlers) {}

  connect(sessionId: string): void {
    this.setAndNotify('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(
      `${proto}://${location.host}/ws?id=${encodeURIComponent(sessionId)}`,
    );
    this.ws = ws;

    ws.onopen = () => this.setAndNotify('connected');
    ws.onmessage = (ev) => {
      let msg: { type?: string; plan?: Plan };
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.type === 'init' && msg.plan) {
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
      this.setAndNotify(ev.code === 4404 ? 'not-found' : 'error');
    };
    ws.onerror = () => {
      if (!TERMINAL.includes(this.state)) this.setAndNotify('error');
    };
  }

  confirm(plan: Plan): void {
    this.ws?.send(JSON.stringify({ type: 'confirm', plan }));
  }

  cancel(): void {
    this.ws?.send(JSON.stringify({ type: 'cancel' }));
  }

  private setAndNotify(state: ConnState): void {
    this.state = state;
    this.handlers.onState(state);
  }
}
