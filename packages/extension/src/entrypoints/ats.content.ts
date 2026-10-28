import { formMatchPatterns } from '@employ-me/core';
import { adapterFor } from '@employ-me/fill';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { contentRequestSchema, type Pong } from '../messaging/content';

// Runs on Greenhouse, Lever and Ashby form hosts, in every frame, so forms
// embedded in company sites (iframe#grnhse_iframe) are reached without any
// permission on the company site (research §5 "Iframes"). It injects nothing
// into the page and does nothing until the side panel asks.
export default defineContentScript({
  matches: formMatchPatterns(),
  allFrames: true,
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const request = contentRequestSchema.safeParse(message);
      if (!request.success) return false;
      const pong: Pong = {
        type: 'pong',
        ats: adapterFor(new URL(location.href)).ats,
        url: location.href,
        topFrame: window.top === window,
      };
      sendResponse(pong);
      return false;
    });
  },
});
