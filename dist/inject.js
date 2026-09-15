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
    settingsEntry: "ZCode Pro \u8BBE\u7F6E",
    settingsTitle: "ZCode Pro \u589E\u5F3A\u8BBE\u7F6E",
    settingsSubtitle: "\u754C\u9762\u589E\u5F3A\u968F ZCode Pro \u542F\u52A8\u81EA\u52A8\u751F\u6548\uFF0C\u4E0D\u4FEE\u6539 ZCode \u5E94\u7528\u6587\u4EF6\u3002",
    featureAlias: "\u9879\u76EE\u201C\u66F4\u591A\u201D\u83DC\u5355 \xB7 \u81EA\u5B9A\u4E49\u522B\u540D",
    featureAliasDesc: "\u53EA\u4E3A\u754C\u9762\u8D77\u4E2A\u987A\u773C\u7684\u522B\u540D\uFF1A\u4FA7\u8FB9\u680F\u663E\u793A\u522B\u540D\uFF0C\u78C1\u76D8\u76EE\u5F55\u4E0E\u6240\u6709\u6570\u636E\u4E0D\u53D8\u3002",
    featureEntry: "\u53F3\u4E0A\u89D2\u83DC\u5355 \xB7 \u8BBE\u7F6E\u5165\u53E3",
    featureEntryDesc: "\u5728\u53F3\u4E0A\u89D2\u4E0B\u62C9\u83DC\u5355\u4E2D\u663E\u793A\u201CZCode Pro \u8BBE\u7F6E\u201D\u3002",
    statusOk: "\u8F85\u52A9\u670D\u52A1\u8FD0\u884C\u4E2D",
    statusDown: "\u8F85\u52A9\u670D\u52A1\u4E0D\u53EF\u7528",
    injectedPages: "\u5DF2\u589E\u5F3A\u9875\u9762",
    version: "\u7248\u672C",
    close: "\u5173\u95ED",
    cancel: "\u53D6\u6D88",
    pathLabel: "\u8DEF\u5F84",
    aliasItem: "\u81EA\u5B9A\u4E49\u522B\u540D\u2026",
    aliasTitle: "\u81EA\u5B9A\u4E49\u9879\u76EE\u522B\u540D",
    aliasDesc: "\u4EC5\u5728 ZCode \u754C\u9762\u4E2D\u663E\u793A\u8BE5\u522B\u540D\uFF0C\u4E0D\u4FEE\u6539\u78C1\u76D8\u76EE\u5F55\u4E0E\u4EFB\u4F55\u6570\u636E\uFF0C\u968F\u65F6\u53EF\u6E05\u9664\u6062\u590D\u3002",
    aliasLabel: "\u522B\u540D",
    aliasPlaceholder: "\u7559\u7A7A\u5E76\u4FDD\u5B58 = \u6062\u590D\u771F\u5B9E\u540D\u79F0",
    aliasConfirm: "\u4FDD\u5B58",
    aliasClear: "\u6062\u590D\u771F\u5B9E\u540D\u79F0",
    aliasSaved: "\u522B\u540D\u5DF2\u66F4\u65B0",
    aliasCleared: "\u5DF2\u6062\u590D\u771F\u5B9E\u540D\u79F0",
    aliasHint: "\u78C1\u76D8\u76EE\u5F55\u540D\u4E0D\u53D8\uFF1A\u7EC8\u7AEF\u3001\u6587\u4EF6\u7BA1\u7406\u5668\u4E0E\u5176\u4ED6\u5F15\u7528\u771F\u5B9E\u8DEF\u5F84\u7684\u754C\u9762\u4ECD\u663E\u793A\u539F\u540D\u3002",
    failed: "\u64CD\u4F5C\u5931\u8D25",
    retryHint: "\u8BF7\u91CD\u8BD5"
  };
  var en = {
    settingsEntry: "ZCode Pro Settings",
    settingsTitle: "ZCode Pro Enhancements",
    settingsSubtitle: "Enhancements load automatically with ZCode Pro; no app files are modified.",
    featureAlias: 'Project "More" menu \xB7 Custom alias',
    featureAliasDesc: "A UI-only alias: the sidebar shows your custom name while the directory and all data stay untouched.",
    featureEntry: "Header menu \xB7 Settings entry",
    featureEntryDesc: 'Show "ZCode Pro Settings" in the top-right dropdown menu.',
    statusOk: "Helper running",
    statusDown: "Helper unavailable",
    injectedPages: "Pages enhanced",
    version: "Version",
    close: "Close",
    cancel: "Cancel",
    pathLabel: "Path",
    aliasItem: "Custom alias\u2026",
    aliasTitle: "Custom alias",
    aliasDesc: "Shown in the ZCode UI only. The directory on disk and all data stay untouched; revert anytime.",
    aliasLabel: "Alias",
    aliasPlaceholder: "Leave empty and save to restore the real name",
    aliasConfirm: "Save",
    aliasClear: "Restore real name",
    aliasSaved: "Alias updated.",
    aliasCleared: "Real name restored.",
    aliasHint: "The directory name on disk is unchanged: terminals, file managers and other path-based UI still show the real name.",
    failed: "Operation failed",
    retryHint: "Please retry"
  };
  function t() {
    return /^zh/i.test(navigator.language || "zh-CN") ? zh : en;
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
  function itemsOf(menuEl) {
    return [...menuEl.querySelectorAll('[role="menuitem"]')];
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
  var contentClass = "w-full sm:max-w-md rounded-2xl border-none bg-popover/98 p-5 text-ui-base/relaxed text-foreground ring-border shadow-2xl";
  function openDialog({ title, description, onMount, onClose, width = "sm:max-w-md" }) {
    const L = t();
    const prevActive = document.activeElement;
    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
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
    const overlay = h("div", {
      id: "zcodepro-overlay",
      class: overlayClass,
      onMousedown: (e) => {
        if (e.target === overlay) close();
      }
    }, content);
    content.append(
      h("h2", { class: "text-lg font-semibold leading-none tracking-tight text-foreground" }, title),
      description ? h("p", { class: "mt-2 text-ui-sm/relaxed text-foreground-subtle" }, description) : null
    );
    const body = h("div", { class: "mt-4" });
    content.append(body);
    document.addEventListener("keydown", onKey, true);
    document.body.append(overlay);
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
    if (autofocus) setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
    return input;
  }
  function settingRow(name, desc, checked, onToggle) {
    const knob = h("span", {
      class: "pointer-events-none block size-4 rounded-full bg-foreground shadow-sm transition-transform " + (checked ? "translate-x-4" : "translate-x-0")
    });
    const track = h("span", {
      class: "flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors " + (checked ? "bg-primary" : "bg-border"),
      "data-state": checked ? "checked" : "unchecked"
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
    #zcodepro-card {
      background-color: var(--color-popover, #fff);
      border-radius: 16px;
      outline: none;
      box-shadow: 0 0 0 1px var(--color-border, rgba(0, 0, 0, 0.1)), 0 25px 50px -12px rgba(0, 0, 0, 0.25);
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
          showToast(L.failed + ": " + (res.error || L.retryHint), "error");
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
                } else showToast(L.failed + ": " + (res.error || L.retryHint), "error");
              }));
            }
            footer.append(btnSecondary(L.cancel, () => close()), submitBtn);
            return footer;
          })()
        );
      }
    });
  }

  // src/inject/features/settings-dialog.js
  function openSettingsDialog() {
    ensureStyle();
    const L = t();
    openDialog({
      title: L.settingsTitle,
      description: L.settingsSubtitle,
      width: "max-w-lg",
      onMount: async ({ body, close }) => {
        const health = await rpc("/health");
        const config = health.ok ? { features: health.features } : await getConfig();
        const setFeature = async (key, value) => {
          const res = await rpc("/config", { method: "POST", body: { features: { [key]: value } } });
          clearConfigCache();
          if (!res.ok) {
            body.querySelector("[data-zcodepro-status]").replaceChildren(
              h("span", { class: "text-ui-sm text-destructive" }, L.failed + ": " + (res.error || ""))
            );
            return false;
          }
          return true;
        };
        const statusLine = h(
          "div",
          {
            class: "flex items-center gap-2 text-ui-sm " + (health.ok ? "text-foreground-subtle" : "text-destructive"),
            "data-zcodepro-status": "1"
          },
          h("span", {
            class: "inline-block size-2 rounded-full " + (health.ok ? "bg-emerald-500" : "bg-destructive")
          }),
          health.ok ? L.statusOk : L.statusDown,
          health.ok ? h("span", { class: "text-foreground-subtle/70" }, ` \xB7 ${L.version} ${health.version} \xB7 ${L.injectedPages} ${health.injectedPages ?? 0}`) : null
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
            settingRow(L.featureEntry, L.featureEntryDesc, f.headerSettingsEntry !== false, async () => {
              const next = !(f.headerSettingsEntry !== false);
              if (await setFeature("headerSettingsEntry", next)) f.headerSettingsEntry = next;
              refreshRows();
            })
          );
        };
        refreshRows();
        body.append(
          statusLine,
          h("div", { class: "mt-4" }, rows),
          h("p", { class: "mt-3 text-ui-xs/relaxed text-foreground-subtle" }, HELPER_URL)
        );
        body.append(
          dialogFooter(btnPrimary(L.close, () => close()))
        );
      }
    });
  }

  // src/inject/features/header-menu.js
  var NEW_TASK_TEXTS = ["\u65B0\u5EFA\u4EFB\u52A1", "New task", "New Task"];
  var OPEN_WS_TEXTS = ["\u6253\u5F00\u5DE5\u4F5C\u533A", "Open workspace", "Open Workspace"];
  function handleHeaderMenu(content) {
    if (content.querySelector('[data-zcodepro-item="settings"]')) return;
    const items = itemsOf(content);
    if (items.length < 2) return;
    const first = itemText(items[0]);
    const head = items.slice(0, 3).map(itemText).join(" ");
    const isNewTask = NEW_TASK_TEXTS.some((x) => first.startsWith(x));
    const isOpenWs = OPEN_WS_TEXTS.some((x) => head.includes(x));
    if (!(isNewTask && isOpenWs)) return;
    void (async () => {
      const config = await getConfig();
      if (config.features && config.features.headerSettingsEntry === false) return;
      appendSettingsItem(content, items[0]);
    })();
  }
  function appendSettingsItem(menu, firstItem) {
    const L = t();
    const item = firstItem.cloneNode(true);
    item.removeAttribute("data-testid");
    item.removeAttribute("data-highlighted");
    item.setAttribute("data-zcodepro-item", "settings");
    for (const child of [...item.childNodes]) child.remove();
    item.append(document.createTextNode(L.settingsEntry));
    item.addEventListener("mouseenter", () => {
      for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute("data-highlighted");
      item.setAttribute("data-highlighted", "");
    });
    item.addEventListener("mouseleave", () => item.removeAttribute("data-highlighted"));
    item.addEventListener("click", () => {
      closeRadixMenu(menu);
      setTimeout(() => openSettingsDialog(), 80);
    });
    menu.append(item);
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
    })();
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
          handleHeaderMenu(content);
        } catch {
        }
        try {
          handleProjectMenu(content);
        } catch {
        }
      });
      try {
        void startAliasWatcher();
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
