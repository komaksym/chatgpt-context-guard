# ChatGPT Context Guard Implementation Plan

## Summary

Build and verify a dependency-free Chrome extension that estimates visible ChatGPT transcript size, warns at configurable thresholds, and prepares checkpoint handoffs without automatic submission.

Current continuation state and unresolved review findings are recorded in `CHECKPOINT.md`.

## Milestone 1: Pure context logic

- [x] Add failing tests for token estimation, threshold classification, settings validation, and checkpoint generation.
- [x] Implement the minimal pure functions.
- [x] Run the Node test suite and syntax checks.

## Milestone 2: Chrome extension UI and ChatGPT adapter

- [x] Add failing contract assertions for widget injection and warning behavior.
- [x] Implement the MV3 manifest, Shadow DOM meter, settings, warnings, composer insertion, and checkpoint carryover.
- [x] Run unit and browser-backed interaction checks.

## Milestone 3: Browser and live verification

- [x] Load the unpacked extension in an isolated headless Chromium profile.
- [x] Verify normal, warning, critical, settings, carryover, light, and dark states.
- [x] Smoke-test content-script injection on the live ChatGPT DOM without sending messages.
- [ ] Run final tests, static validation, and review feedback repairs.
