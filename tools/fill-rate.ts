import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

// The README's coverage table: per ATS, how many fields of the recorded
// forms a Fill handles from the test Profile with the Provider unavailable
// (rules only). Reads fixtures/*/*.expected.json, which e2e/fill.spec.ts
// checks against real runs.
//
//   pnpm fill-rate            print the table
//   pnpm fill-rate --write    also update it in README.md

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURES = path.join(ROOT, 'fixtures');
const START = '<!-- fill-rate:start -->';
const END = '<!-- fill-rate:end -->';
const ORDER = ['greenhouse', 'lever', 'ashby', 'generic'] as const;

// Just what the table counts. The full shape (e2e/expected.ts) is checked by
// the specs; it imports core, which plain node can't load from source.
const expectedFileSchema = z.object({
  ats: z.enum(ORDER),
  fields: z.array(z.object({ outcome: z.enum(['filled', 'needsReview', 'couldNotFill']) })),
});
type ExpectedFile = z.infer<typeof expectedFileSchema>;
const NAMES: Record<(typeof ORDER)[number], string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  generic: 'Generic fallback',
};

async function main(): Promise<void> {
  const files: ExpectedFile[] = [];
  for (const ats of await readdir(FIXTURES, { withFileTypes: true })) {
    if (!ats.isDirectory()) continue;
    const dir = path.join(FIXTURES, ats.name);
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.expected.json'))) {
      files.push(expectedFileSchema.parse(JSON.parse(await readFile(path.join(dir, name), 'utf8'))));
    }
  }
  const table = render(files);
  process.stdout.write(`${table}\n`);
  if (process.argv.includes('--write')) {
    const readme = path.join(ROOT, 'README.md');
    const text = await readFile(readme, 'utf8');
    const start = text.indexOf(START);
    const end = text.indexOf(END);
    if (start === -1 || end === -1) throw new Error(`README.md needs ${START} and ${END} markers`);
    await writeFile(readme, `${text.slice(0, start + START.length)}\n${table}\n${text.slice(end)}`);
  }
}

function render(files: readonly ExpectedFile[]): string {
  const rows = ORDER.map((ats) => {
    const forms = files.filter((f) => f.ats === ats);
    const fields = forms.flatMap((f) => f.fields);
    const count = (kind: string) => fields.filter((f) => f.outcome === kind).length;
    const filled = count('filled');
    const review = count('needsReview');
    const couldNot = count('couldNotFill');
    const rate = fields.length === 0 ? '–' : `${Math.round((100 * filled) / fields.length)}%`;
    return `| ${NAMES[ats]} | ${forms.length} | ${fields.length} | ${filled} | ${review} | ${couldNot} | ${rate} |`;
  });
  return [
    "| ATS | Forms | Fields | Filled | Needs review | Couldn't fill | Fill rate |",
    '|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

await main();
