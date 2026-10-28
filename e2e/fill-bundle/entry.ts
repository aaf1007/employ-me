import * as fill from '@employ-me/fill';

// Test-only: exposes the fill engine to Playwright, which injects this bundle
// into a replayed Application Form. In the product the engine runs inside the
// extension's content script; the side-panel wiring lands separately.
Object.assign(globalThis, { employMeFill: fill });
