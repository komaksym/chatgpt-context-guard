(function initContextGuardDom(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ContextGuardDom = api;
})(typeof globalThis === "object" ? globalThis : this, function createDomAdapter() {
  "use strict";

  const MESSAGE_SELECTOR = '[data-message-author-role="user"], [data-message-author-role="assistant"]';
  const CONTENT_SELECTOR = ".markdown, .whitespace-pre-wrap";
  const COMPOSER_SELECTOR = '#prompt-textarea, textarea[data-id="root"]';

  function nodeText(node) {
    return node?.innerText || node?.textContent || "";
  }

  function messageText(messageNode) {
    const candidates = [...messageNode.querySelectorAll(CONTENT_SELECTOR)];
    const topLevel = candidates.filter(
      (candidate) => !candidates.some((other) => other !== candidate && other.contains(candidate)),
    );
    const sources = topLevel.length ? topLevel : [messageNode];
    return sources
      .map((node) => nodeText(node).trim())
      .filter(Boolean)
      .join("\n\n");
  }

  function conversationMessages(documentObject) {
    return [...documentObject.querySelectorAll(MESSAGE_SELECTOR)]
      .map((node) => ({
        role: node.getAttribute("data-message-author-role"),
        text: messageText(node),
      }))
      .filter((message) => message.text);
  }

  function latestAssistantText(messages) {
    return [...messages].reverse().find((message) => message.role === "assistant")?.text.trim() || "";
  }

  function findComposer(documentObject) {
    return documentObject.querySelector(COMPOSER_SELECTOR);
  }

  function isCheckpointReady({
    baselineAssistantCount,
    previousResponse,
    messages,
    generating,
  }) {
    if (baselineAssistantCount === null || generating) return false;
    const assistantCount = messages.filter((message) => message.role === "assistant").length;
    const latest = latestAssistantText(messages);
    return assistantCount > baselineAssistantCount && Boolean(latest) && latest !== previousResponse;
  }

  function resolveTheme(documentObject, prefersDark) {
    const rootElement = documentObject.documentElement;
    const explicit = rootElement?.dataset?.theme;
    if (explicit === "dark" || explicit === "light") return explicit;
    if (rootElement?.classList?.contains("dark")) return "dark";
    if (rootElement?.classList?.contains("light")) return "light";
    return prefersDark ? "dark" : "light";
  }

  function findConversationRoot(documentObject) {
    return documentObject.querySelector("main, [role=\"main\"]") || documentObject.body;
  }

  return Object.freeze({
    COMPOSER_SELECTOR,
    CONTENT_SELECTOR,
    MESSAGE_SELECTOR,
    conversationMessages,
    findComposer,
    findConversationRoot,
    isCheckpointReady,
    latestAssistantText,
    messageText,
    resolveTheme,
  });
});
