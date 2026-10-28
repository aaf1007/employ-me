import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../constants';
import { helperRequestSchema } from './messages';

const parseResume = {
  v: PROTOCOL_VERSION,
  id: 'r1',
  type: 'parseResume',
  provider: 'claude',
  input: { fileName: 'resume.txt', mimeType: 'text/plain', dataBase64: 'U2FtIExlZQ==' },
} as const;

describe('helper requests', () => {
  it('carry an optional model for the Provider', () => {
    expect(helperRequestSchema.safeParse(parseResume).success).toBe(true);
    expect(helperRequestSchema.safeParse({ ...parseResume, model: 'sonnet' }).success).toBe(true);
    expect(helperRequestSchema.safeParse({ ...parseResume, model: 'claude-sonnet-4-5' }).success).toBe(true);
    expect(helperRequestSchema.safeParse({ ...parseResume, model: 'gpt-5-codex' }).success).toBe(true);
  });

  it.each(['--dangerously-skip-permissions', '-p', 'sonnet; rm -rf ~', 'two words', '', 'a'.repeat(101)])(
    'refuse a model that could become a CLI flag or shell text: %s',
    (model) => {
      expect(helperRequestSchema.safeParse({ ...parseResume, model }).success).toBe(false);
    },
  );

  it('do not accept a model on health, which runs no Provider', () => {
    const health = { v: PROTOCOL_VERSION, id: 'h1', type: 'health' };
    expect(helperRequestSchema.safeParse(health).success).toBe(true);
    expect(helperRequestSchema.safeParse({ ...health, model: 'sonnet' }).success).toBe(false);
  });
});
