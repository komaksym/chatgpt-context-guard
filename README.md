# ChatGPT Context Guard

ChatGPT Context Guard is a local-only Chrome extension that estimates the size of the active ChatGPT conversation history. It warns before a long thread becomes risky and prepares a structured checkpoint for continuing in a fresh chat.

## What it can and cannot measure

For saved conversation routes, the extension first tries to load ChatGPT's complete active conversation branch from ChatGPT's own same-origin conversation data. This avoids undercounting when the page virtualizes old messages and removes them from the DOM.

The meter labels the source of every estimate:

- **Full history** — a fresh complete active-branch snapshot.
- **Cached full history** — the most recent complete snapshot when refreshing is unavailable.
- **Partial loaded history** — only currently mounted page messages; the number includes a `+` suffix.

Only token counts and message IDs are cached locally. Conversation text and access tokens are never persisted. The ChatGPT conversation endpoint is undocumented and may change, so the DOM fallback is intentional.

The meter still cannot see hidden system instructions, tool payloads, reasoning tokens, the exact content ChatGPT sends to the model, server-side truncation, or compaction. Treat it as an early-warning estimate, not an exact context-window gauge.

Default warning thresholds:

- 250K: long conversation
- 400K: checkpoint recommended
- 600K: start a fresh chat

All thresholds are configurable from the meter.

## Install from source

1. Run `npm ci && npm run verify`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this repository's `dist` directory.
5. Open or reload `https://chatgpt.com`.

## Checkpoint workflow

1. Click **Generate checkpoint**.
2. Review the prompt inserted into ChatGPT and send it yourself.
3. After ChatGPT finishes the checkpoint response, click **Carry latest to new chat**. The extension captures that checkpoint response, so later turns cannot replace it.
4. The extension opens a fresh chat and prefills its composer with the captured checkpoint. It never sends a message automatically.

## Privacy

- No analytics or third-party remote calls.
- No cookies, API keys, bearer tokens, or conversation text are persisted.
- Full-history requests stay on the current ChatGPT origin and use the existing signed-in browser session.
- Settings, token-only conversation ledgers, and one pending checkpoint are stored through Chrome extension storage.

## Development

```bash
npm ci
npm test
npm run lint
npm run build
npm run test:browser
```

The browser test uses an installed Chrome or Chromium executable. Set `CHROMIUM_PATH` when it is not available at a common system path.