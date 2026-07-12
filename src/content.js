(function startContextGuard() {
  "use strict";

  const core = globalThis.ContextGuardCore;
  const dom = globalThis.ContextGuardDom;
  const environment = globalThis.ContextGuardEnvironment || {};
  if (!core || !dom || document.getElementById("chatgpt-context-guard-host")) return;

  const host = document.createElement("div");
  host.id = "chatgpt-context-guard-host";
  host.setAttribute("data-chatgpt-context-guard", "");
  document.documentElement.append(host);

  const shadow = host.attachShadow({ mode: "open" });
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = chrome.runtime.getURL("src/styles.css");
  shadow.append(stylesheet);

  const shell = document.createElement("section");
  shell.className = "guard";
  shell.setAttribute("aria-label", "ChatGPT context estimate");
  shell.innerHTML = `
    <button class="collapsed" type="button" aria-label="Expand context estimate" hidden>
      <span class="collapsed-dot"></span><span class="collapsed-count">0</span>
    </button>
    <div class="panel">
      <header>
        <strong>Context estimate</strong>
        <div class="header-actions">
          <button class="icon-button settings-button" type="button" aria-label="Context Guard settings">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 3.2h4.8l.5 2a7.8 7.8 0 0 1 1.4.8l2-.6 2.4 4.2-1.5 1.4a8.5 8.5 0 0 1 0 1.7l1.5 1.4-2.4 4.2-2-.6a7.8 7.8 0 0 1-1.4.8l-.5 2H9.6l-.5-2a7.8 7.8 0 0 1-1.4-.8l-2 .6-2.4-4.2 1.5-1.4a8.5 8.5 0 0 1 0-1.7L3.3 9.6l2.4-4.2 2 .6a7.8 7.8 0 0 1 1.4-.8l.5-2Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="icon-button collapse-button" type="button" aria-label="Collapse context estimate">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>
          </button>
        </div>
      </header>
      <div class="rail" aria-hidden="true"><span></span></div>
      <div class="count"><span class="token-count">0</span> visible tokens</div>
      <div class="status" role="status"><span class="status-dot"></span><span class="status-text"></span></div>
      <p class="disclaimer">Visible-message estimate only. Hidden system, tool, and reasoning context, server limits, and compaction are unknown.</p>
      <button class="primary" type="button">Generate checkpoint</button>
      <form class="settings" hidden>
        <label>Long conversation <input name="long" type="number" min="1" step="1000"></label>
        <label>Checkpoint recommended <input name="warning" type="number" min="2" step="1000"></label>
        <label>Start fresh chat <input name="critical" type="number" min="3" step="1000"></label>
        <p class="settings-error" role="alert"></p>
        <div class="settings-actions">
          <button class="secondary cancel-settings" type="button">Cancel</button>
          <button class="secondary save-settings" type="submit">Save</button>
        </div>
      </form>
    </div>
    <aside class="warning-toast" role="alert" hidden>
      <div><strong class="warning-title"></strong><p class="warning-copy"></p></div>
      <button class="warning-dismiss" type="button" aria-label="Dismiss warning">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>
      </button>
    </aside>
  `;
  shadow.append(shell);

  const elements = {
    panel: shell.querySelector(".panel"),
    collapsed: shell.querySelector(".collapsed"),
    collapsedCount: shell.querySelector(".collapsed-count"),
    count: shell.querySelector(".token-count"),
    rail: shell.querySelector(".rail span"),
    status: shell.querySelector(".status-text"),
    primary: shell.querySelector(".primary"),
    settings: shell.querySelector(".settings"),
    settingsError: shell.querySelector(".settings-error"),
    warning: shell.querySelector(".warning-toast"),
    warningTitle: shell.querySelector(".warning-title"),
    warningCopy: shell.querySelector(".warning-copy"),
  };

  let thresholds = core.DEFAULT_THRESHOLDS;
  let warned = new Set();
  let lastPath = currentPathname();
  let updateTimer = 0;
  let checkpointAnchor = [];
  let checkpointPrompt = "";
  let checkpointResponse = "";
  let observedRoot = null;

  const conversationObserver = new MutationObserver((mutations) => {
    if (dom.mutationsAffectMessages(mutations)) scheduleRender();
  });
  const themeObserver = new MutationObserver(() => applyTheme());
  const colorScheme = matchMedia("(prefers-color-scheme: dark)");

  function conversationMessages() {
    return dom.conversationMessages(document);
  }

  function currentPathname() {
    return environment.pathname?.() || location.pathname;
  }

  function navigate(url) {
    if (environment.navigate) environment.navigate(url);
    else location.assign(url);
  }

  function findComposer() {
    return dom.findComposer(document);
  }

  function setComposerText(text) {
    const composer = findComposer();
    if (!composer) return false;
    composer.focus();
    if ("value" in composer) {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(composer), "value");
      if (descriptor?.set) descriptor.set.call(composer, text);
      else composer.value = text;
    } else {
      const selection = document.getSelection();
      const range = document.createRange();
      range.selectNodeContents(composer);
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand("insertText", false, text)) composer.textContent = text;
      selection.removeAllRanges();
    }
    composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    return true;
  }

  function isGenerating() {
    return Boolean(document.querySelector('[data-testid="stop-button"], button[aria-label*="Stop"]'));
  }

  function maybeCaptureCheckpoint(messages) {
    if (checkpointResponse || !checkpointPrompt) return;
    checkpointResponse = dom.findCheckpointResponse({
      anchorMessages: checkpointAnchor,
      checkpointPrompt,
      messages,
      generating: isGenerating(),
    });
  }

  function warningContent(level) {
    if (level === "critical") return ["Start a fresh chat", "Create a checkpoint now to reduce the risk of losing early constraints."];
    if (level === "warning") return ["Checkpoint recommended", "This conversation is large enough that a continuation checkpoint is prudent."];
    return ["Long conversation", "Context is growing. Confirm that important decisions are written down."];
  }

  function showWarning(level) {
    if (level === "normal" || warned.has(level)) return;
    warned.add(level);
    const [title, copy] = warningContent(level);
    elements.warningTitle.textContent = title;
    elements.warningCopy.textContent = copy;
    elements.warning.dataset.level = level;
    elements.warning.hidden = false;
  }

  function applyTheme() {
    host.dataset.theme = dom.resolveTheme(document, colorScheme.matches);
  }

  function refreshObservedRoot() {
    const nextRoot = dom.findConversationRoot(document);
    if (!nextRoot || nextRoot === observedRoot) return;
    conversationObserver.disconnect();
    conversationObserver.observe(nextRoot, { childList: true, subtree: true, characterData: true });
    observedRoot = nextRoot;
  }

  function render() {
    refreshObservedRoot();
    applyTheme();
    if (currentPathname() !== lastPath) {
      lastPath = currentPathname();
      warned = new Set();
      checkpointAnchor = [];
      checkpointPrompt = "";
      checkpointResponse = "";
      elements.warning.hidden = true;
      consumePendingCheckpoint();
    }
    const messages = conversationMessages();
    const tokens = core.estimateTranscriptTokens(messages);
    const usage = core.classifyUsage(tokens, thresholds);
    maybeCaptureCheckpoint(messages);

    shell.dataset.level = usage.level;
    elements.count.textContent = core.formatTokenCount(tokens);
    elements.collapsedCount.textContent = core.formatTokenCount(tokens);
    elements.status.textContent = usage.label;
    elements.rail.style.width = `${Math.min(100, (tokens / thresholds.critical) * 100)}%`;
    elements.primary.textContent = checkpointResponse ? "Carry latest to new chat" : "Generate checkpoint";
    showWarning(usage.level);
  }

  function scheduleRender() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(render, 250);
  }

  async function loadThresholds() {
    const stored = await chrome.storage.sync.get("thresholds");
    if (stored.thresholds) {
      try {
        thresholds = core.normalizeThresholds(stored.thresholds);
      } catch {
        thresholds = core.DEFAULT_THRESHOLDS;
      }
    }
    renderSettings();
    render();
  }

  function renderSettings() {
    for (const key of ["long", "warning", "critical"]) elements.settings.elements[key].value = thresholds[key];
    elements.settingsError.textContent = "";
  }

  async function generateCheckpoint() {
    const messages = conversationMessages();
    checkpointAnchor = messages.slice(-4);
    checkpointPrompt = core.createCheckpointPrompt();
    checkpointResponse = "";
    if (!setComposerText(checkpointPrompt)) {
      elements.status.textContent = "Could not find the ChatGPT composer";
      return;
    }
    elements.status.textContent = "Checkpoint prompt prepared — review and send it";
  }

  async function carryLatestToNewChat() {
    if (!checkpointResponse) return;
    await chrome.storage.local.set({ pendingCheckpoint: checkpointResponse });
    navigate("/");
  }

  async function consumePendingCheckpoint() {
    if (currentPathname() !== "/") return;
    const { pendingCheckpoint } = await chrome.storage.local.get("pendingCheckpoint");
    if (!pendingCheckpoint) return;
    let attempts = 0;
    const tryInsert = async () => {
      if (setComposerText(`Continue from this checkpoint:\n\n${pendingCheckpoint}`)) {
        await chrome.storage.local.remove("pendingCheckpoint");
        return;
      }
      if (attempts++ < 30) setTimeout(tryInsert, 250);
    };
    tryInsert();
  }

  shell.querySelector(".collapse-button").addEventListener("click", () => {
    elements.panel.hidden = true;
    elements.collapsed.hidden = false;
  });
  elements.collapsed.addEventListener("click", () => {
    elements.collapsed.hidden = true;
    elements.panel.hidden = false;
  });
  shell.querySelector(".settings-button").addEventListener("click", () => {
    renderSettings();
    elements.settings.hidden = !elements.settings.hidden;
  });
  shell.querySelector(".cancel-settings").addEventListener("click", () => {
    elements.settings.hidden = true;
    renderSettings();
  });
  elements.settings.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      thresholds = core.normalizeThresholds(Object.fromEntries(new FormData(elements.settings)));
      await chrome.storage.sync.set({ thresholds });
      elements.settings.hidden = true;
      render();
    } catch (error) {
      elements.settingsError.textContent = error.message;
    }
  });
  elements.primary.addEventListener("click", () => {
    if (checkpointResponse) carryLatestToNewChat();
    else generateCheckpoint();
  });
  shell.querySelector(".warning-dismiss").addEventListener("click", () => {
    elements.warning.hidden = true;
  });

  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  colorScheme.addEventListener?.("change", applyTheme);
  setInterval(() => {
    if (currentPathname() !== lastPath || dom.findConversationRoot(document) !== observedRoot) scheduleRender();
  }, 1_000);

  refreshObservedRoot();
  applyTheme();
  loadThresholds();
  consumePendingCheckpoint();
})();
