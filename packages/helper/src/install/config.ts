import { readFile, writeFile } from 'node:fs/promises';
import { err, ok, type Result } from '@employ-me/core/protocol';
import { z } from 'zod';
import { BROWSERS } from './browsers';

/**
 * What `employ-me setup` records, and the host reads at start. Holds paths
 * only: never credentials, tokens or Profile data (ADR-0002).
 */
export const helperConfigSchema = z.object({
  configVersion: z.literal(1),
  helperVersion: z.string(),
  /** The node the launcher runs. Absent for the e2e test host. */
  nodePath: z.string().optional(),
  /** Absolute CLI paths found at setup. Chrome launched from the Dock has no shell PATH (ADR-0001). */
  cli: z.object({ claude: z.string().optional(), codex: z.string().optional() }).default({}),
  /** Model overrides, used when a request (the model picked in Settings) names none. Unset means Sonnet for Claude and your default model for Codex (design.md "Default models"). */
  models: z.object({ claude: z.string().optional(), codex: z.string().optional() }).default({}),
  /** An empty folder the CLIs run in. */
  workDir: z.string(),
  /** Everything setup wrote outside the install folder, so uninstall can remove it. */
  installed: z
    .object({
      manifests: z.array(z.object({ browser: z.enum(BROWSERS), path: z.string() })).default([]),
      registryKeys: z.array(z.object({ browser: z.enum(BROWSERS), key: z.string() })).default([]),
    })
    .default({ manifests: [], registryKeys: [] }),
});
export type HelperConfig = z.infer<typeof helperConfigSchema>;

export type ConfigProblem = { readonly reason: 'missing' } | { readonly reason: 'invalid' };

export async function readHelperConfig(file: string): Promise<Result<HelperConfig, ConfigProblem>> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return err({ reason: 'missing' });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err({ reason: 'invalid' });
  }
  const parsed = helperConfigSchema.safeParse(json);
  return parsed.success ? ok(parsed.data) : err({ reason: 'invalid' });
}

export async function writeHelperConfig(file: string, config: HelperConfig): Promise<void> {
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
