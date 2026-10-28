import { z } from 'zod';

/** What one frame of a job site's tab says about itself before the content script runs there. */
export const frameProbeSchema = z.strictObject({
  url: z.string(),
  /** Origins of the frame's own iframes, so the side panel can see which it can't read. */
  frameOrigins: z.array(z.string()),
});
export type FrameProbe = z.infer<typeof frameProbeSchema>;

/**
 * Run in every frame employ-me may read, with `scripting.executeScript({ func })`,
 * when you click Fill on a site it has no content script for. Chrome sends
 * the function's source, so it must not use anything from outside its body.
 * It only reads the page.
 */
export function probeFrame(): FrameProbe {
  const origins = new Set<string>();
  for (const frame of document.querySelectorAll('iframe[src], frame[src]')) {
    try {
      const url = new URL(frame.getAttribute('src') ?? '', document.baseURI);
      if (url.protocol === 'https:' || url.protocol === 'http:') origins.add(url.origin);
    } catch (error) {
      // An src that isn't a URL loads nothing.
      if (!(error instanceof TypeError)) throw error;
    }
  }
  return { url: location.href, frameOrigins: [...origins] };
}
