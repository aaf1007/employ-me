#!/usr/bin/env node
// A stand-in for `codex`, so unit tests never spend anyone's plan. Speaks
// the app-server's JSON-RPC lines as codex-cli 0.158.0 does (see
// `codex app-server generate-ts`), with canned answers.
//
//   STUB_MODE    ok (default) | notLoggedIn | rateLimited | hang | askApproval | crash
//   STUB_OUTPUT  the final agent message text (default {})
//   STUB_MCP     JSON printed by `mcp list --json` (default [])
//   STUB_RECORD  file to append one JSON line per call and message to, for assertions
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const mode = process.env.STUB_MODE ?? 'ok';
const args = process.argv.slice(2);
const record = (entry) => {
  if (process.env.STUB_RECORD) appendFileSync(process.env.STUB_RECORD, `${JSON.stringify(entry)}\n`);
};
const subcommand = args.filter((arg, i) => arg !== '-c' && args[i - 1] !== '-c');

if (args[0] === '--version') {
  process.stdout.write('codex-cli 0.158.0\n');
  process.exit(0);
}
if (subcommand[0] === 'mcp' && subcommand[1] === 'list') {
  record({ call: 'mcp list', argv: args });
  process.stdout.write(`${process.env.STUB_MCP ?? '[]'}\n`);
  process.exit(0);
}
if (subcommand[0] !== 'app-server') process.exit(2);

record({
  call: 'app-server',
  argv: args,
  hasOpenAiKey: process.env.OPENAI_API_KEY !== undefined,
});
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
let threads = 0;

createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  record({ call: 'message', message });
  const { id, method, params } = message;
  if (method === undefined) return; // our answer to a server request
  const reply = (result) => send({ id, result });
  switch (method) {
    case 'initialize':
      return reply({ userAgent: 'stub', codexHome: '/tmp', platformFamily: 'unix', platformOs: 'macos' });
    case 'initialized':
      return;
    case 'account/read':
      return reply(
        mode === 'notLoggedIn'
          ? { account: null, requiresOpenaiAuth: true }
          : {
              account: { type: 'chatgpt', email: 'sam@example.com', planType: 'plus' },
              requiresOpenaiAuth: true,
            },
      );
    case 'account/rateLimits/read':
      return reply({
        ordinaryUsageAllowed: true,
        rateLimits: {
          primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1793188063 },
          secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 1793774863 },
        },
      });
    case 'thread/start':
      threads += 1;
      return reply({ thread: { id: `thread-${threads}` } });
    case 'turn/start':
      reply({ turn: { id: `turn-${threads}`, status: 'inProgress' } });
      return finishTurn(params.threadId);
    case 'turn/interrupt':
      return reply({});
    case 'thread/unsubscribe':
      return reply({ status: 'unsubscribed' });
    default:
      return send({ id, error: { code: -32600, message: `unknown method ${method}` } });
  }
});

function finishTurn(threadId) {
  const completed = (status, error = null) =>
    send({ method: 'turn/completed', params: { threadId, turn: { id: 'turn', status, error } } });
  switch (mode) {
    case 'hang':
      return;
    case 'crash':
      process.exit(1);
      return;
    case 'rateLimited':
      return completed('failed', { message: 'limit', codexErrorInfo: 'usageLimitExceeded' });
    case 'askApproval':
      send({ id: 'server-1', method: 'item/commandExecution/requestApproval', params: { threadId } });
    // falls through: Codex carries on once its request is refused
    default:
      send({
        method: 'item/completed',
        params: {
          threadId,
          item: {
            type: 'agentMessage',
            id: 'msg',
            text: process.env.STUB_OUTPUT ?? '{}',
            phase: 'final_answer',
          },
        },
      });
      return completed('completed');
  }
}
