// Narrow readers for JSON that comes from a page or a public API. Everything
// is checked, nothing is cast, and unknown shapes read as undefined.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number') return String(value);
  return undefined;
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function parseJsonText(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
