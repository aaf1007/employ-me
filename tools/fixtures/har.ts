import { z } from 'zod';

// Just enough of the HAR 1.2 format for scrubbing recordings. Loose objects:
// everything we don't name is kept as recorded and then dropped explicitly.

const header = z.object({ name: z.string(), value: z.string() });

export const harContentSchema = z.looseObject({
  size: z.number().optional(),
  mimeType: z.string().optional(),
  text: z.string().optional(),
  encoding: z.string().optional(),
  _file: z.string().optional(),
});
export type HarContent = z.infer<typeof harContentSchema>;

export const harEntrySchema = z.looseObject({
  startedDateTime: z.string(),
  time: z.number(),
  request: z.looseObject({
    method: z.string(),
    url: z.string(),
    httpVersion: z.string(),
    headers: z.array(header),
    queryString: z.array(header),
    cookies: z.array(z.unknown()),
    headersSize: z.number(),
    bodySize: z.number(),
    postData: z.looseObject({ mimeType: z.string(), text: z.string().optional() }).optional(),
  }),
  response: z.looseObject({
    status: z.number(),
    statusText: z.string(),
    httpVersion: z.string(),
    headers: z.array(header),
    cookies: z.array(z.unknown()),
    content: harContentSchema,
    redirectURL: z.string(),
    headersSize: z.number(),
    bodySize: z.number(),
  }),
  cache: z.unknown(),
  timings: z.unknown(),
  pageref: z.string().optional(),
});
export type HarEntry = z.infer<typeof harEntrySchema>;

export const harSchema = z.looseObject({
  log: z.looseObject({
    version: z.string(),
    creator: z.unknown(),
    pages: z.array(z.unknown()).optional(),
    entries: z.array(harEntrySchema),
  }),
});
export type Har = z.infer<typeof harSchema>;
