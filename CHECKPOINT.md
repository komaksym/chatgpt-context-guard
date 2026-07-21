# Continuation Checkpoint

## Objective

Release ChatGPT Context Guard with a robust full-history estimate that does not depend on which messages ChatGPT currently mounts in the DOM.

## Repository state

- GitHub: `git@github.com:komaksym/chatgpt-context-guard.git`
- Base branch: `codex/context-guard`
- Working branch: `fix/full-conversation-estimate`
- Pull request: `#2`
- Design: `docs/superpowers/specs/2026-07-21-full-conversation-estimate-design.md`
- Plan: `docs/superpowers/plans/2026-07-21-full-conversation-estimate.md`

## Implemented

- Added `src/conversation.js` for route parsing, authenticated same-origin conversation loading, active `current_node` parent-chain reconstruction, content extraction, and token-only ledger creation.
- The meter now uses this fallback order:
  1. fresh complete active-branch estimate;
  2. cached complete token-only snapshot;
  3. explicitly partial mounted-DOM estimate with a `+` suffix.
- Regenerated sibling branches are excluded.
- Missing nodes and cycles fail closed.
- Access tokens and conversation text are never persisted.
- Cache is bounded to the 20 most recently updated conversations.
- Full snapshots are downgraded to cached while generation changes the thread or when a refresh fails.
- Checkpoint response binding remains DOM-based and independent of the undocumented conversation endpoint.
- Manifest, build, lint, README, styles, static tests, and browser tests include the new adapter and source labels.

## Verification evidence

- RED: `node --test tests/conversation.test.js` initially failed because `src/conversation.js` did not exist.
- RED: the first Chromium run caught suffix-spacing assertion failures.
- GREEN: `npm run verify` passed locally on Node 22.
  - unit/static tests: 27/27 passed;
  - Chromium/Playwright tests: 7/7 passed;
  - lint: passed;
  - build: passed.
- Browser coverage includes full, cached, partial, stale-snapshot downgrade, checkpoint carry/consume, theme and multi-block extraction, and the real 10,000-message DOM/MutationObserver regression.
- Repeated GitHub Actions jobs terminate before exposing any steps or logs (`steps: []`, no log blob). This is an unresolved CI runner/account issue, not a reproduced repository test failure.

## Remaining release gate

Run a live smoke test in normal Chrome against a very long saved ChatGPT conversation. Confirm that the meter shows `full-history tokens` without scrolling, then test the cached and partial labels by temporarily blocking or breaking the internal endpoint. The endpoint is undocumented, so live behavior is the final source of truth.

## Next concrete action

Merge PR #2 based on the complete local verification, reload the unpacked extension from the rebuilt `dist/`, and perform the live long-chat smoke test. If the live request fails, inspect the ChatGPT network response and update only `src/conversation.js`; the DOM fallback must remain honest and operational.