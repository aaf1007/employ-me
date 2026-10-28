# Coding standards

Concrete rules a reviewer can check. Lint and types enforce many of them; the rest are on the reviewer. When a rule here is wrong, change this file in its own commit. Don't work around it.

## Modules

- **Small modules.** One concept per file. Past ~200 lines, split it.
- A folder's `index.ts` is its public surface. Other folders import from the index, not from files inside it.
- Package direction is fixed: core ← fill ← extension, and core/protocol ← helper. Lint enforces it.
- Stubs are typed signatures whose body is `throw new Error('not implemented')`. Unused parameters are prefixed `_`.

## Types

- Strict TypeScript everywhere, with `noUncheckedIndexedAccess`. No `any`, explicit or leaked.
- Data that crosses a boundary is parsed with a zod schema from core, never cast: storage reads, runtime messages, helper messages, Provider output, imported JSON or CSV. `as` belongs only where a schema has already checked the value.
- Inputs to a Provider are strict and branded (rejected on unknown keys, built only through core's `to*` functions). Outputs from a Provider are parsed leniently (unknown keys stripped) and used as data, never as code or selectors to run.

## Errors

- **Typed results at boundaries.** A function that can fail for an expected reason returns core's `Result<T, E>`, with `E` a union of `{ reason, … }` cases. This covers every module API, `act`, runtime messages and the helper protocol.
- Throw only for bugs (a broken invariant), and let them surface.
- **No silent catch.** Every `catch` (or promise rejection handler) does one of three things: converts the error into a typed result, records it in the helper's Logger, or rethrows it with `{ cause }`. An empty catch fails lint.
- Errors that reach the user carry a reason and a fix in plain words (see `HELPER_ERROR_FIXES` in core).

## Fill outcomes

- Every field a Fill touches ends as exactly one `FieldOutcome`: `filled`, `needsReview` with a `ReviewReason`, or `couldNotFill` with a `CouldNotFillReason` and a `fix`. Leaving a field unmentioned is a bug.
- After every write, read the value back. If it didn't stick, the outcome is `couldNotFill: valueDidNotStick`, never `filled`.
- If the Provider is unavailable, the Fill still runs on rules. Fields that needed the AI get `couldNotFill: providerUnavailable` with the helper's fix.
- Self-ID questions fill only from the user's Self-ID Answers ("decline" by default). Attestations get `couldNotFill: attestation`.

## DOM (packages/fill)

- Read the DOM anywhere in fill. Write it, or dispatch events on it, only through `act/`. Extend `act/` with a new guarded operation when you need one.
- Outside `act/`, fill writes nothing through a computed key (`x[key] = v`): build objects with `Object.fromEntries` or a `Map`. Nowhere in fill is a method called through one (`x[name]()`).
- `act/` dispatches only events built in place with a literal type (`el.dispatchEvent(new Event('input', …))`), and never presses Enter.
- core and fill never touch the global object (`globalThis`, `window`, `self`, `top`, `parent`, `frames`, `opener`). Use the global you need by name, or the element's own document.
- No code builds elements or HTML (`createElement`, `innerHTML`, `insertAdjacentHTML`), and nothing in core, fill or the extension loads code at run time (`import()`). The extension's pages render through React.
- Check element kinds with `localName` and attributes, not `instanceof`: elements from iframes belong to another realm.
- Walk open shadow roots when extracting.
- Nothing is injected into job sites' pages: no overlays, no elements, no stylesheets, no classes, no attributes. The side panel is the UI.
- The one exception is the Fill's matching outlines (design.md "What you see"). `act.outlineField` sets only the field's own inline `outline` and `outline-offset`, saves what the page had first, and `act.clearOutlines` puts it back when the Fill ends. Style writes elsewhere in fill and in the content script fail lint.

## Adapters

- **Every adapter ships with fixtures and e2e tests.** A change to an adapter without a fixture that exercises it, or a fixture without a spec, fails review.
- Fixtures are real, public forms recorded with `node tools/fixtures/record.ts <ats>/<employer>-<yyyy-mm-dd>` (listed in `e2e/forms.ts`): a Playwright HAR (`fixtures/<ats>/<name>.har`, bodies shared in `fixtures/<ats>/har/`) that replays the page with its own JavaScript, plus the rendered DOM (`<name>.html`) for unit tests. The recorder keeps only the ATS's own hosts, drops cookies, session headers, client keys, tokens and signed upload policies, and never clicks or submits anything. Check a new recording for anything personal before committing.
- Each adapter spec replays its fixtures at the real URL (`sites.replay`), runs a Fill from the test Profile, and checks every field's outcome and the value the form shows against `<name>.expected.json`, that Attestations were left alone, and that nothing was submitted. `UPDATE_FILL_EXPECTED=1` rewrites the expected files; review that diff by hand. `pnpm fill-rate` turns them into the README's coverage table.

## Tests

- Unit tests sit next to the code as `*.test.ts` (Vitest; jsdom in fill). e2e specs live in `e2e/`.
- Tests are hermetic: no network, no real CLI. Use the fake Provider (`EMPLOY_ME_PROVIDER=fake`, or `createFakeProvider` in unit tests).
- A bug fix lands with the test that went red on the bug.
- Test the behaviour design.md promises (never Submit, nothing sensitive to the Provider, every field gets an outcome), not implementation details.

## Privacy

- Profile values never appear in logs, error messages, debug reports or test snapshots. Use obviously fake data in fixtures and tests (`Sam Lee`, `example.com`).
- The helper logs only through the `LogEntry` shape, which has no free-text field.

## Comments

- Sparse. A comment explains why: the constraint, the gotcha, the design decision. The code says what.
- When a rule comes from the spec, cite it: `(design.md "Sensitive questions")`, `(research §5)`.
- No commented-out code, and no TODOs in code: open items go in your BUILD_LOG entry.

## Dependencies

- Add a dependency only when code uses it, pin the exact version, and note why in BUILD_LOG.
- The extension bundles everything it runs (MV3 bans remote code). The helper bundles core and zod, so `npx employ-me` installs nothing else.

## UI (packages/extension)

- React 19 function components, one per file, under `src/ui/<surface>/`. Entrypoints in `src/entrypoints/` stay thin.
- Use the glossary's words in the UI: "Fill", "Needs your review", "Couldn't fill", "Saved Answers", "Tracker".
- Give the elements tests need a `data-testid`.
