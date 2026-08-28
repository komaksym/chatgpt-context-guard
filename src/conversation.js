(function initContextGuardConversation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ContextGuardConversation = api;
})(typeof globalThis === "object" ? globalThis : this, function createConversationAdapter() {
  "use strict";

  const MODEL_RELEVANT_METADATA_KEYS = Object.freeze([
    "tool_calls",
    "tool_call_id",
    "function_call",
    "function_calls",
    "tool_name",
    "command",
  ]);

  function conversationIdFromPathname(pathname) {
    const match = String(pathname || "").match(/(?:^|\/)c\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function contentText(content) {
    if (typeof content === "string") return content.trim();
    if (!content || typeof content !== "object") return "";
    if (typeof content.text === "string") return content.text.trim();
    if (!Array.isArray(content.parts)) return "";

    return content.parts
      .map((part) => {
        if (typeof part === "string") return part.trim();
        if (part && typeof part === "object" && typeof part.text === "string") return part.text.trim();
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  function sanitizeStructuredValue(value, key = "", seen = new WeakSet()) {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      if (/^data:[^,]*;base64,/i.test(value)) return "[binary data]";
      if (key === "asset_pointer") return "[asset pointer]";
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value !== "object") return String(value);
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    if (Array.isArray(value)) {
      const array = value.map((item) => sanitizeStructuredValue(item, "", seen));
      seen.delete(value);
      return array;
    }

    const object = {};
    for (const objectKey of Object.keys(value).sort()) {
      const item = value[objectKey];
      if (item === undefined) continue;
      object[objectKey] = sanitizeStructuredValue(item, objectKey, seen);
    }
    seen.delete(value);
    return object;
  }

  function stableStringify(value) {
    return JSON.stringify(sanitizeStructuredValue(value));
  }

  function contentTokenText(content) {
    if (typeof content === "string") return content;
    if (!content || typeof content !== "object") return "";

    const contentType = typeof content.content_type === "string" ? content.content_type : "";
    if (contentType === "text" || contentType === "multimodal_text" || !contentType) {
      const parts = [];
      if (typeof content.text === "string") parts.push(content.text);
      for (const part of Array.isArray(content.parts) ? content.parts : []) {
        if (typeof part === "string") parts.push(part);
        else if (part && typeof part === "object" && typeof part.text === "string") parts.push(part.text);
        else if (part && typeof part === "object") parts.push(stableStringify(part));
      }
      return parts.filter((part) => part !== "").join("\n");
    }

    if (contentType === "code") {
      const parts = [];
      if (content.language) parts.push(`language:${content.language}`);
      if (typeof content.text === "string") parts.push(content.text);
      for (const part of Array.isArray(content.parts) ? content.parts : []) {
        parts.push(typeof part === "string" ? part : stableStringify(part));
      }
      return parts.filter(Boolean).join("\n");
    }

    // Tool outputs and newer ChatGPT content types are structured. Preserve the
    // complete textual/JSON representation instead of dropping fields we do not
    // recognize. This is intentionally future-tolerant.
    return stableStringify(content);
  }

  function relevantMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") return null;
    const selected = {};
    for (const key of MODEL_RELEVANT_METADATA_KEYS) {
      if (metadata[key] !== undefined && metadata[key] !== null) selected[key] = metadata[key];
    }
    return Object.keys(selected).length ? selected : null;
  }

  function messageTokenText(message) {
    if (!message || typeof message !== "object") return "";
    const role = message.author?.role || message.role || "";
    const name = message.author?.name || message.name || "";
    const recipient = message.recipient || "";
    const channel = message.channel || message.metadata?.channel || "";
    const body = contentTokenText(message.content);
    const metadata = relevantMetadata(message.metadata);

    const semantic = [];
    if (name) semantic.push(`name:${name}`);
    if (recipient && recipient !== "all") semantic.push(`recipient:${recipient}`);
    if (channel) semantic.push(`channel:${channel}`);
    if (body) semantic.push(body);
    if (metadata) semantic.push(`metadata:${stableStringify(metadata)}`);
    if (!semantic.length) return "";

    return [`role:${role || "unknown"}`, ...semantic].join("\n");
  }

  function activeBranchMessages(payload) {
    const mapping = payload?.mapping;
    let nodeId = payload?.current_node;
    if (!mapping || typeof mapping !== "object" || !nodeId) {
      throw new TypeError("Conversation payload is missing mapping or current node.");
    }

    const visited = new Set();
    const branch = [];
    while (nodeId) {
      if (visited.has(nodeId)) throw new Error(`Conversation mapping contains a cycle at ${nodeId}.`);
      visited.add(nodeId);
      const node = mapping[nodeId];
      if (!node) throw new Error(`Conversation mapping is missing node ${nodeId}.`);
      branch.push({ nodeId, node });
      nodeId = node.parent || "";
    }

    return branch
      .reverse()
      .map(({ nodeId: mappingId, node }) => {
        const message = node.message;
        const role = message?.author?.role || message?.role || "";
        return {
          id: node.id || message?.id || mappingId,
          role,
          text: contentText(message?.content),
          tokenText: messageTokenText(message),
        };
      })
      .filter((message) => message.tokenText);
  }

  async function readJson(response, label) {
    if (!response?.ok) throw new Error(`${label} request failed with status ${response?.status || 0}.`);
    try {
      return await response.json();
    } catch {
      throw new Error(`${label} response was not valid JSON.`);
    }
  }

  async function fetchActiveConversation({ conversationId, origin, fetchImpl = fetch }) {
    if (!conversationId) throw new TypeError("conversationId is required.");
    if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function.");
    const base = String(origin || "").replace(/\/$/, "");
    if (!base) throw new TypeError("origin is required.");

    const sessionResponse = await fetchImpl(`${base}/api/auth/session`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const session = await readJson(sessionResponse, "Session");
    if (!session?.accessToken) throw new Error("Session response did not include an access token.");

    const conversationResponse = await fetchImpl(
      `${base}/backend-api/conversation/${encodeURIComponent(conversationId)}`,
      {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
      },
    );
    const payload = await readJson(conversationResponse, "Conversation");
    return {
      currentNode: payload.current_node,
      messages: activeBranchMessages(payload),
    };
  }

  function createTokenLedger({
    conversationId,
    currentNode,
    messages,
    estimateTextTokens,
    updatedAt = Date.now(),
  }) {
    if (typeof estimateTextTokens !== "function") throw new TypeError("estimateTextTokens must be a function.");
    const messageTokens = {};
    let totalTokens = 0;
    for (const message of messages || []) {
      const tokenText = message?.tokenText || message?.text || "";
      if (!message?.id || !tokenText) continue;
      const tokens = estimateTextTokens(tokenText);
      messageTokens[message.id] = { role: message.role || "", tokens };
      totalTokens += tokens;
    }
    return {
      conversationId,
      currentNode,
      messageTokens,
      totalTokens,
      messageCount: Object.keys(messageTokens).length,
      updatedAt,
    };
  }

  return Object.freeze({
    activeBranchMessages,
    contentText,
    contentTokenText,
    conversationIdFromPathname,
    createTokenLedger,
    fetchActiveConversation,
    messageTokenText,
    stableStringify,
  });
});
