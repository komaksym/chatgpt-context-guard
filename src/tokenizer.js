(function initContextGuardTokenizer(root, factory) {
  let implementation = root.GPTTokenizer_o200k_base || null;
  if (!implementation && typeof module === "object" && module.exports && typeof require === "function") {
    implementation = require("gpt-tokenizer/encoding/o200k_base");
  }

  const api = factory(implementation);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ContextGuardTokenizer = api;
})(typeof globalThis === "object" ? globalThis : this, function createTokenizer(implementation) {
  "use strict";

  if (!implementation || (typeof implementation.countTokens !== "function" && typeof implementation.encode !== "function")) {
    throw new Error("o200k_base tokenizer is unavailable.");
  }

  // Keep the merge cache deliberately small. Long chats contain lots of unique
  // text, so a huge cache buys little while retaining unnecessary memory.
  implementation.setMergeCacheSize?.(2_048);

  function countTextTokens(text) {
    if (!text) return 0;
    const value = String(text);
    if (typeof implementation.countTokens === "function") return implementation.countTokens(value);
    return implementation.encode(value).length;
  }

  return Object.freeze({ countTextTokens });
});
