import {
  fieldTypeSchema,
  idSchema,
  isOrdinaryFieldType,
  ok,
  savedAnswerSchema,
  sensitiveQuestion,
  type SavedAnswer,
} from '@employ-me/core';
import { z } from 'zod';
import { parseStored, type DataResult } from './context';

/**
 * A Saved Answer kept before employ-me refused its kind of question: a
 * Self-ID question, an Attestation, or one about passwords, SIN/SSN, date of
 * birth or references (design.md "Sensitive questions"). It is quarantined:
 * never used in a Fill, never sent to the Provider, left out of backups. The
 * Saved Answers page shows its question so you can delete it.
 */
export interface RefusedSavedAnswer {
  readonly id: string;
  readonly question: string;
}

export interface SavedAnswerRecords {
  readonly usable: SavedAnswer[];
  readonly refused: RefusedSavedAnswer[];
}

/** Enough of a refused record to show its question and delete it; nothing else is read from it. */
const refusedShapeSchema = z.object({
  id: idSchema,
  question: z.string().trim().min(1).max(2000),
  fieldType: z.unknown().optional(),
});

/** Paths core's savedAnswerSchema refuses sensitive Saved Answers at. */
const REFUSED_AT = new Set<PropertyKey>(['question', 'fieldType']);

/**
 * Sorts stored Saved Answers into ones a Fill may use and refused ones. Any
 * other damage is `corrupt`, as before: only the guardrail's refusal is
 * quarantined.
 */
export function sortSavedAnswerRecords(values: readonly unknown[]): DataResult<SavedAnswerRecords> {
  const usable: SavedAnswer[] = [];
  const refused: RefusedSavedAnswer[] = [];
  for (const value of values) {
    const parsed = savedAnswerSchema.safeParse(value);
    if (parsed.success) {
      usable.push(parsed.data);
      continue;
    }
    const entry = refusedEntry(value, parsed.error);
    if (entry === null) {
      const damaged = parseStored(savedAnswerSchema, value, 'Saved Answer');
      if (!damaged.ok) return damaged;
      continue;
    }
    refused.push(entry);
  }
  return ok({ usable, refused });
}

/** The refused entry, when the only thing wrong with `value` is that its question or field type is sensitive. */
export function refusedEntry(value: unknown, error: z.ZodError): RefusedSavedAnswer | null {
  if (!error.issues.every((issue) => REFUSED_AT.has(issue.path[0] ?? ''))) return null;
  const shape = refusedShapeSchema.safeParse(value);
  if (!shape.success) return null;
  const { id, question, fieldType } = shape.data;
  const type = fieldTypeSchema.safeParse(fieldType);
  const sensitiveType = type.success && !isOrdinaryFieldType(type.data);
  if (sensitiveQuestion(question) === null && !sensitiveType) return null;
  return { id, question };
}

/** A backup's Saved Answers without the refused ones, and how many were left out. */
export function withoutRefused(values: readonly unknown[]): { kept: unknown[]; skipped: number } {
  const kept = values.filter((value) => {
    const parsed = savedAnswerSchema.safeParse(value);
    return parsed.success || refusedEntry(value, parsed.error) === null;
  });
  return { kept, skipped: values.length - kept.length };
}
