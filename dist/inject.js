(() => {
  // src/inject/core.js
  var BOOT = typeof window !== "undefined" ? window.__ZCODEPRO__ || {} : {};
  var HELPER_URL = BOOT.helperUrl || "http://127.0.0.1:47889";
  var TOKEN = BOOT.token || "";
  function rpc(path, options = {}) {
    return fetch(HELPER_URL + path, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "X-ZCodePro-Token": TOKEN
      },
      body: options.body ? JSON.stringify(options.body) : void 0
    }).then((r) => r.json()).catch((err) => ({ ok: false, error: String(err && err.message || err) }));
  }
  var configCache = { value: null, at: 0 };
  async function getConfig(force = false) {
    const now = Date.now();
    if (!force && configCache.value && now - configCache.at < 3e3) return configCache.value;
    const res = await rpc("/config");
    if (res.ok && res.config) {
      configCache = { value: res.config, at: now };
      return res.config;
    }
    return configCache.value || { features: {} };
  }
  function clearConfigCache() {
    configCache = { value: null, at: 0 };
  }
  var zh = {
    settingsTitle: "ZCode Pro \u589E\u5F3A\u8BBE\u7F6E",
    tabFeatures: "\u529F\u80FD",
    tabStyles: "\u6837\u5F0F\u8C03\u6574",
    tabAgents: "\u5168\u5C40\u63D0\u793A\u8BCD",
    agentsDesc: "\u5199\u5165 ~/.zcode/AGENTS.md\uFF0C\u4F5C\u4E3A\u9ED8\u8BA4\u6307\u4EE4\u6CE8\u5165\u6240\u6709\u9879\u76EE\u7684\u6BCF\u6B21\u4F1A\u8BDD\uFF1B\u4FDD\u5B58\u540E\u4ECE\u65B0\u4F1A\u8BDD\u8D77\u751F\u6548\uFF0C\u9879\u76EE\u5185\u7684 AGENTS.md \u53EF\u8865\u5145\u6216\u8986\u76D6\u3002\u5185\u5BB9\u8D85\u8FC7 100KB \u4F1A\u88AB\u5E94\u7528\u622A\u65AD\u3002",
    agentsPlaceholder: "\u586B\u5199\u5E0C\u671B\u6240\u6709\u9879\u76EE\u9ED8\u8BA4\u9075\u5FAA\u7684\u6307\u4EE4\uFF1B\u6E05\u7A7A\u5E76\u4FDD\u5B58\u5373\u79FB\u9664\u5168\u5C40\u63D0\u793A\u8BCD",
    agentsSave: "\u4FDD\u5B58",
    agentsSaved: "\u5168\u5C40\u63D0\u793A\u8BCD\u5DF2\u4FDD\u5B58",
    agentsLoadFailed: "\u8BFB\u53D6\u5168\u5C40\u63D0\u793A\u8BCD\u5931\u8D25",
    rowGapName: "\u6BB5\u843D\u95F4\u8DDD",
    rowGapDesc: "\u4F1A\u8BDD\u4E2D\u6BB5\u843D\u7B49\u6587\u672C\u5757\u4E4B\u95F4\u7684\u5782\u76F4\u95F4\u8DDD\uFF08\u56DE\u5408\u4E4B\u95F4\u3001\u7B54\u6848\u5185\u90E8\uFF09\u3002",
    listSpacingName: "\u5217\u8868\u95F4\u8DDD",
    listSpacingDesc: "\u7B54\u6848\u4E2D\u5217\u8868\u4E0A\u4E0B\u7684\u7559\u767D\u3002",
    listItemSpacingName: "\u5217\u8868\u9879\u95F4\u8DDD",
    listItemSpacingDesc: "\u5217\u8868\u4E2D\u76F8\u90BB\u5217\u8868\u9879\u4E4B\u95F4\u7684\u95F4\u8DDD\u3002",
    quoteCodeSpacingName: "\u5F15\u7528\u4E0E\u4EE3\u7801\u5757\u95F4\u8DDD",
    quoteCodeSpacingDesc: "\u5F15\u7528\u3001\u4EE3\u7801\u5757\u4E0A\u4E0B\u7684\u7559\u767D\u3002",
    lineHeightName: "\u56DE\u7B54\u884C\u9AD8",
    lineHeightDesc: "\u56DE\u7B54\u6B63\u6587\u7684\u884C\u9AD8\uFF08\u500D\u6570\uFF09\u3002",
    userLineHeightName: "\u63D0\u95EE\u884C\u9AD8",
    userLineHeightDesc: "\u63D0\u95EE\u5185\u5BB9\u7684\u884C\u9AD8\uFF08\u500D\u6570\uFF09\u3002",
    contentWidthName: "\u5185\u5BB9\u5BBD\u5EA6",
    contentWidthDesc: "\u4F1A\u8BDD\u5185\u5BB9\u7684\u6700\u5927\u5BBD\u5EA6\uFF0C\u53EF\u8F93\u5165 px \u6216 %\uFF08\u5982 900px\u300185%\uFF09\uFF1B\u9ED8\u8BA4\u663E\u793A\u5F53\u524D\u5B9E\u9645\u5BBD\u5EA6\uFF0C% \u76F8\u5BF9\u4F1A\u8BDD\u533A\u57DF\u3002",
    defaultValue: "\u9ED8\u8BA4",
    resetDefault: "\u6062\u590D\u9ED8\u8BA4",
    featureAlias: "\u9879\u76EE\u201C\u66F4\u591A\u201D\u83DC\u5355 \xB7 \u81EA\u5B9A\u4E49\u522B\u540D",
    featureAliasDesc: "\u4E3A\u9879\u76EE\u8BBE\u7F6E\u4EC5\u754C\u9762\u663E\u793A\u7684\u522B\u540D\uFF1A\u4FA7\u8FB9\u680F\u663E\u793A\u522B\u540D\uFF0C\u78C1\u76D8\u76EE\u5F55\u4E0E\u6240\u6709\u6570\u636E\u4E0D\u53D8\u3002",
    featureRelocate: "\u9879\u76EE\u201C\u66F4\u591A\u201D\u83DC\u5355 \xB7 \u5207\u6362\u6587\u4EF6\u5939",
    featureRelocateDesc: "\u5C06\u9879\u76EE\u6307\u5411\u53E6\u4E00\u4E2A\u6587\u4EF6\u5939\uFF1A\u4FA7\u8FB9\u680F\u3001\u6807\u7B7E\u9875\u4E0E\u4EFB\u52A1\u5386\u53F2\u4E00\u5E76\u8FC1\u79FB\uFF0C\u76EE\u5F55\u672C\u8EAB\u4E0D\u52A8\u3002",
    featureTaskOrder: "\u4FA7\u8FB9\u680F\u4F1A\u8BDD\u62D6\u52A8\u6392\u5E8F",
    featureTaskOrderDesc: "\u8BA9\u7F6E\u9876\u3001\u9879\u76EE\u4E0E\u5206\u7EC4\u4E2D\u7684\u4F1A\u8BDD\u62D6\u52A8\u540E\u8BB0\u4F4F\u987A\u5E8F\uFF0C\u5237\u65B0\u540E\u4FDD\u6301\u3002",
    featureFileActions: "\u6587\u4EF6\u83DC\u5355\u589E\u5F3A",
    featureFileActionsDesc: "\u5728\u4F1A\u8BDD\u4E2D\u6587\u4EF6\u94FE\u63A5\u7684\u53F3\u952E\u83DC\u5355\u91CC\u65B0\u589E\u300C\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00\u300D\u4E0E\u300C\u6253\u5F00\u6240\u5728\u76EE\u5F55\u300D\u3002",
    featureImageCopy: "\u56FE\u7247\u53F3\u952E\u590D\u5236",
    featureImageCopyDesc: "\u53F3\u952E\u4F1A\u8BDD\u4E2D\u7684\u56FE\u7247\u6216\u70B9\u51FB\u653E\u5927\u7684\u9884\u89C8\u56FE\uFF0C\u53EF\u5C06\u56FE\u7247\u590D\u5236\u5230\u526A\u8D34\u677F\u3002",
    imageCopy: "\u590D\u5236\u56FE\u7247",
    imageCopied: "\u56FE\u7247\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F",
    imageCopyFailed: "\u590D\u5236\u56FE\u7247\u5931\u8D25",
    openFolderItem: "\u6253\u5F00\u6587\u4EF6\u5939",
    fileOpenDefault: "\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00",
    fileReveal: "\u6253\u5F00\u6240\u5728\u76EE\u5F55",
    featurePinnedExpand: "\u7F6E\u9876\u4F1A\u8BDD\u4FDD\u6301\u9879\u76EE\u6298\u53E0\uFF08\u5B9E\u9A8C\u6027\uFF09",
    featurePinnedExpandDesc: "\u70B9\u51FB\u6298\u53E0\u9879\u76EE\u7684\u7F6E\u9876\u4F1A\u8BDD\u540E\u5C06\u5176\u4FDD\u6301\u6298\u53E0\u3002\u53D7\u9650\u4E8E\u5E94\u7528\u673A\u5236\uFF0C\u9879\u76EE\u4F1A\u5148\u77ED\u6682\u5C55\u5F00\u518D\u7F29\u8D77\u3002",
    version: "\u7248\u672C",
    close: "\u5173\u95ED",
    cancel: "\u53D6\u6D88",
    pathLabel: "\u8DEF\u5F84",
    aliasItem: "\u81EA\u5B9A\u4E49\u522B\u540D",
    aliasTitle: "\u81EA\u5B9A\u4E49\u9879\u76EE\u522B\u540D",
    aliasDesc: "\u4EC5\u5728 ZCode \u754C\u9762\u4E2D\u663E\u793A\u8BE5\u522B\u540D\uFF0C\u4E0D\u4FEE\u6539\u78C1\u76D8\u76EE\u5F55\u4E0E\u4EFB\u4F55\u6570\u636E\uFF0C\u968F\u65F6\u53EF\u6E05\u9664\u6062\u590D\u3002",
    aliasLabel: "\u522B\u540D",
    aliasPlaceholder: "\u7559\u7A7A\u5E76\u4FDD\u5B58 = \u6062\u590D\u771F\u5B9E\u540D\u79F0",
    aliasConfirm: "\u4FDD\u5B58",
    aliasClear: "\u6062\u590D\u771F\u5B9E\u540D\u79F0",
    aliasSaved: "\u522B\u540D\u5DF2\u66F4\u65B0",
    aliasCleared: "\u5DF2\u6062\u590D\u771F\u5B9E\u540D\u79F0",
    aliasHint: "\u78C1\u76D8\u76EE\u5F55\u540D\u4E0D\u53D8\uFF1A\u7EC8\u7AEF\u3001\u6587\u4EF6\u7BA1\u7406\u5668\u4E0E\u5176\u4ED6\u5F15\u7528\u771F\u5B9E\u8DEF\u5F84\u7684\u754C\u9762\u4ECD\u663E\u793A\u539F\u540D\u3002",
    taskOrderSaved: "\u987A\u5E8F\u5DF2\u66F4\u65B0",
    plugTitle: "\u63D2\u4EF6\u63A8\u8350\uFF1Azcode-plugins",
    plugDesc: "AI \u4EE3\u7801\u8BC4\u5BA1\u4E0E token \u538B\u7F29",
    qqGroupTitle: "QQ \u7FA4\uFF1A428403354",
    qqGroupDesc: "\u95EE\u9898\u53CD\u9988\u4E0E\u4EA4\u6D41",
    browse: "\u6D4F\u89C8",
    relocateItem: "\u5207\u6362\u6587\u4EF6\u5939",
    relocateTitle: "\u5207\u6362\u6587\u4EF6\u5939",
    relocateDesc: "\u5C06\u8BE5\u9879\u76EE\u6307\u5411\u53E6\u4E00\u4E2A\u6587\u4EF6\u5939\uFF1A\u4FA7\u8FB9\u680F\u3001\u5DF2\u6253\u5F00\u6807\u7B7E\u9875\u4E0E\u672C\u5730\u4EFB\u52A1\u5386\u53F2\u4E00\u5E76\u8FC1\u79FB\uFF0C\u76EE\u5F55\u672C\u8EAB\u4E0D\u4F1A\u88AB\u79FB\u52A8\uFF0C\u4F1A\u8BDD\u8BB0\u5F55\u4E0D\u4F1A\u4E22\u5931\u3002",
    relocateNewPathLabel: "\u65B0\u6587\u4EF6\u5939",
    relocateConfirm: "\u79FB\u52A8",
    relocateHint: "\u76EE\u6807\u6587\u4EF6\u5939\u9700\u5DF2\u5B58\u5728\uFF0C\u53EF\u8F93\u5165\u8DEF\u5F84\u6216\u70B9\u51FB\u300C\u6D4F\u89C8\u300D\u9009\u62E9\uFF1B\u5B8C\u6210\u540E\u754C\u9762\u5C06\u81EA\u52A8\u5237\u65B0\u3002",
    relocateSuccess: "\u5DF2\u5207\u6362\u6587\u4EF6\u5939\uFF0C\u6B63\u5728\u5237\u65B0\u754C\u9762\u2026",
    relocateIndexSkipped: "\u5DF2\u5207\u6362\u6587\u4EF6\u5939\uFF1B\u4EFB\u52A1\u5386\u53F2\u672A\u80FD\u540C\u6B65\uFF08\u672C\u673A\u7F3A\u5C11 SQLite \u652F\u6301\uFF09\uFF0C\u65E7\u4EFB\u52A1\u6761\u76EE\u53EF\u80FD\u4ECD\u6307\u5411\u65E7\u8DEF\u5F84\u3002",
    relocateSame: "\u65B0\u6587\u4EF6\u5939\u4E0E\u5F53\u524D\u6587\u4EF6\u5939\u76F8\u540C",
    relocateNotFound: "\u76EE\u6807\u6587\u4EF6\u5939\u4E0D\u5B58\u5728",
    relocateProtected: "\u62D2\u7EDD\u6307\u5411 ZCode \u6570\u636E\u76EE\u5F55\u5185\u90E8\u8DEF\u5F84",
    relocateIndexBusy: "\u4EFB\u52A1\u7D22\u5F15\u6B63\u88AB ZCode \u5360\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
    failed: "\u64CD\u4F5C\u5931\u8D25",
    retryHint: "\u8BF7\u91CD\u8BD5"
  };
  var en = {
    settingsTitle: "ZCode Pro Enhancements",
    tabFeatures: "Features",
    tabStyles: "Styles",
    tabAgents: "Global Prompt",
    agentsDesc: "Written to ~/.zcode/AGENTS.md and injected as default instructions into every session across all projects. Takes effect for new sessions; per-project AGENTS.md can extend or override it. Content over 100 KB is truncated by the app.",
    agentsPlaceholder: "Instructions followed by all projects by default; save empty to remove the global prompt",
    agentsSave: "Save",
    agentsSaved: "Global prompt saved.",
    agentsLoadFailed: "Failed to load the global prompt",
    rowGapName: "Paragraph spacing",
    rowGapDesc: "Vertical spacing between text blocks (turns, paragraphs inside answers).",
    listSpacingName: "List spacing",
    listSpacingDesc: "Space above and below lists.",
    listItemSpacingName: "List item spacing",
    listItemSpacingDesc: "Spacing between adjacent list items.",
    quoteCodeSpacingName: "Quote & code spacing",
    quoteCodeSpacingDesc: "Space above and below quotes and code blocks.",
    lineHeightName: "Answer line height",
    lineHeightDesc: "Line height of answer text (multiplier).",
    userLineHeightName: "Question line height",
    userLineHeightDesc: "Line height of question text (multiplier).",
    contentWidthName: "Content width",
    contentWidthDesc: "Max width of conversation content; accepts px or % (e.g. 900px, 85%).",
    defaultValue: "default",
    resetDefault: "Reset to default",
    featureAlias: 'Project "More" menu \xB7 Custom alias',
    featureAliasDesc: "A UI-only alias: the sidebar shows your custom name while the directory and all data stay untouched.",
    featureRelocate: 'Project "More" menu \xB7 Switch folder',
    featureRelocateDesc: "Points a project at another folder; the sidebar, tabs and task history follow. The directory stays untouched.",
    featureTaskOrder: "Sidebar session drag ordering",
    featureTaskOrderDesc: "Makes session drags in Pinned, Projects and Groups persist across refreshes.",
    featureFileActions: "File menu actions",
    featureFileActionsDesc: 'Adds "Open with default app" and "Reveal in file manager" to the right-click menu of file links in chat.',
    featureImageCopy: "Image right-click copy",
    featureImageCopyDesc: "Right-click an image in chat or the enlarged preview to copy it to the clipboard.",
    imageCopy: "Copy image",
    imageCopied: "Image copied to the clipboard.",
    imageCopyFailed: "Failed to copy the image.",
    openFolderItem: "Open folder",
    fileOpenDefault: "Open with default app",
    fileReveal: "Reveal in file manager",
    featurePinnedExpand: "Keep projects collapsed for pinned sessions (experimental)",
    featurePinnedExpandDesc: "Keeps the project collapsed after clicking a pinned session. Note: it briefly expands first, then collapses.",
    version: "Version",
    close: "Close",
    cancel: "Cancel",
    pathLabel: "Path",
    aliasItem: "Custom alias",
    aliasTitle: "Custom alias",
    aliasDesc: "Shown in the ZCode UI only. The directory on disk and all data stay untouched; revert anytime.",
    aliasLabel: "Alias",
    aliasPlaceholder: "Leave empty and save to restore the real name",
    aliasConfirm: "Save",
    aliasClear: "Restore real name",
    aliasSaved: "Alias updated.",
    aliasCleared: "Real name restored.",
    aliasHint: "The directory name on disk is unchanged: terminals, file managers and other path-based UI still show the real name.",
    taskOrderSaved: "Order updated.",
    plugTitle: "Plugin pick: zcode-plugins",
    plugDesc: "AI code review & token saving",
    qqGroupTitle: "QQ group: 428403354",
    qqGroupDesc: "Feedback & discussion",
    browse: "Browse",
    relocateItem: "Switch folder",
    relocateTitle: "Switch folder",
    relocateDesc: "Points this project at another folder: the sidebar, open tabs and local task history move along. The directory itself is not moved and no sessions are lost.",
    relocateNewPathLabel: "New folder",
    relocateConfirm: "Move",
    relocateHint: "The target folder must already exist. Enter a path or use Browse; the UI refreshes automatically afterwards.",
    relocateSuccess: "Folder switched. Refreshing\u2026",
    relocateIndexSkipped: "Folder switched, but the task history was not synced (SQLite support missing); old entries may still point to the old path.",
    relocateSame: "The new folder is the same as the current one.",
    relocateNotFound: "The target folder does not exist.",
    relocateProtected: "Refusing to point inside the ZCode data directory.",
    relocateIndexBusy: "The task index is busy (ZCode may be writing). Please retry shortly.",
    failed: "Operation failed",
    retryHint: "Please retry"
  };
  function isZhLocale() {
    let pref = null;
    try {
      pref = window.localStorage.getItem("zcode-locale-preference");
    } catch {
    }
    if (pref === "zh-CN" || pref === "en-US") return pref === "zh-CN";
    return /^zh/i.test(navigator.language || "zh-CN");
  }
  function t() {
    return isZhLocale() ? zh : en;
  }
  var errEn = {
    "invalid-path": "Invalid project path",
    "not-found": "The folder does not exist",
    "invalid-request": "Invalid request",
    "invalid-content": "content must be a string",
    "agents-read": "Failed to read AGENTS.md",
    "agents-write": "Failed to write AGENTS.md",
    "config-save": "Failed to save config",
    "settings-write": "Failed to update setting.json",
    "workspace-empty": "Workspace not found or has no sessions",
    "order-write": "Failed to persist ordering",
    "group-not-found": "No group contains these sessions",
    "group-ambiguous": "Cannot determine the group uniquely",
    "name-too-long": "Alias too long (max 100 characters)",
    "name-invalid-chars": "Alias must not contain newlines or control characters",
    "index-remap-failed": "Failed to update the task index (config changes rolled back)",
    "index-error": "Task index error",
    "index-busy": "The task index is busy. Please retry shortly."
  };
  function errText(res) {
    if (!res) return "";
    if (!isZhLocale()) {
      const en2 = res.code && errEn[res.code];
      if (en2) return en2;
    }
    return res.error || "";
  }
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") el.className = v;
        else if (k === "style") el.setAttribute("style", v);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) el.setAttribute(k, "");
        else if (v !== false && v !== void 0 && v !== null) el.setAttribute(k, String(v));
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c === void 0 || c === null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function closeRadixMenu(contentEl) {
    try {
      contentEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    } catch {
    }
  }
  function observeRadixPopups(onPopup) {
    const seen = /* @__PURE__ */ new WeakSet();
    const check = (node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.hasAttribute("data-radix-popper-content-wrapper")) {
        requestAnimationFrame(() => {
          const content = node.firstElementChild;
          if (content && !seen.has(content)) {
            seen.add(content);
            onPopup(content);
          }
        });
      }
      if (node.getAttribute && node.getAttribute("role") === "menu" && !seen.has(node)) {
        seen.add(node);
        onPopup(node);
      }
    };
    const process = (mutations) => {
      for (const m of mutations) for (const n of m.addedNodes) check(n);
    };
    const observer2 = new MutationObserver(process);
    observer2.observe(document.documentElement, { childList: true, subtree: true });
    return observer2;
  }
  function itemsOf(menuEl2) {
    return [...menuEl2.querySelectorAll('[role="menuitem"]')];
  }
  function itemText(item) {
    return (item.textContent || "").trim();
  }

  // src/inject/ui.js
  var toastTimer = null;
  function showToast(text, kind = "info") {
    document.getElementById("__zcodepro_toast__")?.remove();
    const el = h(
      "div",
      {
        id: "__zcodepro_toast__",
        class: "fixed bottom-6 right-6 z-[100] flex max-w-md items-center gap-2 rounded-lg border px-4 py-3 text-ui-sm shadow-lg " + (kind === "error" ? "border-destructive/40 bg-menu text-foreground" : "border-border bg-menu text-foreground"),
        style: "animation:zcodepro-fade-in .18s ease"
      },
      h("span", { class: "truncate" }, text)
    );
    document.body.append(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), kind === "error" ? 5e3 : 2600);
  }
  var overlayClass = "fixed inset-0 isolate z-50 flex items-center justify-center bg-black/60 supports-backdrop-filter:backdrop-blur-xs duration-100 p-4 platform-linux-desktop:top-12";
  var overlayClassBare = "fixed inset-0 isolate z-50 flex items-center justify-center duration-100 p-4 platform-linux-desktop:top-12";
  var contentClass = "w-full sm:max-w-md rounded-2xl border-none bg-popover/98 p-5 text-ui-base/relaxed text-foreground ring-border shadow-2xl";
  function openDialog({ title, description, onMount, onClose, width = "sm:max-w-md", overlay = "dim", draggable = false, posKey = "", dismissOnOutside = true }) {
    const L = t();
    const prevActive = document.activeElement;
    let cleanupDrag = null;
    const close = () => {
      overlayEl.remove();
      document.removeEventListener("keydown", onKey);
      if (cleanupDrag) cleanupDrag();
      if (prevActive && prevActive.focus) {
        try {
          prevActive.focus();
        } catch {
        }
      }
      onClose && onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    const content = h("div", {
      role: "dialog",
      "aria-modal": "true",
      id: "zcodepro-card",
      class: contentClass.replace("sm:max-w-md", width)
    });
    const overlayEl = h("div", {
      id: "zcodepro-overlay",
      "data-overlay": overlay,
      class: overlay === "none" ? overlayClassBare : overlayClass,
      onMousedown: (e) => {
        if (dismissOnOutside && e.target === overlayEl) close();
      }
    }, content);
    if (!dismissOnOutside) {
      overlayEl.style.pointerEvents = "none";
      content.style.pointerEvents = "auto";
    }
    const titleEl = h("h2", { class: "text-lg font-semibold leading-none tracking-tight text-foreground" }, title);
    content.append(
      titleEl,
      ...description ? [h("p", { class: "mt-2 text-ui-sm/relaxed text-foreground-subtle" }, description)] : []
    );
    const body = h("div", { class: "mt-4" });
    content.append(body);
    if (draggable) {
      titleEl.style.cursor = "move";
      titleEl.style.userSelect = "none";
      let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
      const clampPos = (x, y) => {
        const mx = Math.max(0, (window.innerWidth - content.offsetWidth) / 2 - 8);
        const my = Math.max(0, (window.innerHeight - content.offsetHeight) / 2 - 8);
        return [Math.min(mx, Math.max(-mx, x)), Math.min(my, Math.max(-my, y))];
      };
      const restore = () => {
        if (!posKey) return;
        try {
          const saved = JSON.parse(localStorage.getItem("zcodepro-dialog-pos:" + posKey) || "null");
          if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
            [ox, oy] = clampPos(saved.x, saved.y);
            if (ox || oy) content.style.transform = `translate(${ox}px, ${oy}px)`;
          }
        } catch {
        }
      };
      const onDown = (e) => {
        if (e.button !== 0) return;
        dragging = true;
        sx = e.clientX - ox;
        sy = e.clientY - oy;
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!dragging) return;
        [ox, oy] = clampPos(e.clientX - sx, e.clientY - sy);
        content.style.transform = `translate(${ox}px, ${oy}px)`;
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        if (posKey) {
          try {
            localStorage.setItem("zcodepro-dialog-pos:" + posKey, JSON.stringify({ x: ox, y: oy }));
          } catch {
          }
        }
      };
      titleEl.addEventListener("mousedown", onDown);
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      cleanupDrag = () => {
        titleEl.removeEventListener("mousedown", onDown);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      restore();
    }
    document.addEventListener("keydown", onKey, true);
    document.body.append(overlayEl);
    try {
      onMount && onMount({ body, close, content });
    } catch (err) {
      console.error("[zcodepro] dialog onMount \u5931\u8D25:", err);
    }
    return { close };
  }
  function dialogFooter(...buttons) {
    return h("div", { class: "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end" }, buttons);
  }
  function btnSecondary(text, onClick, extra = "") {
    return h("button", {
      type: "button",
      class: "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-border bg-surface px-4 text-ui-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50 " + extra,
      onClick
    }, text);
  }
  function btnPrimary(text, onClick, extra = "") {
    return h("button", {
      type: "button",
      class: "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-4 text-ui-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 " + extra,
      onClick
    }, text);
  }
  function textInput({ value = "", placeholder = "", onInput, onEnter, autofocus = true } = {}) {
    const input = h("input", {
      type: "text",
      value,
      placeholder,
      class: "h-9 w-full rounded-lg border border-border bg-input px-3 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
    });
    if (onInput) input.addEventListener("input", onInput);
    if (onEnter) input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onEnter();
    });
    if (autofocus) {
      const tryFocus = () => {
        if (!input.isConnected) return;
        input.focus();
        if (document.activeElement === input) input.select();
      };
      tryFocus();
      for (const ms of [120, 300, 600]) {
        setTimeout(() => {
          if (!input.isConnected) return;
          const dialog = input.closest('[role="dialog"]');
          if (dialog && !dialog.contains(document.activeElement)) tryFocus();
        }, ms);
      }
    }
    return input;
  }
  function numberField({ value = null, fallback = 0, min = 0, max = 48, step = 1, onCommit }) {
    let current = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const input = h("input", {
      type: "text",
      inputmode: "decimal",
      value: String(current),
      class: "h-8 w-16 rounded-lg border border-border bg-input px-2 text-right text-ui-sm tabular-nums text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
    });
    const clamp = (v) => Math.min(max, Math.max(min, v));
    const display = (v) => {
      input.value = String(v);
    };
    const commit = (v) => {
      const next = clamp(v);
      if (next === current) {
        display(next);
        return;
      }
      current = next;
      display(next);
      onCommit && onCommit(next);
    };
    input.addEventListener("wheel", (e) => {
      e.preventDefault();
      const dir = (e.deltaY || 0) < 0 ? 1 : -1;
      const raw = current + dir * step;
      commit(step < 1 ? Math.round(raw / step) * step : Math.round(raw));
    }, { passive: false });
    const submitTyped = () => {
      const parsed = parseFloat(String(input.value).trim());
      if (!Number.isFinite(parsed)) {
        display(current);
        return;
      }
      commit(step < 1 ? Math.round(parsed / step) * step : parsed);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitTyped();
      }
    });
    input.addEventListener("blur", submitTyped);
    return {
      el: input,
      set(v) {
        current = clamp(v);
        display(current);
      },
      reset() {
        current = fallback;
        display(current);
      },
      get() {
        return current;
      }
    };
  }
  function unitField({ value = null, fallback = { value: 100, unit: "%" }, step = { px: 10, "%": 1 }, onCommit }) {
    const RANGES = { px: [320, 3840], "%": [20, 100] };
    const norm2 = (v) => {
      if (!v || !RANGES[v.unit]) return null;
      const [min, max] = RANGES[v.unit];
      const n = v.unit === "px" ? Math.round(v.value) : Math.round(v.value * 10) / 10;
      return Number.isFinite(n) ? { value: Math.min(max, Math.max(min, n)), unit: v.unit } : null;
    };
    let current = norm2(value) || norm2(fallback) || { value: 100, unit: "%" };
    const input = h("input", {
      type: "text",
      inputmode: "decimal",
      value: `${current.value}${current.unit}`,
      class: "h-8 w-20 rounded-lg border border-border bg-input px-2 text-right text-ui-sm tabular-nums text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
    });
    const display = () => {
      input.value = `${current.value}${current.unit}`;
    };
    const commit = (v) => {
      const next = norm2(v);
      if (!next || next.value === current.value && next.unit === current.unit) {
        display();
        return;
      }
      current = next;
      display();
      onCommit && onCommit({ ...current });
    };
    input.addEventListener("wheel", (e) => {
      e.preventDefault();
      const dir = (e.deltaY || 0) < 0 ? 1 : -1;
      commit({ value: current.value + dir * (step[current.unit] || 1), unit: current.unit });
    }, { passive: false });
    const parseTyped = (s) => {
      const m = String(s).trim().match(/^(\d+(?:\.\d+)?)\s*(px|%)?$/i);
      if (!m) return null;
      return { value: parseFloat(m[1]), unit: (m[2] || current.unit).toLowerCase() === "px" ? "px" : "%" };
    };
    const submitTyped = () => {
      const parsed = parseTyped(input.value);
      if (!parsed) {
        display();
        return;
      }
      commit(parsed);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitTyped();
      }
    });
    input.addEventListener("blur", submitTyped);
    return {
      el: input,
      reset() {
        current = norm2(fallback) || current;
        display();
      },
      get() {
        return { ...current };
      }
    };
  }
  function settingRow(name, desc, checked, onToggle) {
    const knob = h("span", { class: "zcodepro-switch-knob" });
    const track = h("span", {
      class: "zcodepro-switch",
      "data-zcodepro-switch": "",
      "data-state": checked ? "on" : "off"
    }, knob);
    const row = h(
      "div",
      {
        class: "flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-surface-hover",
        onClick: () => {
          onToggle();
        }
      },
      h(
        "div",
        { class: "min-w-0 flex-1" },
        h("div", { class: "text-ui-sm font-medium text-foreground" }, name),
        h("div", { class: "mt-0.5 text-ui-xs/relaxed text-foreground-subtle" }, desc)
      ),
      h("button", {
        type: "button",
        role: "switch",
        "aria-checked": String(checked),
        class: "relative inline-flex shrink-0 cursor-pointer items-center"
      }, track)
    );
    return row;
  }
  function ensureStyle() {
    if (document.getElementById("__zcodepro_style__")) return;
    const root = document.head || document.documentElement;
    if (!root) return;
    root.append(h("style", { id: "__zcodepro_style__" }, `
    @keyframes zcodepro-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    /* \u5F39\u7A97\u906E\u7F69/\u9762\u677F\u515C\u5E95\uFF1A\u4E0D\u4F9D\u8D56\u5E94\u7528 Tailwind \u7C7B\u662F\u5426\u4ECD\u5B58\u5728\uFF1B\u4E3B\u9898\u8272\u8D70 --color-* \u53D8\u91CF\uFF0C\u7F3A\u5931\u65F6\u56DE\u9000\u5B57\u9762\u91CF */
    #zcodepro-overlay { background-color: rgba(0, 0, 0, 0.6); }
    #zcodepro-overlay[data-overlay="none"] { background-color: transparent; }
    #zcodepro-card {
      background-color: var(--color-popover, #fff);
      border-radius: 16px;
      outline: none;
      box-shadow: 0 0 0 1px var(--color-border, rgba(0, 0, 0, 0.1)), 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
    /* \u5F00\u5173\uFF08\u8BBE\u7F6E\u5F39\u7A97\uFF09\uFF1A\u51E0\u4F55\u56FA\u5B9A\u5199\u5165\uFF0C\u989C\u8272\u968F\u4E3B\u9898\u53D8\u91CF */
    [data-zcodepro-switch] {
      position: relative;
      display: inline-flex;
      align-items: center;
      width: 32px;
      height: 18px;
      border-radius: 9999px;
      padding: 1px;
      transition: background-color 0.15s ease;
      background-color: color-mix(in oklab, var(--color-primary, #000) 30%, transparent);
    }
    [data-zcodepro-switch][data-state="on"] { background-color: var(--color-primary, #000); }
    .zcodepro-switch-knob {
      display: block;
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background-color: var(--color-primary-foreground, #fff);
      transition: transform 0.15s ease;
    }
    [data-zcodepro-switch][data-state="on"] .zcodepro-switch-knob { transform: translateX(14px); }
    /* \u6807\u7B7E\u9875\u5207\u6362\uFF08\u8BBE\u7F6E\u5F39\u7A97\uFF09\uFF1A\u80F6\u56CA\u5BB9\u5668 + \u6FC0\u6D3B\u9AD8\u4EAE\uFF0C\u89C6\u89C9\u53C2\u8003\u4FA7\u680F\u300C\u5206\u7EC4/\u9879\u76EE\u300D\u5207\u6362\uFF1B
       \u4E0E\u5F00\u5173\u540C\u7406\uFF0C\u51E0\u4F55/\u914D\u8272\u5199\u5165\u81EA\u6709\u89C4\u5219\u5E76\u53D6\u4E3B\u9898\u53D8\u91CF\uFF0C\u4E0D\u4F9D\u8D56\u5E94\u7528 Tailwind \u7C7B */
    .zcodepro-tablist {
      display: inline-flex;
      align-items: center;
      height: 28px;
      padding: 2px;
      border-radius: 9999px;
      background-color: color-mix(in oklab, var(--color-foreground, #888) 8%, transparent);
    }
    .zcodepro-tab {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 24px;
      padding: 0 14px;
      border: none;
      border-radius: 9999px;
      background: transparent;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      color: var(--color-muted-foreground, #888);
      transition: color 0.15s ease, background-color 0.15s ease;
    }
    .zcodepro-tab[data-state="active"] {
      background-color: var(--color-background, #fff);
      color: var(--color-foreground, #111);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    }
    /* \u5168\u5C40\u63D0\u793A\u8BCD\u7F16\u8F91\u6846\uFF08\u8BBE\u7F6E\u5F39\u7A97\uFF09\uFF1A\u4E0E\u5F00\u5173/\u6807\u7B7E\u9875\u540C\u7406\uFF0C\u51E0\u4F55/\u914D\u8272\u5199\u5165\u81EA\u6709\u89C4\u5219\u5E76\u53D6\u4E3B\u9898\u53D8\u91CF\u3002
       \u8FB9\u6846\u7528 border \u800C\u975E box-shadow\uFF1A\u5E94\u7528\u5168\u5C40\u6837\u5F0F\u5BF9 :focus/:focus-visible \u5F3A\u5236
       box-shadow:none !important\u3001outline:none !important\uFF0Cbox-shadow \u8FB9\u6846\u805A\u7126\u77AC\u95F4\u4F1A\u88AB\u6E05\u6389\uFF1B
       \u5E94\u7528\u81EA\u8EAB\u8F93\u5165\u6846\u7684\u805A\u7126\u53CD\u9988\u540C\u6837\u53EA\u8D70 border \u53D8\u8272 */
    .zcodepro-textarea {
      display: block;
      width: 100%;
      min-height: 11rem;
      max-height: 22rem;
      resize: vertical;
      padding: 10px 12px;
      border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12));
      border-radius: 10px;
      outline: none;
      background-color: var(--color-input, var(--color-popover, #fff));
      color: var(--color-foreground, #111);
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      font-size: 12px;
      line-height: 1.6;
    }
    .zcodepro-textarea:focus-visible {
      border-color: var(--color-primary, #111);
    }
    .zcodepro-textarea::placeholder { color: var(--color-muted-foreground, #888); }
    .zcodepro-textarea:disabled { opacity: 0.5; }
    /* \u884C\u9AD8\u6ED1\u6746\uFF08\u6837\u5F0F\u8C03\u6574\u6807\u7B7E\u9875\uFF09 */
    .zcodepro-range {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 4px;
      border-radius: 9999px;
      background: color-mix(in oklab, var(--color-foreground, #888) 18%, transparent);
      outline: none;
    }
    .zcodepro-range::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 9999px;
      background: var(--color-primary, #111);
      cursor: pointer;
    }
    /* \u56FE\u7247\u53F3\u952E\u83DC\u5355\u9879\u60AC\u505C\u9AD8\u4EAE\uFF1A\u540C\u4E0A\u4E0D\u4F9D\u8D56\u5E94\u7528 Tailwind hover \u7C7B\u662F\u5426\u5B58\u5728 */
    .zcodepro-imgmenu-item { transition: background-color 0.12s ease; }
    .zcodepro-imgmenu-item:hover {
      background-color: var(--color-accent, color-mix(in oklab, var(--color-foreground, #888) 10%, transparent));
    }
  `));
  }

  // src/inject/features/alias.js
  var norm = (p) => String(p || "").replace(/[\\/]+$/, "");
  var basenameOf = (p) => norm(p).split(/[\\/]/).pop() || "";
  function extractPathFromTestId(testid) {
    let m = testid.match(/[-:=,|](\/.+)$/);
    if (m) return m[1];
    m = testid.match(/[-:=,|]([A-Za-z]:\\.*)$/);
    return m ? m[1] : null;
  }
  var aliases = {};
  var enabled = true;
  var observer = null;
  async function startAliasWatcher() {
    await syncFromConfig();
    if (observer) return;
    observer = new MutationObserver(() => scheduleApply());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    applyAliass();
  }
  async function syncFromConfig() {
    const config = await getConfig();
    enabled = !(config.features && config.features.projectAlias === false);
    aliases = enabled ? config.aliases || {} : {};
  }
  var applyTimer = 0;
  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(applyAliass, 60);
  }
  function applyAliass() {
    const rows = document.querySelectorAll('[data-testid^="workspace-item-"]');
    for (const row of rows) {
      const path = norm(extractPathFromTestId(row.getAttribute("data-testid") || ""));
      if (!path) continue;
      const nameEl = [...row.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim());
      if (!nameEl) continue;
      const real = nameEl.textContent.trim();
      const want = aliases[path];
      if (want) {
        if (!row.dataset.zcodeproRealName) row.dataset.zcodeproRealName = real;
        if (real !== want) nameEl.textContent = want;
      } else if (row.dataset.zcodeproRealName) {
        nameEl.textContent = row.dataset.zcodeproRealName;
        delete row.dataset.zcodeproRealName;
      }
    }
  }
  async function refreshAliases() {
    await syncFromConfig();
    applyAliass();
  }
  function appendAliasItem(menu, anchorItem, project) {
    if (menu.querySelector('[data-zcodepro-item="alias"]')) return;
    const L = t();
    const item = anchorItem.cloneNode(true);
    item.removeAttribute("data-testid");
    item.removeAttribute("data-highlighted");
    item.setAttribute("data-zcodepro-item", "alias");
    for (const child of [...item.childNodes]) child.remove();
    const origIcon = anchorItem.querySelector("svg");
    const iconClass = origIcon ? origIcon.getAttribute("class") : "h-3.5 w-3.5";
    item.append(hTagIcon(iconClass), document.createTextNode(L.aliasItem));
    item.addEventListener("mouseenter", () => {
      for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute("data-highlighted");
      item.setAttribute("data-highlighted", "");
    });
    item.addEventListener("mouseleave", () => item.removeAttribute("data-highlighted"));
    item.addEventListener("click", () => {
      try {
        menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      } catch {
      }
      setTimeout(() => openAliasDialog(project), 80);
    });
    anchorItem.before(item);
  }
  function hTagIcon(cls) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("class", cls);
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z");
    svg.append(p);
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", "7.5");
    c.setAttribute("cy", "7.5");
    c.setAttribute("r", ".5");
    c.setAttribute("fill", "currentColor");
    svg.append(c);
    return svg;
  }
  function openAliasDialog(project) {
    ensureStyle();
    const L = t();
    const current = aliases[norm(project.path)] || "";
    const realName = project.name || basenameOf(project.path);
    let submitting = false;
    openDialog({
      title: L.aliasTitle,
      description: L.aliasDesc,
      width: "sm:max-w-md",
      onMount: ({ body, close }) => {
        const input = textInput({
          value: current || realName,
          placeholder: L.aliasPlaceholder,
          onEnter: () => submit()
        });
        const submitBtn = btnPrimary(L.aliasConfirm, () => submit(), "min-w-24");
        const submit = async () => {
          if (submitting) return;
          const name = input.value.trim();
          if (name && name === current) {
            close();
            return;
          }
          submitting = true;
          submitBtn.setAttribute("disabled", "true");
          const res = await rpc("/project/alias", {
            method: "POST",
            body: { path: project.path, alias: name === realName ? "" : name }
          });
          submitting = false;
          submitBtn.removeAttribute("disabled");
          if (res.ok) {
            close();
            clearConfigCache();
            await refreshAliases();
            showToast(name ? L.aliasSaved : L.aliasCleared);
            return;
          }
          showToast(L.failed + ": " + (errText(res) || L.retryHint), "error");
        };
        body.append(
          h(
            "div",
            { class: "space-y-3" },
            h(
              "div",
              {},
              h("div", { class: "mb-1.5 text-ui-sm font-medium text-foreground" }, L.aliasLabel),
              input
            ),
            h(
              "div",
              {},
              h("div", { class: "mb-1 text-ui-xs text-foreground-subtle" }, L.pathLabel),
              h("div", { class: "break-all rounded-lg border border-border bg-surface-hover/50 px-3 py-1.5 font-mono text-ui-xs text-foreground-subtle" }, project.path)
            ),
            h("p", { class: "text-ui-xs/relaxed text-foreground-subtle" }, L.aliasHint)
          ),
          (() => {
            const footer = document.createElement("div");
            footer.className = "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
            if (current) {
              footer.append(btnSecondary(L.aliasClear, async () => {
                if (submitting) return;
                submitting = true;
                const res = await rpc("/project/alias", { method: "POST", body: { path: project.path, alias: "" } });
                submitting = false;
                if (res.ok) {
                  close();
                  clearConfigCache();
                  await refreshAliases();
                  showToast(L.aliasCleared);
                } else showToast(L.failed + ": " + (errText(res) || L.retryHint), "error");
              }));
            }
            footer.append(btnSecondary(L.cancel, () => close()), submitBtn);
            return footer;
          })()
        );
      }
    });
  }

  // src/inject/features/relocate-dialog.js
  function appendRelocateItem(menu, anchorItem, project) {
    if (menu.querySelector('[data-zcodepro-item="relocate"]')) return;
    const L = t();
    const item = anchorItem.cloneNode(true);
    item.removeAttribute("data-testid");
    item.removeAttribute("data-highlighted");
    item.setAttribute("data-zcodepro-item", "relocate");
    for (const child of [...item.childNodes]) child.remove();
    const origIcon = anchorItem.querySelector("svg");
    const iconClass = origIcon ? origIcon.getAttribute("class") : "h-3.5 w-3.5";
    item.append(hMoveIcon(iconClass), document.createTextNode(L.relocateItem));
    item.addEventListener("mouseenter", () => {
      for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute("data-highlighted");
      item.setAttribute("data-highlighted", "");
    });
    item.addEventListener("mouseleave", () => item.removeAttribute("data-highlighted"));
    item.addEventListener("click", () => {
      closeRadixMenu(menu);
      setTimeout(() => openRelocateDialog(project), 80);
    });
    anchorItem.before(item);
  }
  function hMoveIcon(cls) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("class", cls);
    for (const d of ["m16 3 4 4-4 4", "M20 7H4", "m8 21-4-4 4-4", "M4 17h16"]) {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      svg.append(p);
    }
    return svg;
  }
  function openRelocateDialog(project) {
    ensureStyle();
    const L = t();
    let submitting = false;
    openDialog({
      title: L.relocateTitle,
      description: L.relocateDesc,
      width: "sm:max-w-md",
      onMount: ({ body, close }) => {
        const errLine = h("div", { class: "mt-2 hidden text-ui-sm text-destructive", "data-zcodepro-error": "1" });
        const showError = (msg) => {
          errLine.textContent = msg;
          errLine.classList.remove("hidden");
        };
        const input = textInput({ value: project.path, onEnter: () => submit() });
        const submitBtn = btnPrimary(L.relocateConfirm, () => submit(), "min-w-24");
        const picker = typeof window !== "undefined" && window.zcode && typeof window.zcode.selectDirectory === "function" ? () => window.zcode.selectDirectory() : null;
        const browse = async () => {
          browseBtn.setAttribute("disabled", "true");
          try {
            let dir = null;
            const res = await rpc("/pick-folder?start=" + encodeURIComponent(project.path) + "&title=" + encodeURIComponent(L.relocateTitle));
            if (res && res.ok) {
              if (res.path) dir = res.path;
              else if (res.unavailable && picker) dir = await picker();
            } else if (picker) {
              dir = await picker();
            }
            if (dir) {
              input.value = dir;
              input.focus();
            }
          } catch {
          }
          browseBtn.removeAttribute("disabled");
        };
        const browseBtn = h("button", {
          type: "button",
          class: "h-9 shrink-0 whitespace-nowrap rounded-lg border border-border bg-surface px-3 text-ui-sm font-medium text-foreground transition-colors hover:bg-surface-hover",
          onClick: () => {
            void browse();
          }
        }, L.browse);
        const submit = async () => {
          if (submitting) return;
          const newPath = input.value.trim();
          if (!newPath || newPath === project.path) {
            close();
            return;
          }
          submitting = true;
          submitBtn.setAttribute("disabled", "true");
          errLine.classList.add("hidden");
          const res = await rpc("/project/relocate", {
            method: "POST",
            body: { path: project.path, newPath }
          });
          submitting = false;
          submitBtn.removeAttribute("disabled");
          if (res.ok) {
            close();
            showToast(res.indexSynced === false ? L.relocateIndexSkipped : L.relocateSuccess);
            setTimeout(() => location.reload(), 900);
            return;
          }
          const byCode = {
            "same-path": L.relocateSame,
            "new-not-found": L.relocateNotFound,
            "protected-path": L.relocateProtected,
            "index-busy": L.relocateIndexBusy
          };
          showError(byCode[res.code] || L.failed + ": " + (errText(res) || L.retryHint));
        };
        body.append(
          h(
            "div",
            { class: "space-y-3" },
            h(
              "div",
              {},
              h("div", { class: "mb-1.5 text-ui-sm font-medium text-foreground" }, L.relocateNewPathLabel),
              h(
                "div",
                { class: "flex gap-2" },
                h("div", { class: "min-w-0 flex-1" }, input),
                browseBtn
              )
            ),
            h(
              "div",
              {},
              h("div", { class: "mb-1 text-ui-xs text-foreground-subtle" }, L.pathLabel),
              h("div", { class: "break-all rounded-lg border border-border bg-surface-hover/50 px-3 py-1.5 font-mono text-ui-xs text-foreground-subtle" }, project.path)
            ),
            h("p", { class: "text-ui-xs/relaxed text-foreground-subtle" }, L.relocateHint),
            errLine
          ),
          dialogFooter(btnSecondary(L.cancel, () => close()), submitBtn)
        );
      }
    });
  }

  // src/inject/features/open-folder.js
  function appendOpenFolderItem(menu, anchorItem, project) {
    if (menu.querySelector('[data-zcodepro-item="open-folder"]')) return;
    const L = t();
    const item = anchorItem.cloneNode(true);
    item.removeAttribute("data-testid");
    item.removeAttribute("data-highlighted");
    item.setAttribute("data-zcodepro-item", "open-folder");
    for (const child of [...item.childNodes]) child.remove();
    const origIcon = anchorItem.querySelector("svg");
    const iconClass = origIcon ? origIcon.getAttribute("class") : "h-3.5 w-3.5";
    item.append(hFolderIcon(iconClass), document.createTextNode(L.openFolderItem));
    item.addEventListener("mouseenter", () => {
      for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute("data-highlighted");
      item.setAttribute("data-highlighted", "");
    });
    item.addEventListener("mouseleave", () => item.removeAttribute("data-highlighted"));
    item.addEventListener("click", () => {
      closeRadixMenu(menu);
      try {
        void rpc("/open-folder", { method: "POST", body: { path: project.path } });
      } catch {
      }
    });
    anchorItem.before(item);
  }
  function hFolderIcon(cls) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("class", cls);
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 0-1.69.9l-.58.87A2 2 0 0 1 8.93 8H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z");
    svg.append(p);
    return svg;
  }

  // src/inject/features/project-menu.js
  var REMOVE_TEXTS = ["\u79FB\u9664", "Remove"];
  function extractPathFromTestId2(testid) {
    let m = testid.match(/[-:=,|](\/.+)$/);
    if (m) return m[1];
    m = testid.match(/[-:=,|]([A-Za-z]:\\.*)$/);
    return m ? m[1] : null;
  }
  function basenameOf2(p) {
    return String(p || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
  }
  async function resolveProjectPath(removeItem) {
    const testid = removeItem.getAttribute("data-testid") || "";
    const extracted = extractPathFromTestId2(testid);
    if (!extracted) return null;
    const res = await rpc("/projects");
    if (res.ok && Array.isArray(res.projects)) {
      const norm2 = (p) => String(p).replace(/[\\/]+$/, "");
      const hit = res.projects.find((p) => norm2(p.path) === norm2(extracted));
      if (hit) return hit;
    }
    return { path: extracted, name: basenameOf2(extracted) };
  }
  function handleProjectMenu(content) {
    if (content.querySelector('[data-zcodepro-item="alias"]')) return;
    const items = itemsOf(content);
    const removeItem = items.find(
      (el) => el.hasAttribute("data-testid") && REMOVE_TEXTS.some((x) => itemText(el).startsWith(x))
    );
    if (!removeItem) return;
    void (async () => {
      const config = await getConfig();
      if (config.features && config.features.projectAlias === false) return;
      const project = await resolveProjectPath(removeItem);
      if (!project) return;
      appendAliasItem(content, removeItem, project);
      if (config.features && config.features.projectRelocate !== false) {
        appendRelocateItem(content, removeItem, project);
      }
      appendOpenFolderItem(content, removeItem, project);
    })();
  }

  // src/inject/features/file-menu.js
  var COPY_ABS_TEXTS = ["\u590D\u5236\u7EDD\u5BF9\u8DEF\u5F84", "Copy absolute path"];
  var NO_APPS_TEXTS = ["\u672A\u627E\u5230\u53EF\u7528 App", "No apps found"];
  var ICON_OPEN_DEFAULT = [
    { rect: { x: "2", y: "4", width: "20", height: "16", rx: "2" } },
    { d: "M10 4v4" },
    { d: "M2 8h20" },
    { d: "M6 4v4" }
  ];
  var ICON_REVEAL = [
    { d: "m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.22a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" }
  ];
  function buildIcon(cls, shapes) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    if (cls) svg.setAttribute("class", cls);
    for (const s of shapes) {
      if (s.rect) {
        const r = document.createElementNS(ns, "rect");
        for (const [k, v] of Object.entries(s.rect)) r.setAttribute(k, v);
        svg.append(r);
      } else {
        const p = document.createElementNS(ns, "path");
        p.setAttribute("d", s.d);
        svg.append(p);
      }
    }
    return svg;
  }
  function looksLikePath(v) {
    return typeof v === "string" && (/^[\\/]/.test(v) || /^[A-Za-z]:[\\/]/.test(v));
  }
  function pathFromReactFiber(el) {
    try {
      const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
      let fiber = key ? el[key] : null;
      for (let i = 0; fiber && i < 40; i++, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        if (!props || typeof props !== "object") continue;
        for (const k of ["target", "fileLink", "row"]) {
          const v = props[k];
          if (v && looksLikePath(v.path)) return v.path;
        }
        if (looksLikePath(props.path)) return props.path;
      }
    } catch {
    }
    return null;
  }
  function resolveTargetPath(content) {
    const id = content.id;
    if (id) {
      try {
        const trigger = document.querySelector(`[aria-controls="${CSS.escape(id)}"]`);
        const p = trigger?.getAttribute("title");
        if (looksLikePath(p)) return p;
        const fromFiber = trigger && pathFromReactFiber(trigger);
        if (fromFiber) return fromFiber;
      } catch {
      }
    }
    const open = document.querySelector('[data-slot="context-menu-trigger"][data-state="open"]');
    const p2 = open?.getAttribute("title");
    if (looksLikePath(p2)) return p2;
    return pathFromReactFiber(content);
  }
  function appendMenuItem(content, template, anchor, { marker, label, icon, onPick }) {
    const item = template.cloneNode(true);
    item.removeAttribute("data-testid");
    item.removeAttribute("data-highlighted");
    item.removeAttribute("data-disabled");
    item.removeAttribute("aria-disabled");
    item.setAttribute("data-zcodepro-item", marker);
    for (const child of [...item.childNodes]) child.remove();
    const origIcon = template.querySelector("svg");
    item.append(buildIcon(origIcon?.getAttribute("class") || "size-4", icon), document.createTextNode(label));
    item.addEventListener("mouseenter", () => {
      for (const el of content.querySelectorAll('[role="menuitem"]')) el.removeAttribute("data-highlighted");
      item.setAttribute("data-highlighted", "");
    });
    item.addEventListener("mouseleave", () => item.removeAttribute("data-highlighted"));
    item.addEventListener("click", () => {
      closeRadixMenu(content);
      onPick();
    });
    anchor.before(item);
    return item;
  }
  function handleFileMenu(content) {
    if (content.dataset.zcodeproFileMenu) return;
    const items = itemsOf(content);
    const copyAbs = items.find((el) => COPY_ABS_TEXTS.some((x) => itemText(el).startsWith(x)));
    if (!copyAbs) return;
    if (typeof window === "undefined" || typeof window.zcode?.openExternalFile !== "function" || typeof window.zcode?.openInFileManager !== "function") return;
    content.dataset.zcodeproFileMenu = "1";
    void (async () => {
      const config = await getConfig();
      if (config.features && config.features.fileActions === false) return;
      const path = resolveTargetPath(content);
      if (!path) return;
      const L = t();
      const noApps = items.find((el) => NO_APPS_TEXTS.some((x) => itemText(el) === x)) || content.querySelector('[data-disabled][role="menuitem"]');
      const openAnchor = noApps && content.contains(noApps) ? noApps : copyAbs;
      appendMenuItem(content, copyAbs, openAnchor, {
        marker: "file-open-default",
        label: L.fileOpenDefault,
        icon: ICON_OPEN_DEFAULT,
        onPick: () => {
          try {
            void window.zcode.openExternalFile(path);
          } catch {
          }
        }
      });
      appendMenuItem(content, copyAbs, copyAbs, {
        marker: "file-reveal",
        label: L.fileReveal,
        icon: ICON_REVEAL,
        onPick: () => {
          try {
            void rpc("/reveal-path", { method: "POST", body: { path } });
          } catch {
          }
        }
      });
    })();
  }

  // src/inject/features/image-menu.js
  var MIN_SIZE = 48;
  function copyTargetOf(el, x, y) {
    const sizeOk = (img) => {
      const r = img.getBoundingClientRect();
      return Math.min(r.width, r.height) >= MIN_SIZE;
    };
    if (el instanceof HTMLImageElement) {
      if (!el.closest("[data-v4-timeline-content-column]") && !el.closest('[role="dialog"]')) return null;
      return sizeOk(el) ? el : null;
    }
    if (!(el instanceof Element)) return null;
    const dialog = el.closest('[role="dialog"]');
    if (!dialog) return null;
    let best = null;
    for (const img of dialog.querySelectorAll("img")) {
      const r = img.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      if (!sizeOk(img)) continue;
      const area = r.width * r.height;
      if (!best || area > best.area) best = { img, area };
    }
    return best ? best.img : null;
  }
  var menuEl = null;
  var hideMenu = () => {
  };
  function showMenu(x, y, img) {
    hideMenu();
    const L = t();
    const preBlob = fetchImageBlob(img);
    menuEl = h(
      "div",
      {
        role: "menu",
        class: "fixed rounded-xl border border-border bg-menu p-1 text-ui-sm text-foreground",
        style: "z-index:2147483000;min-width:9rem;box-shadow:0 10px 30px rgba(0,0,0,.18);pointer-events:auto"
      },
      h(
        "div",
        {
          role: "menuitem",
          tabindex: "0",
          class: "zcodepro-imgmenu-item flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5",
          onClick: () => {
            hideMenu();
            void copyImage(img, preBlob);
          }
        },
        hCopyIcon(),
        document.createTextNode(L.imageCopy)
      )
    );
    document.body.append(menuEl);
    const r = menuEl.getBoundingClientRect();
    menuEl.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + "px";
    menuEl.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + "px";
    const onPointerDown = (e) => {
      if (menuEl && menuEl.contains(e.target)) {
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      hideMenu();
    };
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      hideMenu();
    };
    hideMenu = () => {
      if (menuEl) {
        menuEl.remove();
        menuEl = null;
      }
      window.removeEventListener("blur", hideMenu);
      window.removeEventListener("resize", hideMenu);
      document.removeEventListener("scroll", hideMenu, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      hideMenu = () => {
      };
    };
    window.addEventListener("blur", hideMenu);
    window.addEventListener("resize", hideMenu);
    document.addEventListener("scroll", hideMenu, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
  }
  async function fetchImageBlob(img) {
    const src = img.currentSrc || img.src || "";
    if (src) {
      try {
        const resp = await fetch(src);
        if (resp.ok) {
          const blob = await resp.blob();
          if (/^image\//.test(blob.type)) return blob;
        }
      } catch {
      }
    }
    return await fromCanvas(img);
  }
  async function copyImage(img, preBlob) {
    const L = t();
    try {
      let blob = await (preBlob || fetchImageBlob(img));
      if (!blob) throw new Error("empty image");
      if (blob.type !== "image/png") blob = await toPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      showToast(L.imageCopied);
    } catch {
      if (copyViaSelection(img)) showToast(L.imageCopied);
      else showToast(L.imageCopyFailed, "error");
    }
  }
  function copyViaSelection(img) {
    try {
      const prevSelect = img.style.userSelect;
      img.style.userSelect = "text";
      const range = document.createRange();
      range.selectNode(img);
      const sel = window.getSelection();
      const saved = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand("copy");
      sel.removeAllRanges();
      if (saved) sel.addRange(saved);
      img.style.userSelect = prevSelect;
      return ok;
    } catch {
      return false;
    }
  }
  function fromCanvas(img) {
    return new Promise((resolve) => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || 0;
        c.height = img.naturalHeight || 0;
        if (!c.width || !c.height) {
          resolve(null);
          return;
        }
        c.getContext("2d").drawImage(img, 0, 0);
        c.toBlob((b) => resolve(b), "image/png");
      } catch {
        resolve(null);
      }
    });
  }
  async function toPng(blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    const png = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
    if (!png) throw new Error("png convert failed");
    return png;
  }
  function hCopyIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("class", "size-4 shrink-0 text-foreground-subtle");
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("width", "14");
    rect.setAttribute("height", "14");
    rect.setAttribute("x", "8");
    rect.setAttribute("y", "8");
    rect.setAttribute("rx", "2");
    rect.setAttribute("ry", "2");
    svg.append(rect);
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2");
    svg.append(p);
    return svg;
  }
  function startImageMenu() {
    if (typeof window === "undefined") return;
    if (typeof navigator.clipboard?.write !== "function" || typeof window.ClipboardItem === "undefined") return;
    let enabled2 = true;
    const refresh = () => {
      void getConfig().then((c) => {
        enabled2 = !(c.features && c.features.imageCopy === false);
      });
    };
    refresh();
    document.addEventListener("contextmenu", (e) => {
      if (e.defaultPrevented) return;
      const img = copyTargetOf(e.target, e.clientX, e.clientY);
      if (!img) return;
      e.preventDefault();
      if (enabled2) showMenu(e.clientX, e.clientY, img);
      refresh();
    }, true);
  }

  // src/inject/features/styles.js
  var STYLE_DEFAULTS = {
    rowGap: 20,
    // 段落间距：会话内各块之间的垂直间距
    listSpacing: 12,
    // 列表上下留白（my-3）
    listItemSpacing: 6,
    // 列表项之间的间距（space-y-1.5）
    quoteCodeSpacing: 16,
    // 引用/代码块上下留白（my-4）
    lineHeight: 1.75,
    // 回答行高（leading-[1.75]，挂在答案内容容器上）
    userLineHeight: 1.5,
    // 提问行高（用户消息文本容器，默认 normal=1.5）
    contentWidth: null
    // 内容宽度：默认 100%（跟随应用，不覆盖）
  };
  var styleEl = null;
  var CONV = '[class*="@md/conversation"]';
  var SPECIAL = ":is(ul, ol, blockquote, pre, table)";
  function buildCss(styles) {
    const parts = [];
    const n = styles.rowGap;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
      parts.push(
        // 回合内外各级容器（SECTION 自身或后代，二者都覆盖）
        `${CONV}.pb-5,${CONV} .pb-5{padding-bottom:${n}px !important;}`,
        `${CONV}.pt-5,${CONV} .pt-5{padding-top:${n}px !important;}`,
        `${CONV} .flex.flex-col.gap-5{gap:${n}px !important;}`,
        `${CONV} .flex.flex-col.gap-4{gap:${n}px !important;}`,
        // 答案内相邻文本块之间（特殊块除外，走各自间距项）
        `${CONV} .space-y-4 > * + *:not(${SPECIAL}){margin-block-start:${n}px !important;margin-top:${n}px !important;}`,
        // 特殊块后接文本块：去掉文本块的段落间距，避免与特殊块自身留白叠加
        `${CONV} .space-y-4 > ${SPECIAL} + *:not(${SPECIAL}){margin-block-start:0 !important;margin-top:0 !important;}`,
        // 回合内部条目之间（思考触发条 ↔ 正文等）
        `.history-message.flex.flex-col > * + *:not([data-slot="collapsible-content"]){margin-block-start:${n}px !important;margin-top:${n}px !important;}`
      );
    }
    const ls = styles.listSpacing;
    if (typeof ls === "number" && Number.isFinite(ls) && ls >= 0) {
      parts.push(`${CONV} .space-y-4 > :is(ul, ol){margin-block:${ls}px !important;}`);
    }
    const li = styles.listItemSpacing;
    if (typeof li === "number" && Number.isFinite(li) && li >= 0) {
      parts.push(`${CONV} :is(ul, ol) > li + li{margin-block-start:${li}px !important;margin-top:${li}px !important;}`);
    }
    const qc = styles.quoteCodeSpacing;
    if (typeof qc === "number" && Number.isFinite(qc) && qc >= 0) {
      parts.push(`${CONV} .space-y-4 > :is(blockquote, pre, table){margin-block:${qc}px !important;}`);
    }
    const lh = styles.lineHeight;
    if (typeof lh === "number" && Number.isFinite(lh) && lh >= 0.8) {
      parts.push(`${CONV} .space-y-4{line-height:${lh} !important;}`);
    }
    const ulh = styles.userLineHeight;
    if (typeof ulh === "number" && Number.isFinite(ulh) && ulh >= 0.8) {
      parts.push(`${CONV} [class*="user-row"] .whitespace-pre-wrap{line-height:${ulh} !important;}`);
    }
    const cw = styles.contentWidth;
    if (cw && (cw.unit === "px" || cw.unit === "%") && Number.isFinite(cw.value)) {
      parts.push(`[data-v4-timeline-content-column]{max-width:${cw.value}${cw.unit} !important;}`);
    }
    return parts.join("");
  }
  function applyStyles(styles) {
    if (!styleEl) return;
    styleEl.textContent = styles && typeof styles === "object" ? buildCss(styles) : "";
  }
  function startStyleAdjustments() {
    const root = document.head || document.documentElement;
    if (!root) return;
    styleEl = document.getElementById("__zcodepro_styles__");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "__zcodepro_styles__";
      root.append(styleEl);
    }
    void getConfig().then((cfg) => applyStyles(cfg.styles)).catch(() => {
    });
  }

  // src/inject/features/settings-dialog.js
  function openSettingsDialog() {
    ensureStyle();
    const L = t();
    openDialog({
      title: L.settingsTitle,
      width: "max-w-lg",
      overlay: "none",
      draggable: true,
      posKey: "settings",
      dismissOnOutside: false,
      onMount: async ({ body, close }) => {
        const health = await rpc("/health");
        const config = await getConfig(true);
        const agentsRes = await rpc("/agents");
        const setFeature = async (key, value) => {
          const res = await rpc("/config", { method: "POST", body: { features: { [key]: value } } });
          clearConfigCache();
          if (!res.ok) {
            body.querySelector("[data-zcodepro-status]").replaceChildren(
              h("span", { class: "text-ui-sm text-destructive" }, L.failed + ": " + errText(res))
            );
            return false;
          }
          return true;
        };
        const statusLine = h(
          "div",
          {
            class: "flex items-center gap-2 text-ui-sm text-foreground-subtle",
            "data-zcodepro-status": "1"
          },
          h("span", { class: "inline-block size-2 rounded-full bg-emerald-500" }),
          h("span", { class: "text-foreground-subtle/70" }, `${L.version} ${health.version} \xB7 ${HELPER_URL}`)
        );
        const rows = h("div", { class: "divide-y divide-border rounded-xl border border-border" });
        const refreshRows = () => {
          const f = config.features || {};
          rows.replaceChildren(
            settingRow(L.featureAlias, L.featureAliasDesc, f.projectAlias !== false, async () => {
              const next = !(f.projectAlias !== false);
              if (await setFeature("projectAlias", next)) f.projectAlias = next;
              refreshRows();
              await refreshAliases();
            }),
            settingRow(L.featureRelocate, L.featureRelocateDesc, f.projectRelocate !== false, async () => {
              const next = !(f.projectRelocate !== false);
              if (await setFeature("projectRelocate", next)) f.projectRelocate = next;
              refreshRows();
            }),
            settingRow(L.featureTaskOrder, L.featureTaskOrderDesc, f.taskOrder !== false, async () => {
              const next = !(f.taskOrder !== false);
              if (await setFeature("taskOrder", next)) f.taskOrder = next;
              refreshRows();
            }),
            settingRow(L.featureFileActions, L.featureFileActionsDesc, f.fileActions !== false, async () => {
              const next = !(f.fileActions !== false);
              if (await setFeature("fileActions", next)) f.fileActions = next;
              refreshRows();
            }),
            settingRow(L.featureImageCopy, L.featureImageCopyDesc, f.imageCopy !== false, async () => {
              const next = !(f.imageCopy !== false);
              if (await setFeature("imageCopy", next)) f.imageCopy = next;
              refreshRows();
            }),
            settingRow(L.featurePinnedExpand, L.featurePinnedExpandDesc, f.pinnedKeepCollapsed !== false, async () => {
              const next = !(f.pinnedKeepCollapsed !== false);
              if (await setFeature("pinnedKeepCollapsed", next)) f.pinnedKeepCollapsed = next;
              refreshRows();
            })
          );
        };
        refreshRows();
        let recCards = null;
        if (typeof window !== "undefined" && typeof window.zcode?.openExternal === "function") {
          const ns = "http://www.w3.org/2000/svg";
          const extIcon = () => {
            const icon = h("svg", {
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              "stroke-width": "2",
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              class: "size-4 shrink-0 text-foreground-subtle"
            });
            for (const d of ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"]) {
              const p2 = document.createElementNS(ns, "path");
              p2.setAttribute("d", d);
              icon.append(p2);
            }
            return icon;
          };
          const recCard = (title, desc, url) => h(
            "div",
            {
              class: "flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-border p-3 transition-colors hover:bg-surface-hover",
              onClick: () => {
                try {
                  void window.zcode.openExternal(url);
                } catch {
                }
              }
            },
            h(
              "div",
              { class: "min-w-0" },
              h("div", { class: "truncate text-ui-sm font-medium text-foreground" }, title),
              h("div", { class: "mt-0.5 truncate text-ui-xs/relaxed text-foreground-subtle" }, desc)
            ),
            extIcon()
          );
          recCards = h(
            "div",
            { class: "mt-3 grid grid-cols-2 gap-2" },
            recCard(L.plugTitle, L.plugDesc, "https://github.com/duanluan/zcode-plugins"),
            recCard(L.qqGroupTitle, L.qqGroupDesc, "https://qm.qq.com/q/WXuISJK3ug")
          );
        }
        let activeTab = "features";
        const paneFeatures = h(
          "div",
          { role: "tabpanel", class: "mt-4" },
          h("div", {}, rows),
          ...recCards ? [recCards] : []
        );
        const paneStyles = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneAgents = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const panes = { features: paneFeatures, styles: paneStyles, agents: paneAgents };
        const tabDefs = [
          ["features", L.tabFeatures],
          ["styles", L.tabStyles],
          ["agents", L.tabAgents]
        ];
        const tablist = h("div", { role: "tablist", "aria-orientation": "horizontal", class: "zcodepro-tablist mt-4" });
        const renderTabs = () => tablist.replaceChildren(...tabDefs.map(([id, label]) => h("button", {
          type: "button",
          role: "tab",
          class: "zcodepro-tab",
          "aria-selected": String(activeTab === id),
          "data-state": activeTab === id ? "active" : "inactive",
          onClick: () => switchTab(id)
        }, label)));
        const switchTab = (name) => {
          activeTab = name;
          for (const [id, pane] of Object.entries(panes)) pane.style.display = id === name ? "" : "none";
          renderTabs();
        };
        renderTabs();
        const savedStyles = config.styles || {};
        let saveTimer = null;
        const persistStyles = (partial) => {
          clearTimeout(saveTimer);
          saveTimer = setTimeout(async () => {
            const res = await rpc("/config", { method: "POST", body: { styles: partial } });
            clearConfigCache();
            if (res.ok) applyStyles(res.config && res.config.styles || savedStyles);
            else showToast(L.failed + ": " + errText(res), "error");
          }, 150);
        };
        const styleCell = (name, tip, key, { min = 0, max = 48, step = 1, unit = "px" } = {}) => {
          const field = numberField({
            value: typeof savedStyles[key] === "number" ? savedStyles[key] : null,
            fallback: STYLE_DEFAULTS[key],
            min,
            max,
            step,
            onCommit: (v) => persistStyles({ [key]: v })
          });
          return {
            field,
            el: h(
              "div",
              { class: "flex items-center justify-between gap-2 p-2.5" },
              h("span", { class: "min-w-0 truncate text-ui-sm font-medium text-foreground", title: tip }, name),
              h(
                "span",
                { class: "flex shrink-0 items-center gap-1" },
                field.el,
                h("span", { class: "w-3 text-ui-xs text-foreground-subtle" }, unit)
              )
            )
          };
        };
        const column = document.querySelector("[data-v4-timeline-content-column]");
        const currentWidth = column ? Math.round(column.getBoundingClientRect().width) : 0;
        const widthField = unitField({
          value: savedStyles.contentWidth || null,
          fallback: { value: currentWidth > 0 ? currentWidth : 1152, unit: "px" },
          onCommit: (v) => persistStyles({ contentWidth: v })
        });
        const widthCell = {
          field: widthField,
          el: h(
            "div",
            { class: "flex items-center justify-between gap-2 p-2.5" },
            h("span", { class: "min-w-0 truncate text-ui-sm font-medium text-foreground", title: L.contentWidthDesc }, L.contentWidthName),
            widthField.el
          )
        };
        const cells = [
          widthCell,
          styleCell(L.rowGapName, L.rowGapDesc, "rowGap"),
          styleCell(L.userLineHeightName, L.userLineHeightDesc, "userLineHeight", { min: 1, max: 3, step: 0.05, unit: "x" }),
          styleCell(L.lineHeightName, L.lineHeightDesc, "lineHeight", { min: 1, max: 3, step: 0.05, unit: "x" }),
          styleCell(L.listSpacingName, L.listSpacingDesc, "listSpacing"),
          styleCell(L.listItemSpacingName, L.listItemSpacingDesc, "listItemSpacing"),
          styleCell(L.quoteCodeSpacingName, L.quoteCodeSpacingDesc, "quoteCodeSpacing")
        ];
        paneStyles.append(
          h(
            "div",
            { class: "grid grid-cols-2 gap-2 rounded-xl border border-border p-1.5" },
            ...cells.map((c) => h("div", { class: "rounded-lg transition-colors hover:bg-surface-hover" }, c.el))
          ),
          h(
            "div",
            { class: "mt-2 flex justify-end" },
            btnSecondary(L.resetDefault, () => {
              for (const c of cells) c.field.reset();
              persistStyles({ rowGap: null, listSpacing: null, listItemSpacing: null, quoteCodeSpacing: null, lineHeight: null, userLineHeight: null, contentWidth: null });
            }, "h-7 px-3 text-ui-xs")
          )
        );
        const agentsArea = h("textarea", {
          class: "zcodepro-textarea",
          placeholder: L.agentsPlaceholder,
          spellcheck: "false"
        });
        const agentsSaveBtn = btnPrimary(L.agentsSave, () => {
          void saveAgents();
        }, "h-7 px-3 text-ui-xs");
        let agentsOriginal = "";
        let agentsFailed = false;
        if (agentsRes.ok) {
          agentsOriginal = agentsRes.content || "";
          agentsArea.value = agentsOriginal;
        } else {
          agentsFailed = true;
          agentsArea.disabled = true;
        }
        agentsSaveBtn.disabled = true;
        agentsArea.addEventListener("input", () => {
          agentsSaveBtn.disabled = agentsFailed || agentsArea.value === agentsOriginal;
        });
        const saveAgents = async () => {
          agentsSaveBtn.disabled = true;
          const res = await rpc("/agents", { method: "POST", body: { content: agentsArea.value } });
          if (res.ok) {
            agentsOriginal = typeof res.content === "string" ? res.content : agentsArea.value;
            showToast(L.agentsSaved);
          } else {
            showToast(L.failed + ": " + errText(res), "error");
            agentsSaveBtn.disabled = false;
          }
        };
        paneAgents.append(
          h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.agentsDesc),
          ...agentsFailed ? [h("p", { class: "mt-2 text-ui-sm text-destructive" }, L.agentsLoadFailed + ": " + errText(agentsRes))] : [],
          h("div", { class: "mt-3" }, agentsArea),
          h("div", { class: "mt-3 flex justify-end" }, agentsSaveBtn)
        );
        body.append(
          statusLine,
          tablist,
          paneFeatures,
          paneStyles,
          paneAgents
        );
        body.append(
          dialogFooter(btnPrimary(L.close, () => close()))
        );
      }
    });
  }

  // src/inject/features/settings-entry.js
  var SETTINGS_BUTTON_TESTID = "task-settings-button";
  function handleSettingsContextmenu(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(`[data-testid="${SETTINGS_BUTTON_TESTID}"]`)) return;
    e.preventDefault();
    e.stopPropagation();
    if (document.getElementById("zcodepro-overlay")) return;
    openSettingsDialog();
  }
  function startSettingsEntry() {
    document.addEventListener("contextmenu", handleSettingsContextmenu, true);
  }

  // src/inject/features/task-order.js
  var installed = false;
  var dragKey = null;
  function startTaskOrderWatcher() {
    if (installed || typeof document === "undefined") return;
    installed = true;
    ensureStyle();
    document.addEventListener("dragstart", (e) => {
      const row = e.target.closest && e.target.closest("[data-task-item-key]");
      dragKey = row ? row.getAttribute("data-task-item-key") : null;
    }, true);
    document.addEventListener("dragend", () => {
      dragKey = null;
    }, true);
    document.addEventListener("dragover", (e) => {
      if (!dragKey) return;
      const row = e.target.closest && e.target.closest("[data-task-item-key]");
      if (!row || row.getAttribute("data-task-item-key") === dragKey) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const src = [...row.parentElement.querySelectorAll("[data-task-item-key]")].find((el) => el.getAttribute("data-task-item-key") === dragKey);
      if (src && src !== row) {
        row.parentNode.insertBefore(src, before ? row : row.nextSibling);
      }
    }, true);
    document.addEventListener("drop", (e) => {
      if (!dragKey) return;
      const row = e.target.closest && e.target.closest("[data-task-item-key]");
      const list = row ? row.parentElement : null;
      if (!list) return;
      const rows = [...list.querySelectorAll("[data-task-item-key]")];
      if (rows.length < 2) return;
      e.preventDefault();
      e.stopPropagation();
      dragKey = null;
      void persistOrder(rows.map((el) => el.getAttribute("data-task-item-key")));
    }, true);
  }
  var persisting = false;
  async function persistOrder(ordered) {
    if (persisting) return;
    persisting = true;
    try {
      const config = await getConfig();
      if (config.features && config.features.taskOrder === false) return;
      ensureStyle();
      const L = t();
      const workspaces = new Set(ordered.map((k) => k.slice(0, k.lastIndexOf(":"))));
      const scope = workspaces.size === 1 ? "workspace" : "group-members";
      const res = await rpc("/task-order", { method: "POST", body: { scope, ordered } });
      if (res && res.ok) {
        showToast(L.taskOrderSaved);
        setTimeout(() => location.reload(), 600);
      } else {
        showToast(L.failed + ": " + (errText(res) || L.retryHint), "error");
      }
    } finally {
      persisting = false;
    }
  }

  // src/inject/features/pinned-expand.js
  var installed2 = false;
  var keepCollapsed = false;
  async function refreshConfig() {
    try {
      const res = await rpc("/config");
      if (res && res.ok && res.config && res.config.features) {
        keepCollapsed = res.config.features.pinnedKeepCollapsed !== false;
      }
    } catch {
    }
  }
  function startPinnedExpandSuppression() {
    if (installed2 || typeof document === "undefined") return;
    installed2 = true;
    void refreshConfig();
    setInterval(refreshConfig, 5e3);
    document.addEventListener("click", (e) => {
      if (!keepCollapsed) return;
      const taskRow = e.target.closest && e.target.closest('[data-testid^="task-item-"]');
      if (!taskRow) return;
      const key = taskRow.getAttribute("data-task-item-key") || "";
      const sep = key.lastIndexOf(":");
      if (sep <= 0) return;
      const wsKey = key.slice(0, sep);
      const wsRow = document.querySelector(`[data-testid="workspace-item-${cssEscape(wsKey)}"]`);
      if (!wsRow || wsRow.getAttribute("aria-expanded") !== "false") return;
      const head = wsRow.matches("[aria-expanded]") ? wsRow : wsRow.querySelector("[aria-expanded]");
      if (!head) return;
      collapseAfterContentLoaded(wsRow);
    }, true);
    document.addEventListener("click", (e) => {
      const row = e.target.closest && e.target.closest('[data-testid^="workspace-item-"]');
      if (row) row.__zcodeproUserTouched = Date.now();
    }, true);
  }
  function collapseAfterContentLoaded(wsRow) {
    const deadline = Date.now() + 25e3;
    let lastLen = (document.querySelector("main") || document.body).innerText.length;
    let grewAt = 0;
    let settledAt = 0;
    const headOf = () => {
      const h2 = wsRow.matches("[aria-expanded]") ? wsRow : wsRow.querySelector("[aria-expanded]");
      return h2 || null;
    };
    const userTouched = () => wsRow.__zcodeproUserTouched && Date.now() - wsRow.__zcodeproUserTouched < 800;
    const tick = () => {
      if (!keepCollapsed || Date.now() > deadline || !wsRow.isConnected) return done();
      const len = (document.querySelector("main") || document.body).innerText.length;
      if (len > lastLen) grewAt = Date.now();
      if (grewAt && Date.now() - grewAt >= 1e3) settledAt = settledAt || Date.now();
      lastLen = len;
      const head = headOf();
      if (head && head.getAttribute("aria-expanded") === "true" && !userTouched()) {
        head.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
      if (settledAt && Date.now() - settledAt >= 1e3) {
        const h2 = headOf();
        if (h2 && h2.getAttribute("aria-expanded") === "true" && !userTouched()) {
          h2.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        }
        return done();
      }
      setTimeout(tick, 200);
    };
    const done = () => {
      wsRow.__zcodeproSuppending = false;
    };
    wsRow.__zcodeproSuppending = true;
    setTimeout(tick, 400);
  }
  function cssEscape(s) {
    return String(s).replace(/(["\\\]])/g, "\\$1");
  }

  // src/inject/index.js
  (function zcodeproInject() {
    if (typeof window === "undefined") return;
    if (window.__zcodeproInjected) return;
    window.__zcodeproInjected = true;
    const start = () => {
      ensureStyle();
      observeRadixPopups((content) => {
        try {
          handleProjectMenu(content);
        } catch {
        }
        try {
          handleFileMenu(content);
        } catch {
        }
      });
      try {
        void startAliasWatcher();
      } catch {
      }
      try {
        startTaskOrderWatcher();
      } catch {
      }
      try {
        startImageMenu();
      } catch {
      }
      try {
        startPinnedExpandSuppression();
      } catch {
      }
      try {
        startStyleAdjustments();
      } catch {
      }
      try {
        startSettingsEntry();
      } catch {
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => start(), { once: true });
    } else {
      start();
    }
  })();
})();
