import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

/** Chrome's ID for an extension's public key: SHA-256, first 32 hex digits, mapped 0-f to a-p. */
export function extensionIdFromKey(keyBase64: string): string {
  const hex = createHash('sha256').update(Buffer.from(keyBase64, 'base64')).digest('hex').slice(0, 32);
  return hex.replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
}

const manifestKeySchema = z.object({ key: z.string().min(1) });

/**
 * The ID a built extension folder will load with, or null when its manifest
 * has no `key` (then Chrome picks an ID from the folder path, and the host
 * manifest's allowed_origins won't match).
 */
export async function builtExtensionId(extensionDir: string): Promise<string | null> {
  let json: unknown;
  try {
    json = JSON.parse(await readFile(join(extensionDir, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
  const parsed = manifestKeySchema.safeParse(json);
  return parsed.success ? extensionIdFromKey(parsed.data.key) : null;
}
