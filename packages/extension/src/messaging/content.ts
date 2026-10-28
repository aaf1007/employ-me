import { atsIdSchema } from '@employ-me/core';
import { z } from 'zod';

// Messages between extension pages (side panel, background) and the ATS
// content script. Always parse incoming messages: anything can call
// runtime.sendMessage on a page the content script runs in.

export const contentRequestSchema = z.discriminatedUnion('type', [z.object({ type: z.literal('ping') })]);
export type ContentRequest = z.infer<typeof contentRequestSchema>;

export const pongSchema = z.object({
  type: z.literal('pong'),
  ats: atsIdSchema,
  url: z.string(),
  topFrame: z.boolean(),
});
export type Pong = z.infer<typeof pongSchema>;
