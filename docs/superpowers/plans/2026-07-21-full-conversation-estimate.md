# Full Conversation Estimate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silently incomplete DOM-only token meter with an API-first active-branch estimate, token-only cache, and explicit partial fallback.

**Architecture:** Add a pure `src/conversation.js` adapter for route parsing, active-tree traversal, text extraction, authenticated same-origin loading, and token-ledger creation. Integrate it into `src/content.js` without changing the existing DOM-based checkpoint capture flow. The UI selects fresh full data, then cached full data, then mounted DOM data.

**Tech Stack:** Manifest V3, dependency-free JavaScript, Node.js built-in test runner, Playwright fixture, Chrome storage.

## Global Constraints

- Never persist or log the ChatGPT access token.
- Never persist conversation text; cache only per-message token counts and metadata.
- Count only the active `current_node` parent chain, never every mapping node.
- Keep the existing checkpoint workflow DOM-based.
- Label fresh full, cached, and partial estimates distinctly.
- Keep existing `storage` permission and ChatGPT-only host permissions.

---

### Task 1: Conversation payload adapter

**Files:**
- Create: `tests/conversation.test.js`
- Create: `src/conversation.js`
- Modify: `package.json`
- Modify: `scripts/check.js`

**Interfaces:**
- Produces: `conversationIdFromPathname(pathname) -> string`
- Produces: `contentText(content) -> string`
- Produces: `activeBranchMessages(payload) -> Array<{ id, role, text }>`
- Produces: `fetchActiveConversation({ conversationId, origin, fetchImpl }) -> Promise<{ currentNode, messages }>`
- Produces: `createTokenLedger({ conversationId, currentNode, messages, estimateTextTokens, updatedAt }) -> ledger`

- [ ] Write failing unit tests for route extraction, sibling-branch exclusion, malformed trees, mixed content parts, authenticated requests, HTTP failures, and text-free ledgers.
- [ ] Run `node --test tests/conversation.test.js` and confirm it fails because `src/conversation.js` is missing.
- [ ] Implement the smallest dependency-free adapter that passes the tests.
- [ ] Run `node --test tests/conversation.test.js` and confirm all adapter tests pass.
- [ ] Add the test to `npm test` and both files to static syntax checking.
- [ ] Commit with `feat: add full conversation adapter`.

### Task 2: Meter source state and cache

**Files:**
- Modify: `src/content.js`
- Modify: `tests/browser.test.js`

**Interfaces:**
- Consumes: `ContextGuardConversation.fetchActiveConversation(...)`
- Consumes: `ContextGuardConversation.createTokenLedger(...)`
- Uses storage key: `conversationEstimateCache`
- Cache value: `{ version: 1, entries: { [conversationId]: ledger } }`

- [ ] Extend the browser harness with an injected `ContextGuardEnvironment.fetchActiveConversation` implementation and fake API payload.
- [ ] Add a failing browser test proving two mounted messages are replaced by a larger active-branch estimate.
- [ ] Add failing browser tests for cached fallback and uncached partial fallback.
- [ ] Implement fetch deduplication, route reset, generation-complete refresh, one-minute idle refresh, and bounded 20-entry token-only cache.
- [ ] Keep `conversationMessages()` as the sole source for checkpoint response binding.
- [ ] Run `npm test` and `npm run test:browser` and confirm the new and existing flows pass.
- [ ] Commit with `feat: use full conversation estimates`.

### Task 3: Honest UI labels and build wiring

**Files:**
- Modify: `manifest.json`
- Modify: `src/content.js`
- Modify: `src/styles.css`
- Modify: `scripts/build.js`
- Modify: `tests/extension.test.js`
- Modify: `README.md`

**Interfaces:**
- Fresh label: `full-history tokens`
- Cached label: `cached full-history tokens`
- Partial label: `loaded tokens` with a visible `+`

- [ ] Add failing static/browser assertions for script order, source labels, partial `+`, and the updated disclaimer.
- [ ] Load `src/conversation.js` before `src/content.js` in the manifest and browser fixture.
- [ ] Add the module to the build and lint file lists.
- [ ] Render the three source states without changing warning thresholds or checkpoint controls.
- [ ] Document the internal-API limitation and fallback semantics in README.
- [ ] Run `npm test`, `npm run lint`, `npm run build`, and `npm run test:browser`.
- [ ] Commit with `docs: explain full and partial estimates`.

### Task 4: Final verification and review

**Files:**
- Modify: `CHECKPOINT.md`

- [ ] Run the complete `npm run verify` suite in CI.
- [ ] Confirm the cache contains no message text or access token fields by inspecting the implementation and unit tests.
- [ ] Confirm alternate regenerated branches are excluded by the active-parent-chain test.
- [ ] Update `CHECKPOINT.md` with exact commands, results, remaining live-site smoke test, and the next action.
- [ ] Open a pull request against `codex/context-guard` with verification evidence and the undocumented-endpoint risk called out.
