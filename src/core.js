(function initContextGuardCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ContextGuardCore = api;
})(typeof globalThis === "object" ? globalThis : this, function createCore() {
  "use strict";

  const DEFAULT_CONTEXT_WINDOW_TOKENS = 258_000;
  const MIN_CONTEXT_WINDOW_TOKENS = 1_000;
  const CONTEXT_WARNING_RATIOS = Object.freeze({
    long: 0.65,
    warning: 0.8,
    critical: 0.95,
  });

  function normalizeContextWindowTokens(value = DEFAULT_CONTEXT_WINDOW_TOKENS) {
    const tokens = Number(value);
    if (!Number.isSafeInteger(tokens)) {
      throw new TypeError("Context window must be an integer.");
    }
    if (tokens < MIN_CONTEXT_WINDOW_TOKENS) {
      throw new RangeError("Context window must be at least 1,000 tokens.");
    }
    return tokens;
  }

  function thresholdsForContextWindow(value = DEFAULT_CONTEXT_WINDOW_TOKENS) {
    const contextWindowTokens = normalizeContextWindowTokens(value);
    return {
      long: Math.floor(contextWindowTokens * CONTEXT_WARNING_RATIOS.long),
      warning: Math.floor(contextWindowTokens * CONTEXT_WARNING_RATIOS.warning),
      critical: Math.floor(contextWindowTokens * CONTEXT_WARNING_RATIOS.critical),
    };
  }

  const DEFAULT_THRESHOLDS = Object.freeze(thresholdsForContextWindow(DEFAULT_CONTEXT_WINDOW_TOKENS));

  function contextWindowUsage(tokens, value = DEFAULT_CONTEXT_WINDOW_TOKENS) {
    const usedTokens = Number(tokens);
    if (!Number.isSafeInteger(usedTokens) || usedTokens < 0) {
      throw new TypeError("Used tokens must be a non-negative integer.");
    }
    const contextWindowTokens = normalizeContextWindowTokens(value);
    const ratio = usedTokens / contextWindowTokens;
    const usedPercent = Math.floor(ratio * 100);
    return {
      usedTokens,
      contextWindowTokens,
      remainingTokens: Math.max(0, contextWindowTokens - usedTokens),
      usedPercent,
      leftPercent: Math.max(0, 100 - usedPercent),
      ratio,
    };
  }

  function estimateTextTokens(text) {
    if (!text) return 0;
    const value = String(text);
    const cjk = value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || [];
    const remaining = value.replace(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
      "",
    );
    return cjk.length + Math.ceil(remaining.length / 4);
  }

  function estimateTranscriptTokens(messages) {
    return messages.reduce((total, message) => {
      if (message.role !== "user" && message.role !== "assistant") return total;
      return total + estimateTextTokens(message.text);
    }, 0);
  }

  function normalizeThresholds(value = DEFAULT_THRESHOLDS) {
    const thresholds = {
      long: Number(value.long),
      warning: Number(value.warning),
      critical: Number(value.critical),
    };
    if (!Object.values(thresholds).every(Number.isSafeInteger) || Object.values(thresholds).some((n) => n <= 0)) {
      throw new TypeError("Thresholds must be positive integers.");
    }
    if (!(thresholds.long < thresholds.warning && thresholds.warning < thresholds.critical)) {
      throw new RangeError("Thresholds must strictly increase.");
    }
    return thresholds;
  }

  function classifyUsage(tokens, value = DEFAULT_THRESHOLDS) {
    const thresholds = normalizeThresholds(value);
    if (tokens >= thresholds.critical) {
      return { level: "critical", label: "Start a fresh chat", limit: thresholds.critical };
    }
    if (tokens >= thresholds.warning) {
      return { level: "warning", label: "Checkpoint recommended", limit: thresholds.warning };
    }
    if (tokens >= thresholds.long) {
      return { level: "long", label: "Long conversation", limit: thresholds.long };
    }
    return { level: "normal", label: "Context looks healthy", limit: thresholds.long };
  }

  function formatTokenCount(tokens) {
    if (tokens < 1_000) return String(tokens);
    if (tokens < 1_000_000) {
      const value = tokens / 1_000;
      return `${Number(value.toFixed(value < 10 ? 1 : 0))}K`;
    }
    return `${Number((tokens / 1_000_000).toFixed(2))}M`;
  }

  function isExtensionContextInvalidatedError(error) {
    return /extension context invalidated/i.test(String(error?.message || error || ""));
  }

  function createExtensionRuntime({ onInvalidate = () => {} } = {}) {
    let active = true;

    function invalidate() {
      if (!active) return;
      active = false;
      onInvalidate();
    }

    async function call(operation, fallback) {
      if (!active) return fallback;
      try {
        return await operation();
      } catch (error) {
        if (!isExtensionContextInvalidatedError(error)) throw error;
        invalidate();
        return fallback;
      }
    }

    return Object.freeze({
      call,
      invalidate,
      isActive: () => active,
    });
  }

  function createCheckpointPrompt() {
    return [
      "Create a lossless task checkpoint for continuing this work in a fresh chat.",
      "Include:",
      "- objective and all active constraints",
      "- decisions made and rejected approaches with reasons",
      "- exact files changed and current repository state",
      "- commands and tests run, including exact results",
      "- unresolved failures, risks, and blockers",
      "- the next concrete action",
      "Preserve exact names, paths, commands, identifiers, and numerical values.",
      "Do not continue implementation in this response.",
    ].join("\n");
  }

  return Object.freeze({
    DEFAULT_CONTEXT_WINDOW_TOKENS,
    DEFAULT_THRESHOLDS,
    classifyUsage,
    contextWindowUsage,
    createCheckpointPrompt,
    createExtensionRuntime,
    estimateTextTokens,
    estimateTranscriptTokens,
    formatTokenCount,
    isExtensionContextInvalidatedError,
    normalizeContextWindowTokens,
    normalizeThresholds,
    thresholdsForContextWindow,
  });
});
