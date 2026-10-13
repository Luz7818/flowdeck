import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  CheckpointModuleSchema,
  GroupModuleSchema,
  normalizePlan,
  Plan,
  QuestionModuleSchema,
  ResourceModuleSchema,
  RiskModuleSchema,
  StepModuleSchema,
  SuggestionModuleSchema,
} from '@flowdeck/core';
import { CanvasHost } from './canvas-server.js';

const host = new CanvasHost();

const server = new McpServer({
  name: 'flowdeck',
  version: '0.1.0',
});

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
        .array(
          z.union([
            StepModuleSchema,
            QuestionModuleSchema,
            GroupModuleSchema,
            RiskModuleSchema,
            SuggestionModuleSchema,
            CheckpointModuleSchema,
            ResourceModuleSchema,
          ]),
        )
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
  async ({ title, modules }) => {
    const plan = normalizePlan({ title, modules: modules as Array<Record<string, unknown>> });
    const result = await host.present(plan);

    if (result.status === 'cancelled') {
      return {
        content: [
          {
            type: 'text',
            text: '用户在 FlowDeck 画布上取消了本次确认。请改用纯文本方式向用户确认计划,或询问用户希望如何继续。',
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
            `用户已在 FlowDeck 画布上确认以下计划(这是最终版本,请严格按此执行;标注"已移除"的步骤不要执行,问题卡的答案视为用户的决定):`,
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
  await server.connect(new StdioServerTransport());
  // keep the process alive; stdio transport handles the protocol loop
}

main().catch((err) => {
  console.error('[flowdeck] fatal:', err);
  process.exit(1);
});

export type { Plan };
