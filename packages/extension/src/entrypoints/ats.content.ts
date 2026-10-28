import { formMatchPatterns } from '@employ-me/core';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { startContentScript } from '../content';

// Runs on Greenhouse, Lever and Ashby form hosts, in every frame, so forms
// embedded in company sites (iframe#grnhse_iframe) are reached without any
// permission on the company site (research §5 "Iframes"). It does nothing
// until the side panel asks.
export default defineContentScript({
  matches: formMatchPatterns(),
  allFrames: true,
  runAt: 'document_idle',
  main() {
    startContentScript();
  },
});
