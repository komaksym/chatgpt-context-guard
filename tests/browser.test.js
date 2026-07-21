const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const fixture = fs.readFileSync(path.join(__dirname, "fixture.html"), "utf8");

function browserExecutable() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error("Set CHROMIUM_PATH to a Chrome or Chromium executable.");
  return executable;
}

async function launchBrowser(t) {
  const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: ["--no-sandbox"],
  });
  t.after(() => browser.close());
  return browser;
}

async function injectContentScript(
  page,
  { pendingCheckpoint = null, route = "/c/fixture", clearMessages = false } = {},
) {
  await page.setContent(fixture);
  await page.evaluate(
    ({ pending, pathname, shouldClearMessages }) => {
      if (shouldClearMessages) {
        document.querySelectorAll('[data-message-author-role="user"], [data-message-author-role="assistant"]').forEach((node) => node.remove());
      }
      const sync = {};
      const local = pending ? { pendingCheckpoint: pending } : {};
      let currentPathname = pathname;
      globalThis.__contextGuardStorage = { local, sync };
      globalThis.__contextGuardNavigation = null;
      globalThis.ContextGuardEnvironment = {
        pathname: () => currentPathname,
        navigate(url) {
          globalThis.__contextGuardNavigation = url;
          currentPathname = "/";
        },
      };
      globalThis.chrome = {
        runtime: { getURL: () => "data:text/css," },
        storage: {
          sync: {
            async get(key) { return key ? { [key]: sync[key] } : { ...sync }; },
            async set(values) { Object.assign(sync, values); },
          },
          local: {
            async get(key) { return key ? { [key]: local[key] } : { ...local }; },
            async set(values) { Object.assign(local, values); },
            async remove(key) { delete local[key]; },
          },
        },
      };
    },
    { pending: pendingCheckpoint, pathname: route, shouldClearMessages: clearMessages },
  );
  await page.addScriptTag({ path: path.join(root, "src/core.js") });
  await page.addScriptTag({ path: path.join(root, "src/dom.js") });
  await page.addScriptTag({ path: path.join(root, "src/content.js") });
  await page.locator("#chatgpt-context-guard-host").waitFor();
}

async function appendMessage(page, role, text) {
  await page.evaluate(
    ({ authorRole, messageText }) => {
      const article = document.createElement("article");
      article.setAttribute("data-message-author-role", authorRole);
      const content = document.createElement("div");
      content.className = authorRole === "assistant" ? "markdown" : "whitespace-pre-wrap";
      content.textContent = messageText;
      article.append(content);
      document.querySelector("main").append(article);
    },
    { authorRole: role, messageText: text },
  );
}

test("browser fixture verifies multi-block extraction, explicit theme, and short checkpoint readiness", async (t) => {
  const browser = await launchBrowser(t);
  const page = await browser.newPage();
  await injectContentScript(page);

  const messages = await page.evaluate(() => globalThis.ContextGuardDom.conversationMessages(document));
  assert.equal(messages[1].text, "first block\n\nnested duplicate\nsecond block");

  const host = page.locator("#chatgpt-context-guard-host");
  const primary = host.locator(".primary");
  await primary.click();
  await page.waitForFunction(() => document.querySelector("#prompt-textarea").textContent.includes("lossless task checkpoint"));
  const checkpointPrompt = await page.locator("#prompt-textarea").innerText();

  await appendMessage(page, "user", checkpointPrompt);
  await appendMessage(page, "assistant", "Done.");
  await primary.getByText("Carry latest to new chat", { exact: true }).waitFor();

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.waitForFunction(() => document.querySelector("#chatgpt-context-guard-host").dataset.theme === "dark");
});

test("browser fixture carries the checkpoint response and consumes it in a fresh chat", async (t) => {
  const browser = await launchBrowser(t);
  const page = await browser.newPage();
  await injectContentScript(page);

  const primary = page.locator("#chatgpt-context-guard-host").locator(".primary");
  await primary.click();
  const checkpointPrompt = await page.locator("#prompt-textarea").innerText();
  await appendMessage(page, "user", `${checkpointPrompt}\n\nAlso preserve the open review thread IDs.`);
  await appendMessage(page, "assistant", "checkpoint response");
  await primary.getByText("Carry latest to new chat", { exact: true }).waitFor();

  await appendMessage(page, "user", "unrelated later question");
  await appendMessage(page, "assistant", "unrelated later answer");
  await page.waitForTimeout(350);
  await primary.click();
  await page.waitForFunction(() => globalThis.__contextGuardNavigation === "/");

  const carryState = await page.evaluate(() => ({
    pendingCheckpoint: globalThis.__contextGuardStorage.local.pendingCheckpoint,
    navigation: globalThis.__contextGuardNavigation,
  }));
  assert.deepEqual(carryState, { pendingCheckpoint: "checkpoint response", navigation: "/" });

  const freshPage = await browser.newPage();
  await injectContentScript(freshPage, {
    pendingCheckpoint: carryState.pendingCheckpoint,
    route: "/",
    clearMessages: true,
  });
  await freshPage.waitForFunction(() => document.querySelector("#prompt-textarea").textContent.includes("checkpoint response"));
  const prefilledText = (await freshPage.locator("#prompt-textarea").innerText()).replace(/\n{2,}/g, "\n\n");
  assert.equal(prefilledText, "Continue from this checkpoint:\n\ncheckpoint response");
  assert.equal(
    await freshPage.evaluate(() => Object.hasOwn(globalThis.__contextGuardStorage.local, "pendingCheckpoint")),
    false,
  );
});

test("10,000-message browser DOM stays responsive through extraction and observer renders", async (t) => {
  const browser = await launchBrowser(t);
  const page = await browser.newPage();
  await injectContentScript(page);
  const count = page.locator("#chatgpt-context-guard-host").locator(".token-count");
  const initialCount = await count.innerText();

  const measurement = await page.evaluate(() => {
    const main = document.querySelector("main");
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 10_000; index += 1) {
      const article = document.createElement("article");
      article.setAttribute("data-message-author-role", index % 2 ? "assistant" : "user");
      const content = document.createElement("div");
      content.className = index % 2 ? "markdown" : "whitespace-pre-wrap";
      content.textContent = `message ${index}`;
      article.append(content);
      fragment.append(article);
    }
    globalThis.__contextGuardRenderStarted = performance.now();
    main.append(fragment);
    const adapterStarted = performance.now();
    const messages = globalThis.ContextGuardDom.conversationMessages(document);
    return {
      adapterElapsed: performance.now() - adapterStarted,
      messageCount: messages.length,
    };
  });

  assert.equal(measurement.messageCount, 10_002);
  assert.ok(measurement.adapterElapsed < 1_500, `expected browser extraction <1500ms, got ${measurement.adapterElapsed.toFixed(1)}ms`);
  await page.waitForFunction(
    (before) => document.querySelector("#chatgpt-context-guard-host").shadowRoot.querySelector(".token-count").textContent !== before,
    initialCount,
    { timeout: 5_000 },
  );
  const firstRenderElapsed = await page.evaluate(() => performance.now() - globalThis.__contextGuardRenderStarted);
  assert.ok(firstRenderElapsed < 3_000, `expected observer render <3000ms, got ${firstRenderElapsed.toFixed(1)}ms`);

  const beforeBurst = await count.innerText();
  await page.evaluate(() => {
    const main = document.querySelector("main");
    globalThis.__contextGuardBurstStarted = performance.now();
    for (let index = 0; index < 50; index += 1) {
      const article = document.createElement("article");
      article.setAttribute("data-message-author-role", "assistant");
      article.innerHTML = `<div class="markdown">burst ${index} ${"x".repeat(400)}</div>`;
      main.append(article);
    }
  });
  await page.waitForFunction(
    (before) => document.querySelector("#chatgpt-context-guard-host").shadowRoot.querySelector(".token-count").textContent !== before,
    beforeBurst,
    { timeout: 5_000 },
  );
  const burstElapsed = await page.evaluate(() => performance.now() - globalThis.__contextGuardBurstStarted);
  assert.ok(burstElapsed < 3_000, `expected burst render <3000ms, got ${burstElapsed.toFixed(1)}ms`);
});
