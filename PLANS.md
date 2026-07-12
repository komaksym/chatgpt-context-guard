# ChatGPT Context Guard Implementation Plan

## Summary

Build and verify a dependency-free Chrome extension that estimates visible ChatGPT transcript size, warns at configurable thresholds, and prepares checkpoint handoffs without automatic submission.

Current continuation state and unresolved release work are recorded in `CHECKPOINT.md`.

## Milestone 1: Pure context logic

- [x] Add failing tests for token estimation, threshold classification, settings validation, and checkpoint generation.
- [x] Implement the minimal pure functions.
- [x] Run the Node test suite and syntax checks.

## Milestone 2: Chrome extension UI and ChatGPT adapter

- [x] Add failing contract assertions for widget injection and warning behavior.
- [x] Implement the MV3 manifest, Shadow DOM meter, settings, warnings, composer insertion, and checkpoint carryover.
- [x] Run unit and browser-backed interaction checks.

## Milestone 3: Review repairs and release verification

- [x] Add a deterministic browser fixture and repository-owned Playwright automation.
- [x] Aggregate multi-block message content without nested double-counting.
- [x] Follow ChatGPT's explicit document theme with OS fallback.
- [x] Expand the visible-context limitation disclaimer.
- [x] Restrict composer lookup to verified selectors.
- [x] Scope mutation observation to the conversation root, ignore composer typing, preserve generation-complete updates, and add a 10,000-message performance test.
- [x] Accept valid short checkpoint responses, including repeated text.
- [x] Confirm GitHub Actions.
- [ ] Repeat the live ChatGPT smoke test, perform visual comparison, and run a final independent review.
