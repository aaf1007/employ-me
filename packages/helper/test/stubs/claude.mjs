#!/usr/bin/env node
// A stand-in for `claude`, so unit tests never spend anyone's plan. It
// prints canned output shaped like claude 2.1.x's `-p --output-format json`.
//
//   STUB_MODE    ok (default) | notLoggedIn | rateLimited | noStructuredOutput | garbage | hang
//   STUB_OUTPUT  JSON for structured_output (default {})
//   STUB_RECORD  file to write { argv, stdin, hasApiKey } to, for assertions
import { writeFileSync } from 'node:fs';

const mode = process.env.STUB_MODE ?? 'ok';
const args = process.argv.slice(2);

if (args[0] === '--version') {
  process.stdout.write('2.1.311 (Claude Code)\n');
  process.exit(0);
}

if (args[0] === 'auth' && args[1] === 'status') {
  const loggedIn = mode !== 'notLoggedIn';
  // The real CLI also prints account details; the helper must ignore them.
  process.stdout.write(
    `${JSON.stringify({ loggedIn, authMethod: loggedIn ? 'claude.ai' : 'none', email: 'sam@example.com' })}\n`,
  );
  process.exit(loggedIn ? 0 : 1);
}

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (stdin += chunk));
process.stdin.on('end', () => {
  if (process.env.STUB_RECORD) {
    writeFileSync(
      process.env.STUB_RECORD,
      JSON.stringify({ argv: args, stdin, hasApiKey: process.env.ANTHROPIC_API_KEY !== undefined }),
    );
  }
  const result = (fields) =>
    process.stdout.write(
      `${JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1, ...fields })}\n`,
    );
  switch (mode) {
    case 'hang':
      setInterval(() => undefined, 1000);
      return;
    case 'garbage':
      process.stdout.write('this is not json\n');
      process.exit(1);
      return;
    case 'notLoggedIn':
      result({ is_error: true, result: 'Not logged in · Please run /login', api_error_status: null });
      process.exit(1);
      return;
    case 'rateLimited':
      result({ is_error: true, result: "You've hit your usage limit · resets 3pm", api_error_status: 429 });
      process.exit(1);
      return;
    case 'noStructuredOutput':
      result({ is_error: false, result: 'Here you go' });
      return;
    default:
      result({ is_error: false, result: '', structured_output: JSON.parse(process.env.STUB_OUTPUT ?? '{}') });
  }
});
