# ChatGPT Context Guard

ChatGPT Context Guard is a local-only Chrome extension that estimates the size of the messages visible in a ChatGPT conversation. It warns before a long thread becomes risky and prepares a structured checkpoint for continuing in a fresh chat.

## What it can and cannot measure

The meter estimates **visible transcript tokens**. It cannot see ChatGPT system instructions, hidden tool payloads, reasoning tokens, server-side context limits, or compaction. Treat the meter as an early-warning heuristic, not an exact context gauge.

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
3. After ChatGPT finishes the checkpoint response, click **Carry latest to new chat**.
4. The extension opens a fresh chat and prefills its composer with the checkpoint. It never sends a message automatically.

## Privacy

- No analytics or remote calls.
- No cookies, API keys, or network interception.
- Transcript text stays inside the ChatGPT page.
- Settings and one pending checkpoint are stored through Chrome extension storage.

## Development

```bash
npm ci
npm test
npm run lint
npm run build
npm run test:browser
```

The browser test uses an installed Chrome or Chromium executable. Set `CHROMIUM_PATH` when it is not available at a common system path.
