import {
  CLAIM_SUPPORT,
  draftAnswerOutputSchema,
  err,
  ok,
  type DraftAnswerOutput,
  type DraftContext,
} from '@employ-me/core/protocol';
import { z } from 'zod';
import { UNTRUSTED_DATA_RULE, dataBlock, invalidOutput, jsonSchemaOf, type Prompt } from './prompt';

// Drafts are grounded in the whitelisted Draft context (core's
// toDraftContext) and the Posting, every claim says where it came from, and
// anything unsupported is flagged for the user (design.md "Drafts").

const wireSchema = z.object({
  text: z.string(),
  language: z.string().describe('BCP 47 tag of the language the text is written in'),
  claims: z.array(z.object({ text: z.string(), support: z.enum(CLAIM_SUPPORT) })),
});

const SHARED = [
  'Write in the language of the question. If <question> has a language tag, use it; otherwise use the language the question is written in, even if the posting or the facts are in another language.',
  'If the question has a maxLength, the text must fit within that many characters.',
  'Plain text: no Markdown, no placeholders such as [Company], and no greeting or sign-off unless the question asks for a letter.',
  'Return text (the answer), language (BCP 47 tag of the language you wrote in), and claims: every factual statement in the text about the applicant or the company, each with its support: "profile" (from <applicant_facts>), "savedAnswer" (from <saved_answers>), "posting" (from <posting>), "userDraft" (from <user_draft>) or "unsupported" (from none of them). Be honest: the applicant checks every unsupported claim before using the text.',
  UNTRUSTED_DATA_RULE,
];

export const WRITE_SYSTEM = [
  "You draft one answer to a job application question, in the applicant's own voice (first person).",
  "Ground every statement about the applicant in <applicant_facts> and <saved_answers>. Never invent employers, titles, dates, numbers, skills, degrees, projects or achievements. If the question asks for something the facts don't cover, write a shorter answer from what is supported; don't fill the gap with plausible detail.",
  "Use <posting> only to learn about the company and the role, so the answer can connect the applicant's real experience to it.",
  ...SHARED,
].join('\n');

export const POLISH_SYSTEM = [
  "You polish the applicant's own draft answer to a job application question. The form has a policy on AI use, so the words and ideas must stay the applicant's.",
  'Fix grammar, spelling, clarity and flow, and tighten the wording. Keep their meaning, facts, tone, structure and voice. Add no new claims, examples or facts, even ones that <applicant_facts> or <posting> would support.',
  ...SHARED,
].join('\n');

export function draftAnswerPrompt(input: DraftContext): Prompt<DraftAnswerOutput> {
  const polish = input.mode === 'polish';
  const prompt = [
    dataBlock('question', input.question),
    dataBlock('posting', input.posting),
    dataBlock('applicant_facts', input.facts),
    dataBlock('saved_answers', input.savedAnswers),
    ...(polish ? [dataBlock('user_draft', input.userDraft ?? '')] : []),
    polish ? 'Polish the draft in <user_draft>.' : 'Write the answer to <question>.',
  ].join('\n\n');
  return {
    task: {
      type: 'draftAnswer',
      system: polish ? POLISH_SYSTEM : WRITE_SYSTEM,
      prompt,
      schema: jsonSchemaOf(wireSchema),
      effort: 'default',
      timeoutMs: 120_000,
    },
    finish(raw) {
      const draft = wireSchema.safeParse(raw);
      if (!draft.success) return err(invalidOutput('Draft'));
      const output = draftAnswerOutputSchema.safeParse({
        draft: { ...draft.data, text: draft.data.text.trim() },
      });
      return output.success ? ok(output.data) : err(invalidOutput('Draft'));
    },
  };
}
