/**
 * Interactive test driver: present a plan and stay blocked until the browser
 * user confirms/cancels. Prints the returned result as JSON at the end.
 * Usage: FLOWDECK_PORT=7690 FLOWDECK_NO_OPEN=1 node scripts/manual-session.mjs [plan.md]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlanMarkdown } from '@flowdeck/core';
import { CanvasHost } from '../packages/mcp/dist/canvas-server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const planFile = process.argv[2] ?? path.join(root, 'docs/demo-plan.md');
const plan = parsePlanMarkdown(fs.readFileSync(planFile, 'utf-8'));

console.log(`[driver] plan: "${plan.title}" (${plan.modules.length} modules)`);
const host = new CanvasHost();
const result = await host.present(plan);
console.log('=== RESULT ===');
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'confirmed' ? 0 : 2);
