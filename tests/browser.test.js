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

async function injectContentScript(page, pendingCheckpoint = null) {
  await page.setContent(fixture);
  await page.evaluate((pending) => {
    const sync = {};
    const local = pending ? { pendingCheckpoint: pending } : {};
    globalThis.__contextGuardStorage = { local, sync };
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
  }, pendingCheckpoint);
  await page.addScriptTag({ path: path.join(root, "src/core.js") });
  await page.addScriptTag({ path: path.join(root, "src/dom.js") });
  await page.addScriptTag({ path: path.join(root, "src/content.js") });
  await page.locator("#chatgpt-context-guard-host").waitFor();
}

test("browser fixture verifies multi-block extraction, explicit theme, and short checkpoint readiness", async (t) => {
  const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: ["--no-sandbox"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await injectContentScript(page);

  const messages = await page.evaluate(() => globalThis.ContextGuardDom.conversationMessages(document));
  assert.equal(messages[1].text, "first block\n\nnested duplicate\nsecond block");

  const host = page.locator("#chatgpt-context-guard-host");
  const primary = host.locator(".primary");
  await primary.click();
  await page.waitForFunction(() => document.querySelector("#prompt-textarea").textContent.includes("lossless task checkpoint"));

  await page.evaluate(() => {
    const article = document.createElement("article");
    article.setAttribute("data-message-author-role", "assistant");
    article.innerHTML = '<div class="markdown">Done.</div>';
    document.querySelector("main").append(article);
  });
  await primary.getByText("Carry latest to new chat", { exact: true }).waitFor();

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.waitForFunction(() => document.querySelector("#chatgpt-context-guard-host").dataset.theme === "dark");
});
