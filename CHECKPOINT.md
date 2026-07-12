# Continuation Checkpoint

## Objective

Finish and release ChatGPT Context Guard: a local-only Manifest V3 Chrome extension that estimates visible ChatGPT transcript tokens, warns at configurable thresholds, prepares a lossless checkpoint prompt without submitting it, and carries the latest checkpoint response into a fresh chat.

## Repository state

- GitHub: `git@github.com:komaksym/chatgpt-context-guard.git`
- Branch: `codex/context-guard`
- Design: `docs/superpowers/specs/2026-07-11-chatgpt-context-guard-design.md`
- Plan: `PLANS.md`
- No production dependencies.

## Implemented

- MV3 manifest scoped to `chatgpt.com`, legacy `chat.openai.com`, and the `storage` permission.
- Dependency-free visible-text token estimator with conservative CJK handling.
- Default 250K / 400K / 600K thresholds and configurable synced settings.
- Shadow DOM meter with normal, long, warning, and critical states.
- Dismissible threshold warning toast.
- Light/dark styling, focus states, reduced-motion support, collapse control, and SVG icons.
- Checkpoint prompt insertion without automatic submission.
- Latest assistant-response carryover into a new chat through extension-local storage.
- Extension icon set, README, MIT license, build script, lint script, tests, and GitHub Actions CI.

## Verified evidence

- `npm test`: 10/10 tests passed.
- `npm run lint`: JavaScript syntax and manifest permission checks passed.
- `npm run build`: unpacked extension built successfully in `dist/`.
- `git diff --check`: passed.
- `npm install --package-lock-only --ignore-scripts`: zero vulnerabilities.
- Live headed Chrome smoke test proved injection on the real ChatGPT DOM without sending a message.
- Isolated headless Chromium synthetic-DOM checks proved:
  - critical warning state;
  - checkpoint prompt insertion;
  - action transition to `Carry latest to new chat`;
  - checkpoint carryover after fresh-chat navigation;
  - dark mode and collapsed state.
- Final headless carryover result: `{ "promptPrepared": true, "carried": true }`.
- Headless ChatGPT itself returned anti-bot HTTP 403; browser behavior was tested against a synthetic ChatGPT-compatible DOM inside that page.

## Independent review findings to address

The release review verdict was **not ready to merge**. Fix these before release:

1. Add reproducible browser automation to the repository. Current browser checks were executed externally through Playwright CLI; `tests/extension.test.js` mostly verifies static contracts. The design mentions `tests/fixture.html`, which is not present.
2. `src/content.js` currently reads only the first `.markdown` or `.whitespace-pre-wrap` descendant of a message. Multi-block assistant responses may be undercounted and checkpoint carryover may be truncated. Aggregate all content blocks without double-counting nested nodes.
3. Dark mode follows OS `prefers-color-scheme`, not ChatGPT's explicitly selected theme. Support ChatGPT's document theme while retaining OS fallback.
4. Expand the in-widget disclaimer to state that hidden system/tool/reasoning context and server-side compaction are unknown.
5. Remove the overly broad `textarea[placeholder]` composer fallback. Use only verified ChatGPT composer selectors.
6. Scope or optimize the whole-body `MutationObserver` plus full transcript `innerText` scan. Add a long-transcript performance test.
7. Remove the arbitrary `latest.length > 80` checkpoint-readiness gate so valid short checkpoint responses can be carried.

## Next concrete action

Start with failing tests for findings 2, 5, 6, and 7. Extract DOM collection/composer selection into testable functions or add a deterministic browser fixture. Verify RED, implement the smallest fixes, run unit/static/browser checks, then repeat the independent review.

Do not claim release readiness until all review findings are fixed and the final tests, lint, build, browser flow, and visual comparison pass again.
