import { EXTENSION_ID, HELPER_HOST_NAME } from '@employ-me/core/protocol';
import { z } from 'zod';

export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}/`;

/** Chrome's Native Messaging host manifest. */
export const hostManifestSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** Absolute path to the launcher, which runs host.mjs with an absolute node path. */
  path: z.string(),
  type: z.literal('stdio'),
  allowed_origins: z.array(z.string()),
});
export type HostManifest = z.infer<typeof hostManifestSchema>;

export function hostManifest(launcherPath: string): HostManifest {
  return {
    name: HELPER_HOST_NAME,
    description: 'employ-me helper: runs your own claude/codex CLI for the employ-me extension',
    path: launcherPath,
    type: 'stdio',
    // Exactly the fixed extension ID (ADR-0001). Nothing else may talk to the helper.
    allowed_origins: [EXTENSION_ORIGIN],
  };
}

/** Why an existing manifest is wrong, for `doctor`. Empty when it is right. */
export function manifestProblems(manifest: HostManifest, launcherPath: string): string[] {
  const problems: string[] = [];
  if (manifest.name !== HELPER_HOST_NAME) problems.push(`its name is ${manifest.name}`);
  if (manifest.path !== launcherPath) problems.push(`it points at ${manifest.path}, not ${launcherPath}`);
  if (manifest.allowed_origins.length !== 1 || manifest.allowed_origins[0] !== EXTENSION_ORIGIN) {
    problems.push('its allowed_origins is not exactly the employ-me extension');
  }
  return problems;
}
