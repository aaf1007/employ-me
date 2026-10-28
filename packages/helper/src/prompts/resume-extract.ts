import { resumeExtractSchema, type ResumeExtract } from '@employ-me/core/protocol';
import { degreeLevelOf } from './degree-level';
import type { ResumeWire } from './parse-resume';

type Json = Record<string, unknown>;

/** Each pass fixes one problem; a Resume never has anywhere near this many. */
const MAX_REPAIRS = 200;

/**
 * Turns the model's answer into core's ResumeExtract, keeping everything that
 * is valid. A bad value (an email without @, "Canada" as a country code) is
 * dropped on its own; an entry missing something it needs (a job without a
 * start date) is dropped whole. The user reviews every field anyway
 * (design.md "Setup"), so a partial extract beats failing the whole Resume.
 */
export function toResumeExtract(wire: ResumeWire): ResumeExtract | null {
  const candidate = compact(candidateFrom(wire));
  if (!isRecord(candidate)) return {};
  for (let repair = 0; repair < MAX_REPAIRS; repair++) {
    const parsed = resumeExtractSchema.safeParse(candidate);
    if (parsed.success) {
      // Repairs leave undefined keys and emptied objects behind; tidy them away.
      const tidy = resumeExtractSchema.safeParse(compact(parsed.data) ?? {});
      return tidy.success ? tidy.data : parsed.data;
    }
    const issue = parsed.error.issues[0];
    if (issue === undefined || !repairAt(candidate, issue.path)) return null;
  }
  return null;
}

function candidateFrom(wire: ResumeWire): Json {
  const url = (value: string | null) =>
    value === null || value.trim() === '' ? null : /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return {
    identity: { legalName: wire.legalName, preferredName: wire.preferredName },
    contact: { email: wire.email, phone: wire.phone },
    address: { ...wire.address, country: wire.address.country?.toUpperCase() ?? null },
    links: {
      linkedin: url(wire.links.linkedin),
      github: url(wire.links.github),
      portfolio: url(wire.links.portfolio),
    },
    background: {
      workHistory: wire.workHistory.map((entry, i) => ({
        ...entry,
        id: `w${i + 1}`,
        endDate: entry.current ? null : entry.endDate,
      })),
      education: wire.education.map((entry, i) => ({
        ...entry,
        id: `e${i + 1}`,
        degreeLevel: entry.degreeLevel ?? degreeLevelOf(entry.degree),
      })),
      skills: wire.skills.map((name) => ({ name })),
      languages: wire.languages,
    },
  };
}

/** Drops nulls, blank strings and objects left empty. Arrays stay, even empty. */
function compact(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim();
  if (Array.isArray(value)) return value.map(compact).filter((item) => item !== undefined);
  if (!isRecord(value)) return value;
  const entries = Object.entries(value)
    .map(([key, item]) => [key, compact(item)] as const)
    .filter(([, item]) => item !== undefined);
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/**
 * Fixes the problem at `path`: removes the bad value, or, when nothing is
 * there to remove (a required value is missing), the list entry holding it,
 * or else the object holding it.
 */
function repairAt(root: Json, path: readonly PropertyKey[]): boolean {
  if (removeAt(root, path)) return true;
  const lastIndex = path.findLastIndex((key) => typeof key === 'number');
  if (lastIndex >= 0) return removeAt(root, path.slice(0, lastIndex + 1));
  return path.length > 1 && removeAt(root, path.slice(0, -1));
}

function removeAt(root: Json, path: readonly PropertyKey[]): boolean {
  let node: unknown = root;
  for (const key of path.slice(0, -1)) {
    node =
      Array.isArray(node) && typeof key === 'number'
        ? node[key]
        : isRecord(node)
          ? node[String(key)]
          : undefined;
    if (node === undefined) return false;
  }
  const last = path.at(-1);
  if (Array.isArray(node) && typeof last === 'number' && last < node.length) {
    node.splice(last, 1);
    return true;
  }
  if (isRecord(node) && typeof last === 'string' && node[last] !== undefined) {
    // Undefined reads as absent to zod, so an optional value is simply dropped.
    node[last] = undefined;
    return true;
  }
  return false;
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
