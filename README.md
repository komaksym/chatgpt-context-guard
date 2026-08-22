# ChatGPT Context Guard

ChatGPT Context Guard is a local-only Chrome extension that estimates the size of the active ChatGPT conversation history. It shows a Codex-style context-window readout, warns before a long thread becomes risky, and prepares a structured checkpoint for continuing in a fresh chat.

## Context-window readout

The meter stays folded by default as a compact token-count pill. Click the pill to expand the full readout.

The expanded meter shows the same useful shape as the Codex app:

- **percent used / percent left**;
- **estimated tokens used / configured context-window size**;
- a progress rail and warning state.

The default context-window size is **258,000 tokens**. ChatGPT's web UI does not expose an authoritative per-chat model context limit to extensions, so the denominator is configurable from the meter settings. If the model you selected uses a different window, change that value there.

Warnings are derived from the configured window instead of unrelated absolute token thresholds:

- 65%: long conversation;
- 80%: checkpoint recommended;
- 95%: start a fresh chat.

## What it can and cannot measure

For saved conversation routes, the extension first tries to load ChatGPT's complete active conversation branch from ChatGPT's own same-origin conversation data. This avoids undercounting when the page virtualizes old messages and removes them from the DOM.

The meter counts every textual message exposed on that active branch, including user, assistant, system/developer, and tool roles. It does not count inactive regenerated sibling branches.

The meter labels the source of every estimate:

- **Full history** — a fresh complete active-branch snapshot.
- **Cached full history** — the most recent complete snapshot when refreshing is unavailable.
- **Partial loaded history** — only currently mounted page messages; the number includes a `+` suffix and the percentage is shown as a lower bound.

Only token counts, roles, and message IDs are cached locally. Conversation text and access tokens are never persisted. The ChatGPT conversation endpoint is undocumented and may change, so the DOM fallback is intentional.

The numerator is still an estimate, not server-authoritative token telemetry. Tokenization uses a lightweight local heuristic rather than the selected model's exact tokenizer, and context that ChatGPT does not expose to the page is unknowable. Server-side truncation and compaction are also unknown. The configured denominator is not automatically model-detected.

## Install from source

1. Run `npm ci && npm run verify`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this repository's `dist` directory.
5. Open or reload `https://chatgpt.com`.

## Checkpoint workflow

1. Expand the meter and click **Generate checkpoint**.
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