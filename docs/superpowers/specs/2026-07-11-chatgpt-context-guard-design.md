# ChatGPT Context Guard Design

## Goal

Build a dependency-free Manifest V3 Chrome extension that estimates the token size of the visible transcript in a ChatGPT web conversation, warns before a long conversation becomes risky, and helps carry a structured checkpoint into a fresh chat.

## Accuracy boundary

The extension reports **estimated visible tokens**, never actual server-side context usage. It cannot see system instructions, hidden tool payloads, reasoning tokens, product-specific context limits, or server-side compaction. The UI must repeat this limitation.

## User experience

- A compact floating meter sits at the lower-right edge of the conversation pane.
- The meter supports light and dark ChatGPT themes and can collapse.
- It shows estimated visible tokens, a progress rail, current recommendation, settings, and one primary action.
- Default thresholds are 250,000 tokens for “long conversation,” 400,000 for “checkpoint recommended,” and 600,000 for “start fresh chat.”
- Crossing a threshold emits one dismissible warning per severity level per conversation.
- Settings allow all three thresholds to be changed and persist through `chrome.storage.sync`.
- “Generate checkpoint” inserts a checkpoint request into ChatGPT’s composer without sending it.
- After the user sends the request and ChatGPT responds, “Carry latest response” stores the newest assistant response locally and opens a new ChatGPT conversation. The new chat composer is prefilled with that checkpoint without sending it.

## Architecture

- `manifest.json`: minimal MV3 manifest with ChatGPT host access and `storage` permission.
- `src/core.js`: pure token estimation, state classification, threshold validation, and checkpoint prompt generation.
- `src/content.js`: ChatGPT DOM adapter, mutation observation, warning state, carry-to-new-chat flow, and Shadow DOM widget.
- `src/styles.css`: isolated widget styles loaded inside the Shadow DOM.
- `tests/core.test.js`: Node built-in tests for all pure logic.
- `tests/fixture.html`: deterministic ChatGPT-like page for browser verification.

## Privacy and safety

- No analytics, remote calls, API keys, cookies, or network interception.
- Transcript text stays in the page and is used only for local estimation.
- Only an explicit user click writes into the composer or starts a new chat.
- The extension never automatically submits a message.

## Verification

- Unit tests cover token estimation, thresholds, validation, and checkpoint text.
- Static checks validate JavaScript and the manifest.
- Browser verification loads the unpacked extension against the deterministic fixture, checks normal/warning/critical states, settings, checkpoint insertion, and light/dark rendering.
- A live ChatGPT smoke test verifies DOM compatibility without sending a message.

