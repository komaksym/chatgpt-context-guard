(function startContextGuard() {
  "use strict";

  const core = globalThis.ContextGuardCore;
  const dom = globalThis.ContextGuardDom;
  const conversation = globalThis.ContextGuardConversation;
  const environment = globalThis.ContextGuardEnvironment || {};
  if (!core || !dom || !conversation || document.getElementById("chatgpt-context-guard-host")) return;

  const CACHE_KEY = "conversationEstimateCache";
  const CONTEXT_WINDOW_STORAGE_KEY = "contextWindowTokens";
  const CACHE_LIMIT = 20;
  const REFRESH_INTERVAL_MS = 60_000;
  const RETRY_DELAY_MS = 30_000;

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
  shell.setAttribute("aria-label", "ChatGPT context window estimate");
  shell.innerHTML = `
    <button class="collapsed" type="button" aria-label="Expand context estimate">
      <span class="collapsed-dot"></span><span class="collapsed-count">0+</span>
    </button>
    <div class="panel" hidden>
      <header>
        <strong>Context window</strong>
        <div class="header-actions">
          <button class="icon-button settings-button" type="button" aria-label="Context Guard settings">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 3.2h4.8l.5 2a7.8 7.8 0 0 1 1.4.8l2-.6 2.4 4.2-1.5 1.4a8.5 8.5 0 0 1 0 1.7l1.5 1.4-2.4 4.2-2-.6a7.8 7.8 0 0 1-1.4.8l-.5 2H9.6l-.5-2a7.8 7.8 0 0 1-1.4-.8l-2 .6-2.4-4.2 1.5-1.4a8.5 8.5 0 0 1 0-1.7L3.3 9.6l2.4-4.2 2 .6a7.8 7.8 0 0 1 1.4-.8l.5-2Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="icon-button collapse-button" type="button" aria-label="Collapse context estimate">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>
          </button>
        </div>
      </header>
      <div class="usage-summary"><span class="usage-percent">0% used</span> <span class="usage-left">(100% left)</span></div>
      <div class="rail" aria-hidden="true"><span></span></div>
      <div class="count"><span class="token-count">0+</span><span class="context-separator"> / </span><span class="context-limit">258K</span><span class="token-suffix"> tokens loaded</span></div>
      <div class="source" role="status">Partial — only currently loaded messages counted</div>
      <div class="status" role="status"><span class="status-dot"></span><span class="status-text"></span></div>
      <p class="disclaimer">Estimated textual active-branch history versus a configurable context window. Context not exposed by ChatGPT, exact model input, server-side truncation, and compaction remain unknown.</p>
      <button class="primary" type="button">Generate checkpoint</button>
      <form class="settings" hidden>
        <label>Context window <input name="contextWindowTokens" type="number" min="1000" step="1000"></label>
        <p class="settings-help">Default: 258,000 tokens. Change this only if the selected model uses a different window.</p>
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
    usagePercent: shell.querySelector(".usage-percent"),
    usageLeft: shell.querySelector(".usage-left"),
    count: shell.querySelector(".token-count"),
    contextLimit: shell.querySelector(".context-limit"),
    tokenSuffix: shell.querySelector(".token-suffix"),
    source: shell.querySelector(".source"),
    rail: shell.querySelector(".rail span"),
    status: shell.querySelector(".status-text"),
    primary: shell.querySelector(".primary"),
    settings: shell.querySelector(".settings"),
    settingsError: shell.querySelector(".settings-error"),
    warning: shell.querySelector(".warning-toast"),
    warningTitle: shell.querySelector(".warning-title"),
    warningCopy: shell.querySelector(".warning-copy"),
  };

  let contextWindowTokens = core.DEFAULT_CONTEXT_WINDOW_TOKENS;
  let thresholds = core.thresholdsForContextWindow(contextWindowTokens);
  let warned = new Set();
  let lastPath = currentPathname();
  let updateTimer = 0;
  let checkpointAnchor = [];
  let checkpointPrompt = "";
  let checkpointResponse = "";
  let observedRoot = null;
  let activeConversationId = null;
  let estimateState = { kind: "partial", tokens: 0, messageCount: 0 };
  let estimateRequest = null;
  let lastFullRefreshAt = 0;
  let nextRetryAt = 0;
  let wasGenerating = false;

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

  function currentOrigin() {
    return environment.origin?.() || location.origin;
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

  function validLedger(ledger, conversationId) {
    return Boolean(
      ledger &&
      ledger.conversationId === conversationId &&
      Number.isSafeInteger(ledger.totalTokens) &&
      ledger.totalTokens >= 0 &&
      Number.isSafeInteger(ledger.messageCount) &&
      ledger.messageCount >= 0 &&
      Number.isFinite(ledger.updatedAt),
    );
  }

  async function readEstimateCache() {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    const cache = stored[CACHE_KEY];
    if (cache?.version !== 1 || !cache.entries || typeof cache.entries !== "object") {
      return { version: 1, entries: {} };
    }
    return cache;
  }

  async function restoreCachedEstimate(conversationId) {
    const cache = await readEstimateCache();
    const ledger = cache.entries[conversationId];
    if (activeConversationId !== conversationId || !validLedger(ledger, conversationId)) return;
    estimateState = {
      kind: "cached",
      tokens: ledger.totalTokens,
      messageCount: ledger.messageCount,
      updatedAt: ledger.updatedAt,
    };
    scheduleRender();
  }

  async function storeLedger(ledger) {
    const cache = await readEstimateCache();
    cache.entries[ledger.conversationId] = ledger;
    const entries = Object.fromEntries(
      Object.entries(cache.entries)
        .filter(([conversationId, value]) => validLedger(value, conversationId))
        .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
        .slice(0, CACHE_LIMIT),
    );
    await chrome.storage.local.set({ [CACHE_KEY]: { version: 1, entries } });
  }

  function loadActiveConversation(options) {
    if (environment.fetchActiveConversation) return environment.fetchActiveConversation(options);
    return conversation.fetchActiveConversation(options);
  }

  async function refreshFullEstimate({ force = false } = {}) {
    const conversationId = activeConversationId;
    const now = Date.now();
    if (!conversationId || isGenerating()) return;
    if (estimateRequest?.conversationId === conversationId) return estimateRequest.promise;
    if (!force && (now - lastFullRefreshAt < REFRESH_INTERVAL_MS || now < nextRetryAt)) return;

    let request;
    request = Promise.resolve()
      .then(() =>
        loadActiveConversation({
          conversationId,
          origin: currentOrigin(),
          fetchImpl: globalThis.fetch?.bind(globalThis),
        }),
      )
      .then(async ({ currentNode, messages }) => {
        if (activeConversationId !== conversationId) return;
        const ledger = conversation.createTokenLedger({
          conversationId,
          currentNode,
          messages,
          estimateTextTokens: core.estimateTextTokens,
        });
        estimateState = {
          kind: "full",
          tokens: ledger.totalTokens,
          messageCount: ledger.messageCount,
          updatedAt: ledger.updatedAt,
        };
        lastFullRefreshAt = ledger.updatedAt;
        nextRetryAt = 0;
        await storeLedger(ledger).catch(() => {});
      })
      .catch(() => {
        if (activeConversationId !== conversationId) return;
        nextRetryAt = Date.now() + RETRY_DELAY_MS;
        if (estimateState.kind === "full") estimateState = { ...estimateState, kind: "cached" };
      })
      .finally(() => {
        if (estimateRequest?.promise === request) estimateRequest = null;
        if (activeConversationId === conversationId) scheduleRender();
      });
    estimateRequest = { conversationId, promise: request };
    return request;
  }

  async function initializeConversationEstimate(conversationId) {
    if (!conversationId) return;
    await restoreCachedEstimate(conversationId).catch(() => {});
    if (activeConversationId === conversationId) await refreshFullEstimate({ force: true });
  }

  function syncConversationRoute() {
    const nextConversationId = conversation.conversationIdFromPathname(currentPathname());
    if (nextConversationId === activeConversationId) return;
    activeConversationId = nextConversationId;
    estimateState = { kind: "partial", tokens: 0, messageCount: 0 };
    estimateRequest = null;
    lastFullRefreshAt = 0;
    nextRetryAt = 0;
    if (nextConversationId) void initializeConversationEstimate(nextConversationId);
  }

  function selectedEstimate(domMessages) {
    if (estimateState.kind === "full" || estimateState.kind === "cached") return estimateState;
    return {
      kind: "partial",
      tokens: core.estimateTranscriptTokens(domMessages),
      messageCount: domMessages.length,
    };
  }

  function estimatePresentation(estimate) {
    if (estimate.kind === "full") {
      return {
        count: core.formatTokenCount(estimate.tokens),
        suffix: " tokens used",
        source: "Complete active branch estimate",
      };
    }
    if (estimate.kind === "cached") {
      return {
        count: core.formatTokenCount(estimate.tokens),
        suffix: " tokens used",
        source: "Cached complete active branch estimate; refresh unavailable",
      };
    }
    return {
      count: `${core.formatTokenCount(estimate.tokens)}+`,
      suffix: " tokens loaded",
      source: "Partial — only currently loaded messages counted",
    };
  }

  function render() {
    refreshObservedRoot();
    applyTheme();
    syncConversationRoute();
    if (currentPathname() !== lastPath) {
      lastPath = currentPathname();
      warned = new Set();
      checkpointAnchor = [];
      checkpointPrompt = "";
      checkpointResponse = "";
      elements.warning.hidden = true;
      consumePendingCheckpoint();
    }

    const domMessages = conversationMessages();
    maybeCaptureCheckpoint(domMessages);
    const generating = isGenerating();
    if (generating && estimateState.kind === "full") estimateState = { ...estimateState, kind: "cached" };
    if (wasGenerating && !generating) void refreshFullEstimate({ force: true });
    wasGenerating = generating;

    const estimate = selectedEstimate(domMessages);
    const contextUsage = core.contextWindowUsage(estimate.tokens, contextWindowTokens);
    const usage = core.classifyUsage(estimate.tokens, thresholds);
    const presentation = estimatePresentation(estimate);
    const partial = estimate.kind === "partial";
    const partialPercent = partial && contextUsage.usedPercent > 0;

    shell.dataset.level = usage.level;
    shell.dataset.estimateSource = estimate.kind;
    elements.usagePercent.textContent = `${partialPercent ? "≥" : ""}${contextUsage.usedPercent}% used`;
    elements.usageLeft.textContent = `(${partial ? "≤" : ""}${contextUsage.leftPercent}% left)`;
    elements.count.textContent = presentation.count;
    elements.collapsedCount.textContent = presentation.count;
    elements.contextLimit.textContent = core.formatTokenCount(contextWindowTokens);
    elements.tokenSuffix.textContent = presentation.suffix;
    elements.source.textContent = presentation.source;
    elements.status.textContent = usage.label;
    elements.rail.style.width = `${Math.min(100, contextUsage.ratio * 100)}%`;
    elements.primary.textContent = checkpointResponse ? "Carry latest to new chat" : "Generate checkpoint";
    showWarning(usage.level);
  }

  function scheduleRender() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(render, 250);
  }

  async function loadContextWindow() {
    const stored = await chrome.storage.sync.get(CONTEXT_WINDOW_STORAGE_KEY);
    try {
      contextWindowTokens = core.normalizeContextWindowTokens(
        stored[CONTEXT_WINDOW_STORAGE_KEY] ?? core.DEFAULT_CONTEXT_WINDOW_TOKENS,
      );
    } catch {
      contextWindowTokens = core.DEFAULT_CONTEXT_WINDOW_TOKENS;
    }
    thresholds = core.thresholdsForContextWindow(contextWindowTokens);
    renderSettings();
    render();
  }

  function renderSettings() {
    elements.settings.elements.contextWindowTokens.value = contextWindowTokens;
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
      const form = new FormData(elements.settings);
      contextWindowTokens = core.normalizeContextWindowTokens(form.get("contextWindowTokens"));
      thresholds = core.thresholdsForContextWindow(contextWindowTokens);
      await chrome.storage.sync.set({ [CONTEXT_WINDOW_STORAGE_KEY]: contextWindowTokens });
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
    if (activeConversationId && !isGenerating()) void refreshFullEstimate();
  }, 1_000);

  refreshObservedRoot();
  applyTheme();
  syncConversationRoute();
  wasGenerating = isGenerating();
  loadContextWindow();
  consumePendingCheckpoint();
})();