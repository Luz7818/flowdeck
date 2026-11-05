import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { normalizePlan, Plan, PlanModuleSchema } from '@flowdeck/core';
import { CanvasHost } from './canvas-server.js';

// single source of truth — never hardcode the version here again
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
) as { version: string };

const host = new CanvasHost();

// logging capability: Server.sendLoggingMessage drops notifications unless it
// is declared — it is what carries the canvas URL to the conversation side
// while the user decides on the canvas
const server = new McpServer(
  { name: 'flowdeck', version },
  { capabilities: { logging: {} } },
);

server.registerTool(
  'present_plan',
  {
    title: 'Present plan on FlowDeck canvas',
    description: [
      'Render a structured plan (task flow / framework proposal) as an interactive modular canvas in the browser,',
      'let the user drag-reorder steps, exclude steps, answer embedded question cards, adopt AI suggestions,',
      'and confirm. Returns JSON + Markdown summary automatically — never ask the user to copy anything.',
      '',
      '使用场景:在动手执行前需要向用户确认任务流程/方案时调用本工具,代替纯文本计划确认。',
      '返回的 Markdown 摘要是用户最终确认的版本(含被移除的步骤与问题答案),请严格按它执行。',
      '若返回 status=cancelled,请退回纯文本方式与用户确认。',
    ].join('\n'),
    inputSchema: {
      title: z.string().describe('Plan title / 计划标题'),
      modules: z
        .array(PlanModuleSchema)
        .describe(
          [
            'Ordered plan modules. Types:',
            '- step: {type:"step", title, detail?} one executable step',
            '- group: {type:"group", title, note?} lane header; steps after it belong to it until the next group',
            '- question: {type:"question", question, options:[...]} clarification shown as clickable option chips',
            '- suggestion: {type:"suggestion", title, detail?} alternative approach the user may adopt',
            '- risk: {type:"risk", note, level?: "info"|"warn"|"danger"} irreversible or risky operations',
            '- checkpoint: {type:"checkpoint", title, criteria?:[...]} acceptance criteria after related steps',
            '- resource: {type:"resource", label, kind?: "file"|"dir"|"service", path?} files/dirs/services involved',
          ].join('\n'),
        ),
    },
  },
  async ({ title, modules }, extra) => {
    const plan = normalizePlan({ title, modules: modules as Array<Record<string, unknown>> });
    // extra.signal aborts when the IDE cancels the call — end the canvas wait
    let canvasUrl: string | undefined;
    const result = await host.present(plan, {
      signal: extra.signal,
      // the wait is otherwise invisible in the IDE chat: push the URL to the
      // conversation side as a plain log message (no LLM involvement)
      onSession: (url) => {
        canvasUrl = url;
        // best-effort — a client that went away mid-call must not break the tool
        void server.server
          .sendLoggingMessage({
            level: 'info',
            logger: 'flowdeck',
            data: 'FlowDeck 画布已就绪,请在浏览器打开确认:' + url,
          })
          .catch(() => {});
      },
    });

    if (result.status === 'cancelled') {
      return {
        content: [
          {
            type: 'text',
            text: [
              'The user cancelled this confirmation on the FlowDeck canvas. Fall back to plain-text confirmation, or ask how they want to proceed.',
              '用户在 FlowDeck 画布上取消了本次确认。请改用纯文本方式与用户确认计划,或询问用户希望如何继续。',
              ...(canvasUrl ? [`画布地址:${canvasUrl} — 重新打开画布即可继续。`] : []),
            ].join('\n'),
          },
        ],
        structuredContent: { status: 'cancelled' },
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: [
            'The user confirmed the following plan on the FlowDeck canvas. This is the final version — follow it strictly: do NOT execute steps marked 已移除 / removed, and treat question answers as the user\'s decisions.',
            '用户已在 FlowDeck 画布上确认以下计划(最终版本,请严格按此执行;标注「已移除」的步骤不要执行,问题卡的答案视为用户的决定):',
            '',
            result.summary,
          ].join('\n'),
        },
      ],
      structuredContent: { status: 'confirmed', plan: result.plan, summary: result.summary },
    };
  },
);

async function main() {
  // `| head`-style consumers close the pipe early; an unhandled EPIPE would crash ugly
  process.stdout.on('error', () => {});
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const shutdown = () => {
    // settle pending canvas sessions, drop sockets — with the HTTP server
    // closed the event loop empties and the process exits on its own (a forced
    // process.exit() trips a libuv teardown assertion on Windows); the unref'd
    // timer is only a safety net for any handle that lingers
    void host.stop();
    setTimeout(() => process.exit(0), 1000).unref();
  };
  // StdioServerTransport never fires onclose when the IDE ends stdin — watch it directly
  process.stdin.once('end', shutdown);
  transport.onclose = shutdown;
}

main().catch((err) => {
  console.error('[flowdeck] fatal:', err);
  process.exit(1);
});

export type { Plan };
