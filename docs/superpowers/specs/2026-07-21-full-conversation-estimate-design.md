# Full Conversation Estimate Design

## Problem

ChatGPT virtualizes long conversations. `document.querySelectorAll(...)` can only see messages currently mounted in the DOM, so the existing meter silently undercounts a long chat depending on scroll position.

## Goal

Show an estimate for the complete active conversation branch when ChatGPT's own conversation payload is available, while preserving a safe DOM fallback and clearly labeling every estimate as full, cached, or partial.

## Non-goals

- Claiming the exact model input context. Hidden system/tool/reasoning content, server-side truncation, and compaction remain unknowable.
- Counting inactive regenerated or edited branches.
- Persisting conversation text or access tokens.
- Replacing the DOM-based checkpoint-turn capture flow.

## Architecture

### `src/conversation.js`

A dependency-free, testable adapter owns all undocumented ChatGPT conversation API behavior.

It exposes:

- `conversationIdFromPathname(pathname)` — extracts the ID from any route containing `/c/<id>`.
- `activeBranchMessages(payload)` — walks `current_node -> parent -> ... -> root`, reverses the result, and returns only active user/assistant messages.
- `contentText(content)` — extracts textual parts from `text` and `multimodal_text` payloads without serializing metadata or tool objects.
- `fetchActiveConversation({ conversationId, origin, fetchImpl })` — obtains an in-memory access token from `/api/auth/session`, then fetches `/backend-api/conversation/<id>` using `credentials: "include"` and an Authorization header.
- `createTokenLedger(messages, estimateTextTokens)` — stores only `{ role, tokens }` by message ID plus total/message count/current node metadata.

Malformed payloads, missing parents, cycles, authentication failures, and non-2xx responses fail closed so the caller can use a cached or DOM estimate.

### Content-script state

`src/content.js` keeps three independent concerns:

1. DOM messages for checkpoint binding and carryover.
2. Full-conversation estimate state for the meter.
3. Last successful token-only ledger cache in `chrome.storage.local`.

Fetches are deduplicated and occur:

- when a conversation route is first detected;
- after route changes;
- when generation transitions from running to complete;
- periodically while idle, no more than once per minute.

The access token exists only inside the request promise and is never logged or stored.

### Fallback order

1. Fresh full active-branch payload.
2. Last successful token-only ledger for the same conversation ID.
3. Current mounted DOM messages.

The cache is a bounded map of the 20 most recently updated conversations. It contains no message text.

## UI states

- **Full:** `312K full-history tokens` with source copy `Complete active branch`.
- **Cached:** `312K cached full-history tokens` with source copy `Last complete snapshot; refresh unavailable`.
- **Partial:** `18K+ loaded tokens` with source copy `Partial — only currently loaded messages counted`.

Warnings are classified from the selected estimate. Cached and partial values must never be presented as complete live values.

The disclaimer becomes: `Active user/assistant history estimate. Hidden system, tool, and reasoning context, server limits, truncation, and compaction are unknown.`

## Error handling

- No conversation ID: use partial DOM mode.
- Authentication or conversation fetch failure: use cache, otherwise partial DOM mode.
- Invalid tree: reject the payload rather than counting all mapping nodes.
- API recovery: replace cached/partial state immediately and update the token-only ledger.
- New messages while cached: continue labeling the value cached; do not pretend that DOM and cached totals can be safely merged without stable message IDs.

## Testing

### Unit tests

- Route extraction supports standard and nested project routes.
- Active-branch traversal excludes regenerated sibling branches.
- Traversal rejects missing nodes and cycles.
- Text extraction handles strings and multimodal text objects while ignoring non-text objects.
- Fetching obtains the session token, sends credentials and Authorization, and surfaces HTTP errors.
- Token ledgers contain counts but no conversation text.

### Browser fixture

- A fixture with only two mounted DOM messages receives a larger fake API conversation and displays the full-history estimate.
- A failed API request with a stored ledger displays cached state.
- A failed API request without a ledger displays a `+` partial estimate.
- Existing checkpoint carryover and long-DOM performance tests remain green.

## Security and privacy

The extension only requests data from the ChatGPT origin already listed in `host_permissions`. It does not intercept network traffic, persist bearer tokens, persist message text, or contact third-party servers. The internal endpoint is undocumented and therefore always guarded by explicit fallback behavior.