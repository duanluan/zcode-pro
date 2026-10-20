(() => {
  // src/inject/core.js
  var BOOT = typeof window !== "undefined" ? window.__ZCODEPRO__ || {} : {};
  var HELPER_URL = BOOT.helperUrl || "http://127.0.0.1:47889";
  function liveBoot() {
    return typeof window !== "undefined" && window.__ZCODEPRO__ || BOOT;
  }
  function rpc(path, options = {}) {
    const boot = liveBoot();
    return fetch((boot.helperUrl || HELPER_URL) + path, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "X-ZCodePro-Token": boot.token || ""
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
  function zcodeAppVersion() {
    const v = liveBoot().zcodeVersion;
    return typeof v === "string" && v ? v : "";
  }
  function zcodeVersionGte(version, major, minor, patch = 0) {
    const m = String(version || "").match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return false;
    const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]);
    return a > major || a === major && (b > minor || b === minor && c >= patch);
  }
  function officialRenameSupported() {
    return zcodeVersionGte(zcodeAppVersion(), 3, 16, 1);
  }
  var newSidebarCached = false;
  function isNewProjectSidebar() {
    if (newSidebarCached) return true;
    if (officialRenameSupported()) {
      newSidebarCached = true;
      return true;
    }
    try {
      if (document.querySelector("section[data-project-id]")) {
        newSidebarCached = true;
        return true;
      }
    } catch {
    }
    return false;
  }
  var zh = {
    settingsTitle: "ZCode Pro",
    tabFeatures: "\u529F\u80FD",
    tabStyles: "\u6837\u5F0F",
    tabProxy: "\u4EE3\u7406",
    tabBehavior: "\u884C\u4E3A",
    tabAgents: "\u5168\u5C40\u63D0\u793A\u8BCD",
    agentsDesc: "\u5199\u5165 ~/.zcode/AGENTS.md\uFF0C\u4F5C\u4E3A\u9ED8\u8BA4\u6307\u4EE4\u7528\u4E8E\u6240\u6709\u9879\u76EE\u7684\u6BCF\u6B21\u4F1A\u8BDD\uFF1B\u4FDD\u5B58\u540E\u4ECE\u65B0\u4F1A\u8BDD\u8D77\u751F\u6548\uFF0C\u9879\u76EE\u5185\u7684 AGENTS.md \u53EF\u8865\u5145\u6216\u8986\u76D6\u3002\u5185\u5BB9\u8D85\u8FC7 100KB \u4F1A\u88AB\u5E94\u7528\u622A\u65AD\u3002",
    agentsPlaceholder: "\u586B\u5199\u5E0C\u671B\u6240\u6709\u9879\u76EE\u9ED8\u8BA4\u9075\u5FAA\u7684\u6307\u4EE4\uFF1B\u6E05\u7A7A\u5E76\u4FDD\u5B58\u5373\u79FB\u9664\u5168\u5C40\u63D0\u793A\u8BCD",
    agentsSave: "\u4FDD\u5B58",
    agentsSaved: "\u5168\u5C40\u63D0\u793A\u8BCD\u5DF2\u4FDD\u5B58",
    agentsLoadFailed: "\u8BFB\u53D6\u5168\u5C40\u63D0\u793A\u8BCD\u5931\u8D25",
    proxyDesc: "\u4E3A ZCode Pro \u672C\u5730\u52A9\u624B\u53D1\u8D77\u7684\u7F51\u7EDC\u8BBF\u95EE\u8BBE\u7F6E HTTP \u4EE3\u7406\uFF1A\u63D2\u4EF6\u5E02\u573A\u7684\u66F4\u65B0\u4E0E\u5B89\u88C5\u3001\u63D2\u4EF6\u4F9D\u8D56\u8F6F\u4EF6\u7684\u5B89\u88C5\u4E0E\u5347\u7EA7\u3001WebDAV \u540C\u6B65\u90FD\u53EF\u8D70\u8BE5\u4EE3\u7406\uFF0C\u7528\u4E0B\u65B9\u5F00\u5173\u9009\u62E9\u751F\u6548\u8303\u56F4\u3002\u4E0D\u5F71\u54CD ZCode \u5E94\u7528\u672C\u8EAB\u4E0E\u6A21\u578B\u8BF7\u6C42\uFF0C\u4FDD\u5B58\u540E\u7ACB\u5373\u751F\u6548\u3002",
    proxyPlaceholder: "http://127.0.0.1:7890",
    proxySave: "\u4FDD\u5B58",
    proxySaved: "\u4EE3\u7406\u8BBE\u7F6E\u5DF2\u4FDD\u5B58",
    proxyHint: "\u7559\u7A7A\u4FDD\u5B58\u5373\u6E05\u9664\u4EE3\u7406\u3002",
    proxyTest: "\u68C0\u6D4B",
    proxyTesting: "\u68C0\u6D4B\u4E2D\u2026",
    proxyTestEmpty: "\u8BF7\u5148\u8F93\u5165\u4EE3\u7406\u5730\u5740",
    proxyTestFailed: "\u68C0\u6D4B\u5931\u8D25",
    proxyScopePlugins: "\u63D2\u4EF6\u5E02\u573A\u66F4\u65B0",
    proxyScopePluginsDesc: "\u63D2\u4EF6\u5E02\u573A\u7684\u68C0\u67E5\u66F4\u65B0\u3001\u5B89\u88C5\u4E0E\u5378\u8F7D\uFF08zcode CLI \u7684 git \u64CD\u4F5C\uFF09\u8D70\u4EE3\u7406\u3002",
    proxyScopeDeps: "\u63D2\u4EF6\u4F9D\u8D56\u8F6F\u4EF6",
    proxyScopeDepsDesc: "headroom \u4E0E rtk \u7684\u5B89\u88C5\u3001\u68C0\u67E5\u66F4\u65B0\u4E0E\u5347\u7EA7\uFF08pip \u4E0E GitHub \u4E0B\u8F7D\uFF09\u8D70\u4EE3\u7406\u3002",
    proxyScopeSync: "\u540C\u6B65",
    proxyScopeSyncDesc: "WebDAV \u4E0A\u4F20\u4E0E\u4E0B\u8F7D\u8D70\u4EE3\u7406\u3002\u9ED8\u8BA4\u5173\u95ED\uFF1A\u575A\u679C\u4E91\u7B49\u56FD\u5185\u7F51\u76D8\u76F4\u8FDE\u5373\u53EF\uFF0C\u4EE3\u7406\u505C\u4E86\u540C\u6B65\u4F1A\u8DDF\u7740\u5931\u8D25\u3002",
    tabSync: "\u540C\u6B65",
    tabDebug: "\u8C03\u8BD5",
    testNoSessionHint: "\u9009\u62E9\u201C\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD[\u5F53\u524D\u6A21\u578B]\u201D\u65F6\uFF0C\u9009\u62E9\u4E0A\u6B21\u4F1A\u8BDD\u4E2D\u4F7F\u7528\u7684\u4F9B\u5E94\u5546[\u6A21\u578B]",
    syncDesc: "\u624B\u52A8\u628A ZCode Pro \u8BBE\u7F6E\u4E0E\u6A21\u578B\u8BBE\u7F6E\u5907\u4EFD\u5230 WebDAV\uFF0C\u6216\u5728\u65B0\u7535\u8111\u4E0A\u6062\u590D\u3002\u4E24\u9879\u5404\u81EA\u72EC\u7ACB\u6210\u6587\u4EF6\uFF0C\u53EF\u53EA\u4E0A\u4F20\u6216\u53EA\u8986\u76D6\u5176\u4E2D\u4E00\u9879\uFF1B\u6BCF\u6B21\u4E0A\u4F20\u4F1A\u989D\u5916\u4FDD\u7559\u4E00\u4EFD\u5E26\u65F6\u95F4\u6233\u7684\u5386\u53F2\u7248\u672C\uFF08\u4FDD\u7559\u591A\u5C11\u4E2A\u89C1\u201C\u5386\u53F2\u7248\u672C\u201D\u4E00\u884C\uFF0C\u4E0A\u4F20\u540E\u81EA\u52A8\u5220\u9664\u8D85\u51FA\u7684\u6700\u65E7\u7248\u672C\uFF09\uFF0C\u4E0B\u8F7D\u65F6\u4EFB\u9009\u4E00\u4E2A\u7248\u672C\u6062\u590D\uFF1B\u4EC5\u5728\u70B9\u51FB\u6309\u94AE\u65F6\u4F20\u8F93\uFF0C\u4E0D\u505A\u81EA\u52A8\u540C\u6B65\u3002",
    syncUrlPlaceholder: "https://dav.jianguoyun.com/dav/",
    syncDir: "\u4E0A\u4F20\u76EE\u5F55",
    syncDirPlaceholder: "zcode-pro",
    syncLogin: "\u767B\u5F55",
    syncPassword: "\u5BC6\u7801",
    syncHistoryLimit: "\u5386\u53F2\u7248\u672C",
    syncHistoryLimitUnit: "\u4E2A",
    syncHistoryLimitHint: "\u4E91\u7AEF\u6700\u591A\u4FDD\u7559\u6700\u8FD1\u51E0\u6B21\u4E0A\u4F20\u7559\u4E0B\u7684\u5386\u53F2\u7248\u672C\uFF0C\u4E0A\u4F20\u6210\u529F\u540E\u81EA\u52A8\u5220\u9664\u66F4\u65E9\u7684\uFF1B\u56FA\u5B9A\u540D\u6700\u65B0\u7248\u4E0D\u53D7\u5F71\u54CD\uFF1B0 = \u4E0D\u4FDD\u7559\u5386\u53F2\u7248\u672C",
    syncPruned: "\u5DF2\u6E05\u7406 {n} \u4E2A\u66F4\u65E9\u7684\u5386\u53F2\u7248\u672C",
    syncSave: "\u4FDD\u5B58",
    syncSaved: "\u540C\u6B65\u914D\u7F6E\u5DF2\u4FDD\u5B58",
    syncFormHint: "\u540C\u6B65\u6587\u4EF6\u5B58\u5230\u201C\u4E0A\u4F20\u76EE\u5F55\u201D\uFF08\u9ED8\u8BA4 zcode-pro\uFF0C\u53EF\u591A\u7EA7\uFF0C\u81EA\u52A8\u521B\u5EFA\uFF09\uFF1Azcodepro.json \u4E0E model.json \u59CB\u7EC8\u662F\u6700\u65B0\u4E00\u7248\uFF0C\u65C1\u8FB9\u53E6\u4FDD\u7559\u5E26\u65F6\u95F4\u6233\u7684\u5386\u53F2\u7248\u672C\u3002",
    syncRecLink: "\u575A\u679C\u4E91 WebDAV",
    syncRecSuffix: "\uFF1A\u767B\u5F55\u4E0E\u5BC6\u7801\u586B\u201C\u5E94\u7528\u5BC6\u7801\u201D\uFF0C\u4E0D\u662F\u8D26\u53F7\u5BC6\u7801\u3002",
    syncIncludeZcp: "ZCode Pro \u8BBE\u7F6E",
    syncIncludeZcpDesc: "\u529F\u80FD\u5F00\u5173\u3001\u6837\u5F0F\u8C03\u6574\u4E0E\u4EE3\u7406\u8BBE\u7F6E\uFF1B\u540C\u6B65\u914D\u7F6E\u4E0E\u51ED\u636E\u672C\u8EAB\u4E0D\u53C2\u4E0E\u540C\u6B65\u3002\u9879\u76EE\u522B\u540D\u4E0D\u540C\u6B65\uFF08\u5B98\u65B9\u5DF2\u652F\u6301\u6539\u9879\u76EE\u540D\uFF09\u3002",
    syncIncludeModel: "\u6A21\u578B\u8BBE\u7F6E",
    syncIncludeModelDesc: "\u81EA\u5B9A\u4E49\u4F9B\u5E94\u5546\u4E0E\u6A21\u578B\u914D\u7F6E\uFF08config.json \u4E0E provider_config.json\uFF0C\u542B API Key\uFF09\u3002\u8D26\u53F7\u767B\u5F55\u7684\u51ED\u636E\uFF08\u5982 BigModel \u8BA2\u9605\uFF09\u4E0D\u53C2\u4E0E\u540C\u6B65\uFF0C\u5404\u673A\u5668\u7528\u5404\u81EA\u8D26\u53F7\u767B\u5F55\u3002",
    syncUpload: "\u4E0A\u4F20\u5230\u4E91\u7AEF",
    syncDownload: "\u4ECE\u4E91\u7AEF\u4E0B\u8F7D",
    syncUploading: "\u4E0A\u4F20\u4E2D\u2026",
    syncUploaded: "\u5DF2\u4E0A\u4F20\u5230\u4E91\u7AEF",
    syncDownloaded: "\u5DF2\u4ECE\u4E91\u7AEF\u6062\u590D",
    syncLastPush: "\u4E0A\u6B21\u4E0A\u4F20",
    syncLastPull: "\u4E0A\u6B21\u4E0B\u8F7D",
    syncNever: "\u65E0",
    syncConfirmTitle: "\u4ECE\u4E91\u7AEF\u4E0B\u8F7D",
    syncConfirmDesc: "\u5C06\u7528\u6240\u9009\u6587\u4EF6\u8986\u76D6\u672C\u673A\u5BF9\u5E94\u7684\u4E00\u9879\uFF08\u8986\u76D6\u524D\u4F1A\u5728\u539F\u6587\u4EF6\u65C1\u7559\u4E0B .zcodepro-backup \u5907\u4EFD\uFF09\uFF1B\u672C\u673A\u7684\u540C\u6B65\u914D\u7F6E\u4E0E\u767B\u5F55\u51ED\u636E\u4E0D\u53D7\u5F71\u54CD\u3002\u6A21\u578B\u8BBE\u7F6E\u6062\u590D\u540E\u5EFA\u8BAE\u91CD\u542F ZCode \u751F\u6548\u3002\u786E\u8BA4\u5BFC\u5165\uFF1F",
    syncConfirmGo: "\u786E\u8BA4\u5BFC\u5165",
    syncPickDesc: "\u56FA\u5B9A\u540D\u6587\u4EF6\u59CB\u7EC8\u662F\u6700\u65B0\u4E00\u7248\uFF0C\u5E26\u65F6\u95F4\u6233\u7684\u662F\u6BCF\u6B21\u4E0A\u4F20\u7559\u4E0B\u7684\u5386\u53F2\u7248\u672C\uFF1B\u201C\u5BFC\u5165\u201D\u7528\u6240\u9009\u6587\u4EF6\u8986\u76D6\u672C\u673A\u5BF9\u5E94\u7684\u4E00\u9879\u3002",
    syncVerDeleteLatestNote: "\u6CE8\u610F\uFF1A\u8FD9\u662F\u201C\u6700\u65B0\u201D\u6587\u4EF6\uFF0C\u65E7\u7248 zcode-pro \u7684\u201C\u4ECE\u4E91\u7AEF\u4E0B\u8F7D\u201D\u4F9D\u8D56\u5B83\uFF0C\u5220\u9664\u540E\u65E7\u7248\u673A\u5668\u5C06\u65E0\u6CD5\u4E0B\u8F7D\uFF1B\u5E26\u65F6\u95F4\u6233\u7684\u5386\u53F2\u7248\u672C\u4E0D\u53D7\u5F71\u54CD\u3002",
    syncHint: "\u540C\u6B65\u767B\u5F55\u51ED\u636E\u4EC5\u4FDD\u5B58\u5728\u672C\u673A zcodepro.json\uFF1B\u6A21\u578B\u8BBE\u7F6E\u5305\u542B\u81EA\u5B9A\u4E49\u4F9B\u5E94\u5546\u7684 API Key\uFF0C\u53EA\u4F1A\u4E0A\u4F20\u5230\u4F60\u81EA\u5DF1\u7684 WebDAV\u3002",
    syncTest: "\u6D4B\u8BD5",
    syncTesting: "\u6D4B\u8BD5\u4E2D\u2026",
    syncTestEmpty: "\u8BF7\u5148\u586B\u5199 URL",
    syncTestFailed: "\u6D4B\u8BD5\u5931\u8D25",
    syncTestStepConnect: "\u8FDE\u63A5",
    syncTestStepDir: "\u76EE\u5F55",
    syncTestStepList: "\u6587\u4EF6",
    syncTestFilesFound: "\u4E91\u7AEF\u5DF2\u6709 {n} \u4E2A\u5907\u4EFD\u6587\u4EF6",
    syncPickTitle: "\u8BF7\u9009\u62E9\u4E00\u4E2A\u6587\u4EF6",
    syncPickLoading: "\u6B63\u5728\u8BFB\u53D6\u4E91\u7AEF\u6587\u4EF6\u5217\u8868\u2026",
    syncPickEmpty: "\u4E91\u7AEF\u8FD8\u6CA1\u6709\u5907\u4EFD\u6587\u4EF6\uFF0C\u8BF7\u5148\u5728\u5176\u4ED6\u7535\u8111\u4E0A\u4F20",
    syncVerImport: "\u5BFC\u5165",
    syncVerImporting: "\u5BFC\u5165\u4E2D\u2026",
    syncVerDelete: "\u5220\u9664",
    syncVerSave: "\u4FDD\u5B58\u5230\u78C1\u76D8",
    syncVerSaving: "\u4FDD\u5B58\u4E2D\u2026",
    syncVerLatest: "\u6700\u65B0",
    syncVerDeleteTitle: "\u5220\u9664\u4E91\u7AEF\u6587\u4EF6",
    syncVerDeleteDesc: "\u5C06\u5220\u9664\u4E91\u7AEF\u7684\u8FD9\u4EFD\u5907\u4EFD\uFF0C\u4E0D\u53EF\u6062\u590D\uFF1A",
    syncVerDeleted: "\u5DF2\u5220\u9664\u4E91\u7AEF\u5907\u4EFD",
    syncVerSaved: "\u5DF2\u4FDD\u5B58\u5230",
    devMode: "\u5F00\u53D1\u6A21\u5F0F",
    devModeRowDesc: "\u5F00\u542F\u540E\u51FA\u73B0\u201C\u91CD\u8F7D ZCode Pro\u201D\u6309\u94AE\uFF1B\u4E5F\u53EF\u7ED9\u542F\u52A8\u5668\u8BBE\u73AF\u5883\u53D8\u91CF ZCODEPRO_DEV=1 \u542F\u7528\u3002\u6B64\u6807\u7B7E\u9875\u4EC5\u5728\u5F00\u53D1\u6A21\u5F0F\u751F\u6548\u65F6\u663E\u793A\u3002",
    devModeDesc: "\u5F00\u53D1\u8C03\u8BD5\u7528\uFF1A\u6539\u5B8C zcode-pro \u4EE3\u7801\u540E\u4E0D\u5FC5\u91CD\u542F ZCode\uFF0C\u70B9\u201C\u91CD\u8F7D ZCode Pro\u201D\u5373\u53EF\u52A0\u8F7D\u65B0\u4EE3\u7801\u3002\u6D41\u7A0B\u4E3A\u81EA\u52A8\u6784\u5EFA\uFF08\u9700\u5728\u6E90\u7801\u76EE\u5F55\u8FD0\u884C\uFF09\u2192 \u4EE5\u65B0\u8FDB\u7A0B\u91CD\u542F ZCode Pro\uFF08\u672C\u5730\u52A9\u624B\u4E0E\u6CE8\u5165\u811A\u672C\u90FD\u6362\u65B0\uFF09\u2192 \u6240\u6709 ZCode \u7A97\u53E3\u81EA\u52A8\u5237\u65B0\u5E76\u91CD\u65B0\u6CE8\u5165\uFF1BZCode \u672C\u4F53\u4E0E\u5DF2\u6253\u5F00\u7684\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD\u3002",
    devReload: "\u91CD\u8F7D ZCode Pro",
    devReloading: "\u91CD\u8F7D\u4E2D\u2026",
    devReloadDesc: "\u70B9\u51FB\u540E\u7EA6 2-3 \u79D2\u5185\u6240\u6709 ZCode \u7A97\u53E3\u81EA\u52A8\u5237\u65B0\u4E00\u6B21\u5E76\u52A0\u8F7D\u65B0\u811A\u672C\u3002",
    rowGapName: "\u6BB5\u843D\u95F4\u8DDD",
    rowGapDesc: "\u4F1A\u8BDD\u4E2D\u6BB5\u843D\u7B49\u6587\u672C\u5757\u4E4B\u95F4\u7684\u5782\u76F4\u95F4\u8DDD\uFF08\u56DE\u5408\u4E4B\u95F4\u3001\u7B54\u6848\u5185\u90E8\uFF09\u3002",
    listSpacingName: "\u5217\u8868\u4E0A\u4E0B\u8FB9\u8DDD",
    listSpacingDesc: "\u7B54\u6848\u4E2D\u5217\u8868\u4E0A\u4E0B\u7684\u7559\u767D\u3002",
    listItemSpacingName: "\u5217\u8868\u9879\u95F4\u8DDD",
    listItemSpacingDesc: "\u5217\u8868\u4E2D\u76F8\u90BB\u5217\u8868\u9879\u4E4B\u95F4\u7684\u95F4\u8DDD\u3002",
    quoteCodeSpacingName: "\u5F15\u7528\u5757\u4E0A\u4E0B\u8FB9\u8DDD",
    quoteCodeSpacingDesc: "\u5F15\u7528\u5757\u4E0E\u4EE3\u7801\u5757\u4E0A\u4E0B\u7684\u7559\u767D\u3002",
    codeLineHeightName: "\u4EE3\u7801\u5757\u884C\u9AD8",
    codeLineHeightDesc: "\u4EE3\u7801\u5757\u5185\u4EE3\u7801\u884C\u7684\u884C\u9AD8\uFF08\u500D\u6570\uFF09\u3002",
    tableSpacingName: "\u8868\u683C\u4E0A\u4E0B\u8FB9\u8DDD",
    tableSpacingDesc: "\u8868\u683C\u4E0A\u4E0B\u7684\u7559\u767D\u3002",
    tableCellPaddingName: "\u5355\u5143\u683C\u4E0A\u4E0B/\u5DE6\u53F3\u8FB9\u8DDD",
    tableCellPaddingDesc: "\u8868\u683C\u5355\u5143\u683C\u5185\u7684\u7559\u767D\uFF1B\u5DE6\u8F93\u5165\u6846\u4E3A\u4E0A\u4E0B\u3001\u53F3\u4E3A\u5DE6\u53F3\u3002",
    lineHeightName: "\u56DE\u7B54\u884C\u9AD8",
    lineHeightDesc: "\u56DE\u7B54\u6B63\u6587\u7684\u884C\u9AD8\uFF08\u500D\u6570\uFF09\u3002",
    thinkingLineHeightName: "\u601D\u8003\u884C\u9AD8",
    thinkingLineHeightDesc: "\u201C\u5DF2\u5DE5\u4F5C/\u5DE5\u4F5C\u4E2D\u201D\u8FC7\u7A0B\u8BB0\u5F55\uFF08\u8BFB\u53D6/\u7F16\u8F91/\u67E5\u9605/\u7EC8\u7AEF\u6761\u76EE\u4E0E\u601D\u8003\u5185\u5BB9\uFF09\u7684\u884C\u9AD8\uFF08\u500D\u6570\uFF09\u3002",
    userLineHeightName: "\u63D0\u95EE\u884C\u9AD8",
    userLineHeightDesc: "\u63D0\u95EE\u5185\u5BB9\u7684\u884C\u9AD8\uFF08\u500D\u6570\uFF09\u3002",
    contentWidthName: "\u5185\u5BB9\u5BBD\u5EA6",
    contentWidthDesc: "\u4F1A\u8BDD\u5185\u5BB9\u7684\u6700\u5927\u5BBD\u5EA6\uFF0C\u53EF\u8F93\u5165 px \u6216 %\uFF08\u5982 900px\u300185%\uFF09\uFF1B\u9ED8\u8BA4\u663E\u793A\u5F53\u524D\u5B9E\u9645\u5BBD\u5EA6\uFF0C% \u76F8\u5BF9\u4F1A\u8BDD\u533A\u57DF\u3002",
    defaultValue: "\u9ED8\u8BA4",
    resetDefault: "\u6062\u590D\u9ED8\u8BA4",
    featureProjectMenu: "\u9879\u76EE\u83DC\u5355\u589E\u5F3A",
    featureProjectMenuDesc: "\u9879\u76EE\u201C\u66F4\u591A\u201D\u83DC\u5355\u4E2D\u7684\u81EA\u5B9A\u4E49\u522B\u540D\u3001\u5207\u6362\u6587\u4EF6\u5939\u3001\u6253\u5F00\u6587\u4EF6\u5939\u4E0E\u590D\u5236\u8DEF\u5F84\uFF08\u522B\u540D\u540C\u65F6\u4F5C\u7528\u4E8E\u4FA7\u8FB9\u680F\u663E\u793A\uFF09\u3002",
    featureTaskOrder: "\u4FA7\u8FB9\u680F\u4F1A\u8BDD\u62D6\u52A8\u6392\u5E8F",
    featureTaskOrderDesc: "\u8BA9\u7F6E\u9876\u3001\u9879\u76EE\u4E0E\u5206\u7EC4\u4E2D\u7684\u4F1A\u8BDD\u62D6\u52A8\u540E\u8BB0\u4F4F\u987A\u5E8F\uFF0C\u5237\u65B0\u540E\u4FDD\u6301\u3002",
    featureSessionSwitch: "\u4F1A\u8BDD\u5FEB\u6377\u5207\u6362",
    featureSessionSwitchDesc: "alt+z \u5728\u5F53\u524D\u4E0E\u4E0A\u6B21\u4F1A\u8BDD\u95F4\u6765\u56DE\u5207\u6362\uFF1B\u6309\u4F4F alt \u518D\u6309 x/c \u5F39\u51FA\u6700\u8FD1\u4F1A\u8BDD\u5217\u8868\u524D\u540E\u9009\u62E9\uFF0C\u677E\u5F00 alt \u5207\u6362\uFF08\u7C7B alt+tab\uFF09\u3002",
    featureTitleLock: "\u91CD\u547D\u540D\u4F1A\u8BDD\u540D\u9501\u5B9A",
    featureTitleLockDesc: "\u624B\u52A8\u91CD\u547D\u540D\u8FC7\u7684\u4F1A\u8BDD\u4E0D\u518D\u88AB\u81EA\u52A8\u6807\u9898\u8986\u76D6\uFF1A\u4F1A\u8BDD\u6709\u65B0\u56DE\u7B54\u540E\u754C\u9762\u53EF\u80FD\u6539\u663E\u81EA\u52A8\u6807\u9898\uFF0C\u91CD\u542F\u540E\u53C8\u53D8\u56DE\uFF0C\u672C\u529F\u80FD\u8BA9\u4FA7\u680F\u59CB\u7EC8\u663E\u793A\u91CD\u547D\u540D\u540E\u7684\u540D\u5B57\u3002",
    tabTitleGen: "\u4EFB\u52A1\u540D\u63D0\u793A\u8BCD",
    titleGenShortDesc: "\u65B0\u4F1A\u8BDD\u5F00\u59CB\u4F5C\u7B54\u65F6\uFF0C\u6309\u6240\u9009\u4F9B\u5E94\u5546\u4E0E\u63D0\u793A\u8BCD\u751F\u6210\u4EFB\u52A1\u540D\u5E76\u6309\u624B\u52A8\u91CD\u547D\u540D\u4FDD\u5B58\uFF0C\u5B98\u65B9\u81EA\u52A8\u6807\u9898\u4E0D\u518D\u8986\u76D6\u3002",
    titleGenEnabled: "\u542F\u7528",
    titleGenProvider: "\u4F9B\u5E94\u5546",
    titleGenProviderNone: "\u4E0D\u8DDF\u968F\uFF08\u81EA\u586B\u5730\u5740\uFF09",
    titleGenProviderSession: "\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD",
    titleGenProviderDeleted: "\uFF08\u5DF2\u5220\u9664\uFF09",
    titleGenModel: "\u6A21\u578B",
    titleGenModelHint: "\u4ECE\u5217\u8868\u9009\u62E9\uFF0C\u6216\u76F4\u63A5\u586B\u5199\u6A21\u578B id",
    titleGenModelEmpty: "\uFF08\u672A\u9009\u62E9\uFF09",
    titleGenModelSessionHint: "\u4ECE\u5217\u8868\u9009\u62E9\u6A21\u578B\uFF1B\u5217\u8868\u7B2C\u4E00\u9879\u4E3A\u8DDF\u968F\u4F1A\u8BDD\u5F53\u524D\u6A21\u578B",
    titleGenModelFollowSession: "\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD\u5F53\u524D\u6A21\u578B",
    titleGenModelManualHint: "\u8F93\u5165\u6A21\u578B id",
    titleGenBaseUrl: "\u63A5\u53E3\u5730\u5740",
    titleGenApiKey: "API Key",
    titleGenFormat: "\u534F\u8BAE",
    titleGenPrompt: "\u63D0\u793A\u8BCD",
    titleGenPromptPlaceholder: "\u7559\u7A7A\u4F7F\u7528\u5185\u7F6E\u9ED8\u8BA4\u63D0\u793A\u8BCD\uFF08\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u53EF\u67E5\u770B\uFF09",
    titleGenPromptReset: "\u4F7F\u7528\u9ED8\u8BA4\u63D0\u793A\u8BCD",
    titleGenSample: "\u6D4B\u8BD5\u6D88\u606F",
    titleGenTest: "\u6D4B\u8BD5\u751F\u6210",
    titleGenTesting: "\u751F\u6210\u4E2D\u2026",
    titleGenTestOk: "\u751F\u6210\u7ED3\u679C\uFF1A",
    titleGenTestFailed: "\u751F\u6210\u5931\u8D25",
    featureWsRunning: "\u6298\u53E0\u9879\u76EE\u8FD0\u884C\u63D0\u793A\uFF08\u5B9E\u9A8C\u6027\uFF09",
    featureWsRunningDesc: "\u6298\u53E0\u7684\u9879\u76EE\u91CC\u4ECD\u6709\u4F1A\u8BDD\u5728\u8FD0\u884C\u65F6\uFF0C\u9879\u76EE\u56FE\u6807\u65CB\u8F6C\u63D0\u793A\uFF1B\u5168\u90E8\u7ED3\u675F\u6216\u5C55\u5F00\u9879\u76EE\u540E\u6062\u590D\u3002\u671F\u95F4\u6BCF 60 \u79D2\u5728\u540E\u53F0\u77ED\u6682\u5C55\u5F00\u8BE5\u9879\u76EE\u590D\u6838\u8FD0\u884C\u72B6\u6001\u518D\u6536\u8D77\uFF0C\u4F1A\u8BDD\u884C\u4E0D\u663E\u793A\uFF0C\u4EC5\u9879\u76EE\u4F4D\u7F6E\u53EF\u80FD\u6709\u7EA6\u56DB\u5206\u4E4B\u4E00\u79D2\u7684\u8F7B\u5FAE\u9AD8\u5EA6\u8D77\u4F0F\u3002",
    tabPerformance: "\u6027\u80FD",
    perfDesc: "ZCode \u4E3A\u6BCF\u4E2A\u6253\u5F00\u8FC7\u7684\u9879\u76EE\u5E38\u9A7B\u4E00\u4E2A\u4F1A\u8BDD\u8FDB\u7A0B\uFF0C\u5E94\u7528\u81EA\u8EAB\u4E0D\u4F1A\u56DE\u6536\uFF0C\u9879\u76EE\u591A\u4E86\u5185\u5B58\u5360\u7528\u5C31\u9AD8\u3002\u5F00\u542F\u540E\uFF0C\u957F\u65F6\u95F4\u672A\u4F7F\u7528\u4E14\u6CA1\u6709\u4EFB\u52A1\u5728\u8DD1\u7684\u9879\u76EE\u4F1A\u88AB\u81EA\u52A8\u91CA\u653E\uFF1A\u4F1A\u8BDD\u8BB0\u5F55\u4E0D\u53D7\u5F71\u54CD\uFF0C\u518D\u6B21\u6253\u5F00\u65F6\u81EA\u52A8\u6062\u590D\uFF0C\u4EC5\u9996\u6B21\u56DE\u590D\u6709\u51E0\u79D2\u7B49\u5F85\u3002\u6B63\u5728\u4F7F\u7528\u7684\u9879\u76EE\u3001\u8FD0\u884C\u4E2D\u7684\u4F1A\u8BDD\u4E0E\u540E\u53F0\u547D\u4EE4\u3001\u5B9A\u65F6\u4EFB\u52A1\u90FD\u4E0D\u4F1A\u88AB\u56DE\u6536\u3002\u540E\u53F0\u547D\u4EE4\u68C0\u6D4B\u4F9D\u8D56\u7CFB\u7EDF\u8FDB\u7A0B\u4FE1\u606F\uFF08Linux / macOS / Windows \u5404\u8D70\u7CFB\u7EDF\u81EA\u5E26\u5DE5\u5177\uFF09\uFF0C\u68C0\u6D4B\u4E0D\u53EF\u7528\u65F6\u529F\u80FD\u81EA\u52A8\u505C\u7528\u3002",
    featureIdleReclaim: "\u7A7A\u95F2\u9879\u76EE\u5185\u5B58\u56DE\u6536",
    featureIdleReclaimDesc: "\u6EE1\u8DB3\u6761\u4EF6\u7684\u9879\u76EE\u81EA\u52A8\u91CA\u653E\u5185\u5B58\uFF0C\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD\uFF0C\u518D\u6B21\u6253\u5F00\u81EA\u52A8\u6062\u590D\u3002",
    idleReclaimMinutesLabel: "\u7A7A\u95F2\u591A\u4E45\u540E\u56DE\u6536\uFF08\u5206\u949F\uFF09",
    idleReclaimStartupLabel: "\u542F\u52A8\u540E\u591A\u4E45\u56DE\u6536\u4E00\u6B21\uFF08\u5206\u949F\uFF09",
    idleReclaimStartupHint: "\u5E94\u7528\u542F\u52A8\u4F1A\u4E3A\u6BCF\u4E2A\u6062\u590D\u7684\u9879\u76EE\u9884\u70ED\u8FDB\u7A0B\uFF0C\u5230\u70B9\u628A\u672A\u4F7F\u7528\u7684\u9879\u76EE\u4E00\u6B21\u6536\u6389\uFF1B0 = \u542F\u52A8\u540E\u7ACB\u5373\u56DE\u6536\uFF0C\u8BE5\u6B21\u4E0D\u53D7\u4E0A\u4E00\u9879\u7A7A\u95F2\u65F6\u957F\u9650\u5236",
    idleReclaimUnit: "\u5206\u949F",
    featureToolbarIcons: "\u4FA7\u680F\u83DC\u5355\u5E76\u5165\u9876\u680F",
    featureToolbarIconsDesc: "\u628A\u4FA7\u8FB9\u680F\u9876\u90E8\u7684\u201C\u65B0\u5EFA\u4EFB\u52A1 / \u641C\u7D22 / \u81EA\u52A8\u5316 / \u63D2\u4EF6\u5E02\u573A\u201D\u6536\u6210\u9876\u90E8\u5BFC\u822A\u680F\uFF08\u540E\u9000/\u524D\u8FDB\u65C1\uFF09\u7684\u56FE\u6807\u6309\u94AE\uFF1A\u60AC\u505C\u663E\u793A\u540D\u79F0\uFF0C\u5BF9\u5E94\u754C\u9762\u6253\u5F00\u65F6\u9AD8\u4EAE\uFF0C\u5FEB\u6377\u952E\u7167\u5E38\u53EF\u7528\uFF1B\u4FA7\u8FB9\u680F\u539F\u83DC\u5355\u9690\u85CF\u3002",
    tbNewTask: "\u65B0\u5EFA\u4EFB\u52A1",
    tbSearch: "\u641C\u7D22",
    tbAutomations: "\u81EA\u52A8\u5316",
    tbPluginStore: "\u63D2\u4EF6\u5E02\u573A",
    featurePinnedCollapse: "\u5DF2\u7F6E\u9876\u5206\u533A\u53EF\u6298\u53E0",
    featurePinnedCollapseDesc: "\u4FA7\u8FB9\u680F\u201C\u5DF2\u7F6E\u9876\u201D\u6807\u9898\u53EF\u70B9\u51FB\u6298\u53E0/\u5C55\u5F00\u5176\u4EFB\u52A1\u5217\u8868\uFF08\u4E0E\u201C\u9879\u76EE\u201D\u201C\u5206\u7EC4\u201D\u5206\u533A\u4E00\u81F4\uFF09\uFF0C\u72B6\u6001\u8BB0\u4F4F\u3002",
    pinnedToggleAria: "\u6298\u53E0/\u5C55\u5F00\u5DF2\u7F6E\u9876",
    sidebarProjectSpacingName: "\u9879\u76EE\u95F4\u8DDD",
    sidebarProjectSpacingDesc: "\u4FA7\u8FB9\u680F\u4E2D\u76F8\u90BB\u9879\u76EE\u884C\u4E4B\u95F4\u7684\u89C6\u89C9\u95F4\u8DDD\uFF08\u542B\u884C\u5185\u7559\u767D\uFF09\uFF1B\u8BBE\u7F6E\u540E\u5404\u5206\u533A\uFF08\u5DF2\u7F6E\u9876/\u9879\u76EE/\u4EFB\u52A1\uFF09\u4E4B\u95F4\u7684\u95F4\u8DDD\u4E5F\u7EDF\u4E00\u4E3A\u8BE5\u503C\u3002",
    sidebarTaskSpacingName: "\u4EFB\u52A1\u95F4\u8DDD",
    sidebarTaskSpacingDesc: "\u4FA7\u8FB9\u680F\u4E2D\u76F8\u90BB\u4EFB\u52A1\u884C\u4E4B\u95F4\u7684\u5782\u76F4\u95F4\u8DDD\uFF08\u542B\u884C\u5185\u4E0A\u4E0B\u7559\u767D\uFF09\u3002",
    uiFontName: "\u754C\u9762\u5B57\u4F53",
    uiFontDesc: "\u9664\u7EC8\u7AEF\u5916\u6240\u6709\u754C\u9762\u6587\u5B57\u7684\u5B57\u4F53\uFF08\u7EC8\u7AEF\u5B57\u4F53\u5728\u5B98\u65B9\u8BBE\u7F6E\u4E2D\u8C03\u6574\uFF09\u3002",
    userFontName: "\u63D0\u95EE\u5B57\u4F53",
    userFontDesc: "\u4F1A\u8BDD\u4E2D\u63D0\u95EE\u5185\u5BB9\u7684\u5B57\u4F53\uFF1B\u9009\u201C\u9ED8\u8BA4\u201D\u65F6\u8DDF\u968F\u754C\u9762\u5B57\u4F53\u3002",
    assistantFontName: "\u56DE\u7B54\u5B57\u4F53",
    assistantFontDesc: "\u4F1A\u8BDD\u4E2D\u56DE\u7B54\u6B63\u6587\u7684\u5B57\u4F53\uFF08\u4EE3\u7801\u5757\u4ECD\u7528\u7B49\u5BBD\u5B57\u4F53\uFF09\uFF1B\u9009\u201C\u9ED8\u8BA4\u201D\u65F6\u8DDF\u968F\u754C\u9762\u5B57\u4F53\u3002",
    switcherHint: "x / c \u9009\u62E9\uFF0C\u677E\u5F00 alt \u5207\u6362\uFF0CEsc \u53D6\u6D88",
    switcherCurrent: "\u5F53\u524D",
    switcherEmpty: "\u6682\u65E0\u4E0A\u6B21\u4F1A\u8BDD\uFF08\u5207\u6362\u8FC7\u4F1A\u8BDD\u540E\u53EF\u7528\uFF09",
    switcherFailed: "\u672A\u80FD\u5207\u6362\u5230\u8BE5\u4F1A\u8BDD\uFF08\u53EF\u80FD\u5DF2\u5220\u9664\uFF09",
    featureFileActions: "\u6587\u4EF6\u83DC\u5355\u589E\u5F3A",
    featureFileActionsDesc: "\u5728\u4F1A\u8BDD\u4E2D\u6587\u4EF6\u94FE\u63A5\u7684\u53F3\u952E\u83DC\u5355\u91CC\u65B0\u589E\u201C\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00\u201D\u4E0E\u201C\u6253\u5F00\u6240\u5728\u76EE\u5F55\u201D\u3002",
    featureImageCopy: "\u56FE\u7247\u53F3\u952E\u590D\u5236",
    featureImageCopyDesc: "\u53F3\u952E\u4F1A\u8BDD\u4E2D\u7684\u56FE\u7247\u6216\u70B9\u51FB\u653E\u5927\u7684\u9884\u89C8\u56FE\uFF0C\u53EF\u5C06\u56FE\u7247\u590D\u5236\u5230\u526A\u8D34\u677F\u3002",
    imageCopy: "\u590D\u5236\u56FE\u7247",
    imageCopied: "\u56FE\u7247\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F",
    imageCopyFailed: "\u590D\u5236\u56FE\u7247\u5931\u8D25",
    openFolderItem: "\u6253\u5F00\u6587\u4EF6\u5939",
    openFolderPrimary: "\u4E3B\u76EE\u5F55",
    copyPathItem: "\u590D\u5236\u8DEF\u5F84",
    pathCopied: "\u8DEF\u5F84\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F",
    pathCopyFailed: "\u590D\u5236\u8DEF\u5F84\u5931\u8D25",
    fileOpenDefault: "\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00",
    fileReveal: "\u6253\u5F00\u6240\u5728\u76EE\u5F55",
    featurePinnedExpand: "\u7F6E\u9876\u4F1A\u8BDD\u4FDD\u6301\u9879\u76EE\u6298\u53E0\uFF08\u5B9E\u9A8C\u6027\uFF09",
    featurePinnedExpandDesc: "\u70B9\u51FB\u6298\u53E0\u9879\u76EE\u7684\u7F6E\u9876\u4F1A\u8BDD\u540E\u5C06\u5176\u4FDD\u6301\u6298\u53E0\u3002\u53D7\u9650\u4E8E\u5E94\u7528\u673A\u5236\uFF0C\u9879\u76EE\u4F1A\u5148\u77ED\u6682\u5C55\u5F00\u518D\u7F29\u8D77\u3002",
    featureAutoUpdatePlugins: "\u81EA\u52A8\u66F4\u65B0 zcode-plugins \u63D2\u4EF6",
    featureAutoUpdatePluginsDesc: "\u542F\u52A8\u65F6\u81EA\u52A8\u68C0\u67E5\u5E76\u66F4\u65B0\u5DF2\u5B89\u88C5\u7684 zcode-plugins \u63D2\u4EF6\uFF08\u53EA\u5347\u7EA7\u4E0D\u5B89\u88C5\uFF0C\u5378\u8F7D\u4E0D\u4F1A\u88AB\u64A4\u9500\uFF09\uFF0C\u66F4\u65B0\u5728\u65B0\u4F1A\u8BDD\u751F\u6548\u3002",
    pluginsUpdateTitle: "\u63D2\u4EF6\u66F4\u65B0 \xB7 zcode-plugins",
    pluginsCheckNow: "\u68C0\u67E5\u5E76\u66F4\u65B0",
    pluginsUpdating: "\u6B63\u5728\u66F4\u65B0\u63D2\u4EF6\u2026",
    pluginsUpToDate: "\u63D2\u4EF6\u5DF2\u662F\u6700\u65B0",
    pluginsUpdatesFound: "{n} \u4E2A\u63D2\u4EF6\u53EF\u66F4\u65B0",
    pluginsUpdatedDone: "\u5DF2\u66F4\u65B0 {n} \u4E2A\u63D2\u4EF6",
    pluginsUpdateFailed: "\u63D2\u4EF6\u66F4\u65B0\u5931\u8D25",
    pluginsUpdatesAvailable: "zcode-plugins \u6709 {n} \u4E2A\u63D2\u4EF6\u53EF\u66F4\u65B0\uFF08ZCode Pro \u8BBE\u7F6E \u2192 \u529F\u80FD\uFF09",
    pluginsAutoUpdated: "zcode-plugins \u63D2\u4EF6\u5DF2\u66F4\u65B0",
    tabVision: "Vision",
    visionDesc: "\u4E3B\u6A21\u578B\u4E0D\u652F\u6301\u56FE\u7247\u8F93\u5165\u65F6\uFF08\u5982 glm-5.3\uFF09\uFF0C\u81EA\u52A8\u628A\u6D88\u606F\u91CC\u7684\u56FE\u7247\u4EA4\u7ED9\u4E0B\u9762\u7684\u89C6\u89C9\u6A21\u578B\u8BC6\u522B\uFF0C\u628A\u63CF\u8FF0\u5E26\u7ED9\u4E3B\u6A21\u578B\uFF08zcode-vision \u63D2\u4EF6\uFF1B/vision-* \u547D\u4EE4\u7F16\u8F91\u540C\u4E00\u914D\u7F6E\uFF09\u3002\u6539\u52A8\u81EA\u52A8\u4FDD\u5B58\u3002",
    visionEnabled: "\u542F\u7528",
    visionForceIntercept: "\u4E3B\u6A21\u578B\u80FD\u770B\u56FE\u4E5F\u62E6\u622A",
    visionMode: "\u94FE\u6A21\u5F0F",
    visionModeFallback: "\u4F9D\u6B21\u5C1D\u8BD5",
    visionModeFallbackDesc: "\u524D\u4E00\u4E2A\u5931\u8D25\u624D\u8BD5\u4E0B\u4E00\u4E2A\uFF0C\u4EFB\u4E00\u6210\u529F\u5373\u6B62\uFF08\u4E3B\u529B + \u5907\u7528\uFF09\u3002",
    visionModePipeline: "\u9010\u7EA7\u52A0\u5DE5",
    visionModePipelineDesc: "\u6BCF\u6B65\u90FD\u6267\u884C\uFF0C\u540E\u4E00\u6B65\u52A0\u5DE5\u524D\u4E00\u6B65\u7ED3\u679C\uFF08\u63CF\u8FF0 \u2192 \u6821\u5BF9/\u63D0\u70BC\uFF09\u3002",
    visionAddProxy: "\u6DFB\u52A0\u4EE3\u7406",
    visionRemove: "\u5220\u9664",
    visionMoveUp: "\u4E0A\u79FB",
    visionMoveDown: "\u4E0B\u79FB",
    visionName: "\u540D\u79F0",
    visionUseProvider: "\u4F9B\u5E94\u5546",
    visionSkipAfterFailures: "\u8FDE\u7EED\u5931\u8D25\u6B21\u6570",
    visionSkipAfterFailuresHint: "\u67D0\u4EE3\u7406\u8FDE\u7EED\u5931\u8D25\u6EE1\u6B21\u6570\u540E\u6682\u65F6\u8DF3\u8FC7\u5B83\uFF0C\u76F4\u63A5\u8BD5\u4E0B\u4E00\u4E2A\uFF1B0 = \u4E0D\u8DF3\u8FC7",
    visionSkipMinutes: "\u8DF3\u8FC7\u5206\u949F\u6570",
    visionSkipMinutesHint: "\u8DF3\u8FC7\u591A\u4E45\u540E\u81EA\u52A8\u6062\u590D\u5C1D\u8BD5\uFF1B\u671F\u95F4\u4EFB\u4E00\u6B21\u6210\u529F\u5373\u6E05\u96F6\u8BA1\u6570",
    visionResetChain: "\u6062\u590D\u9ED8\u8BA4\u94FE",
    visionResetChainConfirm: "\u5C06\u94FE\u6A21\u5F0F\u4E0E\u4EE3\u7406\u5217\u8868\u6062\u590D\u4E3A\u9ED8\u8BA4\u5355\u7EA7\uFF08session\uFF1A\u8DDF\u968F\u4F1A\u8BDD\u4E0E\u5176\u5F53\u524D\u6A21\u578B\uFF09\uFF0C\u5F53\u524D\u5BF9\u4EE3\u7406\u7684\u4FEE\u6539\u4F1A\u4E22\u5931\u3002\u7EE7\u7EED\uFF1F",
    visionBaseUrl: "\u63A5\u53E3\u5730\u5740",
    visionModel: "\u6A21\u578B",
    visionApiKey: "API Key",
    visionPrompt: "\u8BC6\u522B\u63D0\u793A\u8BCD\uFF08pipeline \u540E\u7EED\u6B65\u53EF\u7528 {prev} \u5F15\u7528\u4E0A\u4E00\u6B65\uFF09",
    visionTest: "\u6D4B\u8BD5",
    visionTesting: "\u6D4B\u8BD5\u4E2D\u2026",
    visionTestFailed: "\u89C6\u89C9\u4EE3\u7406\u6D4B\u8BD5\u5931\u8D25",
    visionCompressKB: "\u538B\u7F29\u9608\u503C KB",
    visionCompressKBHint: "\u8D85\u8FC7\u8BE5\u5927\u5C0F\u7684\u56FE\u5148\u538B\u7F29\u518D\u8BC6\u522B\uFF08\u6700\u957F\u8FB9 2000\u3001JPEG\uFF09\uFF1B0 = \u4E0D\u538B\u7F29",
    visionLoadFailed: "\u8BFB\u53D6\u89C6\u89C9\u4EE3\u7406\u914D\u7F6E\u5931\u8D25",
    tabRtk: "rtk",
    rtkDesc: "rtk \u63D2\u4EF6\uFF1A\u628A\u5E38\u89C1\u5F00\u53D1\u547D\u4EE4\u7684\u8F93\u51FA\u538B\u7F29 60-90% \u518D\u8FDB\u5165\u4E0A\u4E0B\u6587\uFF08/rtk-* \u547D\u4EE4\u7F16\u8F91\u540C\u4E00\u914D\u7F6E\uFF09\u3002\u6539\u52A8\u81EA\u52A8\u4FDD\u5B58\u5E76\u7ACB\u5373\u751F\u6548\u3002",
    rtkEnabled: "\u542F\u7528",
    rtkNotInstalled: "\u672A\u5B89\u88C5 rtk \u672C\u4F53\uFF1B\u5B89\u88C5\u540E\u4EE5\u4E0B\u8BBE\u7F6E\u751F\u6548\uFF08\u4F1A\u8BDD\u91CC\u6267\u884C /rtk-setup \u4E5F\u53EF\u4EE5\uFF09",
    rtkInstallBin: "\u5B89\u88C5 rtk \u672C\u4F53",
    rtkBinInstalled: "rtk \u672C\u4F53\u5DF2\u5B89\u88C5\uFF1BPATH \u9700\u6CE8\u9500\u91CD\u767B\u540E\u5BF9\u4F1A\u8BDD\u751F\u6548\uFF0C\u63D2\u4EF6\u94A9\u5B50\u5373\u65F6\u751F\u6548",
    rtkWhitelistTitle: "\u767D\u540D\u5355\uFF08\u4E0D\u538B\u7F29\u76F4\u63A5\u653E\u884C\uFF09",
    rtkBuiltinLabel: "\u5185\u7F6E\u653E\u884C\uFF08\u53EA\u8BFB\uFF0C\u968F\u63D2\u4EF6\u66F4\u65B0\uFF09\uFF1A",
    rtkWhitelistDesc: "\u6BCF\u6761 name\uFF08\u5982 docker\uFF09\u6216 git:name\uFF08\u5982 git:clone\uFF09\u3002\u8F93\u51FA\u6781\u5C0F\u6216\u7EAF\u526F\u4F5C\u7528\u7684\u547D\u4EE4\u65E0\u9700\u538B\u7F29\uFF0C\u52A0\u5165\u540E\u4E0D\u518D\u538B\u7F29\uFF1B\u5185\u7F6E\u7684 git add/commit/push\u3001mkdir/cp \u7B49\u4E0D\u53EF\u79FB\u9664\u3002\u5220\u9664\u672C\u6587\u4EF6\u5373\u6062\u590D\u9ED8\u8BA4\u3002",
    rtkWhitelistPlaceholder: "name \u6216 git:name\uFF0C\u56DE\u8F66\u6DFB\u52A0",
    rtkWhitelistAdd: "\u6DFB\u52A0",
    rtkWhitelistClear: "\u6E05\u7A7A",
    rtkWhitelistCleared: "\u767D\u540D\u5355\u5DF2\u6E05\u7A7A",
    rtkWhitelistInvalid: "\u6761\u76EE\u683C\u5F0F\u5E94\u4E3A name \u6216 git:name",
    rtkLoadFailed: "\u8BFB\u53D6 rtk \u914D\u7F6E\u5931\u8D25",
    tabHeadroom: "Headroom",
    headroomDesc: "Headroom \u63D2\u4EF6\uFF1A\u672C\u5730\u538B\u7F29\u4EE3\u7406\u9A7B\u7559 127.0.0.1\uFF08\u9ED8\u8BA4 8787 \u7AEF\u53E3\uFF09\uFF0C\u538B\u7F29\u53D1\u5F80\u6A21\u578B\u7684\u4E0A\u4E0B\u6587\u4EE5\u7701 token\uFF08/hr-* \u547D\u4EE4\u7F16\u8F91\u540C\u4E00\u914D\u7F6E\uFF09\u3002\u538B\u7F29\u8BBE\u5907\u4E0E\u7701\u7535\u5207\u6362\u4FDD\u5B58\u540E\u7ACB\u5373\u751F\u6548\uFF1B\u5207\u6362\u8BBE\u5907\u4F1A\u91CD\u542F\u4EE3\u7406\uFF0C\u6B63\u5728\u5904\u7406\u7684\u8BF7\u6C42\u53EF\u80FD\u4E2D\u65AD\u4E00\u6B21\u3002",
    headroomBinMissing: "\u672A\u627E\u5230 headroom \u7A0B\u5E8F\uFF0C\u4EE3\u7406\u65E0\u6CD5\u542F\u52A8\uFF1B\u5B89\u88C5 headroom \u540E\u4EE5\u4E0B\u8BBE\u7F6E\u81EA\u52A8\u751F\u6548",
    hrInstallBin: "\u5B89\u88C5 headroom \u672C\u4F53",
    hrBinInstalled: "headroom \u672C\u4F53\u5DF2\u5B89\u88C5\uFF1B\u91CD\u65B0\u6253\u5F00\u4F1A\u8BDD\u540E\u4EE3\u7406\u53EF\u7528\uFF08SessionStart \u94A9\u5B50\u81EA\u52A8\u62C9\u8D77\uFF09",
    headroomInstallTitle: "\u672A\u5B89\u88C5 headroom \u63D2\u4EF6",
    headroomInstallDesc: "\u4ECE zcode-plugins \u5E02\u573A\u5B89\u88C5\u540E\u5373\u53EF\u5728\u6B64\u7BA1\u7406\u538B\u7F29\u4EE3\u7406\uFF1B\u5EFA\u8BAE\u5B89\u88C5\u540E\u91CD\u542F\u4F1A\u8BDD\u751F\u6548\u3002",
    headroomInstall: "\u5B89\u88C5",
    headroomInstalling: "\u5B89\u88C5\u4E2D\u2026",
    headroomInstalled: "\u5DF2\u5B89\u88C5 headroom \u63D2\u4EF6",
    headroomInstallRetry: "\u5B89\u88C5\u672A\u751F\u6548\uFF0C\u8BF7\u91CD\u8BD5\u6216\u624B\u52A8\u5728\u63D2\u4EF6\u5E02\u573A\u5B89\u88C5",
    pluginInstallCardTitle: "\u672A\u5B89\u88C5 {name} \u63D2\u4EF6",
    pluginInstallCardDesc: "\u4ECE zcode-plugins \u5E02\u573A\u5B89\u88C5\u540E\u5373\u53EF\u5728\u6B64\u7BA1\u7406\uFF1B\u5EFA\u8BAE\u5B89\u88C5\u540E\u91CD\u542F\u4F1A\u8BDD\u751F\u6548\u3002",
    pluginInstallDone: "\u5DF2\u5B89\u88C5 {name} \u63D2\u4EF6",
    pluginEnable: "\u542F\u7528",
    hrStarting: "\u6B63\u5728\u542F\u52A8\u538B\u7F29\u4EE3\u7406\u2026",
    hrStarted: "\u538B\u7F29\u4EE3\u7406\u5DF2\u542F\u52A8",
    hrStartTimeout: "\u4EE3\u7406\u542F\u52A8\u8D85\u65F6\uFF0890 \u79D2\uFF09\uFF0C\u8BF7\u68C0\u67E5 ~/.zcode-headroom-proxy.log",
    hrStopping: "\u6B63\u5728\u505C\u6B62\u538B\u7F29\u4EE3\u7406\u2026",
    hrRestarting: "\u6B63\u5728\u91CD\u542F\u538B\u7F29\u4EE3\u7406\u2026",
    hrStopped: "\u538B\u7F29\u4EE3\u7406\u5DF2\u505C\u6B62",
    hrUsageNone: "\u5F53\u524D\u6CA1\u6709\u8D70 headroom \u7684\u4F9B\u5E94\u5546\uFF0C\u672A\u5207\u6362",
    headroomLoadFailed: "\u8BFB\u53D6 Headroom \u914D\u7F6E\u5931\u8D25",
    headroomStatusTitle: "\u8FD0\u884C\u72B6\u6001",
    hrInstRunning: "\u8FD0\u884C\u4E2D",
    hrInstStopped: "\u672A\u8FD0\u884C",
    headroomStatusLoadFailed: "\u8BFB\u53D6\u8FD0\u884C\u72B6\u6001\u5931\u8D25",
    headroomProxyUp: "\u4EE3\u7406\u8FD0\u884C\u4E2D",
    headroomProxyDown: "\u4EE3\u7406\u672A\u8FD0\u884C",
    headroomCurrentBackend: "\u5F53\u524D\u8BBE\u5907",
    headroomDesiredBackend: "\u76EE\u6807\u8BBE\u5907",
    hrValAuto: "\u81EA\u52A8",
    hrPmAc: "\u4EA4\u6D41\u7535",
    hrPmBattery: "\u7535\u6C60",
    hrPmSaver: "\u7701\u7535\u6A21\u5F0F",
    hrPmSaverBat: "\u7701\u7535\u6A21\u5F0F+\u7535\u6C60",
    hrDetectOk: "\u6B63\u5E38",
    hrDetectMissing: "\u672A\u5B89\u88C5",
    hrDetectBroken: "\u4E0D\u53EF\u7528",
    headroomPowerState: "\u7535\u6E90",
    headroomWatcher: "\u76D1\u89C6\u5668",
    headroomWatcherOn: "\u8FD0\u884C\u4E2D",
    headroomWatcherOff: "\u5DF2\u505C\u6B62",
    headroomSaverDetect: "\u7701\u7535\u6A21\u5F0F\u68C0\u6D4B",
    headroomRefresh: "\u5237\u65B0",
    headroomStart: "\u542F\u52A8",
    headroomRestart: "\u91CD\u542F",
    headroomStopAction: "\u505C\u6B62",
    headroomStopTitle: "\u505C\u6B62 Headroom \u4EE3\u7406",
    headroomStopDesc: "\u505C\u6B62\u540E\uFF0CZCode \u53CA\u5176\u4ED6\u7A0B\u5E8F\u4E2D\u6307\u5411\u8BE5\u4EE3\u7406\uFF08127.0.0.1\uFF09\u7684\u8BF7\u6C42\u90FD\u4F1A\u5931\u8D25\uFF0C\u76F4\u81F3\u91CD\u65B0\u542F\u52A8\u4EE3\u7406\u3002headroom \u662F\u5171\u4EAB\u7684\uFF0C\u5176\u4ED6\u5DE5\u5177\u53EF\u80FD\u6B63\u5728\u4F7F\u7528\u3002\u786E\u8BA4\u505C\u6B62\uFF1F",
    headroomStoppedWarn: "\u4EE3\u7406\u5DF2\u505C\u6B62\uFF1B\u6307\u5411 127.0.0.1 \u7684\u4F9B\u5E94\u5546\u5C06\u65E0\u6CD5\u8FDE\u63A5",
    headroomBackend: "\u538B\u7F29\u8BBE\u5907",
    headroomBackendAuto: "\u81EA\u52A8 \xB7 \u663E\u5361\u4F18\u5148",
    headroomBackendCpu: "CPU \xB7 \u7701\u7535",
    headroomBackendNative: "\uFF08\u539F\u751F\u503C\uFF09",
    headroomBackendDesc: "\u81EA\u52A8\uFF1Aheadroom \u9009\u6700\u5FEB\u8BBE\u5907\uFF08CUDA/MPS \u663E\u5361\u4F18\u5148\uFF09\uFF1BCPU\uFF1A\u5F3A\u5236 CPU \u538B\u7F29\uFF0C\u7701\u7535\u4E14\u4E0D\u5360\u663E\u5B58\u3002\u4E5F\u652F\u6301 headroom \u539F\u751F\u503C\uFF08onnx\u3001pytorch_mps \u7B49\uFF09\u3002\u5207\u6362\u4F1A\u91CD\u542F\u4EE3\u7406\u7ACB\u5373\u751F\u6548\u3002",
    headroomPower: "\u7701\u7535\u81EA\u52A8\u5207\u6362",
    headroomPowerOff: "\u5173\u95ED",
    headroomPowerOffDesc: "\u4E0D\u81EA\u52A8\u5207\u6362\uFF0C\u59CB\u7EC8\u6309\u201C\u538B\u7F29\u8BBE\u5907\u201D\u8FD0\u884C\u3002",
    headroomPowerBattery: "\u7528\u7535\u6C60\u65F6",
    headroomPowerBatteryDesc: "\u62D4\u7535\uFF08\u7535\u6C60\u653E\u7535\uFF09\u2192 CPU \u538B\u7F29\uFF0C\u63D2\u7535\u81EA\u52A8\u5207\u56DE\u3002",
    headroomPowerSaver: "\u7701\u7535\u6A21\u5F0F\u65F6",
    headroomPowerSaverDesc: "\u4EC5\u7CFB\u7EDF\u8FDB\u5165\u7701\u7535\u6A21\u5F0F \u2192 CPU \u538B\u7F29\uFF0C\u9000\u51FA\u5207\u56DE\u3002",
    hrCpuPinnedHint: "\u538B\u7F29\u8BBE\u5907\u5DF2\u56FA\u5B9A\u4E3A CPU\uFF0C\u7701\u7535\u81EA\u52A8\u5207\u6362\u4E0D\u4F1A\u518D\u6539\u53D8\u5B83\u3002",
    headroomInterval: "\u76D1\u89C6\u95F4\u9694",
    headroomIntervalDesc: "\u7701\u7535\u76D1\u89C6\u5668\u8F6E\u8BE2\u7535\u6E90\u72B6\u6001\u7684\u95F4\u9694\uFF0810\u20133600 \u79D2\uFF0C\u9ED8\u8BA4 60\uFF09\uFF1B\u4FDD\u5B58\u540E\u4ECE\u4E0B\u4E00\u8F6E\u5DE1\u68C0\u8D77\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F\u3002",
    headroomSecUnit: "\u79D2",
    upgradeCheck: "\u68C0\u67E5\u66F4\u65B0",
    upgradeChecking: "\u68C0\u67E5\u4E2D\u2026",
    upgradeUpToDate: "\u5DF2\u662F\u6700\u65B0\uFF08{v}\uFF09",
    upgradeFound: "\u53EF\u5347\u7EA7\u5230 {v}",
    upgradeNow: "\u5347\u7EA7",
    upgradeRunning: "\u5347\u7EA7\u4E2D\u2026",
    upgradeStop: "\u505C\u6B62\u5347\u7EA7",
    upgradeStopped: "\u5DF2\u505C\u6B62\u5347\u7EA7",
    upgradeDone: "\u5DF2\u66F4\u65B0\u5230 {v}",
    upgradeFinished: "\u5347\u7EA7\u5B8C\u6210",
    upgradeCheckFailed: "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25",
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
    featureProjectMenuDescNew: "\u9879\u76EE\u201C\u66F4\u591A\u201D\u83DC\u5355\u4E2D\u7684\u5207\u6362\u6587\u4EF6\u5939\u3001\u6253\u5F00\u6587\u4EF6\u5939\u4E0E\u590D\u5236\u8DEF\u5F84\u3002\u5B98\u65B9\u5DF2\u652F\u6301\u4FEE\u6539\u9879\u76EE\u540D\u79F0\uFF08\u7F16\u8F91\u9879\u76EE\uFF09\uFF0C\u81EA\u5B9A\u4E49\u522B\u540D\u5DF2\u505C\u7528\u3002",
    aliasMigrateTitle: "\u8FC1\u79FB\u9879\u76EE\u522B\u540D",
    aliasMigrateDesc: "\u5F53\u524D ZCode \u5DF2\u652F\u6301\u4FEE\u6539\u9879\u76EE\u540D\u79F0\uFF08\u9879\u76EE\u201C\u66F4\u591A\u201D\u83DC\u5355 \u2192 \u7F16\u8F91\u9879\u76EE\uFF09\uFF0C\u81EA\u5B9A\u4E49\u522B\u540D\u529F\u80FD\u5DF2\u505C\u7528\u3002\u53EF\u628A\u5DF2\u4FDD\u5B58\u7684\u522B\u540D\u5199\u5165\u5B98\u65B9\u9879\u76EE\u540D\u79F0\uFF0C\u52FE\u9009\u8981\u8FC1\u79FB\u7684\u9879\u76EE\uFF1B\u8FC1\u79FB\u53EA\u6539\u9879\u76EE\u540D\u79F0\uFF0C\u78C1\u76D8\u76EE\u5F55\u4E0D\u53D7\u5F71\u54CD\u3002",
    aliasMigrateItemHint: "\u8FC1\u79FB\u540E\u5C06\u4F5C\u4E3A\u9879\u76EE\u540D\u79F0\u4FDD\u5B58\uFF08\u53EF\u968F\u65F6\u5728\u201C\u7F16\u8F91\u9879\u76EE\u201D\u4E2D\u518D\u6539\uFF09\u3002\u4EC5\u65E0\u6807\u8BB0\u7684\u6761\u76EE\u53EF\u52FE\u9009\uFF1B\u5DF2\u8FC1\u79FB\u3001\u5DF2\u5E76\u5165\u3001\u9879\u76EE\u5DF2\u5220\u9664\u3001\u672C\u673A\u4E0D\u5B58\u5728\uFF08\u65E7\u673A\u5668\u8DEF\u5F84\uFF09\u4EE5\u53CA\u9879\u76EE\u5DF2\u91CD\u547D\u540D\u7684\u90FD\u4E0D\u53EF\u52FE\u9009\u2014\u2014\u8981\u6539\u8FD9\u4E9B\u9879\u76EE\u7684\u540D\u5B57\uFF0C\u76F4\u63A5\u7528\u9879\u76EE\u201C\u66F4\u591A\u201D\u83DC\u5355\u91CC\u7684\u201C\u7F16\u8F91\u9879\u76EE\u201D\u3002",
    aliasMigrateStateDone: "\u5DF2\u8FC1\u79FB",
    aliasMigrateStateMerged: "\u5DF2\u5E76\u5165\u300C{name}\u300D",
    aliasMigrateStateDeleted: "\u9879\u76EE\u5DF2\u5220\u9664",
    aliasMigrateStateMissing: "\u672C\u673A\u4E0D\u5B58\u5728",
    aliasMigrateStateRenamed: "\u9879\u76EE\u5DF2\u91CD\u547D\u540D",
    aliasMigrateDeadSummary: "\u5DF2\u5931\u6548 {n} \u6761\uFF08\u672C\u673A\u4E0D\u5B58\u5728 / \u9879\u76EE\u5DF2\u5220\u9664\uFF0C\u591A\u4E3A\u8BBE\u7F6E\u540C\u6B65\u5E26\u6765\u7684\u65E7\u673A\u5668\u8DEF\u5F84\uFF09",
    aliasMigrateClearDead: "\u6E05\u9664\u5931\u6548\u6761\u76EE",
    aliasMigrateDeadCleared: "\u5DF2\u6E05\u9664 {n} \u6761\u5931\u6548\u522B\u540D",
    aliasMigrateDeadClearFailed: "\u90E8\u5206\u5931\u6548\u522B\u540D\u672A\u80FD\u6E05\u9664\uFF0C\u8BF7\u91CD\u8BD5",
    aliasMigrateGo: "\u8FC1\u79FB\u6240\u9009",
    aliasMigrateRunning: "\u8FC1\u79FB\u4E2D\u2026",
    aliasMigrateProgress: "\u6B63\u5728\u8FC1\u79FB {i}/{n}\uFF1A{name}",
    aliasMigrateStateFailed: "\u5931\u8D25",
    aliasMigrateSkip: "\u6682\u4E0D\u8FC1\u79FB",
    aliasMigrateDone: "\u5DF2\u8FC1\u79FB {n} \u4E2A\u522B\u540D",
    aliasMigratePartial: "{n} \u4E2A\u5DF2\u8FC1\u79FB\uFF0C{m} \u4E2A\u672A\u6210\u529F\uFF1B\u672A\u6210\u529F\u7684\u53EF\u7A0D\u540E\u5728 ZCode Pro \u8BBE\u7F6E\u4E2D\u91CD\u8BD5",
    aliasMigrateAllFailed: "\u522B\u540D\u8FC1\u79FB\u672A\u6210\u529F\uFF0C\u53EF\u7A0D\u540E\u5728 ZCode Pro \u8BBE\u7F6E\u4E2D\u91CD\u8BD5",
    aliasMigrateCardName: "\u522B\u540D\u8FC1\u79FB",
    aliasMigrateCardDesc: "\u5B98\u65B9\u5DF2\u652F\u6301\u4FEE\u6539\u9879\u76EE\u540D\u79F0\uFF0C\u8FD8\u6709 {n} \u4E2A\u81EA\u5B9A\u4E49\u522B\u540D\u672A\u8FC1\u79FB\u3002",
    aliasMigrateRun: "\u8FC1\u79FB",
    taskOrderSaved: "\u987A\u5E8F\u5DF2\u66F4\u65B0",
    qqGroupTitle: "QQ \u7FA4\uFF1A428403354",
    qqGroupDesc: "\u95EE\u9898\u53CD\u9988\u4E0E\u4EA4\u6D41",
    wechatGroupTitle: "\u5FAE\u4FE1\u7FA4",
    wechatGroupDesc: "\u6DFB\u52A0\u5FAE\u4FE1 {id} \u9080\u8BF7\u8FDB\u7FA4",
    wechatIdCopied: "\u5FAE\u4FE1\u53F7\u5DF2\u590D\u5236",
    browse: "\u6D4F\u89C8",
    relocateItem: "\u5207\u6362\u6587\u4EF6\u5939",
    relocateTitle: "\u5207\u6362\u6587\u4EF6\u5939",
    relocateDesc: "\u5C06\u8BE5\u9879\u76EE\u6307\u5411\u53E6\u4E00\u4E2A\u6587\u4EF6\u5939\uFF1A\u4FA7\u8FB9\u680F\u3001\u5DF2\u6253\u5F00\u6807\u7B7E\u9875\u4E0E\u672C\u5730\u4EFB\u52A1\u5386\u53F2\u4E00\u5E76\u8FC1\u79FB\uFF0C\u76EE\u5F55\u672C\u8EAB\u4E0D\u4F1A\u88AB\u79FB\u52A8\uFF0C\u4F1A\u8BDD\u8BB0\u5F55\u4E0D\u4F1A\u4E22\u5931\u3002",
    relocateNewPathLabel: "\u65B0\u6587\u4EF6\u5939",
    relocateConfirm: "\u79FB\u52A8",
    relocateHint: "\u76EE\u6807\u6587\u4EF6\u5939\u9700\u5DF2\u5B58\u5728\uFF0C\u53EF\u8F93\u5165\u8DEF\u5F84\u6216\u70B9\u51FB\u201C\u6D4F\u89C8\u201D\u9009\u62E9\uFF1B\u5B8C\u6210\u540E\u754C\u9762\u5C06\u81EA\u52A8\u5237\u65B0\u3002",
    relocateSuccess: "\u5DF2\u5207\u6362\u6587\u4EF6\u5939\uFF0C\u6B63\u5728\u5237\u65B0\u754C\u9762\u2026",
    relocateIndexSkipped: "\u5DF2\u5207\u6362\u6587\u4EF6\u5939\uFF1B\u4EFB\u52A1\u5386\u53F2\u672A\u80FD\u540C\u6B65\uFF08\u672C\u673A\u7F3A\u5C11 SQLite \u652F\u6301\uFF09\uFF0C\u65E7\u4EFB\u52A1\u6761\u76EE\u53EF\u80FD\u4ECD\u6307\u5411\u65E7\u8DEF\u5F84\u3002",
    relocateSame: "\u65B0\u6587\u4EF6\u5939\u4E0E\u5F53\u524D\u6587\u4EF6\u5939\u76F8\u540C",
    relocateNotFound: "\u76EE\u6807\u6587\u4EF6\u5939\u4E0D\u5B58\u5728",
    relocateProtected: "\u62D2\u7EDD\u6307\u5411 ZCode \u6570\u636E\u76EE\u5F55\u5185\u90E8\u8DEF\u5F84",
    relocateIndexBusy: "\u4EFB\u52A1\u7D22\u5F15\u6B63\u88AB ZCode \u5360\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
    relocateConfirmTitle: "\u786E\u8BA4\u5207\u6362\u6587\u4EF6\u5939",
    relocateConfirmDesc: "\u5207\u6362\u540E\u5C06\u81EA\u52A8\u5237\u65B0\u9875\u9762\uFF0C\u804A\u5929\u8F93\u5165\u6846\u4E2D\u672A\u53D1\u9001\u7684\u5185\u5BB9\u4F1A\u4E22\u5931\uFF1B\u4F1A\u8BDD\u8BB0\u5F55\u4E0E\u9879\u76EE\u6587\u4EF6\u4E0D\u53D7\u5F71\u54CD\u3002",
    relocateConfirmGo: "\u786E\u8BA4\u5207\u6362",
    failed: "\u64CD\u4F5C\u5931\u8D25",
    retryHint: "\u8BF7\u91CD\u8BD5"
  };
  var en = {
    settingsTitle: "ZCode Pro",
    tabFeatures: "Features",
    tabStyles: "Styles",
    tabProxy: "Proxy",
    tabBehavior: "Behavior",
    tabAgents: "Global Prompt",
    agentsDesc: "Written to ~/.zcode/AGENTS.md and used as default instructions in every session across all projects. Takes effect for new sessions; per-project AGENTS.md can extend or override it. Content over 100 KB is truncated by the app.",
    agentsPlaceholder: "Instructions followed by all projects by default; save empty to remove the global prompt",
    agentsSave: "Save",
    agentsSaved: "Global prompt saved.",
    agentsLoadFailed: "Failed to load the global prompt",
    proxyDesc: "Set an HTTP proxy for network access made by the local helper: plugin marketplace updates and installs, plugin dependency installs and upgrades, and WebDAV sync can all use it \u2014 pick the scopes with the toggles below. Does not affect the ZCode app itself or model requests. Applies immediately.",
    proxyPlaceholder: "http://127.0.0.1:7890",
    proxySave: "Save",
    proxySaved: "Proxy settings saved.",
    proxyHint: "Save empty to clear the proxy.",
    proxyTest: "Test",
    proxyTesting: "Testing\u2026",
    proxyTestEmpty: "Enter a proxy address first",
    proxyTestFailed: "Test failed",
    proxyScopePlugins: "Plugin marketplace",
    proxyScopePluginsDesc: "Marketplace checks, installs and uninstalls (zcode CLI git operations) go through the proxy.",
    proxyScopeDeps: "Plugin dependencies",
    proxyScopeDepsDesc: "headroom and rtk installs, update checks and upgrades (pip and GitHub downloads) go through the proxy.",
    proxyScopeSync: "Sync",
    proxyScopeSyncDesc: "WebDAV upload and download go through the proxy. Off by default: domestic WebDAV providers work fine direct, and a stopped proxy breaks sync.",
    tabSync: "Sync",
    tabDebug: "Debug",
    testNoSessionHint: "With \u201Cfollow current session [current model]\u201D selected, the provider [model] of the last session is used.",
    syncDesc: 'Manually back up ZCode Pro settings and model settings to WebDAV, or restore them on a new computer. The two items are stored as separate files, so you can upload or overwrite either one alone; every upload also keeps a timestamped history version (how many to keep is set in the "History" row; older ones are removed automatically after upload) and download lets you pick any of them. Data moves only when you click, never automatically.',
    syncUrlPlaceholder: "https://dav.example.com/dav/",
    syncDir: "Folder",
    syncDirPlaceholder: "zcode-pro",
    syncLogin: "Login",
    syncPassword: "Password",
    syncHistoryLimit: "History",
    syncHistoryLimitUnit: "versions",
    syncHistoryLimitHint: "How many recent uploads keep their history versions on the server; older ones are removed automatically after a successful upload. The fixed-name latest file is never removed. 0 = keep no history versions.",
    syncPruned: "removed {n} older history versions",
    syncSave: "Save",
    syncSaved: "Sync settings saved.",
    syncFormHint: "Sync files go inside the folder (default zcode-pro, multi-level allowed, created automatically): zcodepro.json and model.json are always the latest version; timestamped history versions are kept alongside.",
    syncRecLink: "Jianguoyun WebDAV",
    syncRecSuffix: " \u2014 use the app password, not your account password.",
    syncIncludeZcp: "ZCode Pro settings",
    syncIncludeZcpDesc: "Feature toggles, style adjustments and the proxy setting; the sync config and credentials themselves are never synced. Project aliases are not synced (renaming is built in now).",
    syncIncludeModel: "Model settings",
    syncIncludeModelDesc: "Custom providers and model config (config.json and provider_config.json, API keys included). Account sign-in credentials (e.g. the BigModel subscription) are not synced; each computer signs in with its own account.",
    syncUpload: "Upload",
    syncDownload: "Download",
    syncUploading: "Uploading\u2026",
    syncUploaded: "Uploaded to the server.",
    syncDownloaded: "Restored from the server.",
    syncLastPush: "Last upload",
    syncLastPull: "Last download",
    syncNever: "never",
    syncConfirmTitle: "Download from the server",
    syncConfirmDesc: "The selected file will overwrite the matching local section (a .zcodepro-backup copy is kept next to each file); your local sync config and credentials stay untouched. Restarting ZCode is recommended after restoring model settings. Import now?",
    syncConfirmGo: "Import",
    syncPickDesc: "Fixed names are always the latest version; timestamped files are the history each upload leaves behind. Import overwrites the matching local section.",
    syncVerDeleteLatestNote: 'Note: this is the "latest" file that older zcode-pro installs download from; deleting it breaks their download. Timestamped history versions are not affected.',
    syncHint: "Sync credentials are stored locally in zcodepro.json only; model settings contain the API keys of custom providers and go to your own WebDAV only.",
    syncTest: "Test",
    syncTesting: "Testing\u2026",
    syncTestEmpty: "Enter the WebDAV URL first",
    syncTestFailed: "Test failed",
    syncTestStepConnect: "Connect",
    syncTestStepDir: "Folder",
    syncTestStepList: "Files",
    syncTestFilesFound: "{n} backup file(s) on the server",
    syncPickTitle: "Select a file",
    syncPickLoading: "Loading files from the server\u2026",
    syncPickEmpty: "No backups on the server yet. Upload from a computer first.",
    syncVerImport: "Import",
    syncVerImporting: "Importing\u2026",
    syncVerDelete: "Delete",
    syncVerSave: "Save to disk",
    syncVerSaving: "Saving\u2026",
    syncVerLatest: "Latest",
    syncVerDeleteTitle: "Delete server file",
    syncVerDeleteDesc: "This backup will be deleted from the server and cannot be recovered: ",
    syncVerDeleted: "Backup deleted from the server.",
    syncVerSaved: "Saved to",
    devMode: "Developer mode",
    devModeRowDesc: 'Shows the "Reload ZCode Pro" button; can also be enabled with the ZCODEPRO_DEV=1 environment variable. This tab is visible only while developer mode is active.',
    devModeDesc: 'For development: after changing zcode-pro code, click "Reload ZCode Pro" instead of restarting ZCode. It builds automatically (when running from the source repo), restarts the ZCode Pro launcher process (fresh helper and injected script), and every ZCode window refreshes and re-injects. The ZCode app itself and all sessions stay untouched.',
    devReload: "Reload ZCode Pro",
    devReloading: "Reloading\u2026",
    devReloadDesc: "Every ZCode window refreshes automatically within 2-3 seconds to load the new script.",
    rowGapName: "Paragraph spacing",
    rowGapDesc: "Vertical spacing between text blocks (turns, paragraphs inside answers).",
    listSpacingName: "List spacing",
    listSpacingDesc: "Space above and below lists.",
    listItemSpacingName: "List item spacing",
    listItemSpacingDesc: "Spacing between adjacent list items.",
    quoteCodeSpacingName: "Quote block spacing",
    quoteCodeSpacingDesc: "Space above and below quotes and code blocks.",
    codeLineHeightName: "Code line height",
    codeLineHeightDesc: "Line height of lines inside code blocks (multiplier).",
    tableSpacingName: "Table spacing",
    tableSpacingDesc: "Space above and below tables.",
    tableCellPaddingName: "Cell padding (V/H)",
    tableCellPaddingDesc: "Padding inside table cells; left input is vertical, right is horizontal.",
    lineHeightName: "Answer line height",
    lineHeightDesc: "Line height of answer text (multiplier).",
    thinkingLineHeightName: "Work-log line height",
    thinkingLineHeightDesc: "Line height of the \u201Cworked for\u2026\u201D history panel (tool entries and reasoning, multiplier).",
    userLineHeightName: "Question line height",
    userLineHeightDesc: "Line height of question text (multiplier).",
    contentWidthName: "Content width",
    contentWidthDesc: "Max width of conversation content; accepts px or % (e.g. 900px, 85%).",
    defaultValue: "default",
    resetDefault: "Reset to default",
    featureProjectMenu: "Project menu actions",
    featureProjectMenuDesc: 'Custom alias, switch folder, open folder and copy path in the project "More" menu (the alias also applies to the sidebar).',
    featureTaskOrder: "Sidebar session drag ordering",
    featureTaskOrderDesc: "Makes session drags in Pinned, Projects and Groups persist across refreshes.",
    featureSessionSwitch: "Session quick switch",
    featureSessionSwitchDesc: "alt+z toggles between the current and the last session; hold alt and press x/c to move the highlight across recently used sessions, release alt to switch (like alt+tab).",
    featureTitleLock: "Keep renamed session titles",
    featureTitleLockDesc: "Sessions you renamed keep their custom title: after new replies the app may show an auto-generated title instead, which reverts after a restart; this keeps the renamed title in the sidebar.",
    tabTitleGen: "Task name prompt",
    titleGenShortDesc: "When a new session starts answering, generates the task name with the chosen provider and prompt and saves it as a manual rename the built-in title never overrides.",
    titleGenEnabled: "Enable",
    titleGenProvider: "Provider",
    titleGenProviderNone: "Custom endpoint (no provider)",
    titleGenProviderSession: "Follow current session",
    titleGenProviderDeleted: " (deleted)",
    titleGenModel: "Model",
    titleGenModelHint: "Pick from the list, or type a model id",
    titleGenModelEmpty: "(not set)",
    titleGenModelSessionHint: "Pick from the list; the first entry follows the session model",
    titleGenModelFollowSession: "Follow the session model",
    titleGenModelManualHint: "Type a model id",
    titleGenBaseUrl: "Base URL",
    titleGenApiKey: "API Key",
    titleGenFormat: "Protocol",
    titleGenPrompt: "Prompt",
    titleGenPromptPlaceholder: "Leave empty for the built-in default prompt (button below shows it)",
    titleGenPromptReset: "Use default prompt",
    titleGenSample: "Test message",
    titleGenTest: "Test",
    titleGenTesting: "Generating\u2026",
    titleGenTestOk: "Result: ",
    titleGenTestFailed: "Generation failed",
    featureWsRunning: "Running indicator on collapsed projects (experimental)",
    featureWsRunningDesc: "Spins a collapsed project's icon while any of its sessions is still running; stops when they all finish or the project is expanded. While spinning, the project is briefly re-expanded in the background every 60 s to re-check and then collapsed \u2014 rows stay hidden, with only a subtle quarter-second height ripple at the project.",
    tabPerformance: "Performance",
    perfDesc: "ZCode keeps a session process resident for every project you have opened and never reclaims it, so memory grows with projects. When enabled, projects unused for a while with nothing running release their memory automatically: sessions are untouched and reload when reopened, with a few seconds wait on the first reply. The project in use, running sessions, background commands and scheduled tasks are never reclaimed. Background-command detection reads system process info via built-in tools (Linux / macOS / Windows); when unavailable, the feature disables itself.",
    featureIdleReclaim: "Idle project memory reclaim",
    featureIdleReclaimDesc: "Qualifying projects release their memory; sessions are untouched and reload when reopened.",
    idleReclaimMinutesLabel: "Idle minutes before reclaim",
    idleReclaimStartupLabel: "Minutes after startup for a one-shot reclaim",
    idleReclaimStartupHint: "Startup pre-spawns a process per restored project; this pass collects the unused ones once. 0 = reclaim right after startup, ignoring the idle minutes above",
    idleReclaimUnit: "min",
    featureToolbarIcons: "Sidebar menu in the top bar",
    featureToolbarIconsDesc: "Turns the sidebar menu (New task / Search / Automations / Plugin store) into icon buttons next to the back/forward arrows in the top bar: hover shows the name, the button stays highlighted while its view is open, and shortcuts still work; the original sidebar menu is hidden.",
    tbNewTask: "New task",
    tbSearch: "Search",
    tbAutomations: "Automations",
    tbPluginStore: "Plugin store",
    featurePinnedCollapse: "Collapsible Pinned section",
    featurePinnedCollapseDesc: 'The sidebar "Pinned" header collapses/expands its task list (like Projects and Groups); the state is remembered.',
    pinnedToggleAria: "Collapse/expand Pinned",
    sidebarProjectSpacingName: "Project spacing",
    sidebarProjectSpacingDesc: "Visual spacing between adjacent project rows in the sidebar (row padding included); when set, section gaps (Pinned/Projects/Tasks) follow the same value.",
    sidebarTaskSpacingName: "Task spacing",
    sidebarTaskSpacingDesc: "Vertical spacing between adjacent task rows in the sidebar (row padding included).",
    uiFontName: "UI font",
    uiFontDesc: "Font for all interface text except the terminal (its font is set in the official settings).",
    userFontName: "Question font",
    userFontDesc: 'Font of question text in conversations; "default" follows the UI font.',
    assistantFontName: "Answer font",
    assistantFontDesc: 'Font of answer text in conversations (code blocks stay monospaced); "default" follows the UI font.',
    switcherHint: "x / c to choose, release alt to switch, Esc to cancel",
    switcherCurrent: "current",
    switcherEmpty: "No previous session yet (available after you switch sessions)",
    switcherFailed: "Failed to switch to that session (it may have been deleted)",
    featureFileActions: "File menu actions",
    featureFileActionsDesc: 'Adds "Open with default app" and "Reveal in file manager" to the right-click menu of file links in chat.',
    featureImageCopy: "Image right-click copy",
    featureImageCopyDesc: "Right-click an image in chat or the enlarged preview to copy it to the clipboard.",
    imageCopy: "Copy image",
    imageCopied: "Image copied to the clipboard.",
    imageCopyFailed: "Failed to copy the image.",
    openFolderItem: "Open folder",
    openFolderPrimary: "primary",
    copyPathItem: "Copy path",
    pathCopied: "Path copied to the clipboard.",
    pathCopyFailed: "Failed to copy the path.",
    fileOpenDefault: "Open with default app",
    fileReveal: "Reveal in file manager",
    featurePinnedExpand: "Keep projects collapsed for pinned sessions (experimental)",
    featurePinnedExpandDesc: "Keeps the project collapsed after clicking a pinned session. Note: it briefly expands first, then collapses.",
    featureAutoUpdatePlugins: "Auto-update zcode-plugins plugins",
    featureAutoUpdatePluginsDesc: "Checks and updates installed zcode-plugins plugins on startup (updates only \u2014 never installs; uninstalled plugins stay uninstalled). Updates apply to new sessions.",
    pluginsUpdateTitle: "Plugin updates \xB7 zcode-plugins",
    pluginsCheckNow: "Check & update",
    pluginsUpdating: "Updating plugins\u2026",
    pluginsUpToDate: "Plugins are up to date",
    pluginsUpdatesFound: "{n} plugin(s) can be updated",
    pluginsUpdatedDone: "Updated {n} plugin(s)",
    pluginsUpdateFailed: "Plugin update failed",
    pluginsUpdatesAvailable: "{n} zcode-plugins update(s) available (ZCode Pro settings \u2192 Features)",
    pluginsAutoUpdated: "zcode-plugins updated",
    tabVision: "Vision",
    visionDesc: "When the main model cannot see images (e.g. glm-5.3), images in messages are recognized by the vision models below and passed to the main model as text (zcode-vision plugin; /vision-* commands edit the same file). Changes save automatically.",
    visionEnabled: "Enable",
    visionForceIntercept: "Intercept even if the main model sees images",
    visionMode: "Chain mode",
    visionModeFallback: "Fallback",
    visionModeFallbackDesc: "Try in order until one succeeds (primary + backup).",
    visionModePipeline: "Pipeline",
    visionModePipelineDesc: "Every step runs; later steps refine earlier results (describe \u2192 refine).",
    visionAddProxy: "Add proxy",
    visionRemove: "Remove",
    visionMoveUp: "Up",
    visionMoveDown: "Down",
    visionName: "Name",
    visionUseProvider: "Provider",
    visionSkipAfterFailures: "Skip after failures",
    visionSkipAfterFailuresHint: "After this many consecutive failures a proxy is skipped and the next one is tried; 0 = never skip",
    visionSkipMinutes: "Skip minutes",
    visionSkipMinutesHint: "How long a skipped proxy rests before being retried; any success resets the counter",
    visionResetChain: "Reset default chain",
    visionResetChainConfirm: "Reset chain mode and the proxy list to the default single-level chain (session: follow session and its current model)? Current proxy edits will be lost. Continue?",
    visionBaseUrl: "API URL",
    visionModel: "Model",
    visionApiKey: "API Key",
    visionPrompt: "Recognition prompt ({prev} = previous step in pipeline)",
    visionTest: "Test",
    visionTesting: "Testing\u2026",
    visionTestFailed: "Vision proxy test failed",
    visionCompressKB: "Compress threshold KB",
    visionCompressKBHint: "Images above this size are compressed first (max edge 2000, JPEG); 0 = never",
    visionLoadFailed: "Failed to load the vision config",
    tabRtk: "rtk",
    rtkDesc: "rtk plugin: compresses common dev command output by 60-90% before it reaches the context (/rtk-* commands edit the same files). Changes save automatically and apply immediately.",
    rtkEnabled: "Enable",
    rtkNotInstalled: "rtk is not installed. The settings below take effect after installation (/rtk-setup in a session).",
    rtkInstallBin: "Install rtk binary",
    rtkBinInstalled: "rtk installed; PATH takes effect for sessions after signing out and back in \u2014 the plugin hook works immediately",
    rtkWhitelistTitle: "Whitelist (pass through without compression)",
    rtkBuiltinLabel: "Built-in exemptions (read-only, follow plugin updates):",
    rtkWhitelistDesc: "Each entry is name (e.g. docker) or git:name (e.g. git:clone). Commands with tiny or no output need no compression; adding them skips compression. Built-ins (git add/commit/push, mkdir/cp, \u2026) cannot be removed. Delete the file to reset.",
    rtkWhitelistPlaceholder: "name or git:name, press Enter to add",
    rtkWhitelistAdd: "Add",
    rtkWhitelistClear: "Clear",
    rtkWhitelistCleared: "Whitelist cleared",
    rtkWhitelistInvalid: "Entry must be name or git:name",
    rtkLoadFailed: "Failed to load the rtk config",
    tabHeadroom: "Headroom",
    headroomDesc: "Headroom plugin: a local compression proxy on 127.0.0.1 (port 8787 by default) that compresses context sent to the model to save tokens (/hr-* commands edit the same file). Device and power-save changes apply immediately; switching the device restarts the proxy, so requests in progress may be interrupted once.",
    headroomBinMissing: "The headroom program was not found, so the proxy cannot start. The settings below take effect once it is installed.",
    hrInstallBin: "Install headroom binary",
    hrBinInstalled: "headroom installed; reopen a session and the hook will start the proxy automatically",
    headroomInstallTitle: "headroom plugin not installed",
    headroomInstallDesc: "Install it from the zcode-plugins marketplace to manage the compression proxy here; restarting the session afterwards is recommended.",
    headroomInstall: "Install",
    headroomInstalling: "Installing\u2026",
    headroomInstalled: "headroom plugin installed",
    headroomInstallRetry: "Installation did not take effect; retry or install it from the marketplace manually",
    pluginInstallCardTitle: "{name} plugin not installed",
    pluginInstallCardDesc: "Install it from the zcode-plugins marketplace to manage it here; restarting the session afterwards is recommended.",
    pluginInstallDone: "{name} plugin installed",
    pluginEnable: "Enable",
    hrStarting: "Starting compression proxy\u2026",
    hrStarted: "Compression proxy started",
    hrStartTimeout: "Proxy start timed out (90s); check ~/.zcode-headroom-proxy.log",
    hrStopping: "Stopping compression proxy\u2026",
    hrRestarting: "Restarting compression proxy\u2026",
    hrStopped: "Compression proxy stopped",
    hrUsageNone: "No providers route through headroom; nothing changed",
    headroomLoadFailed: "Failed to load the Headroom config",
    headroomStatusTitle: "Status",
    hrInstRunning: "running",
    hrInstStopped: "down",
    headroomStatusLoadFailed: "Failed to load the status",
    headroomProxyUp: "Proxy running",
    headroomProxyDown: "Proxy down",
    headroomCurrentBackend: "Current device",
    headroomDesiredBackend: "Target device",
    hrValAuto: "Auto",
    hrPmAc: "AC",
    hrPmBattery: "Battery",
    hrPmSaver: "Power saver",
    hrPmSaverBat: "Saver + battery",
    hrDetectOk: "OK",
    hrDetectMissing: "missing",
    hrDetectBroken: "unavailable",
    headroomPowerState: "Power",
    headroomWatcher: "Watcher",
    headroomWatcherOn: "Running",
    headroomWatcherOff: "Stopped",
    headroomSaverDetect: "Power-saver detection",
    headroomRefresh: "Refresh",
    headroomStart: "Start",
    headroomRestart: "Restart",
    headroomStopAction: "Stop",
    headroomStopTitle: "Stop the Headroom proxy",
    headroomStopDesc: "Requests from ZCode and other apps pointing at this proxy (127.0.0.1) will fail until it is started again. headroom is shared \u2014 other tools may be using it. Stop it?",
    headroomStoppedWarn: "Proxy stopped; providers pointing at 127.0.0.1 cannot connect.",
    headroomBackend: "Compression device",
    headroomBackendAuto: "Auto \xB7 GPU first",
    headroomBackendCpu: "CPU \xB7 power saving",
    headroomBackendNative: " (native)",
    headroomBackendDesc: "Auto lets headroom pick the fastest device (CUDA/MPS); CPU forces CPU compression (power saving, no VRAM). Native headroom values (onnx, pytorch_mps, \u2026) also work. Switching restarts the proxy to apply.",
    headroomPower: "Power-save auto switch",
    headroomPowerOff: "Off",
    headroomPowerOffDesc: "No auto switching; always follow the compression device.",
    headroomPowerBattery: "On battery",
    headroomPowerBatteryDesc: "On battery (discharging) \u2192 CPU; switches back when plugged in.",
    headroomPowerSaver: "Power-saver",
    headroomPowerSaverDesc: "Only the system power-saver mode \u2192 CPU; back when it exits.",
    hrCpuPinnedHint: "The compression device is pinned to CPU, so power-save switching no longer changes anything.",
    headroomInterval: "Watch interval",
    headroomIntervalDesc: "Seconds between power checks (10\u20133600, default 60); applies from the next round, no restart needed.",
    headroomSecUnit: "s",
    upgradeCheck: "Check update",
    upgradeChecking: "Checking\u2026",
    upgradeUpToDate: "Up to date ({v})",
    upgradeFound: "{v} available",
    upgradeNow: "Update",
    upgradeRunning: "Updating\u2026",
    upgradeStop: "Stop",
    upgradeStopped: "Upgrade stopped",
    upgradeDone: "Updated to {v}",
    upgradeFinished: "Update finished",
    upgradeCheckFailed: "Update check failed",
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
    featureProjectMenuDescNew: 'Switch folder, open folder and copy path in the project "More" menu. Renaming is built in since ZCode 3.16.1 ("Edit project"), so the custom alias is retired.',
    aliasMigrateTitle: "Migrate project aliases",
    aliasMigrateDesc: 'This ZCode supports renaming projects (project "More" menu \u2192 Edit project), so the custom alias feature is retired. Write your saved aliases into the official project names by picking the projects below; only the project name changes, folders on disk are untouched.',
    aliasMigrateItemHint: 'The alias becomes the project name (re-editable anytime via "Edit project"). Only unmarked entries can be checked; migrated, merged, deleted, not-on-this-machine and manually-renamed ones cannot \u2014 to rename those projects, use "Edit project" in the project "More" menu directly.',
    aliasMigrateStateDone: "Migrated",
    aliasMigrateStateMerged: 'Merged into "{name}"',
    aliasMigrateStateDeleted: "Project deleted",
    aliasMigrateStateMissing: "Not on this machine",
    aliasMigrateStateRenamed: "Project renamed",
    aliasMigrateDeadSummary: "{n} stale entries (not on this machine / project deleted \u2014 usually old-machine paths from settings sync)",
    aliasMigrateClearDead: "Clear stale entries",
    aliasMigrateDeadCleared: "Removed {n} stale alias(es)",
    aliasMigrateDeadClearFailed: "Some stale aliases could not be removed; please retry",
    aliasMigrateGo: "Migrate selected",
    aliasMigrateRunning: "Migrating\u2026",
    aliasMigrateProgress: "Migrating {i}/{n}: {name}",
    aliasMigrateStateFailed: "Failed",
    aliasMigrateSkip: "Not now",
    aliasMigrateDone: "Migrated {n} alias(es)",
    aliasMigratePartial: "{n} migrated, {m} failed; retry the rest later in ZCode Pro settings",
    aliasMigrateAllFailed: "Alias migration failed; retry later in ZCode Pro settings",
    aliasMigrateCardName: "Alias migration",
    aliasMigrateCardDesc: "Project renaming is built in now; {n} custom alias(es) are not migrated yet.",
    aliasMigrateRun: "Migrate",
    taskOrderSaved: "Order updated.",
    qqGroupTitle: "QQ group: 428403354",
    qqGroupDesc: "Feedback & discussion",
    wechatGroupTitle: "WeChat group",
    wechatGroupDesc: "Add WeChat {id} for a group invite",
    wechatIdCopied: "WeChat ID copied.",
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
    relocateConfirmTitle: "Confirm folder switch",
    relocateConfirmDesc: "The page will refresh after switching, and unsent text in the chat input will be lost. Sessions and project files are not affected.",
    relocateConfirmGo: "Confirm switch",
    failed: "Operation failed",
    retryHint: "Please retry"
  };
  var cachedSystemLocale = null;
  function startLocaleResolver() {
    if (cachedSystemLocale !== null) return;
    const get = typeof window !== "undefined" ? window.zcode?.getSystemLocale : null;
    if (typeof get !== "function") return;
    Promise.resolve(get()).then((locale) => {
      if (typeof locale === "string" && locale) {
        cachedSystemLocale = locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
      }
    }).catch(() => {
    });
  }
  function isZhLocale() {
    let pref = null;
    try {
      pref = window.localStorage.getItem("zcode-locale-preference");
    } catch {
    }
    if (pref === "zh-CN" || pref === "en-US") return pref === "zh-CN";
    if (cachedSystemLocale) return cachedSystemLocale === "zh-CN";
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
    "index-busy": "The task index is busy. Please retry shortly.",
    "vision-invalid": "Invalid vision config",
    "vision-read": "Failed to read zcode-vision.json",
    "vision-write": "Failed to write zcode-vision.json",
    "vision-test": "Vision test failed",
    "proxy-invalid": "Proxy must look like http://127.0.0.1:7890, or be empty",
    "proxy-not-set": "Set the proxy address first",
    "rtk-invalid": "Invalid rtk config",
    "rtk-update": "Failed to check rtk updates (GitHub Releases unreachable? Set a proxy in the Proxy tab)",
    "rtk-write": "Failed to write the rtk config",
    "headroom-read": "Failed to read headroom.json",
    "headroom-write": "Failed to write headroom.json",
    "headroom-invalid": "Invalid headroom setting",
    "headroom-plugin": "headroom plugin not found (install it from the marketplace)",
    "headroom-sh": "sh not found; cannot run the headroom plugin script",
    "headroom-action": "The headroom action failed",
    "headroom-status": "Failed to read the headroom status",
    "headroom-upgrade": "headroom upgrade failed",
    "plugins-status": "Failed to read the plugin list",
    "plugins-update": "Failed to update plugins",
    "sync-invalid": "Invalid sync settings",
    "sync-not-configured": "Set the sync type to WebDAV and save the config first",
    "sync-remote-missing": "No synced data on the server yet; upload from another computer first",
    "sync-remote-invalid": "The URL already holds a different file; use another file path",
    "sync-request": "The WebDAV request failed",
    "sync-run": "Sync failed",
    "sync-file-invalid": "Invalid backup file name",
    "sync-export": "Failed to save the backup to disk"
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
        requestAnimationFrame(() => {
          if (node.isConnected) onPopup(node);
        });
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
        class: "fixed bottom-6 z-[100] flex max-w-md items-center gap-2 rounded-lg border px-4 py-3 text-ui-sm shadow-lg " + (kind === "error" ? "border-destructive/40 bg-menu text-foreground" : "border-border bg-menu text-foreground"),
        // left 用内联样式：ZCode 的 Tailwind 未编译 left-6/right-6 工具类（bottom-6 有）
        style: "animation:zcodepro-fade-in .18s ease; left: 1.5rem;"
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
  var dialogStack = [];
  function openDialog({ title, description, onMount, onClose, width = "sm:max-w-md", overlay = "dim", draggable = false, posKey = "", dismissOnOutside = true, bodyClass = "", closable = false }) {
    const L = t();
    const prevActive = document.activeElement;
    let cleanupDrag = null;
    const close = () => {
      overlayEl.remove();
      dialogStack = dialogStack.filter((e) => e !== overlayEl);
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
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (dialogStack[dialogStack.length - 1] === overlayEl) close();
    };
    const content = h("div", {
      role: "dialog",
      "aria-modal": "true",
      class: contentClass.replace("sm:max-w-md", width) + " zcodepro-card"
    });
    const overlayEl = h("div", {
      "data-overlay": overlay,
      class: (overlay === "none" ? overlayClassBare : overlayClass) + " zcodepro-overlay",
      onMousedown: (e) => {
        if (dismissOnOutside && e.target === overlayEl) close();
      }
    }, content);
    dialogStack.push(overlayEl);
    if (!dismissOnOutside) {
      overlayEl.style.pointerEvents = "none";
      content.style.pointerEvents = "auto";
    }
    const titleEl = h("h2", { class: "text-lg font-semibold leading-none tracking-tight text-foreground" }, title);
    const titleRow = closable ? h(
      "div",
      { class: "flex items-start justify-between gap-2" },
      titleEl,
      h("button", {
        type: "button",
        class: "zcodepro-close",
        title: L.close,
        "aria-label": L.close,
        onMousedown: (e) => {
          e.stopPropagation();
        },
        onClick: () => {
          close();
        }
      }, "\u2715")
    ) : titleEl;
    content.append(
      titleRow,
      ...description ? [h("p", { class: "mt-2 text-ui-sm/relaxed text-foreground-subtle" }, description)] : []
    );
    const body = h("div", { class: "zcodepro-dialog-body " + (bodyClass || "mt-4") });
    content.append(body);
    let restorePos = null;
    if (draggable) {
      titleEl.style.cursor = "move";
      titleEl.style.userSelect = "none";
      let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
      const clampPos = (x, y) => {
        const ob = overlayEl.getBoundingClientRect();
        const mx = Math.max(0, (ob.width - content.offsetWidth) / 2 - 8);
        const my = Math.max(0, (ob.height - content.offsetHeight) / 2 - 8);
        return [Math.min(mx, Math.max(-mx, x)), Math.min(my, Math.max(-my, y))];
      };
      const applyPos = () => {
        content.style.transform = ox || oy ? `translate(${ox}px, ${oy}px)` : "";
      };
      const reclamp = () => {
        if (dragging) return;
        [ox, oy] = clampPos(ox, oy);
        applyPos();
      };
      const restore = () => {
        if (!posKey) return;
        try {
          const saved = JSON.parse(localStorage.getItem("zcodepro-dialog-pos:" + posKey) || "null");
          if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
            [ox, oy] = clampPos(saved.x, saved.y);
            applyPos();
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
        applyPos();
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
      const posObserver = new ResizeObserver(reclamp);
      posObserver.observe(content);
      window.addEventListener("resize", reclamp);
      cleanupDrag = () => {
        titleEl.removeEventListener("mousedown", onDown);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        posObserver.disconnect();
        window.removeEventListener("resize", reclamp);
      };
      restorePos = restore;
    }
    document.addEventListener("keydown", onKey, true);
    document.body.append(overlayEl);
    if (restorePos) restorePos();
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
  function btnSmall(text, onClick, extra = "", variant = "") {
    return h("button", {
      type: "button",
      class: "zcodepro-btn-sm " + extra,
      "data-variant": variant || void 0,
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
    let current2 = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const input = h("input", {
      type: "text",
      inputmode: "decimal",
      value: String(current2),
      class: "h-8 w-16 rounded-lg border border-border bg-input px-2 text-right text-ui-sm tabular-nums text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
    });
    const clamp = (v) => Math.min(max, Math.max(min, v));
    const quantize = (v) => step >= 1 ? Math.round(v) : Math.round(Math.round(v / step) * step * 1e4) / 1e4;
    const display = (v) => {
      input.value = String(v);
    };
    const commit = (v) => {
      const next = clamp(v);
      if (next === current2) {
        display(next);
        return;
      }
      current2 = next;
      display(next);
      onCommit && onCommit(next);
    };
    input.addEventListener("wheel", (e) => {
      e.preventDefault();
      const dir = (e.deltaY || 0) < 0 ? 1 : -1;
      commit(quantize(current2 + dir * step));
    }, { passive: false });
    const submitTyped = () => {
      const parsed = parseFloat(String(input.value).trim());
      if (!Number.isFinite(parsed)) {
        display(current2);
        return;
      }
      commit(step >= 1 ? parsed : quantize(parsed));
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
        current2 = clamp(v);
        display(current2);
      },
      reset() {
        current2 = fallback;
        display(current2);
      },
      get() {
        return current2;
      }
    };
  }
  function unitField({ value = null, fallback = { value: 100, unit: "%" }, step = { px: 10, "%": 1 }, onCommit }) {
    const RANGES = { px: [320, 3840], "%": [20, 100] };
    const norm3 = (v) => {
      if (!v || !RANGES[v.unit]) return null;
      const [min, max] = RANGES[v.unit];
      const n = v.unit === "px" ? Math.round(v.value) : Math.round(v.value * 10) / 10;
      return Number.isFinite(n) ? { value: Math.min(max, Math.max(min, n)), unit: v.unit } : null;
    };
    let current2 = norm3(value) || norm3(fallback) || { value: 100, unit: "%" };
    const input = h("input", {
      type: "text",
      inputmode: "decimal",
      value: `${current2.value}${current2.unit}`,
      class: "h-8 w-20 rounded-lg border border-border bg-input px-2 text-right text-ui-sm tabular-nums text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
    });
    const display = () => {
      input.value = `${current2.value}${current2.unit}`;
    };
    const commit = (v) => {
      const next = norm3(v);
      if (!next || next.value === current2.value && next.unit === current2.unit) {
        display();
        return;
      }
      current2 = next;
      display();
      onCommit && onCommit({ ...current2 });
    };
    input.addEventListener("wheel", (e) => {
      e.preventDefault();
      const dir = (e.deltaY || 0) < 0 ? 1 : -1;
      commit({ value: current2.value + dir * (step[current2.unit] || 1), unit: current2.unit });
    }, { passive: false });
    const parseTyped = (s) => {
      const m = String(s).trim().match(/^(\d+(?:\.\d+)?)\s*(px|%)?$/i);
      if (!m) return null;
      return { value: parseFloat(m[1]), unit: (m[2] || current2.unit).toLowerCase() === "px" ? "px" : "%" };
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
        current2 = norm3(fallback) || current2;
        display();
      },
      get() {
        return { ...current2 };
      }
    };
  }
  function settingRow(name, desc, checked, onToggle, extra) {
    const knob = h("span", { class: "zcodepro-switch-knob" });
    const track = h("span", {
      class: "zcodepro-switch",
      "data-zcodepro-switch": "",
      "data-state": checked ? "on" : "off"
    }, knob);
    const extraEl = extra ? h("div", {
      class: "flex shrink-0 items-center",
      onClick: (e) => {
        e.stopPropagation();
      },
      onMousedown: (e) => {
        e.stopPropagation();
      },
      onWheel: (e) => {
        e.stopPropagation();
      }
    }, extra) : null;
    const row = h(
      "div",
      {
        class: `flex cursor-pointer items-center gap-2 rounded-lg ${desc ? "p-2" : "p-1.5"} transition-colors hover:bg-surface-hover`,
        onClick: () => {
          onToggle();
        }
      },
      h(
        "div",
        { class: "min-w-0 flex-1" },
        h("div", { class: "text-ui-sm font-medium text-foreground" }, name),
        ...desc ? [h("div", { class: "mt-0.5 text-ui-xs/relaxed text-foreground-subtle" }, desc)] : []
      ),
      ...extraEl ? [extraEl] : [],
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
    .zcodepro-overlay { background-color: rgba(0, 0, 0, 0.6); }
    .zcodepro-overlay[data-overlay="none"] { background-color: transparent; }
    .zcodepro-card {
      background-color: var(--color-popover, #fff);
      border-radius: 16px;
      outline: none;
      box-shadow: 0 0 0 1px var(--color-border, rgba(0, 0, 0, 0.1)), 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      /* \u9650\u9AD8 + \u7EB5\u5411\u5E03\u5C40\uFF1A\u5185\u5BB9\u6BD4\u7A97\u53E3\u9AD8\u65F6\uFF08\u5982\u89C6\u89C9\u4EE3\u7406\u591A\u5361\u7247\uFF09\u4E0D\u518D\u6EA2\u51FA\u7A97\u53E3\uFF0C
         \u7531\u6B63\u6587\u533A\u5185\u90E8\u6EDA\u52A8\uFF1B\u6807\u9898\u4E0E\u5173\u95ED\u6309\u94AE\u56FA\u5B9A\u53EF\u89C1\u3002max-height \u7528\u767E\u5206\u6BD4\u8DDF\u968F
         \u906E\u7F69\u5B9E\u9645\u9AD8\u5EA6\uFF08Linux \u4E0B\u9876\u90E8\u8BA9\u51FA\u81EA\u7ED8\u6807\u9898\u680F\uFF09\uFF0C\u4E0D\u7528 vh \u624B\u7B97 */
      display: flex;
      flex-direction: column;
      max-height: 100%;
    }
    /* \u6807\u9898/\u63CF\u8FF0\u4E0D\u53C2\u4E0E\u538B\u7F29\uFF0C\u6B63\u6587\u533A\u72EC\u5360\u6536\u7F29\uFF08flex \u5E03\u5C40\u4E0B\u7684\u4FDD\u9669\u5199\u6CD5\uFF09 */
    .zcodepro-card > * { flex-shrink: 0; }
    .zcodepro-dialog-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      /* \u6EDA\u5230\u5E95\u4E0D\u518D\u628A\u6EDA\u52A8\u4F20\u7ED9\u5F39\u7A97\u540E\u9762\u7684\u9875\u9762 */
      overscroll-behavior: contain;
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
    /* \u6807\u7B7E\u9875\u5207\u6362\uFF08\u8BBE\u7F6E\u5F39\u7A97\uFF09\uFF1A\u80F6\u56CA\u5BB9\u5668 + \u6FC0\u6D3B\u9AD8\u4EAE\uFF0C\u89C6\u89C9\u53C2\u8003\u4FA7\u680F\u201C\u5206\u7EC4/\u9879\u76EE\u201D\u5207\u6362\uFF1B
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
      padding: 0 8px;
      border: none;
      border-radius: 9999px;
      background: transparent;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
      color: var(--color-muted-foreground, #888);
      transition: color 0.15s ease, background-color 0.15s ease;
    }
    .zcodepro-tab[data-state="active"] {
      background-color: var(--color-background, #fff);
      color: var(--color-foreground, #111);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    }
    /* \u7D27\u51D1\u5C0F\u6309\u94AE\uFF1A\u51E0\u4F55/\u914D\u8272\u5199\u5165\u81EA\u6709\u89C4\u5219\u5E76\u53D6\u4E3B\u9898\u53D8\u91CF\uFF08\u9AD8\u5EA6=24px\uFF0C\u4E0E\u6807\u7B7E\u9875\u4E00\u81F4\uFF09 */
    .zcodepro-btn-sm {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 24px;
      padding: 0 10px;
      border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12));
      border-radius: 8px;
      background-color: transparent;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
      color: var(--color-foreground, #111);
      transition: background-color 0.12s ease;
    }
    .zcodepro-btn-sm:hover:not(:disabled) {
      background-color: color-mix(in oklab, var(--color-foreground, #888) 8%, transparent);
    }
    .zcodepro-btn-sm:disabled {
      opacity: 0.5;
      pointer-events: none;
    }
    .zcodepro-btn-sm[data-variant="primary"] {
      border-color: transparent;
      background-color: var(--color-primary, #111);
      color: var(--color-primary-foreground, #fff);
    }
    .zcodepro-btn-sm[data-variant="primary"]:hover:not(:disabled) {
      background-color: color-mix(in oklab, var(--color-primary, #111) 88%, #fff);
    }
    /* \u5F39\u7A97\u53F3\u4E0A\u89D2\u5173\u95ED\u6309\u94AE\uFF1A\u7528\u6587\u5B57\u5B57\u5F62\u800C\u975E SVG \u63CF\u8FB9\uFF08\u5E94\u7528\u73AF\u5883\u91CC\u6CE8\u5165\u7684 SVG \u63CF\u8FB9\u4E0D\u53EF\u89C1\uFF09\uFF0C
       \u51E0\u4F55/\u914D\u8272\u5199\u5165\u81EA\u6709\u89C4\u5219\u5E76\u53D6\u4E3B\u9898\u53D8\u91CF\uFF0C\u4FDD\u8BC1\u5E38\u663E */
    .zcodepro-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      color: var(--color-muted-foreground, #888);
      transition: background-color 0.12s ease, color 0.12s ease;
    }
    .zcodepro-close:hover {
      background-color: color-mix(in oklab, var(--color-foreground, #888) 8%, transparent);
      color: var(--color-foreground, #111);
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
    /* \u5C0F\u578B\u6587\u672C\u57DF\uFF08\u89C6\u89C9\u4EE3\u7406\u63D0\u793A\u8BCD\u7B49\uFF09\uFF1A11rem \u6700\u5C0F\u9AD8\u5EA6\u53EA\u5C5E\u4E8E\u5168\u5C40\u63D0\u793A\u8BCD\u5927\u7F16\u8F91\u6846\uFF0C\u8FD9\u91CC\u6309 rows \u5B9A\u9AD8 */
    .zcodepro-textarea.zcodepro-textarea-sm { min-height: 0; }
    /* \u5168\u5C40\u63D0\u793A\u8BCD\u5927\u7F16\u8F91\u6846\uFF1A\u9ED8\u8BA4/\u6700\u5927\u9AD8\u5EA6\u90FD\u6BD4\u9ED8\u8BA4\u6587\u672C\u57DF\u66F4\u9AD8 */
    .zcodepro-textarea.zcodepro-textarea-lg { min-height: 16rem; max-height: 40rem; }
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
    /* \u4F1A\u8BDD\u5FEB\u6377\u5207\u6362\u5F39\u7A97\uFF08alt+x/c\uFF09\uFF1A\u5C45\u4E2D\u5217\u8868\u5361\uFF0C\u7C7B alt+tab */
    .zcodepro-switcher-overlay {
      position: fixed;
      inset: 0;
      z-index: 90;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(0, 0, 0, 0.35);
    }
    .zcodepro-switcher {
      display: flex;
      flex-direction: column;
      min-width: 440px;
      max-width: min(560px, calc(100vw - 2rem));
      max-height: 60vh;
      padding: 8px;
      border-radius: 14px;
      background-color: var(--color-popover, #fff);
      box-shadow: 0 0 0 1px var(--color-border, rgba(0, 0, 0, 0.1)), 0 25px 50px -12px rgba(0, 0, 0, 0.35);
    }
    .zcodepro-switcher-hint {
      padding: 4px 10px 8px;
      font-size: 11px;
      color: var(--color-muted-foreground, #888);
    }
    .zcodepro-switcher-list {
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    /* \u4E24\u884C\u5E03\u5C40\uFF08\u6807\u9898 + \u9879\u76EE\u540D\uFF09\u5168\u90E8\u5C45\u5DE6\uFF1B\u6807\u9898\u884C\u7684\u201C\u5F53\u524D\u201D\u6807\u7B7E\u4E0E\u6587\u672C\u5782\u76F4\u5C45\u4E2D */
    .zcodepro-switcher-row {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
    }
    .zcodepro-switcher-row:hover { background-color: color-mix(in oklab, var(--color-foreground, #888) 6%, transparent); }
    .zcodepro-switcher-row[data-active] {
      background-color: color-mix(in oklab, var(--color-foreground, #888) 12%, transparent);
    }
    .zcodepro-switcher-title {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      text-align: left;
      font-size: 13px;
      color: var(--color-foreground, #111);
    }
    /* \u6807\u9898\u6587\u672C\u627F\u8F7D span\uFF1A\u622A\u65AD\u7701\u7565\u653E\u5728\u6587\u672C\u8282\u70B9\u4E0A\uFF0C\u907F\u514D flex \u5BB9\u5668 ellipsis \u5931\u6548 */
    .zcodepro-switcher-title > span:last-child {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .zcodepro-switcher-tag {
      flex-shrink: 0;
      padding: 1px 5px;
      border-radius: 5px;
      font-size: 10px;
      background-color: color-mix(in oklab, var(--color-primary, #111) 12%, transparent);
      color: var(--color-foreground-subtle, #666);
    }
    .zcodepro-switcher-ws {
      font-size: 11px;
      color: var(--color-muted-foreground, #888);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
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
    /* \u6298\u53E0\u9879\u76EE\u8FD0\u884C\u63D0\u793A\uFF08ws-running.js\uFF09\uFF1A\u9879\u76EE\u56FE\u6807\u65CB\u8F6C\u3002\u52A8\u753B\u7C7B\u6302\u5728\u56FE\u6807\u5916\u5C42\u7684
       \u7A33\u5B9A span \u4E0A\uFF0C\u5C55\u5F00/\u6536\u8D77\u65F6\u5E94\u7528\u91CD\u5EFA svg \u4E5F\u4E0D\u53D7\u5F71\u54CD\uFF1B\u65F6\u957F\u4E0E\u5E94\u7528 loader \u4E00\u81F4 */
    @keyframes zcodepro-ws-spin { to { transform: rotate(360deg); } }
    span.zcodepro-ws-running > svg {
      animation: zcodepro-ws-spin 1s linear infinite;
      transform-origin: center;
    }
    /* \u65E0\u611F\u63A2\u67E5\u671F\u95F4\u76D6\u5728\u9879\u76EE\u884C\u4E0A\u7684\u51BB\u7ED3\u514B\u9686\uFF1A\u56FA\u5B9A\u5B9A\u4F4D\u3001\u4E0D\u54CD\u5E94\u6307\u9488 */
    .zcodepro-ws-frozen {
      position: fixed;
      z-index: 2147483000;
      pointer-events: none;
      margin: 0;
    }
    /* \u4FA7\u680F\u83DC\u5355\u5E76\u5165\u9876\u680F\uFF08toolbar-icons.js\uFF09\uFF1A\u81EA\u6709\u56FE\u6807\u6309\u94AE + \u60AC\u505C\u63D0\u793A + \u539F\u83DC\u5355\u9690\u85CF\u3002
       \u51E0\u4F55\u5BF9\u9F50\u5E94\u7528\u5BFC\u822A\u6309\u94AE\uFF08icon-md\uFF1A28\xD728\u3001\u5706\u89D2 8px\uFF09\uFF0C\u989C\u8272\u8D70\u4E3B\u9898\u53D8\u91CF\uFF0C
       \u4E0E\u5F00\u5173/\u6807\u7B7E\u9875\u540C\u7406\u4E0D\u4F9D\u8D56\u5E94\u7528 Tailwind \u7C7B */
    .zcodepro-tb-row {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: 6px;
      -webkit-app-region: no-drag;
    }
    .zcodepro-tb-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background-color: transparent;
      color: var(--color-foreground-subtle, #666);
      cursor: pointer;
      flex-shrink: 0;
      transition: background-color 0.12s ease, color 0.12s ease;
    }
    .zcodepro-tb-btn:hover,
    .zcodepro-tb-btn:focus-visible {
      outline: none;
      background-color: var(--color-hover, color-mix(in oklab, var(--color-foreground, #888) 8%, transparent));
      color: var(--color-foreground, #111);
    }
    .zcodepro-tb-btn[data-active="1"] {
      background-color: color-mix(in oklab, var(--color-foreground, #888) 10%, transparent);
      color: var(--color-foreground, #111);
    }
    .zcodepro-tb-icon {
      display: block;
      width: 16px;
      height: 16px;
    }
    /* \u60AC\u505C\u63D0\u793A\uFF1A\u6309\u94AE\u4E0B\u65B9\u5C45\u4E2D\u51FA\u73B0\uFF08\u7EA6 0.3s \u5EF6\u8FDF\uFF0C\u5BF9\u9F50\u5E94\u7528\u63D0\u793A\u8282\u594F\uFF09\uFF0C\u79FB\u5F00\u7ACB\u5373\u6D88\u5931 */
    .zcodepro-tb-btn::after {
      content: attr(data-zcodepro-tip);
      position: absolute;
      top: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--color-border, rgba(127, 127, 127, 0.25));
      background-color: var(--color-menu, #171717);
      color: var(--color-foreground, #fff);
      font-size: 11px;
      line-height: 1.5;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      z-index: 60;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }
    .zcodepro-tb-btn:hover::after,
    .zcodepro-tb-btn:focus-visible::after {
      opacity: 1;
      visibility: visible;
      transition: opacity 0.15s ease 0.3s;
    }
    /* \u539F\u4FA7\u680F\u83DC\u5355\u6574\u4F53\u9690\u85CF\uFF08toolbar-icons \u5F00\u542F\u65F6\uFF09 */
    .zcodepro-tb-hidden { display: none !important; }
    /* \u539F\u751F\u9876\u680F\u65B0\u5EFA\u4EFB\u52A1\u6309\u94AE\uFF08\u6587\u4EF6\u67E5\u770B\u7B49\u5B50\u9875\u5C55\u5F00\u7684\u90A3\u4E2A\uFF09\uFF1A\u5E38\u9A7B DOM\u3001\u9760\u52A8\u753B\u5BB9\u5668
       \u5728 w-7/w-0 \u95F4\u5207\u6362\u663E\u9690\u3002\u529F\u80FD\u5F00\u542F\u671F\u95F4\u6574\u4F53\u9489\u6B7B\u6536\u8D77\u6001\u2014\u2014\u65B0\u5EFA\u5165\u53E3\u7EDF\u4E00\u7531\u6211\u4EEC
       \u7684\u6309\u94AE\u884C\u63D0\u4F9B\uFF0C\u4E5F\u5C31\u4E0D\u518D\u9700\u8981\u968F\u5B50\u9875\u8FDB\u51FA\u52A8\u6001\u663E\u9690\u81EA\u5DF1\u7684\u65B0\u5EFA\u6309\u94AE */
    .zcodepro-tb-hidden-native div[class*="transition-[opacity,width]"] {
      width: 0 !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    /* \u5DF2\u7F6E\u9876\u5206\u533A\u53EF\u6298\u53E0\uFF08pinned-collapse.js\uFF09\uFF1A\u6807\u9898\u6574\u884C\u53EF\u70B9\uFF0C\u6298\u53E0\u65F6\u85CF\u8D77\u4EFB\u52A1\u5217\u8868\uFF0C
       chevron \u65CB\u5411\u4E0E\u201C\u9879\u76EE\u201D\u5206\u533A\u4E00\u81F4\uFF08\u6536\u8D77\u6307\u5411\u53F3\u4FA7\uFF09 */
    .zcodepro-pin-head {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      transition: color 0.15s ease;
    }
    .zcodepro-pin-head:hover { color: var(--color-foreground, #111); }
    .zcodepro-pin-chevron {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: none;
      background-color: transparent;
      color: inherit;
      cursor: pointer;
    }
    .zcodepro-pin-chevron svg {
      width: 14px;
      height: 14px;
      opacity: 0.55;
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .zcodepro-pin-head:hover .zcodepro-pin-chevron svg { opacity: 1; }
    .zcodepro-pin-collapsed .zcodepro-pin-chevron svg { transform: rotate(-90deg); }
    .zcodepro-pin-collapsed > ul { display: none !important; }
    /* \u6298\u53E0\u540E\u53BB\u6389\u6807\u9898\u81EA\u5E26\u7684\u5E95\u90E8\u7559\u767D\uFF0C\u4E0E\u4E0B\u4E00\u5206\u533A\u7684\u95F4\u9694\u548C\u5176\u4ED6\u5206\u533A\u8282\u594F\u4E00\u81F4 */
    .zcodepro-pin-collapsed .zcodepro-pin-head { padding-bottom: 0; }
  `));
  }

  // src/inject/features/copy-path.js
  async function appendCopyPathItem(menu, anchorItem, project) {
    if (menu.querySelector('[data-zcodepro-item="copy-path"]')) return;
    const L = t();
    const item = anchorItem.cloneNode(true);
    item.removeAttribute("data-testid");
    item.removeAttribute("data-highlighted");
    item.setAttribute("data-zcodepro-item", "copy-path");
    for (const child of [...item.childNodes]) child.remove();
    const origIcon = anchorItem.querySelector("svg");
    const iconClass = origIcon ? origIcon.getAttribute("class") : "h-3.5 w-3.5";
    item.append(hCopyIcon(iconClass), document.createTextNode(L.copyPathItem));
    item.addEventListener("mouseenter", () => {
      for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute("data-highlighted");
      item.setAttribute("data-highlighted", "");
    });
    item.addEventListener("mouseleave", () => item.removeAttribute("data-highlighted"));
    item.addEventListener("click", () => {
      closeRadixMenu(menu);
      void copyText(project.path);
    });
    anchorItem.before(item);
  }
  async function copyText(text) {
    const L = t();
    if (await copyToClipboard(text)) showToast(L.pathCopied);
    else showToast(L.pathCopyFailed, "error");
  }
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyViaHiddenInput(text);
    }
  }
  function copyViaHiddenInput(text) {
    try {
      const input = h("input", { type: "text", style: "position:fixed;left:-9999px;top:0;opacity:0" });
      input.value = text;
      document.body.append(input);
      input.select();
      const ok = document.execCommand("copy");
      input.remove();
      return ok;
    } catch {
      return false;
    }
  }
  function hCopyIcon(cls) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("class", cls);
    for (const d of [
      "M8 8h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z",
      "M4 16c-1.1 0-2-.9-2-2V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2"
    ]) {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      svg.append(p);
    }
    return svg;
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
  var rowSel = '[data-testid^="workspace-item-"]';
  var inProjectRow = (node) => node instanceof Element && !!node.closest && !!node.closest(rowSel);
  function projectRowMutations(muts) {
    for (const m of muts) {
      if (m.type === "characterData") {
        if (m.target.parentElement && inProjectRow(m.target.parentElement)) return true;
        continue;
      }
      if (inProjectRow(m.target)) return true;
      for (const n of m.addedNodes) {
        if (n instanceof Element && (n.matches(rowSel) || !!n.querySelector(rowSel))) return true;
      }
    }
    return false;
  }
  async function startAliasWatcher() {
    if (isNewProjectSidebar()) return;
    await syncFromConfig();
    if (observer) return;
    observer = new MutationObserver((muts) => {
      if (projectRowMutations(muts)) scheduleApply();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    applyAliass();
  }
  async function syncFromConfig() {
    const config = await getConfig();
    enabled = !(config.features && config.features.projectMenu === false);
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
    const current2 = aliases[norm(project.path)] || "";
    const realName = project.name || basenameOf(project.path);
    let submitting = false;
    openDialog({
      title: L.aliasTitle,
      description: L.aliasDesc,
      width: "sm:max-w-md",
      onMount: ({ body, close }) => {
        const input = textInput({
          value: current2 || realName,
          placeholder: L.aliasPlaceholder,
          onEnter: () => submit()
        });
        const submitBtn = btnPrimary(L.aliasConfirm, () => submit(), "min-w-24");
        const submit = async () => {
          if (submitting) return;
          const name = input.value.trim();
          if (name && name === current2) {
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
            if (current2) {
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
          openDialog({
            title: L.relocateConfirmTitle,
            description: L.relocateConfirmDesc,
            width: "sm:max-w-md",
            onMount: ({ body: body2, close: closeConfirm }) => {
              body2.append(
                dialogFooter(
                  btnSecondary(L.cancel, () => closeConfirm()),
                  btnPrimary(L.relocateConfirmGo, () => {
                    closeConfirm();
                    void runRelocate();
                  }, "min-w-24")
                )
              );
            }
          });
        };
        const runRelocate = async () => {
          const newPath = input.value.trim();
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
  function openMenuProjectRow() {
    const trigger = document.querySelector(
      '[data-testid="virtual-project-menu"][aria-expanded="true"], [data-testid="virtual-project-menu"][data-state="open"], [data-testid="virtual-project-row"][data-state="open"], [data-testid="virtual-project-row"][aria-expanded="true"]'
    );
    const row = trigger ? trigger.closest("section[data-project-id]") : null;
    if (!row) return null;
    const host = row.getAttribute("data-project-host");
    return host === null || host === "local" ? row : null;
  }
  async function resolveProjectPath(removeItem) {
    const extracted = extractPathFromTestId2(removeItem.getAttribute("data-testid") || "");
    if (!extracted) return null;
    const res = await rpc("/projects");
    if (res.ok && Array.isArray(res.projects)) {
      const norm3 = (p) => String(p).replace(/[\\/]+$/, "");
      const hit = res.projects.find((p) => norm3(p.path) === norm3(extracted));
      if (hit) return hit;
    }
    return { path: extracted, name: String(extracted).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "" };
  }
  function cloneMenuItem(anchor, testid, label) {
    const item = anchor.cloneNode(true);
    item.removeAttribute("data-testid");
    item.removeAttribute("data-highlighted");
    item.removeAttribute("id");
    item.setAttribute("data-zcodepro-item", testid);
    for (const child of [...item.childNodes]) child.remove();
    const origIcon = anchor.querySelector("svg");
    const iconClass = origIcon ? origIcon.getAttribute("class") : "h-3.5 w-3.5";
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("class", iconClass);
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z");
    svg.append(p);
    item.append(svg, document.createTextNode(label));
    return item;
  }
  function wireHighlight(menu, item) {
    item.addEventListener("mouseenter", () => {
      for (const el of menu.querySelectorAll('[role="menuitem"]')) el.removeAttribute("data-highlighted");
      item.setAttribute("data-highlighted", "");
    });
    item.addEventListener("mouseleave", () => item.removeAttribute("data-highlighted"));
  }
  function attachFolderHover(menu, item, roots) {
    const L = t();
    let sub = null;
    let subHovered = false;
    let hideTimer = 0;
    let aliveTimer = 0;
    const removeSub = () => {
      clearTimeout(hideTimer);
      clearInterval(aliveTimer);
      sub?.remove();
      sub = null;
      subHovered = false;
    };
    const position = () => {
      const rect = item.getBoundingClientRect();
      sub.style.left = rect.right + "px";
      sub.style.top = rect.top + "px";
      const r = sub.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) {
        sub.style.left = "";
        sub.style.right = window.innerWidth - rect.left + "px";
      }
    };
    const ensureSub = () => {
      if (sub) {
        position();
        return;
      }
      sub = document.createElement("div");
      sub.setAttribute("role", "menu");
      sub.setAttribute("data-zcodepro-item", "open-folder-sub");
      sub.className = "zcodepro-card flex flex-col gap-0.5 rounded-lg border border-border bg-menu p-1 text-ui-sm shadow-lg";
      sub.style.cssText = "position:fixed;z-index:60;min-width:14rem;";
      for (const root of roots) {
        const base = String(root.path).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || root.path;
        const row = document.createElement("div");
        row.setAttribute("role", "menuitem");
        row.className = "flex cursor-pointer items-center gap-2 truncate rounded-md px-2 py-1.5 text-foreground transition-colors hover:bg-surface-hover";
        row.title = root.path;
        row.append(document.createTextNode(base + (root.primary ? ` \xB7 ${L.openFolderPrimary}` : "")));
        row.addEventListener("click", () => {
          try {
            menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
          } catch {
          }
          removeSub();
          void rpc("/open-folder", { method: "POST", body: { path: root.path } });
        });
        sub.append(row);
      }
      sub.addEventListener("mouseenter", () => {
        subHovered = true;
        clearTimeout(hideTimer);
      });
      sub.addEventListener("mouseleave", () => {
        subHovered = false;
        scheduleHide();
      });
      document.body.append(sub);
      position();
      aliveTimer = setInterval(() => {
        if (!menu.isConnected) removeSub();
      }, 400);
    };
    const scheduleHide = () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!subHovered) removeSub();
      }, 300);
    };
    item.addEventListener("mouseenter", () => {
      clearTimeout(hideTimer);
      ensureSub();
    });
    item.addEventListener("mouseleave", scheduleHide);
    item.addEventListener("click", () => {
      clearTimeout(hideTimer);
      ensureSub();
    });
  }
  async function injectNewMenuItems(content, menuRow) {
    const L = t();
    const projectId = menuRow.getAttribute("data-project-id");
    const editItem = content.querySelector('[data-testid="virtual-project-edit"]');
    if (!editItem || !projectId) return;
    if (content.querySelector("[data-zcodepro-item]")) return;
    const config = await getConfig();
    if (config.features && config.features.projectMenu === false) return;
    const res = await rpc("/projects-v2");
    if (!res.ok || !res.available) return;
    const proj = (res.projects || []).find((p) => p.id === projectId);
    if (!proj) return;
    const roots = (proj.roots || []).slice().sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
    if (!roots.length) return;
    const primary = roots.find((r) => r.primary) || roots[0];
    const openItem = cloneMenuItem(editItem, "open-folder", L.openFolderItem);
    wireHighlight(content, openItem);
    if (roots.length === 1) {
      openItem.addEventListener("click", () => {
        try {
          content.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        } catch {
        }
        void rpc("/open-folder", { method: "POST", body: { path: primary.path } });
      });
    } else {
      const ns = "http://www.w3.org/2000/svg";
      const chev = document.createElementNS(ns, "svg");
      chev.setAttribute("viewBox", "0 0 24 24");
      chev.setAttribute("fill", "none");
      chev.setAttribute("stroke", "currentColor");
      chev.setAttribute("stroke-width", "2");
      chev.setAttribute("stroke-linecap", "round");
      chev.setAttribute("stroke-linejoin", "round");
      chev.setAttribute("class", "ml-auto size-3.5 shrink-0 text-foreground-subtle");
      const chevPath = document.createElementNS(ns, "path");
      chevPath.setAttribute("d", "m9 18 6-6-6-6");
      chev.append(chevPath);
      openItem.append(chev);
      attachFolderHover(content, openItem, roots);
    }
    editItem.after(openItem);
    const copyItem = cloneMenuItem(editItem, "copy-path", L.copyPathItem);
    wireHighlight(content, copyItem);
    copyItem.addEventListener("click", () => {
      try {
        content.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      } catch {
      }
      void copyToClipboard(primary.path).then((ok) => showToast(ok ? L.pathCopied : L.pathCopyFailed, ok ? void 0 : "error"));
    });
    openItem.after(copyItem);
  }
  function handleProjectMenu(content) {
    if (content.querySelector("[data-zcodepro-item]")) return;
    const items = itemsOf(content);
    const newUi = isNewProjectSidebar();
    const menuRow = newUi ? openMenuProjectRow() : null;
    const anchor = newUi ? items.find((el) => el.getAttribute("data-testid") === "virtual-project-edit") : items.find(
      (el) => el.hasAttribute("data-testid") && REMOVE_TEXTS.some((x) => itemText(el).startsWith(x))
    );
    if (!anchor) return;
    if (newUi) {
      if (!menuRow) return;
      void injectNewMenuItems(content, menuRow);
      return;
    }
    void (async () => {
      const config = await getConfig();
      if (config.features && config.features.projectMenu === false) return;
      const project = await resolveProjectPath(anchor);
      if (!project) return;
      appendAliasItem(content, anchor, project);
      appendRelocateItem(content, anchor, project);
      appendOpenFolderItem(content, anchor, project);
      appendCopyPathItem(content, anchor, project);
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
    content.dataset.zcodeproFileMenu = "1";
    void (async () => {
      const config = await getConfig();
      if (config.features && config.features.fileActions === false) return;
      const path = resolveTargetPath(content);
      if (!path) return;
      const L = t();
      const fire = (endpoint, label) => {
        rpc(endpoint, { method: "POST", body: { path } }).then((r) => {
          if (r && r.ok === false) showToast(`${label}\u5931\u8D25\uFF1A${r.error || "\u672A\u77E5\u9519\u8BEF"}`, "error");
        }).catch(() => {
        });
      };
      const noApps = items.find((el) => NO_APPS_TEXTS.some((x) => itemText(el) === x)) || content.querySelector('[data-disabled][role="menuitem"]');
      const openAnchor = noApps && content.contains(noApps) ? noApps : copyAbs;
      appendMenuItem(content, copyAbs, openAnchor, {
        marker: "file-open-default",
        label: L.fileOpenDefault,
        icon: ICON_OPEN_DEFAULT,
        onPick: () => {
          void fire("/open-path", L.fileOpenDefault);
        }
      });
      appendMenuItem(content, copyAbs, copyAbs, {
        marker: "file-reveal",
        label: L.fileReveal,
        icon: ICON_REVEAL,
        onPick: () => {
          void fire("/reveal-path", L.fileReveal);
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
        hCopyIcon2(),
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
  function hCopyIcon2() {
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
    let enabled6 = true;
    const refresh = () => {
      void getConfig().then((c) => {
        enabled6 = !(c.features && c.features.imageCopy === false);
      });
    };
    refresh();
    document.addEventListener("contextmenu", (e) => {
      if (e.defaultPrevented) return;
      const img = copyTargetOf(e.target, e.clientX, e.clientY);
      if (!img) return;
      e.preventDefault();
      if (enabled6) showMenu(e.clientX, e.clientY, img);
      refresh();
    }, true);
  }

  // src/inject/provider-fields.js
  var PROVIDER_FIELD_CLS = "h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";
  function comboField(current2, options, onChange, { disabled = false, placeholder = "", staleLabel = "\uFF08\u624B\u52A8\u8F93\u5165\uFF09", emptyLabel = "" } = {}) {
    const sel = h("select", { class: PROVIDER_FIELD_CLS, disabled: disabled || void 0 });
    const input = h("input", { type: "text", value: current2, placeholder, class: PROVIDER_FIELD_CLS, disabled: disabled || void 0 });
    const sync3 = () => {
      const cur = input.value;
      const opts = [...options];
      if (cur && !opts.some((o) => o.value === cur)) opts.push({ value: cur, label: `${cur}${staleLabel}` });
      if (!cur && !opts.some((o) => o.value === "")) opts.unshift({ value: "", label: emptyLabel });
      sel.replaceChildren(...opts.map((o) => h("option", { value: o.value, title: o.value }, o.label)));
      sel.value = cur;
    };
    sel.addEventListener("change", () => {
      input.value = sel.value;
      onChange(sel.value, "select");
    });
    input.addEventListener("input", () => onChange(input.value, "type"));
    input.addEventListener("blur", () => sync3());
    sync3();
    return h("div", { class: "flex flex-col gap-1" }, sel, input);
  }
  function providerOptionsOf(providers, L) {
    return [
      { value: "", label: L.titleGenProviderNone },
      { value: "session", label: L.titleGenProviderSession },
      ...providers.map((p) => ({ value: p.id, label: p.name }))
    ];
  }
  function modelOptionsOf(providerValue, providers, { followSession = false, followSessionLabel = "" } = {}) {
    const v = (providerValue || "").trim();
    const cur = providers.find((p) => p.id === v);
    if (cur) return cur.models.map((m) => ({ value: m, label: m }));
    if (v === "session") {
      const head = followSession && followSessionLabel ? [{ value: "", label: followSessionLabel }] : [];
      return [...head, ...[...new Set(providers.flatMap((p) => p.models))].map((m) => ({ value: m, label: m }))];
    }
    return [];
  }
  function modelPlaceholderOf(providerValue, L) {
    const v = (providerValue || "").trim();
    if (v === "session") return L.titleGenModelSessionHint;
    if (v === "") return L.titleGenModelManualHint;
    return L.titleGenModelHint;
  }
  function isManualConn(providerValue, providers) {
    const v = (providerValue || "").trim();
    return v === "" || v !== "session" && !providers.some((p) => p.id === v);
  }

  // src/inject/features/ws-rows.js
  var norm2 = (p) => String(p || "").replace(/[\\/]+$/, "");
  var NEW_ROW_SEL = "section[data-project-id]";
  var OLD_ROW_SEL = '[data-testid^="workspace-item-"]';
  var pathByProjectId = /* @__PURE__ */ new Map();
  function projectRowSelector() {
    return isNewProjectSidebar() ? NEW_ROW_SEL : OLD_ROW_SEL;
  }
  function projectRows(root = document) {
    return [...root.querySelectorAll(projectRowSelector())];
  }
  function rowPath(row) {
    if (!row) return null;
    if (row.hasAttribute && row.hasAttribute("data-project-id")) {
      const host = row.getAttribute("data-project-host");
      if (host !== null && host !== "local") return null;
      const id = row.getAttribute("data-project-id");
      let found = null;
      for (const el of row.querySelectorAll("[data-task-item-key]")) {
        const key = el.getAttribute("data-task-item-key") || "";
        const cut = key.lastIndexOf(":");
        if (cut > 1) {
          found = key.slice(0, cut);
          break;
        }
      }
      if (found) pathByProjectId.set(id, found);
      return found || pathByProjectId.get(id) || null;
    }
    const testid = row.getAttribute && row.getAttribute("data-testid");
    if (!testid || !testid.startsWith("workspace-item-")) return null;
    return norm2(testid.slice("workspace-item-".length)) || null;
  }
  function findProjectRow(path) {
    const want = norm2(path);
    if (!want) return null;
    for (const row of projectRows()) {
      const p = rowPath(row);
      if (p && norm2(p) === want) return row;
    }
    return null;
  }

  // src/inject/features/alias-migration.js
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  var basenameOf2 = (p) => String(p || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
  function waitFor(getter, timeoutMs, step) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick2 = () => {
        let v = null;
        try {
          v = getter();
        } catch {
        }
        if (v) {
          resolve(v);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(step));
          return;
        }
        setTimeout(tick2, 120);
      };
      tick2();
    });
  }
  function setReactInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value")?.set || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("input-setter");
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function pressEscape() {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    } catch {
    }
  }
  async function markDismissed() {
    await rpc("/config", { method: "POST", body: { migrations: { aliasRenameDismissed: true } } });
    clearConfigCache();
  }
  var MIGRATE_LOCK_KEY = "zcodepro:alias-migrate-lock";
  var MIGRATE_LOCK_MS = 5 * 6e4;
  function migrateLockFresh() {
    try {
      const at = Number(localStorage.getItem(MIGRATE_LOCK_KEY));
      return Number.isFinite(at) && Date.now() - at < MIGRATE_LOCK_MS;
    } catch {
      return false;
    }
  }
  function touchMigrateLock() {
    try {
      localStorage.setItem(MIGRATE_LOCK_KEY, String(Date.now()));
    } catch {
    }
  }
  async function migrateOne(path, alias) {
    if (document.querySelector('[data-testid="virtual-project-name"], [role="menu"]')) {
      pressEscape();
      await sleep(300);
    }
    let row = findProjectRow(path);
    if (!row) {
      const byName = [...document.querySelectorAll("section[data-project-id]")].filter((el) => {
        const host = el.getAttribute("data-project-host");
        return (host === null || host === "local") && el.getAttribute("data-project-name") === basenameOf2(path);
      });
      if (byName.length === 1) row = byName[0];
    }
    if (!row) throw new Error("project-row");
    const projectId = row.getAttribute("data-project-id");
    const rowById = () => document.querySelector(`section[data-project-id="${CSS.escape(projectId)}"]`);
    try {
      row.scrollIntoView({ block: "center" });
    } catch {
    }
    const trigger = await waitFor(
      () => rowById()?.querySelector('[data-testid="virtual-project-menu"]'),
      4e3,
      "menu-trigger"
    );
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 }));
    trigger.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 }));
    trigger.click();
    const menu = await waitFor(() => {
      for (const m of document.querySelectorAll('[role="menu"]')) {
        if (m.querySelector('[data-testid="virtual-project-edit"]')) return m;
      }
      return null;
    }, 4e3, "menu-open");
    menu.querySelector('[data-testid="virtual-project-edit"]').click();
    const input = await waitFor(
      () => document.querySelector('[data-testid="virtual-project-name"]'),
      5e3,
      "editor-open"
    );
    const wantName = alias.trim();
    setReactInputValue(input, wantName);
    const save = await waitFor(
      () => {
        const btn = document.querySelector('[data-testid="virtual-project-save"]');
        return btn && !btn.disabled ? btn : null;
      },
      4e3,
      "save-ready"
    );
    save.click();
    await waitFor(() => {
      const r = rowById();
      return r && r.getAttribute("data-project-name") === wantName ? r : null;
    }, 8e3, "name-updated");
    await sleep(250);
    if (document.querySelector('[data-testid="virtual-project-name"]')) pressEscape();
    const res = await rpc("/project/alias", { method: "POST", body: { path, alias: "" } });
    if (!res.ok) throw new Error("alias-clear");
  }
  async function classifyEntry(path, alias, db) {
    const want = norm0(path);
    if (db) {
      let alsoDeleted = false;
      for (const proj of db.projects || []) {
        const hit = (proj.roots || []).find((r) => norm0(r.path) === want);
        if (!hit) continue;
        if (hit.primary) {
          if (proj.name === alias) return { state: "done", note: "" };
          return { state: "", note: "", overridden: !!proj.overridden };
        }
        alsoDeleted = (db.deletedRoots || []).some((p) => norm0(p) === want);
        return { state: "merged", note: proj.name, alsoDeleted };
      }
      if ((db.deletedRoots || []).some((p) => norm0(p) === want)) return { state: "deleted", note: "" };
      return { state: "missing", note: "" };
    }
    const localRows = [...document.querySelectorAll("section[data-project-id]")].filter((el) => {
      const host = el.getAttribute("data-project-host");
      return host === null || host === "local";
    });
    const byPath = localRows.find((el) => norm0(rowPath(el)) === want);
    if (byPath) {
      return (byPath.getAttribute("data-project-name") || "") === alias ? { state: "done", note: "" } : { state: "", note: "" };
    }
    const byName = localRows.filter((el) => el.getAttribute("data-project-name") === alias);
    if (byName.length === 1) return { state: "done", note: "" };
    for (const task of document.querySelectorAll("[data-task-item-key]")) {
      const key = task.getAttribute("data-task-item-key") || "";
      const cut = key.lastIndexOf(":");
      if (cut <= 1 || norm0(key.slice(0, cut)) !== want) continue;
      const owner = task.closest("section[data-project-id]");
      const ownerName = owner ? owner.getAttribute("data-project-name") || "" : "";
      if (ownerName) return { state: "merged", note: ownerName };
    }
    return { state: "missing", note: "" };
  }
  async function fetchProjectDb() {
    const res = await rpc("/projects-v2");
    return res.ok && res.available ? res : null;
  }
  var norm0 = (p) => String(p || "").replace(/[\\/]+$/, "");
  function openMigrationDialog() {
    ensureStyle();
    const L = t();
    let running = false;
    let decided = false;
    const decide = () => {
      if (decided) return;
      decided = true;
      void markDismissed();
    };
    touchMigrateLock();
    openDialog({
      title: L.aliasMigrateTitle,
      description: L.aliasMigrateDesc,
      width: "sm:max-w-md",
      // 迁移不可中途撤销且过程可见：点遮罩不关闭（防误触），右上角 ✕ 关闭
      dismissOnOutside: false,
      closable: true,
      onClose: () => {
        decide();
        window.dispatchEvent(new CustomEvent("zcodepro:aliases-changed"));
      },
      onMount: ({ body, close }) => {
        void (async () => {
          const config = await getConfig(true);
          const db = await fetchProjectDb();
          const entries = [];
          for (const [path, aliasRaw] of Object.entries(config.aliases || {})) {
            const alias = String(aliasRaw || "").trim();
            if (!alias) continue;
            const cls = await classifyEntry(path, alias, db);
            entries.push({
              path,
              alias,
              checked: cls.state === "" && !cls.overridden,
              state: cls.state,
              note: cls.note || "",
              overridden: !!cls.overridden,
              alsoDeleted: !!cls.alsoDeleted
            });
          }
          if (!entries.length) {
            close();
            return;
          }
          const badgesOf = (e) => {
            const out = [];
            if (e.state === "run") out.push({ text: L.aliasMigrateRunning, cls: "text-amber-500" });
            if (e.state === "ok") out.push({ text: L.aliasMigrateStateDone, cls: "text-emerald-600" });
            if (e.state === "fail") out.push({ text: L.aliasMigrateStateFailed, cls: "text-destructive" });
            if (e.state === "done") out.push({ text: L.aliasMigrateStateDone, cls: "text-emerald-600" });
            if (e.state === "merged") out.push({ text: L.aliasMigrateStateMerged.replace("{name}", e.note), cls: "text-amber-500" });
            if (e.state === "deleted" || e.state === "merged" && e.alsoDeleted) out.push({ text: L.aliasMigrateStateDeleted, cls: "text-foreground-subtle/70" });
            if (e.state === "missing") out.push({ text: L.aliasMigrateStateMissing, cls: "text-foreground-subtle/70" });
            if (e.state === "" && e.overridden) out.push({ text: L.aliasMigrateStateRenamed, cls: "text-foreground-subtle/70" });
            return out;
          };
          const progressEl = h("div", { class: "mb-1 text-ui-xs text-foreground-subtle", style: "display:none" });
          const listEl = h("div", { class: "max-h-[50vh] space-y-1.5 overflow-y-auto" });
          let deadOpen = false;
          const renderList = () => {
            const alive = entries.filter((e) => e.state !== "missing" && e.state !== "deleted");
            const dead = entries.filter((e) => e.state === "missing" || e.state === "deleted");
            const rowOf = (e, deadRow) => {
              const cb = h("input", { type: "checkbox" });
              cb.checked = e.checked;
              cb.disabled = running || e.state !== "" && e.state !== "fail" || e.overridden;
              cb.addEventListener("change", () => {
                e.checked = cb.checked;
              });
              const badges = badgesOf(e);
              const dim = deadRow || e.state !== "" && e.state !== "fail" && e.state !== "run" || e.overridden;
              return h(
                "label",
                { class: "flex cursor-pointer items-start gap-2 rounded-lg p-2 transition-colors hover:bg-surface-hover" + (dim ? " opacity-60" : "") },
                h("span", { class: "mt-0.5" }, cb),
                h(
                  "span",
                  { class: "min-w-0 flex-1" },
                  h("span", { class: "block truncate text-ui-sm font-medium text-foreground" }, e.alias),
                  h("span", { class: "block truncate font-mono text-ui-xs text-foreground-subtle" }, e.path)
                ),
                ...badges.map((b) => h("span", { class: "shrink-0 self-center text-ui-xs " + b.cls }, b.text))
              );
            };
            const parts = alive.map((e) => rowOf(e, false));
            if (dead.length) {
              const deadRows = h(
                "div",
                { class: "space-y-1", style: deadOpen ? "" : "display:none" },
                ...dead.map((e) => rowOf(e, true))
              );
              const toggle2 = h("button", {
                type: "button",
                class: "flex w-full items-center gap-1 rounded-lg p-2 text-left text-ui-xs text-foreground-subtle transition-colors hover:bg-surface-hover",
                onClick: () => {
                  deadOpen = !deadOpen;
                  renderList();
                }
              }, (deadOpen ? "\u25BE " : "\u25B8 ") + L.aliasMigrateDeadSummary.replace("{n}", String(dead.length)));
              parts.push(toggle2, deadRows);
            }
            listEl.replaceChildren(...parts);
          };
          renderList();
          const clearDead = async () => {
            if (running) return;
            const dead = entries.filter((e) => e.state === "missing" || e.state === "deleted");
            if (!dead.length) return;
            running = true;
            goBtn.setAttribute("disabled", "true");
            let ok = 0;
            for (const e of dead) {
              const r = await rpc("/project/alias", { method: "POST", body: { path: e.path, alias: "" } });
              if (r.ok) {
                ok++;
                entries.splice(entries.indexOf(e), 1);
              }
            }
            running = false;
            goBtn.removeAttribute("disabled");
            goBtn.textContent = L.aliasMigrateGo;
            clearConfigCache();
            renderList();
            window.dispatchEvent(new CustomEvent("zcodepro:aliases-changed"));
            if (ok === dead.length) showToast(L.aliasMigrateDeadCleared.replace("{n}", String(ok)));
            else showToast(L.aliasMigrateDeadClearFailed, "error");
          };
          const goBtn = btnPrimary(L.aliasMigrateGo, () => {
            void run();
          }, "min-w-24");
          const run = async () => {
            if (running) return;
            const todo = entries.filter((e) => e.checked);
            if (!todo.length) return;
            running = true;
            goBtn.setAttribute("disabled", "true");
            goBtn.textContent = L.aliasMigrateRunning;
            let ok = 0;
            const failed = [];
            for (let i = 0; i < todo.length; i++) {
              const e = todo[i];
              progressEl.style.display = "";
              progressEl.textContent = L.aliasMigrateProgress.replace("{i}", String(i + 1)).replace("{n}", String(todo.length)).replace("{name}", e.alias);
              e.state = "run";
              renderList();
              try {
                await migrateOne(e.path, e.alias);
                e.state = "ok";
                e.checked = false;
                ok++;
              } catch (err) {
                console.warn("[zcodepro] alias-migrate: " + e.path + " \u5931\u8D25\u4E8E " + (err && err.message));
                e.state = "fail";
                failed.push(e);
              }
              renderList();
            }
            running = false;
            progressEl.style.display = "none";
            goBtn.removeAttribute("disabled");
            goBtn.textContent = L.aliasMigrateGo;
            decide();
            close();
            if (!failed.length) {
              showToast(L.aliasMigrateDone.replace("{n}", String(ok)), "ok");
            } else if (ok) {
              showToast(L.aliasMigratePartial.replace("{n}", String(ok)).replace("{m}", String(failed.length)), "error");
            } else {
              showToast(L.aliasMigrateAllFailed, "error");
            }
          };
          body.append(
            progressEl,
            listEl,
            h("p", { class: "text-ui-xs/relaxed text-foreground-subtle" }, L.aliasMigrateItemHint),
            (() => {
              const footer = document.createElement("div");
              footer.className = "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
              const hasDead = entries.some((e) => e.state === "missing" || e.state === "deleted");
              if (hasDead) {
                const clearBtn = btnSecondary(L.aliasMigrateClearDead, () => {
                  void clearDead().then(() => {
                    if (!entries.some((e) => e.state === "missing" || e.state === "deleted")) clearBtn.style.display = "none";
                  });
                });
                footer.append(clearBtn);
              }
              footer.append(
                btnSecondary(L.aliasMigrateSkip, () => {
                  if (running) return;
                  decide();
                  close();
                }),
                goBtn
              );
              return footer;
            })()
          );
        })();
      }
    });
  }
  function migrationCard() {
    const L = t();
    const card = h("div", {
      class: "flex items-center gap-2 rounded-lg p-2",
      "data-zcodepro-migration-card": ""
    });
    const render = (count) => {
      card.replaceChildren(
        h(
          "div",
          { class: "min-w-0 flex-1" },
          h("div", { class: "text-ui-sm font-medium text-foreground" }, L.aliasMigrateCardName),
          h(
            "div",
            { class: "mt-0.5 text-ui-xs/relaxed text-foreground-subtle" },
            count === null ? "\u2026" : L.aliasMigrateCardDesc.replace("{n}", String(count))
          )
        ),
        btnSmall(L.aliasMigrateRun, () => {
          openMigrationDialog();
        })
      );
    };
    render(null);
    const refresh = async () => {
      const config = await getConfig(true);
      const db = await fetchProjectDb();
      let count = 0;
      for (const [p, a] of Object.entries(config.aliases || {})) {
        if (!String(a || "").trim()) continue;
        const cls = await classifyEntry(p, String(a).trim(), db);
        if (cls.state === "" && !cls.overridden) count++;
      }
      if (!count) {
        card.remove();
        return;
      }
      render(count);
    };
    const onAliasesChanged = () => {
      if (!card.isConnected) {
        window.removeEventListener("zcodepro:aliases-changed", onAliasesChanged);
        return;
      }
      void refresh();
    };
    window.addEventListener("zcodepro:aliases-changed", onAliasesChanged);
    void refresh();
    return card;
  }
  function startAliasMigrationWatcher() {
    if (!officialRenameSupported() && !isNewProjectSidebar()) return;
    void (async () => {
      try {
        const config = await getConfig();
        const hasAliases = Object.values(config.aliases || {}).some((a) => String(a || "").trim());
        if (!hasAliases) return;
        if (config.migrations && config.migrations.aliasRenameDismissed) return;
        await waitFor(() => document.querySelector("section[data-project-id]"), 45e3, "sidebar");
        let focused = false;
        for (let i = 0; i < 600; i++) {
          if (document.visibilityState === "visible" && document.hasFocus()) {
            focused = true;
            break;
          }
          await sleep(500);
        }
        if (!focused) return;
        if (migrateLockFresh()) return;
        await waitFor(() => document.querySelector(".zcodepro-overlay") ? null : true, 12e4, "dialog-busy");
        const fresh = await getConfig(true);
        const still = Object.values(fresh.aliases || {}).some((a) => String(a || "").trim());
        if (still && !(fresh.migrations && fresh.migrations.aliasRenameDismissed)) openMigrationDialog();
      } catch {
      }
    })();
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
    // 引用块上下留白（my-4；代码块同规则）
    codeLineHeight: 1.65,
    // 代码块行高（应用默认 12px 字号 × 20px 行盒）
    tableSpacing: 20,
    // 表格上下边距（未设置时跟随段落间距）
    tableCellPaddingV: 3,
    // 单元格上下边距（应用默认 3px）
    tableCellPaddingH: 3,
    // 单元格左右边距（应用默认 3px）
    lineHeight: 1.75,
    // 回答行高（leading-[1.75]，挂在答案内容容器上）
    thinkingLineHeight: 1.5,
    // 思考行高：“已工作/工作中”过程视图的行距（实测应用默认 1.5；范围见 buildCss 注释）
    userLineHeight: 1.5,
    // 提问行高（用户消息文本容器，默认 normal=1.5）
    contentWidth: null,
    // 内容宽度：默认 100%（跟随应用，不覆盖）
    sidebarProjectSpacing: 20,
    // 侧栏项目间距：项目行视觉间距（行内留白 12 + 边距 8）
    sidebarTaskSpacing: 10,
    // 侧栏任务间距：行内留白加行间边距（py-1 + space-y-0.5）
    uiFont: null,
    // 界面字体：除终端外所有界面文字（null = 跟随应用默认）
    userFont: null,
    // 提问字体：会话中提问内容
    assistantFont: null
    // 回答字体：会话中回答正文（代码块仍用等宽字体）
  };
  var styleEl = null;
  var origFontSans = "";
  var origFontMono = "";
  function captureFontVars() {
    try {
      const cs = getComputedStyle(document.documentElement);
      origFontSans = cs.getPropertyValue("--font-sans").trim();
      origFontMono = cs.getPropertyValue("--font-mono").trim();
    } catch {
    }
  }
  var fontStack = (v) => typeof v === "string" && v.trim() && !/[{};<>\\]/.test(v) ? v.trim() : null;
  var CONV = '[class*="@md/conversation"]';
  var SPECIAL = ':is(ul, ol, blockquote, pre, table, div:has(table), div:has(pre), [class*="code-block"])';
  var SEL_LIST = `${CONV} .space-y-4 > :is(ul, ol)`;
  var SEL_QUOTE = `${CONV} .space-y-4 > :is(blockquote, div:has(pre), [class*="code-block"])`;
  var SEL_TABLE = `${CONV} .space-y-4 > div:has(table)`;
  function buildCss(styles) {
    const parts = [];
    const n = styles.rowGap;
    const rowGapSet = typeof n === "number" && Number.isFinite(n) && n >= 0;
    if (rowGapSet) {
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
        `.history-message.flex.flex-col > * + *:not([data-slot="collapsible-content"]){margin-block-start:${n}px !important;margin-top:${n}px !important;}`,
        // 工具/状态卡片（“N 个文件已更改”等）上方间距下限 8px：
        // 段落间距调到 0 时也不至于贴死（gap 与 margin 在弹性布局里相加）
        `${CONV} .flex.flex-col.gap-5 > [data-slot="collapsible"]{margin-block-start:max(0px, calc(8px - ${n}px)) !important;margin-top:max(0px, calc(8px - ${n}px)) !important;}`
      );
    }
    const own = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : rowGapSet ? n : null;
    const ls = own(styles.listSpacing);
    const qc = own(styles.quoteCodeSpacing);
    const tsp = own(styles.tableSpacing);
    const anySet = ls !== null || qc !== null || tsp !== null;
    if (ls !== null) parts.push(`${SEL_LIST}{margin-block:${ls}px !important;}`);
    if (qc !== null) parts.push(`${SEL_QUOTE}{margin-block:${qc}px !important;}`);
    if (rowGapSet || anySet) {
      parts.push(`${CONV} .space-y-4 > :not(${SPECIAL}){margin-block-end:0 !important;margin-bottom:0 !important;}`);
    }
    if (tsp !== null) {
      parts.push(
        `${SEL_TABLE}{margin-block:${tsp}px !important;}`,
        `${SEL_TABLE} [class*="markdown-table-frame"] > .pointer-events-none.py-1{position:absolute !important;left:0;right:0;bottom:0;}`
      );
    }
    const li = styles.listItemSpacing;
    if (typeof li === "number" && Number.isFinite(li) && li >= 0) {
      parts.push(
        `${CONV} :is(ul, ol) > li{margin-block-end:0 !important;margin-bottom:0 !important;}`,
        `${CONV} :is(ul, ol) > li + li{margin-block-start:${li}px !important;margin-top:${li}px !important;}`
      );
    }
    const clh = styles.codeLineHeight;
    if (typeof clh === "number" && Number.isFinite(clh) && clh >= 0.8) {
      parts.push(
        `${CONV} diffs-container{line-height:${clh} !important;}`,
        `${CONV} pre,${CONV} pre code,${CONV} pre [class*="line"]{line-height:${clh} !important;}`
      );
    }
    const tcv = styles.tableCellPaddingV;
    if (typeof tcv === "number" && Number.isFinite(tcv) && tcv >= 0) {
      parts.push(`${CONV} table :is(td, th){padding-block:${tcv}px !important;padding-top:${tcv}px !important;padding-bottom:${tcv}px !important;}`);
    }
    const tch = styles.tableCellPaddingH;
    if (typeof tch === "number" && Number.isFinite(tch) && tch >= 0) {
      parts.push(`${CONV} table :is(td, th){padding-inline:${tch}px !important;padding-left:${tch}px !important;padding-right:${tch}px !important;}`);
    }
    const lh = styles.lineHeight;
    if (typeof lh === "number" && Number.isFinite(lh) && lh >= 0.8) {
      parts.push(`${CONV} .space-y-4{line-height:${lh} !important;}`);
    }
    const tlh = styles.thinkingLineHeight;
    if (typeof tlh === "number" && Number.isFinite(tlh) && tlh >= 0.8) {
      parts.push(
        `[data-testid^="chat-assistant-history-content"]{line-height:${tlh} !important;}`
      );
    }
    const ulh = styles.userLineHeight;
    if (typeof ulh === "number" && Number.isFinite(ulh) && ulh >= 0.8) {
      parts.push(`${CONV} [class*="user-row"] .whitespace-pre-wrap{line-height:${ulh} !important;}`);
    }
    const cw = styles.contentWidth;
    if (cw && (cw.unit === "px" || cw.unit === "%") && Number.isFinite(cw.value)) {
      parts.push(`[data-v4-timeline-content-column]{max-width:${cw.value}${cw.unit} !important;}`);
    }
    const uif = fontStack(styles.uiFont);
    if (uif) {
      parts.push(`:root{--font-sans:${uif} !important;--font-mono:${uif} !important;}`);
      if (origFontSans && origFontMono) {
        parts.push(`.terminal,.terminal *{--font-sans:${origFontSans};--font-mono:${origFontMono};}`);
      }
    }
    const usf = fontStack(styles.userFont);
    if (usf) {
      parts.push(`${CONV} [class*="user-row"] .whitespace-pre-wrap{font-family:${usf} !important;}`);
    }
    const asf = fontStack(styles.assistantFont);
    if (asf) {
      parts.push(`${CONV} .space-y-4{font-family:${asf} !important;}`);
    }
    const SCROLL = ".flex.flex-1.min-h-0.flex-col.gap-3.overflow-y-auto";
    const sps = styles.sidebarProjectSpacing;
    if (typeof sps === "number" && Number.isFinite(sps) && sps >= 0) {
      const m = Math.min(sps, 8);
      const pad = Math.max(0, Math.round((sps - m) / 2));
      const LIST = '.space-y-2.pb-4:has(div [data-testid^="workspace-item-"])';
      parts.push(
        // 块间边距（应用的 space-y 落在非末尾子块的 margin-block-end 上，同方向覆盖不叠加）
        `${LIST} > :not(:last-child){margin-block-end:${m}px !important;margin-bottom:${m}px !important;}`,
        // 列表底部留白（pb-4）清零：分区间距由 gap 统一给，避免叠加出大空隙
        `${LIST}{padding-bottom:0 !important;}`,
        // 分区间距：外层滚动容器与项目/任务分区所在的 gap-3 容器。
        // 注意不能用嵌套 :has()（:has 里再套 LIST 的 :has）——当前 Chromium 不支持，
        // 整条选择器会被判非法而丢弃；这里用单层 :has 定位 pb-4 列表容器即可
        `${SCROLL}:has(> div .space-y-2.pb-4),.flex.min-h-0.flex-col.gap-3.px-2:has(.space-y-2.pb-4){gap:${m}px !important;row-gap:${m}px !important;}`,
        // 已置顶分区内层 gap-1（标题与列表间）与项目块内层 gap-1（项目行与任务列表间）
        `${SCROLL} .flex.flex-col.gap-1{gap:${m}px !important;row-gap:${m}px !important;}`,
        // 行高压缩：项目行（role=button 的 div，固定 h-8）、分区标题按钮及其 h-7 包装行。
        // 行高随设置压缩，但要留不小于悬停内容的稳定下限（悬停会渲染约 25px 高的
        // 操作按钮组，实际高约 26.2px 含小数，下限需留出余量，行高若随内容伸缩，
        // 行间无空隙时邻居会被推得上下抖动）；
        // box-sizing 为 border-box，min-height 已含上下留白。
        // 文字容器占满行高：否则悬停按钮组（比文字高）入场时行内重新居中，
        // 项目名称会被顶起约 2px
        `${LIST} [data-testid^="workspace-item-"]{height:auto !important;min-height:${28 + 2 * pad}px !important;padding-block:${pad}px !important;padding-top:${pad}px !important;padding-bottom:${pad}px !important;}`,
        `${LIST} [data-testid^="workspace-item-"] > div:first-child{align-self:stretch !important;}`,
        `${SCROLL} [data-slot="collapsible-trigger"],${SCROLL} .flex.h-7{height:auto !important;}`,
        `${SCROLL} [data-slot="collapsible-trigger"]{min-height:${28 + 2 * pad}px !important;padding-block:${pad}px !important;padding-top:${pad}px !important;padding-bottom:${pad}px !important;}`
      );
    }
    const sts = styles.sidebarTaskSpacing;
    if (typeof sts === "number" && Number.isFinite(sts) && sts >= 0) {
      const m = Math.min(sts, 2);
      const pad = Math.max(0, Math.round((sts - m) / 2));
      parts.push(
        `ul.space-y-0\\.5:has(> li[data-task-item-key]) > :not(:last-child){margin-block-end:${m}px !important;margin-bottom:${m}px !important;}`,
        `ul.space-y-0\\.5:has(> li[data-task-item-key]) > li{padding-block:${pad}px !important;padding-top:${pad}px !important;padding-bottom:${pad}px !important;}`,
        `${SCROLL} .flex.flex-col.gap-2{gap:${m}px !important;row-gap:${m}px !important;}`,
        `${SCROLL} div.cursor-pointer[class*="pl-8"]{padding-block:${pad}px !important;padding-top:${pad}px !important;padding-bottom:${pad}px !important;}`
      );
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
    captureFontVars();
    void getConfig().then((cfg) => applyStyles(cfg.styles)).catch(() => {
    });
    window.addEventListener("zcodepro:config-changed", () => {
      void getConfig(true).then((cfg) => applyStyles(cfg.styles)).catch(() => {
      });
    });
  }
  var HL_SELECTORS = {
    rowGap: `${CONV} .space-y-4 > *, ${CONV} .flex.flex-col.gap-5 > *`,
    listSpacing: `${CONV} :is(ul, ol)`,
    listItemSpacing: `${CONV} :is(ul, ol) > li`,
    quoteCodeSpacing: SEL_QUOTE,
    tableSpacing: SEL_TABLE,
    tableCellPaddingV: `${CONV} td, ${CONV} th`,
    tableCellPaddingH: `${CONV} td, ${CONV} th`,
    codeLineHeight: `${CONV} diffs-container, ${CONV} pre`,
    lineHeight: `${CONV} .space-y-4:not([data-reasoning-content] *)`,
    // 思考行高作用在“已工作/工作中”过程视图容器上；视图折叠未挂载时不标
    // （触发行不属此设置范围，不额外描边）
    thinkingLineHeight: `[data-testid^="chat-assistant-history-content"]`,
    userLineHeight: `${CONV} [class*="user-row"] .whitespace-pre-wrap`,
    contentWidth: "[data-v4-timeline-content-column]",
    sidebarProjectSpacing: '[data-testid^="workspace-item-"]',
    sidebarTaskSpacing: "li[data-task-item-key]"
  };
  var HL_MARGIN = {
    rowGap: { sel: `${CONV} .space-y-4 > * + *:not(${SPECIAL}):not(${SPECIAL} + *)`, top: true },
    listSpacing: { sel: SEL_LIST, top: true, bottom: true },
    listItemSpacing: { sel: `${CONV} :is(ul, ol) > li + li`, top: true },
    quoteCodeSpacing: { sel: SEL_QUOTE, top: true, bottom: true },
    tableSpacing: { sel: SEL_TABLE, top: true, bottom: true }
  };
  var HL_AMBER = "rgba(255, 213, 79, 0.5)";
  var hlEl = null;
  function showStyleHighlight(key, value = null) {
    const outlineSel = HL_SELECTORS[key];
    const margin = HL_MARGIN[key];
    if (!outlineSel && !margin) return;
    if (!hlEl || !hlEl.isConnected) {
      hlEl = document.createElement("style");
      hlEl.id = "__zcodepro_hl__";
      (document.head || document.documentElement).append(hlEl);
    }
    const parts = [];
    if (outlineSel) {
      parts.push(`${outlineSel}{box-shadow:inset 0 0 0 0.5px color-mix(in oklab, var(--color-primary, #3b82f6) 65%, transparent) !important;}`);
    }
    if (margin) {
      const v = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
      parts.push(`${margin.sel}{position:relative !important;}`);
      if (margin.top) parts.push(`${margin.sel}::before{content:'' !important;position:absolute;left:0;right:0;bottom:100%;height:${v}px;background:${HL_AMBER};pointer-events:none;}`);
      if (margin.bottom) parts.push(`${margin.sel}::after{content:'' !important;position:absolute;left:0;right:0;top:100%;height:${v}px;background:${HL_AMBER};pointer-events:none;}`);
    }
    hlEl.textContent = parts.join("");
  }
  function hideStyleHighlight() {
    if (hlEl) hlEl.textContent = "";
  }

  // src/inject/features/settings-dialog.js
  function openExternal(url) {
    try {
      void window.zcode.openExternal(url);
    } catch {
    }
  }
  function makeUpgradeControls({ endpoint, metaRefresh, idleText }) {
    const L = t();
    const state = h("span", { class: "min-w-0 flex-1 truncate text-left text-ui-xs/relaxed text-foreground-subtle" });
    const hasIdle = () => typeof idleText === "function";
    const setState = (text, kind = "") => {
      const shown = text || (hasIdle() ? idleText() || "" : "");
      state.textContent = shown ? kind === "error" ? shown : ` \xB7 ${shown}` : "";
      state.className = "min-w-0 flex-1 truncate text-left text-ui-xs/relaxed " + (kind === "error" ? "text-destructive" : "text-foreground-subtle");
    };
    let latest = null;
    let busy = false;
    let timer = null;
    const stopPoll = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const lastLine = (out) => {
      const lines = String(out || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      return lines[lines.length - 1] || "";
    };
    const short = (line) => {
      const v = line.replace(/[.…]{3,}\s*$/, "").trimEnd();
      if (v.length <= 80) return v;
      return v.slice(0, 40) + "\u2026" + v.slice(-39);
    };
    const btn = btnSmall(L.upgradeCheck, () => {
      void runCheck();
    }, "shrink-0");
    const runCancel = async () => {
      const res = await rpc(endpoint, { method: "POST", body: { cancelUpgrade: true } });
      if (!res.ok) showToast(L.failed + ": " + errText(res), "error");
    };
    const runUpgrade = async () => {
      if (busy) return;
      busy = true;
      const res = await rpc(endpoint, { method: "POST", body: { upgrade: true } });
      busy = false;
      if (!res.ok) {
        btn.textContent = L.upgradeNow;
        showToast(L.failed + ": " + errText(res), "error");
        return;
      }
      pollStart();
    };
    const runCheck = async () => {
      if (busy) return;
      if (timer) {
        void runCancel();
        return;
      }
      if (latest) {
        void runUpgrade();
        return;
      }
      busy = true;
      btn.disabled = true;
      setState(L.upgradeChecking);
      const res = await rpc(endpoint, { method: "POST", body: { checkUpdate: true } });
      busy = false;
      btn.disabled = false;
      if (!res.ok) {
        setState(L.upgradeCheckFailed, "error");
        showToast(L.upgradeCheckFailed + ": " + errText(res), "error");
        return;
      }
      if (res.upToDate) {
        latest = null;
        setState(L.upgradeUpToDate.replaceAll("{v}", res.current || ""));
        return;
      }
      latest = res.latest;
      setState(L.upgradeFound.replaceAll("{v}", res.latest || ""));
      btn.textContent = L.upgradeNow;
    };
    const tick2 = async () => {
      const res = await rpc(endpoint + "/upgrade");
      if (!res.ok) {
        stopPoll();
        latest = null;
        busy = false;
        btn.disabled = false;
        btn.textContent = L.upgradeCheck;
        showToast(L.failed + ": " + errText(res), "error");
        return;
      }
      const snap = res.upgrade || {};
      if (snap.running) {
        setState(short(lastLine(snap.output)) || L.upgradeRunning);
        return;
      }
      stopPoll();
      latest = null;
      busy = false;
      btn.disabled = false;
      btn.textContent = L.upgradeCheck;
      if (snap.canceled) {
        setState(L.upgradeStopped);
        return;
      }
      if (snap.error) {
        setState(String(snap.error).split("\n")[0], "error");
        showToast(L.failed + ": " + String(snap.error).split("\n")[0], "error");
        return;
      }
      setState(snap.version ? L.upgradeDone.replaceAll("{v}", snap.version) : L.upgradeFinished);
      showToast(state.textContent, "success");
      await metaRefresh();
    };
    const pollStart = () => {
      stopPoll();
      btn.disabled = false;
      btn.textContent = L.upgradeStop;
      setState(L.upgradeRunning);
      timer = setInterval(() => {
        void tick2();
      }, 1500);
      void tick2();
    };
    void (async () => {
      const res = await rpc(endpoint + "/upgrade");
      if (res.ok && res.upgrade && res.upgrade.running) pollStart();
    })();
    setState("");
    return { btn, state, stop: stopPoll };
  }
  function openSettingsDialog() {
    ensureStyle();
    const L = t();
    let hrUpgradePollStop = null;
    let rtkUpgradePollStop = null;
    openDialog({
      title: L.settingsTitle,
      // 宽度类必须用宿主样式表已有的工具类（注入的类名不会生成 CSS）：
      // sm:max-w-3xl 不存在会失去约束拉满全屏；max-w-3xl=48rem 存在——英文界面
      // 标签栏较长，42rem 会挤出一块空白并触发横向滚动
      width: "max-w-3xl",
      bodyClass: "mt-1",
      overlay: "none",
      draggable: true,
      posKey: "settings",
      dismissOnOutside: false,
      onClose: () => {
        if (hrUpgradePollStop) hrUpgradePollStop();
        if (rtkUpgradePollStop) rtkUpgradePollStop();
      },
      onMount: async ({ body, close, content }) => {
        const titleEl = content && content.firstElementChild;
        if (titleEl && titleEl.tagName === "H2") {
          titleEl.classList.add("flex", "w-full", "items-center", "justify-between");
          const ns2 = "http://www.w3.org/2000/svg";
          const mkIcon = (paths, cls) => {
            const svg = h("svg", {
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              "stroke-width": "2",
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              class: cls
            });
            for (const d of paths) {
              const p2 = document.createElementNS(ns2, "path");
              p2.setAttribute("d", d);
              svg.append(p2);
            }
            return svg;
          };
          const titleLeft = h("span", { class: "flex min-w-0 items-center" }, L.settingsTitle);
          if (typeof window.zcode?.openExternal === "function") {
            const REPO_URL = "https://github.com/duanluan/zcode-pro";
            titleLeft.replaceChildren(
              h("span", {
                class: "cursor-pointer underline-offset-4 hover:underline",
                title: REPO_URL,
                onClick: () => openExternal(REPO_URL)
              }, L.settingsTitle),
              mkIcon(["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"], "ml-1 inline-block size-4 text-foreground-subtle")
            );
          }
          const closeX = h("button", {
            type: "button",
            class: "zcodepro-close",
            title: L.close,
            "aria-label": L.close,
            onMousedown: (e) => {
              e.stopPropagation();
            },
            onClick: () => {
              close();
            }
          }, "\u2715");
          titleEl.replaceChildren(titleLeft, closeX);
        }
        const health = await rpc("/health");
        const config = await getConfig(true);
        const agentsRes = await rpc("/agents");
        const visionRes = await rpc("/vision");
        const titleGenRes = await rpc("/title-gen");
        const titleGenProvidersRes = await rpc("/title-gen/providers");
        const titleGenProviders = titleGenProvidersRes.ok && Array.isArray(titleGenProvidersRes.providers) ? titleGenProvidersRes.providers : [];
        const rtkRes = await rpc("/rtk");
        const headroomRes = await rpc("/headroom");
        const setFeature = async (key, value) => {
          const res = await rpc("/config", { method: "POST", body: { features: { [key]: value } } });
          clearConfigCache();
          window.dispatchEvent(new CustomEvent("zcodepro:config-changed"));
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
          h("span", { class: "text-foreground-subtle/70" }, `${health.version} \xB7 ${HELPER_URL}`)
        );
        const rows = h("div", { class: "divide-y divide-border rounded-xl border border-border" });
        const refreshRows = () => {
          const f = config.features || {};
          rows.replaceChildren(
            ...isNewProjectSidebar() ? [migrationCard()] : [],
            settingRow(L.featureProjectMenu, isNewProjectSidebar() ? L.featureProjectMenuDescNew : L.featureProjectMenuDesc, f.projectMenu !== false, async () => {
              const next = !(f.projectMenu !== false);
              if (await setFeature("projectMenu", next)) f.projectMenu = next;
              refreshRows();
              await refreshAliases();
            }),
            settingRow(L.featureTaskOrder, L.featureTaskOrderDesc, f.taskOrder !== false, async () => {
              const next = !(f.taskOrder !== false);
              if (await setFeature("taskOrder", next)) f.taskOrder = next;
              refreshRows();
            }),
            settingRow(L.featureSessionSwitch, L.featureSessionSwitchDesc, f.sessionSwitch !== false, async () => {
              const next = !(f.sessionSwitch !== false);
              if (await setFeature("sessionSwitch", next)) f.sessionSwitch = next;
              refreshRows();
            }),
            settingRow(L.featureTitleLock, L.featureTitleLockDesc, f.titleLock !== false, async () => {
              const next = !(f.titleLock !== false);
              if (await setFeature("titleLock", next)) f.titleLock = next;
              refreshRows();
            }),
            settingRow(L.featurePinnedCollapse, L.featurePinnedCollapseDesc, f.pinnedCollapse !== false, async () => {
              const next = !(f.pinnedCollapse !== false);
              if (await setFeature("pinnedCollapse", next)) f.pinnedCollapse = next;
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
            settingRow(L.featureWsRunning, L.featureWsRunningDesc, f.wsRunningSpin !== false, async () => {
              const next = !(f.wsRunningSpin !== false);
              if (await setFeature("wsRunningSpin", next)) f.wsRunningSpin = next;
              refreshRows();
            }),
            settingRow(L.featurePinnedExpand, L.featurePinnedExpandDesc, f.pinnedKeepCollapsed !== false, async () => {
              const next = !(f.pinnedKeepCollapsed !== false);
              if (await setFeature("pinnedKeepCollapsed", next)) f.pinnedKeepCollapsed = next;
              refreshRows();
            }),
            settingRow(L.featureAutoUpdatePlugins, L.featureAutoUpdatePluginsDesc, f.autoUpdatePlugins === true, async () => {
              const next = !(f.autoUpdatePlugins === true);
              if (await setFeature("autoUpdatePlugins", next)) f.autoUpdatePlugins = next;
              refreshRows();
            })
          );
        };
        refreshRows();
        const WECHAT_ID = "ai4only";
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
        const communityCard = (title, desc, icon, onClick) => h(
          "div",
          {
            class: "flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-border p-2 transition-colors hover:bg-surface-hover",
            onClick
          },
          h(
            "div",
            { class: "min-w-0" },
            h("div", { class: "truncate text-ui-sm font-medium text-foreground" }, title),
            h("div", { class: "mt-0.5 truncate text-ui-xs/relaxed text-foreground-subtle" }, desc)
          ),
          icon()
        );
        const communityCards = h(
          "div",
          { class: "mt-3 grid grid-cols-2 gap-2" },
          ...typeof window !== "undefined" && typeof window.zcode?.openExternal === "function" ? [communityCard(L.qqGroupTitle, L.qqGroupDesc, extIcon, () => openExternal("https://qm.qq.com/q/WXuISJK3ug"))] : [],
          communityCard(
            L.wechatGroupTitle,
            L.wechatGroupDesc.replaceAll("{id}", WECHAT_ID),
            () => hCopyIcon("size-4 shrink-0 text-foreground-subtle"),
            async () => {
              if (await copyToClipboard(WECHAT_ID)) showToast(L.wechatIdCopied);
            }
          )
        );
        let activeTab = "features";
        const pluginsStatusLine = h("span", { class: "text-ui-xs/relaxed text-foreground-subtle" }, "\u2026");
        const pluginsBtn = btnSmall(L.pluginsCheckNow, () => {
          void runPluginsUpdate();
        });
        const runPluginsUpdate = async () => {
          pluginsBtn.disabled = true;
          pluginsStatusLine.textContent = L.pluginsUpdating;
          const res = await rpc("/plugins/update", { method: "POST", body: {} });
          pluginsBtn.disabled = false;
          if (!res.ok) {
            pluginsStatusLine.textContent = "";
            showToast(L.pluginsUpdateFailed + ": " + errText(res), "error");
            return;
          }
          pluginsStatusLine.textContent = res.updated > 0 ? L.pluginsUpdatedDone.replaceAll("{n}", String(res.updated)) : L.pluginsUpToDate;
          showToast(pluginsStatusLine.textContent, "success");
        };
        void (async () => {
          const res = await rpc("/plugins/status");
          if (!res.ok) {
            pluginsStatusLine.textContent = "";
            return;
          }
          pluginsStatusLine.textContent = (res.updates || []).length > 0 ? L.pluginsUpdatesFound.replaceAll("{n}", String(res.updates.length)) : L.pluginsUpToDate;
        })();
        const PLUGINS_REPO_URL = "https://github.com/duanluan/zcode-plugins";
        const repoName = "zcode-plugins";
        const titleParts = L.pluginsUpdateTitle.split(repoName);
        const pluginsTitle = h("div", { class: "truncate text-ui-sm font-medium text-foreground" });
        if (titleParts.length === 2 && typeof window.zcode?.openExternal === "function") {
          pluginsTitle.append(
            titleParts[0],
            h("span", {
              class: "cursor-pointer underline-offset-4 hover:underline",
              title: PLUGINS_REPO_URL,
              onClick: () => openExternal(PLUGINS_REPO_URL)
            }, repoName),
            titleParts[1]
          );
        } else {
          pluginsTitle.append(L.pluginsUpdateTitle);
        }
        const pluginsCard = h(
          "div",
          { class: "mt-3 flex items-center justify-between gap-2 rounded-xl border border-border p-2" },
          h(
            "div",
            { class: "min-w-0" },
            pluginsTitle,
            h("div", { class: "mt-0.5 truncate text-ui-xs/relaxed text-foreground-subtle" }, pluginsStatusLine)
          ),
          pluginsBtn
        );
        const paneFeatures = h(
          "div",
          { role: "tabpanel", class: "mt-4" },
          h("div", {}, rows),
          pluginsCard,
          communityCards
        );
        const paneStyles = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const panePerf = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneAgents = h("div", { role: "tabpanel", class: "mt-2", style: "display:none" });
        const paneProxy = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneSync = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneVision = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneRtk = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneHeadroom = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneTitleGen = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneDebug = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const panes = { features: paneFeatures, styles: paneStyles, perf: panePerf, agents: paneAgents, proxy: paneProxy, sync: paneSync, vision: paneVision, headroom: paneHeadroom, rtk: paneRtk, debug: paneDebug };
        const tabDefs = [
          ["features", L.tabFeatures],
          ["agents", L.tabBehavior],
          ["styles", L.tabStyles],
          ["perf", L.tabPerformance],
          ["proxy", L.tabProxy],
          ["sync", L.tabSync],
          ["vision", L.tabVision],
          ["headroom", L.tabHeadroom],
          ["rtk", L.tabRtk],
          // “调试”标签页只对开发模式生效的用户显示（配置开关或 ZCODEPRO_DEV=1），
          // 普通用户不可见
          ...config.devMode === true || config.devActive === true ? [["debug", L.tabDebug]] : []
        ];
        const tablist = h("div", { role: "tablist", "aria-orientation": "horizontal", class: "zcodepro-tablist mt-1" });
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
        const bindHighlight = (field, key) => {
          field.el.addEventListener("focus", () => showStyleHighlight(key, field.get()));
          field.el.addEventListener("blur", () => hideStyleHighlight());
        };
        const styleCell = (name, tip, key, { min = 0, max = 48, step = 1, unit = "px" } = {}) => {
          const field = numberField({
            value: typeof savedStyles[key] === "number" ? savedStyles[key] : null,
            fallback: STYLE_DEFAULTS[key],
            min,
            max,
            step,
            onCommit: (v) => {
              persistStyles({ [key]: v });
              showStyleHighlight(key, v);
            }
          });
          bindHighlight(field, key);
          return {
            field,
            el: h(
              "div",
              { class: "flex items-center justify-between gap-2 p-2" },
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
        bindHighlight(widthField, "contentWidth");
        const widthCell = {
          field: widthField,
          el: h(
            "div",
            { class: "flex items-center justify-between gap-2 p-2" },
            h("span", { class: "min-w-0 truncate text-ui-sm font-medium text-foreground", title: L.contentWidthDesc }, L.contentWidthName),
            widthField.el
          )
        };
        const cellPadField = (key) => numberField({
          value: typeof savedStyles[key] === "number" ? savedStyles[key] : null,
          fallback: STYLE_DEFAULTS[key],
          min: 0,
          max: 24,
          step: 1,
          onCommit: (v) => {
            persistStyles({ [key]: v });
            showStyleHighlight(key, v);
          }
        });
        const cellPadV = cellPadField("tableCellPaddingV");
        const cellPadH = cellPadField("tableCellPaddingH");
        bindHighlight(cellPadV, "tableCellPaddingV");
        bindHighlight(cellPadH, "tableCellPaddingH");
        const cellPadCell = {
          field: { reset() {
            cellPadV.reset();
            cellPadH.reset();
          } },
          el: h(
            "div",
            { class: "flex items-center justify-between gap-2 p-2" },
            h("span", { class: "min-w-0 truncate text-ui-sm font-medium text-foreground", title: L.tableCellPaddingDesc }, L.tableCellPaddingName),
            h(
              "span",
              { class: "flex shrink-0 items-center gap-1" },
              cellPadV.el,
              h("span", { class: "text-ui-xs text-foreground-subtle" }, "/"),
              cellPadH.el,
              h("span", { class: "w-3 text-ui-xs text-foreground-subtle" }, "px")
            )
          )
        };
        const cells = [
          styleCell(L.sidebarProjectSpacingName, L.sidebarProjectSpacingDesc, "sidebarProjectSpacing", { max: 24 }),
          styleCell(L.sidebarTaskSpacingName, L.sidebarTaskSpacingDesc, "sidebarTaskSpacing", { max: 24 }),
          widthCell,
          styleCell(L.rowGapName, L.rowGapDesc, "rowGap"),
          styleCell(L.userLineHeightName, L.userLineHeightDesc, "userLineHeight", { min: 1, max: 3, step: 0.05, unit: "x" }),
          styleCell(L.lineHeightName, L.lineHeightDesc, "lineHeight", { min: 1, max: 3, step: 0.05, unit: "x" }),
          styleCell(L.thinkingLineHeightName, L.thinkingLineHeightDesc, "thinkingLineHeight", { min: 1, max: 3, step: 0.05, unit: "x" }),
          styleCell(L.codeLineHeightName, L.codeLineHeightDesc, "codeLineHeight", { min: 1, max: 3, step: 0.05, unit: "x" }),
          styleCell(L.listSpacingName, L.listSpacingDesc, "listSpacing"),
          styleCell(L.listItemSpacingName, L.listItemSpacingDesc, "listItemSpacing"),
          styleCell(L.quoteCodeSpacingName, L.quoteCodeSpacingDesc, "quoteCodeSpacing"),
          styleCell(L.tableSpacingName, L.tableSpacingDesc, "tableSpacing"),
          cellPadCell
        ];
        const toolbarSwitchWrap = h("div");
        const renderToolbarSwitch = () => {
          const f = config.features || {};
          toolbarSwitchWrap.replaceChildren(settingRow(L.featureToolbarIcons, L.featureToolbarIconsDesc, f.toolbarIcons !== false, async () => {
            const next = !(f.toolbarIcons !== false);
            if (await setFeature("toolbarIcons", next)) f.toolbarIcons = next;
            renderToolbarSwitch();
          }));
        };
        const fontSelectCls = "h-8 w-full min-w-0 flex-1 rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";
        const FONT_FALLBACK = ["\u971E\u9E5C\u6587\u6977 \u5C4F\u5E55\u9605\u8BFB\u7248", "\u971E\u9E5C\u65B0\u6670\u9ED1 \u5C4F\u5E55\u9605\u8BFB\u7248", "Noto Sans CJK SC", "Noto Serif CJK SC", "Noto Sans Mono CJK SC", "\u6587\u6CC9\u9A7F\u5FAE\u7C73\u9ED1", "\u6587\u6CC9\u9A7F\u7B49\u5BBD\u5FAE\u7C73\u9ED1", "JetBrains Mono", "Fira Code", "Cascadia Mono", "DejaVu Sans", "DejaVu Serif", "DejaVu Sans Mono", "Liberation Mono", "Consolas", "Menlo", "SF Mono", "PingFang SC", "Microsoft YaHei", "SimSun", "KaiTi", "FangSong"];
        const fontCell = (name, tip, key) => {
          const saved = typeof savedStyles[key] === "string" ? savedStyles[key].trim() : "";
          const sel = h(
            "select",
            { class: fontSelectCls, title: tip },
            h("option", { value: "" }, L.defaultValue)
          );
          if (saved) sel.append(h("option", { value: saved }, saved));
          sel.value = saved;
          sel.addEventListener("change", () => persistStyles({ [key]: sel.value || null }));
          return {
            field: { reset() {
              sel.value = "";
            } },
            el: h(
              "div",
              { class: "flex items-center justify-between gap-2 p-2" },
              h("span", { class: "w-24 shrink-0 truncate text-ui-sm font-medium text-foreground", title: tip }, name),
              sel
            ),
            setOptions(families) {
              const cur = sel.value;
              const opts = [h("option", { value: "" }, L.defaultValue)];
              if (cur && !families.includes(cur)) opts.push(h("option", { value: cur }, cur));
              for (const fam of families) {
                const opt = h("option", { value: fam }, fam);
                opt.style.fontFamily = fam;
                opts.push(opt);
              }
              sel.replaceChildren(...opts);
              sel.value = cur;
            }
          };
        };
        const fontCells = [
          fontCell(L.uiFontName, L.uiFontDesc, "uiFont"),
          fontCell(L.userFontName, L.userFontDesc, "userFont"),
          fontCell(L.assistantFontName, L.assistantFontDesc, "assistantFont")
        ];
        void (async () => {
          let families = null;
          try {
            if (typeof window.queryLocalFonts === "function") {
              const fonts = await window.queryLocalFonts();
              families = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b, "zh"));
            }
          } catch {
          }
          const list = ["sans-serif", "serif", "monospace", ...families || FONT_FALLBACK];
          for (const c of fontCells) c.setOptions(list);
        })();
        renderToolbarSwitch();
        paneStyles.append(
          toolbarSwitchWrap,
          h(
            "div",
            { class: "mt-2 flex flex-col gap-0.5 rounded-xl border border-border p-1" },
            ...fontCells.map((c) => h("div", { class: "rounded-lg transition-colors hover:bg-surface-hover" }, c.el))
          ),
          h(
            "div",
            { class: "mt-2 grid grid-cols-2 gap-2 rounded-xl border border-border p-1" },
            ...cells.map((c) => h("div", { class: "rounded-lg transition-colors hover:bg-surface-hover" }, c.el))
          ),
          h(
            "div",
            { class: "mt-2 flex justify-end" },
            btnSmall(L.resetDefault, () => {
              for (const c of [...cells, ...fontCells]) c.field.reset();
              persistStyles(Object.fromEntries(Object.keys(STYLE_DEFAULTS).map((k) => [k, null])));
            })
          )
        );
        const agentsArea = h("textarea", {
          class: "zcodepro-textarea zcodepro-textarea-lg",
          placeholder: L.agentsPlaceholder,
          spellcheck: "false"
        });
        const agentsSaveBtn = btnSmall(L.agentsSave, () => {
          void saveAgents();
        }, "", "primary");
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
        const agentsPromptPane = h("div", { class: "mt-4" });
        agentsPromptPane.append(
          h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.agentsDesc),
          ...agentsFailed ? [h("p", { class: "mt-2 text-ui-sm text-destructive" }, L.agentsLoadFailed + ": " + errText(agentsRes))] : [],
          h("div", { class: "mt-3" }, agentsArea),
          h("div", { class: "mt-3 flex justify-end" }, agentsSaveBtn)
        );
        let agentsSubTab = "prompt";
        const agentsSubPanes = { prompt: agentsPromptPane, titleGen: paneTitleGen };
        const agentsSubList = h("div", { role: "tablist", "aria-orientation": "horizontal", class: "zcodepro-tablist" });
        const renderAgentsSubTabs = () => {
          agentsSubList.replaceChildren(...[
            ["prompt", L.tabAgents],
            ["titleGen", L.tabTitleGen]
          ].map(([id, label]) => h("button", {
            type: "button",
            role: "tab",
            class: "zcodepro-tab",
            "aria-selected": String(agentsSubTab === id),
            "data-state": agentsSubTab === id ? "active" : "inactive",
            onClick: () => {
              agentsSubTab = id;
              for (const [pid, pane] of Object.entries(agentsSubPanes)) pane.style.display = pid === id ? "" : "none";
              renderAgentsSubTabs();
            }
          }, label)));
        };
        for (const [pid, pane] of Object.entries(agentsSubPanes)) pane.style.display = pid === agentsSubTab ? "" : "none";
        renderAgentsSubTabs();
        paneAgents.append(agentsSubList, agentsPromptPane, paneTitleGen);
        const savedProxy = typeof config.proxy === "string" ? config.proxy : "";
        const proxyInputCls = "h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";
        const proxyInput = h("input", { type: "text", value: savedProxy, placeholder: L.proxyPlaceholder, spellcheck: "false", class: proxyInputCls + " min-w-0 flex-1" });
        const proxySaveBtn = btnSmall(L.proxySave, () => {
          void saveProxy();
        }, "shrink-0", "primary");
        let proxyOriginal = savedProxy;
        proxySaveBtn.disabled = true;
        proxyInput.addEventListener("input", () => {
          proxySaveBtn.disabled = proxyInput.value.trim() === proxyOriginal;
        });
        const saveProxy = async () => {
          proxySaveBtn.disabled = true;
          const res = await rpc("/config", { method: "POST", body: { proxy: proxyInput.value.trim() } });
          if (res.ok) {
            proxyOriginal = res.config && typeof res.config.proxy === "string" ? res.config.proxy : proxyInput.value.trim();
            proxyInput.value = proxyOriginal;
            showToast(L.proxySaved);
          } else {
            proxySaveBtn.disabled = false;
            showToast(L.failed + ": " + errText(res), "error");
          }
        };
        const proxyTestState = h("p", { class: "mt-2 text-ui-xs/relaxed text-foreground-subtle" });
        let proxyTesting = false;
        const proxyTestBtn = btnSmall(L.proxyTest, () => {
          void runProxyTest();
        }, "shrink-0");
        const runProxyTest = async () => {
          if (proxyTesting) return;
          if (!proxyInput.value.trim()) {
            proxyTestState.className = "mt-2 text-ui-xs/relaxed text-amber-500";
            proxyTestState.textContent = L.proxyTestEmpty;
            return;
          }
          proxyTesting = true;
          proxyTestBtn.disabled = true;
          proxyTestBtn.textContent = L.proxyTesting;
          proxyTestState.textContent = "";
          proxyTestState.className = "mt-2 text-ui-xs/relaxed text-foreground-subtle";
          const res = await rpc("/proxy/test", { method: "POST", body: { proxy: proxyInput.value.trim() } });
          proxyTesting = false;
          proxyTestBtn.disabled = false;
          proxyTestBtn.textContent = L.proxyTest;
          if (!res.ok) {
            proxyTestState.className = "mt-2 text-ui-xs/relaxed text-destructive";
            proxyTestState.textContent = L.proxyTestFailed + ": " + errText(res);
            return;
          }
          const parts = (res.targets || []).map((t2) => `${t2.name} ${t2.ok ? "\u2713 " + (t2.ms != null ? t2.ms + "ms" : "") : "\u2717 " + (t2.error || t2.httpCode || "")}`.trim());
          const allOk = (res.targets || []).length > 0 && (res.targets || []).every((t2) => t2.ok);
          proxyTestState.className = "mt-2 text-ui-xs/relaxed " + (allOk ? "text-foreground-subtle" : "text-amber-500");
          proxyTestState.textContent = `${res.proxy}\uFF1A${parts.join(" \xB7 ")}`;
        };
        const persistProxyScope = async (partial) => {
          const res = await rpc("/config", { method: "POST", body: { proxyScopes: partial } });
          if (!res.ok) {
            showToast(L.failed + ": " + errText(res), "error");
            return false;
          }
          if (res.config && res.config.proxyScopes) config.proxyScopes = res.config.proxyScopes;
          return true;
        };
        const proxyScopeWrap = h("div");
        const renderProxyScopes = () => {
          const sc = config.proxyScopes || {};
          proxyScopeWrap.replaceChildren(
            settingRow(L.proxyScopePlugins, L.proxyScopePluginsDesc, sc.plugins !== false, async () => {
              const next = !(sc.plugins !== false);
              if (await persistProxyScope({ plugins: next })) sc.plugins = next;
              renderProxyScopes();
            }),
            settingRow(L.proxyScopeDeps, L.proxyScopeDepsDesc, sc.deps !== false, async () => {
              const next = !(sc.deps !== false);
              if (await persistProxyScope({ deps: next })) sc.deps = next;
              renderProxyScopes();
            }),
            settingRow(L.proxyScopeSync, L.proxyScopeSyncDesc, sc.sync === true, async () => {
              const next = !(sc.sync === true);
              if (await persistProxyScope({ sync: next })) sc.sync = next;
              renderProxyScopes();
            })
          );
        };
        renderProxyScopes();
        paneProxy.append(
          h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.proxyDesc),
          h(
            "div",
            { class: "mt-3 flex items-center gap-2" },
            proxyInput,
            proxySaveBtn,
            proxyTestBtn
          ),
          h("p", { class: "mt-2 text-ui-xs/relaxed text-foreground-subtle" }, L.proxyHint),
          proxyTestState,
          h("div", { class: "mt-3 divide-y divide-border rounded-xl border border-border" }, proxyScopeWrap)
        );
        const perfToggleWrap = h("div");
        const renderPerfToggle = () => {
          const f = config.features || {};
          perfToggleWrap.replaceChildren(
            settingRow(L.featureIdleReclaim, L.featureIdleReclaimDesc, f.idleReclaim !== false, async () => {
              const next = !(f.idleReclaim !== false);
              if (await setFeature("idleReclaim", next)) f.idleReclaim = next;
              renderPerfToggle();
            })
          );
        };
        renderPerfToggle();
        const perfNumberRow = (labelText, tip, key, fallback, min) => {
          const v = Number(config[key]);
          return h(
            "div",
            { class: "flex items-center justify-between gap-2 px-2 py-1.5" },
            h(
              "div",
              { class: "min-w-0" },
              h("div", { class: "text-ui-sm font-medium text-foreground" }, labelText),
              ...tip ? [h("div", { class: "mt-0.5 text-ui-xs/relaxed text-foreground-subtle" }, tip)] : []
            ),
            h(
              "div",
              { class: "flex shrink-0 items-center gap-1" },
              numberField({
                value: Number.isFinite(v) ? v : fallback,
                fallback,
                min,
                max: 1440,
                step: 1,
                onCommit: async (n) => {
                  const res = await rpc("/config", { method: "POST", body: { [key]: n } });
                  if (res.ok && res.config) {
                    config[key] = res.config[key];
                    clearConfigCache();
                  }
                }
              }).el,
              h("span", { class: "text-ui-xs text-foreground-subtle" }, L.idleReclaimUnit)
            )
          );
        };
        panePerf.append(
          h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.perfDesc),
          h(
            "div",
            { class: "mt-3 divide-y divide-border rounded-xl border border-border" },
            perfToggleWrap,
            perfNumberRow(L.idleReclaimMinutesLabel, null, "idleReclaimMinutes", 30, 1),
            perfNumberRow(L.idleReclaimStartupLabel, L.idleReclaimStartupHint, "idleReclaimStartupMinutes", 5, 0)
          )
        );
        const savedSync = config.sync && typeof config.sync === "object" ? config.sync : { url: "", dir: "zcode-pro", login: "", password: "", include: { zcodepro: true, model: true }, lastPushAt: null, lastPullAt: null };
        const syncInputBase = "h-8 rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";
        const syncInputCls = syncInputBase + " w-full";
        const syncLabel = (text) => h("span", { class: "w-20 shrink-0 text-ui-sm font-medium text-foreground" }, text);
        const syncFormRow = (labelText, node) => h(
          "div",
          { class: "flex items-center gap-3 px-2 py-1.5" },
          syncLabel(labelText),
          node
        );
        const syncUrlInput = h("input", { type: "text", value: savedSync.url || "", placeholder: L.syncUrlPlaceholder, spellcheck: "false", autocomplete: "off", class: syncInputCls + " min-w-0 flex-1" });
        const syncDirInput = h("input", { type: "text", value: savedSync.dir || "zcode-pro", placeholder: L.syncDirPlaceholder, spellcheck: "false", autocomplete: "off", class: syncInputCls + " min-w-0 flex-1" });
        const syncLoginInput = h("input", { type: "text", value: savedSync.login || "", spellcheck: "false", autocomplete: "off", class: syncInputCls + " min-w-0 flex-1" });
        const syncPasswordInput = h("input", { type: "password", value: savedSync.password || "", autocomplete: "new-password", class: syncInputCls + " min-w-0 flex-1" });
        const syncHistoryInput = h("input", {
          type: "number",
          min: "0",
          max: "100",
          step: "1",
          value: Number.isInteger(savedSync.historyLimit) ? savedSync.historyLimit : 10,
          title: L.syncHistoryLimitHint,
          class: syncInputBase + " w-20 shrink-0 text-center"
        });
        const syncHistoryValue = () => {
          const s = syncHistoryInput.value.trim();
          if (!s) return 10;
          const n = Number(s);
          return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 10;
        };
        let syncFormOriginal = null;
        const syncSaveBtn = btnSmall(L.syncSave, () => {
          void saveSyncForm();
        }, "shrink-0", "primary");
        const syncFormValues = () => ({
          url: syncUrlInput.value.trim(),
          dir: syncDirInput.value.trim(),
          login: syncLoginInput.value.trim(),
          password: syncPasswordInput.value,
          historyLimit: syncHistoryValue()
        });
        const syncCheckDirty = () => {
          const c = syncFormValues();
          syncSaveBtn.disabled = c.url === syncFormOriginal.url && c.dir === syncFormOriginal.dir && c.login === syncFormOriginal.login && c.password === syncFormOriginal.password && c.historyLimit === syncFormOriginal.historyLimit;
        };
        syncFormOriginal = syncFormValues();
        syncSaveBtn.disabled = true;
        for (const el of [syncUrlInput, syncDirInput, syncLoginInput, syncPasswordInput, syncHistoryInput]) {
          el.addEventListener("input", syncCheckDirty);
        }
        const saveSyncForm = async () => {
          syncSaveBtn.disabled = true;
          const res = await rpc("/sync", { method: "POST", body: { sync: syncFormValues() } });
          if (res.ok) {
            syncFormOriginal = {
              url: res.sync.url,
              dir: res.sync.dir,
              login: res.sync.login,
              password: res.sync.password,
              historyLimit: Number.isInteger(res.sync.historyLimit) ? res.sync.historyLimit : 10
            };
            syncUrlInput.value = res.sync.url;
            syncDirInput.value = res.sync.dir;
            syncLoginInput.value = res.sync.login;
            syncPasswordInput.value = res.sync.password;
            syncHistoryInput.value = syncFormOriginal.historyLimit;
            showToast(L.syncSaved);
          } else {
            showToast(L.failed + ": " + errText(res), "error");
            syncCheckDirty();
          }
        };
        const syncTestState = h("p", { class: "mt-2 text-ui-xs/relaxed text-foreground-subtle" });
        let syncTesting = false;
        const syncTestBtn = btnSmall(L.syncTest, () => {
          void runSyncTest();
        }, "shrink-0");
        const runSyncTest = async () => {
          if (syncTesting) return;
          if (!syncUrlInput.value.trim()) {
            syncTestState.className = "mt-2 text-ui-xs/relaxed text-amber-500";
            syncTestState.textContent = L.syncTestEmpty;
            return;
          }
          syncTesting = true;
          syncTestBtn.disabled = true;
          syncTestBtn.textContent = L.syncTesting;
          syncTestState.textContent = "";
          syncTestState.className = "mt-2 text-ui-xs/relaxed text-foreground-subtle";
          const res = await rpc("/sync/test", { method: "POST", body: { sync: syncFormValues() } });
          syncTesting = false;
          syncTestBtn.disabled = false;
          syncTestBtn.textContent = L.syncTest;
          if (!res.ok) {
            syncTestState.className = "mt-2 text-ui-xs/relaxed text-destructive";
            syncTestState.textContent = L.syncTestFailed + ": " + errText(res);
            return;
          }
          const stepName = { connect: L.syncTestStepConnect, dir: L.syncTestStepDir, list: L.syncTestStepList };
          const parts = (res.targets || []).map((t2) => `${stepName[t2.step] || t2.step} ${t2.ok ? "\u2713" + (t2.ms != null ? " " + t2.ms + "ms" : "") : "\u2717 " + (t2.error || t2.httpCode || "")}`.trim());
          const allOk = (res.targets || []).length > 0 && (res.targets || []).every((t2) => t2.ok);
          let host = syncUrlInput.value.trim();
          try {
            host = new URL(host).host;
          } catch {
          }
          syncTestState.className = "mt-2 text-ui-xs/relaxed " + (allOk ? "text-foreground-subtle" : "text-amber-500");
          syncTestState.textContent = `${host}\uFF1A${parts.join(" \xB7 ")}` + (allOk && res.fileCount != null ? `\uFF08${L.syncTestFilesFound.replace("{n}", res.fileCount)}\uFF09` : "");
        };
        const JIANGUO_HELP = "https://help.jianguoyun.com/?p=2064";
        const syncRecLine = h("p", { class: "mt-1 text-ui-xs/relaxed text-foreground-subtle" });
        if (typeof window.zcode?.openExternal === "function") {
          syncRecLine.append(
            h("span", {
              class: "cursor-pointer underline-offset-4 hover:underline",
              title: JIANGUO_HELP,
              onClick: () => openExternal(JIANGUO_HELP)
            }, L.syncRecLink),
            L.syncRecSuffix
          );
        } else {
          syncRecLine.textContent = L.syncRecLink + L.syncRecSuffix;
        }
        const persistSyncInclude = async (partial) => {
          const res = await rpc("/sync", { method: "POST", body: { include: partial } });
          if (!res.ok) showToast(L.failed + ": " + errText(res), "error");
          return res.ok;
        };
        const syncIncludeWrap = h("div");
        const renderSyncInclude = () => {
          const inc = savedSync.include || {};
          syncIncludeWrap.replaceChildren(
            settingRow(L.syncIncludeZcp, L.syncIncludeZcpDesc, inc.zcodepro !== false, async () => {
              const next = !(inc.zcodepro !== false);
              if (await persistSyncInclude({ zcodepro: next })) inc.zcodepro = next;
              renderSyncInclude();
            }),
            settingRow(L.syncIncludeModel, L.syncIncludeModelDesc, inc.model !== false, async () => {
              const next = !(inc.model !== false);
              if (await persistSyncInclude({ model: next })) inc.model = next;
              renderSyncInclude();
            })
          );
        };
        renderSyncInclude();
        const fmtSyncTime = (ts) => ts ? new Date(ts).toLocaleString() : L.syncNever;
        const syncStatusLine = h("div", { class: "text-ui-xs/relaxed text-foreground-subtle" });
        const renderSyncStatus = (s) => {
          syncStatusLine.textContent = `${L.syncLastPush} ${fmtSyncTime(s.lastPushAt)} \xB7 ${L.syncLastPull} ${fmtSyncTime(s.lastPullAt)}`;
        };
        renderSyncStatus(savedSync);
        const syncUploadBtn = btnSmall(L.syncUpload, () => {
          void runSyncPush();
        }, "shrink-0", "primary");
        const syncDownloadBtn = btnSmall(L.syncDownload, () => {
          openSyncVersionPicker();
        }, "shrink-0");
        const openSyncVersionPicker = () => {
          openDialog({
            title: L.syncPickTitle,
            description: L.syncPickDesc,
            width: "max-w-2xl",
            dismissOnOutside: false,
            onMount: async ({ body: pickBody, content: content2, close: closePicker }) => {
              const titleEl2 = content2 && content2.firstElementChild;
              if (titleEl2 && titleEl2.tagName === "H2") {
                titleEl2.classList.add("flex", "w-full", "items-center", "justify-between");
                titleEl2.replaceChildren(
                  h("span", { class: "flex min-w-0 items-center" }, L.syncPickTitle),
                  h("button", {
                    type: "button",
                    class: "zcodepro-close",
                    title: L.close,
                    "aria-label": L.close,
                    onMousedown: (e) => {
                      e.stopPropagation();
                    },
                    onClick: () => {
                      closePicker();
                    }
                  }, "\u2715")
                );
              }
              const listWrap = h("div", { class: "space-y-1" });
              pickBody.append(listWrap);
              const fmtSize = (n) => {
                if (!Number.isFinite(n) || n <= 0) return "";
                return n >= 1048576 ? (n / 1048576).toFixed(2) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
              };
              const setStatus = (el) => {
                listWrap.replaceChildren(el);
              };
              const setRowBusy = (btns, busy) => {
                for (const b of btns) b.disabled = busy;
              };
              const versionRow = (f) => {
                const isLatest = !/-\d{4}-\d{2}-\d{2}T/.test(f.name);
                const importBtn = btnSmall(L.syncVerImport, () => {
                  confirmImport(f, rowBtns, importBtn);
                }, "shrink-0");
                const deleteBtn = btnSmall(L.syncVerDelete, () => {
                  confirmDelete(f, rowBtns, isLatest);
                }, "shrink-0");
                const saveBtn = btnSmall(L.syncVerSave, () => {
                  void exportVersion(f, rowBtns, saveBtn);
                }, "shrink-0");
                const rowBtns = [importBtn, deleteBtn, saveBtn];
                return h(
                  "div",
                  { class: "flex items-center gap-3 rounded-xl border border-border px-3 py-2" },
                  h(
                    "div",
                    { class: "min-w-0 flex-1" },
                    h(
                      "div",
                      { class: "flex min-w-0 items-center gap-1.5" },
                      h("span", { class: "truncate font-mono text-ui-xs text-foreground", title: f.name }, f.name),
                      ...isLatest ? [h("span", { class: "shrink-0 rounded border border-border px-1.5 text-ui-xs text-foreground-subtle" }, L.syncVerLatest)] : []
                    ),
                    h(
                      "div",
                      { class: "mt-0.5 text-ui-xs/relaxed text-foreground-subtle" },
                      [fmtSize(f.size), f.lastModified ? new Date(f.lastModified).toLocaleString() : ""].filter(Boolean).join(" \xB7 ")
                    )
                  ),
                  h("div", { class: "flex shrink-0 items-center gap-1.5" }, importBtn, deleteBtn, saveBtn)
                );
              };
              const loadList = async () => {
                setStatus(h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.syncPickLoading));
                const res = await rpc("/sync/versions", { method: "POST", body: {} });
                if (!res.ok) {
                  setStatus(h("p", { class: "text-ui-sm text-destructive" }, L.failed + ": " + errText(res)));
                  return;
                }
                const files = res.files || [];
                if (!files.length) {
                  setStatus(h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.syncPickEmpty));
                  return;
                }
                const parts = [];
                for (const [prefix, label] of [["zcodepro", L.syncIncludeZcp], ["model", L.syncIncludeModel]]) {
                  const group = files.filter((f) => f.name === `${prefix}.json` || f.name.startsWith(`${prefix}-`));
                  if (!group.length) continue;
                  const latest = group.find((f) => f.name === `${prefix}.json`);
                  const history = group.filter((f) => f !== latest).sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0) || b.name.localeCompare(a.name));
                  parts.push(h(
                    "div",
                    { class: "px-1 pt-2 text-ui-xs font-medium text-foreground-subtle" },
                    `${label}${isZhLocale() ? "\uFF08" : " ("}${group.length}${isZhLocale() ? "\uFF09" : ")"}`
                  ));
                  for (const f of [latest, ...history]) {
                    if (f) parts.push(versionRow(f));
                  }
                }
                listWrap.replaceChildren(...parts);
              };
              const confirmImport = (f, rowBtns, importBtn) => {
                openDialog({
                  title: L.syncConfirmTitle,
                  width: "sm:max-w-md",
                  onMount: ({ body: confirmBody, close: closeConfirm }) => {
                    confirmBody.append(
                      h("p", { class: "mb-2 truncate font-mono text-ui-xs text-foreground-subtle", title: f.name }, f.name),
                      h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.syncConfirmDesc),
                      dialogFooter(
                        btnSecondary(L.cancel, () => closeConfirm()),
                        btnPrimary(L.syncConfirmGo, () => {
                          closeConfirm();
                          void importVersion(f, rowBtns, importBtn);
                        }, "min-w-24")
                      )
                    );
                  }
                });
              };
              const importVersion = async (f, rowBtns, importBtn) => {
                setRowBusy(rowBtns, true);
                importBtn.textContent = L.syncVerImporting;
                const res = await rpc("/sync/version/apply", { method: "POST", body: { file: f.name } });
                setRowBusy(rowBtns, false);
                importBtn.textContent = L.syncVerImport;
                if (!res.ok) {
                  showToast(L.failed + ": " + errText(res), "error");
                  return;
                }
                closePicker();
                renderSyncStatus(res.sync || {});
                clearConfigCache();
                window.dispatchEvent(new CustomEvent("zcodepro:config-changed"));
                Object.assign(config, await getConfig(true));
                refreshRows();
                renderToolbarSwitch();
                const names = (res.applied || []).map((k) => k === "model" ? L.syncIncludeModel : L.syncIncludeZcp).join(isZhLocale() ? "\u3001" : ", ");
                showToast(names ? `${L.syncDownloaded}\uFF08${names}\uFF09` : L.syncDownloaded, "success");
              };
              const confirmDelete = (f, rowBtns, isLatest) => {
                openDialog({
                  title: L.syncVerDeleteTitle,
                  width: "sm:max-w-md",
                  onMount: ({ body: confirmBody, close: closeConfirm }) => {
                    confirmBody.append(
                      h(
                        "p",
                        { class: "text-ui-sm/relaxed text-foreground-subtle" },
                        L.syncVerDeleteDesc,
                        h("span", { class: "font-mono" }, f.name)
                      ),
                      ...isLatest ? [h("p", { class: "mt-2 text-ui-xs/relaxed text-amber-500" }, L.syncVerDeleteLatestNote)] : [],
                      dialogFooter(
                        btnSecondary(L.cancel, () => closeConfirm()),
                        btnPrimary(L.syncVerDelete, () => {
                          closeConfirm();
                          void deleteVersion(f, rowBtns);
                        }, "min-w-24")
                      )
                    );
                  }
                });
              };
              const deleteVersion = async (f, rowBtns) => {
                setRowBusy(rowBtns, true);
                const res = await rpc("/sync/version/delete", { method: "POST", body: { file: f.name } });
                setRowBusy(rowBtns, false);
                if (!res.ok) {
                  showToast(L.failed + ": " + errText(res), "error");
                  return;
                }
                showToast(L.syncVerDeleted, "success");
                void loadList();
              };
              const exportVersion = async (f, rowBtns, saveBtn) => {
                setRowBusy(rowBtns, true);
                saveBtn.textContent = L.syncVerSaving;
                const res = await rpc("/sync/version/export", { method: "POST", body: { file: f.name } });
                setRowBusy(rowBtns, false);
                saveBtn.textContent = L.syncVerSave;
                if (!res.ok) {
                  if (res.code !== "export-cancelled") showToast(L.failed + ": " + errText(res), "error");
                  return;
                }
                showToast(`${L.syncVerSaved} ${res.path}`, "success");
              };
              void loadList();
            }
          });
        };
        const runSyncPush = async () => {
          syncUploadBtn.disabled = true;
          syncDownloadBtn.disabled = true;
          const idleText = syncUploadBtn.textContent;
          syncUploadBtn.textContent = L.syncUploading;
          const res = await rpc("/sync/run", { method: "POST", body: { direction: "push" } });
          syncUploadBtn.disabled = false;
          syncDownloadBtn.disabled = false;
          syncUploadBtn.textContent = idleText;
          if (!res.ok) {
            showToast(L.failed + ": " + errText(res), "error");
            return;
          }
          renderSyncStatus(res.sync || {});
          showToast(res.pruned ? L.syncUploaded + (isZhLocale() ? "\uFF1B" : "; ") + L.syncPruned.replace("{n}", res.pruned) : L.syncUploaded, "success");
        };
        paneSync.append(
          h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.syncDesc),
          h(
            "div",
            { class: "mt-3 rounded-xl border border-border p-1" },
            syncFormRow("URL", syncUrlInput),
            // 登录与密码一行、上传目录与历史版本一行：短字段成对排，少占纵向空间
            h(
              "div",
              { class: "flex items-center gap-3 px-2 py-1.5" },
              syncLabel(L.syncLogin),
              syncLoginInput,
              syncLabel(L.syncPassword),
              syncPasswordInput
            ),
            h(
              "div",
              { class: "flex items-center gap-3 px-2 py-1.5" },
              syncLabel(L.syncDir),
              syncDirInput,
              syncLabel(L.syncHistoryLimit),
              syncHistoryInput,
              h("span", { class: "shrink-0 text-ui-xs text-foreground-subtle" }, L.syncHistoryLimitUnit)
            ),
            h(
              "div",
              { class: "flex items-center justify-between gap-2 px-2 py-1.5" },
              h(
                "div",
                { class: "min-w-0" },
                h("p", { class: "text-ui-xs/relaxed text-foreground-subtle" }, L.syncFormHint),
                syncRecLine
              ),
              h("div", { class: "flex shrink-0 items-center gap-1.5" }, syncSaveBtn, syncTestBtn)
            )
          ),
          syncTestState,
          h("div", { class: "mt-2 divide-y divide-border rounded-xl border border-border" }, syncIncludeWrap),
          h(
            "div",
            { class: "mt-2 flex items-center justify-between gap-2 rounded-xl border border-border p-2" },
            h("div", { class: "min-w-0" }, syncStatusLine),
            h("div", { class: "flex shrink-0 items-center gap-1.5" }, syncUploadBtn, syncDownloadBtn)
          ),
          h("p", { class: "mt-2 text-ui-xs/relaxed text-foreground-subtle" }, L.syncHint)
        );
        const persistDevMode = async (v) => {
          const res = await rpc("/config", { method: "POST", body: { devMode: v } });
          if (!res.ok) {
            showToast(L.failed + ": " + errText(res), "error");
            return false;
          }
          if (res.config) config.devMode = res.config.devMode;
          return true;
        };
        const devReloadBtn = btnSmall(L.devReload, () => {
          void runDevReload();
        }, "shrink-0", "primary");
        const runDevReload = async () => {
          devReloadBtn.disabled = true;
          devReloadBtn.textContent = L.devReloading;
          try {
            await rpc("/dev/reload", { method: "POST", body: {} });
          } catch {
          }
          setTimeout(() => {
            try {
              location.reload();
            } catch {
            }
          }, 2e3);
        };
        const devModeWrap = h("div");
        const renderDevPane = () => {
          const dev = config.devMode === true;
          devModeWrap.replaceChildren(
            h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.devModeDesc),
            h(
              "div",
              { class: "mt-3 divide-y divide-border rounded-xl border border-border" },
              settingRow(L.devMode, L.devModeRowDesc, dev, async () => {
                if (await persistDevMode(!dev)) renderDevPane();
              }),
              ...dev ? [h(
                "div",
                { class: "flex items-center justify-between gap-2 px-2 py-1.5" },
                h(
                  "div",
                  { class: "min-w-0" },
                  h("div", { class: "text-ui-sm font-medium text-foreground" }, L.devReload),
                  h("div", { class: "mt-0.5 text-ui-xs/relaxed text-foreground-subtle" }, L.devReloadDesc)
                ),
                devReloadBtn
              )] : []
            )
          );
        };
        renderDevPane();
        paneDebug.append(devModeWrap);
        const VISION_DEFAULT_PROMPT = "\u8BF7\u8BE6\u7EC6\u63CF\u8FF0\u8FD9\u5F20\u56FE\u7247\u7684\u5168\u90E8\u5185\u5BB9\u3002\u82E5\u662F\u754C\u9762\u6216\u56FE\u8868\u622A\u56FE\uFF0C\u8BF7\u5148\u628A\u6240\u6709\u9519\u8BEF\u3001\u8B66\u544A\u3001\u5F02\u5E38\u72B6\u6001\u9010\u5B57\u5F15\u7528\u51FA\u6765\uFF08\u542B\u5B8C\u6574\u539F\u6587\uFF09\uFF0C\u518D\u63CF\u8FF0\u6574\u4F53\u5E03\u5C40\u3001\u6587\u5B57\u4E0E\u5173\u952E\u6570\u636E\u3002";
        const VISION_DEFAULT_CFG = {
          enabled: true,
          chainMode: "fallback",
          chain: ["session"],
          proxies: [
            { name: "session", useProvider: "session", model: "", prompt: VISION_DEFAULT_PROMPT }
          ],
          pollMs: 3e3,
          apiTimeoutMs: 12e4,
          // 视觉上游冷启动可能近 2 分钟，与插件 DEFAULT_CONFIG 一致
          compressThresholdKB: 1024,
          skipAfterFailures: 2,
          skipMinutes: 30,
          forceIntercept: true
        };
        let visionCfg = visionRes.ok && visionRes.config && typeof visionRes.config === "object" ? structuredClone(visionRes.config) : null;
        let visionSaveTimer = null;
        const persistVision = async () => {
          visionCfg.chain = visionCfg.proxies.map((p) => (p.name || "").trim()).filter(Boolean);
          const res = await rpc("/vision", { method: "POST", body: { config: visionCfg } });
          if (!res.ok) showToast(L.failed + ": " + errText(res), "error");
          return res.ok;
        };
        const saveVisionSoon = () => {
          clearTimeout(visionSaveTimer);
          visionSaveTimer = setTimeout(() => {
            void persistVision();
          }, 500);
        };
        const visionTestPre = h("pre", {
          class: "mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-2 text-ui-xs text-foreground-subtle",
          style: "display:none"
        });
        const visionInputCls = "h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";
        const pluginInstallCard = (pluginName, onInstalled) => {
          const installBtn = btnSmall(L.headroomInstall, () => {
            void runInstall();
          }, "shrink-0");
          const installState = h("div", { class: "mt-0.5 truncate text-ui-xs/relaxed text-foreground-subtle" });
          const runInstall = async () => {
            installBtn.disabled = true;
            installBtn.textContent = L.headroomInstalling;
            installState.textContent = "";
            const res = await rpc("/plugins/update", { method: "POST", body: { name: pluginName } });
            if (!res.ok) {
              installBtn.disabled = false;
              installBtn.textContent = L.headroomInstall;
              showToast(L.pluginsUpdateFailed + ": " + errText(res), "error");
              return;
            }
            if (onInstalled) await onInstalled();
            showToast(L.pluginInstallDone.replaceAll("{name}", pluginName), "success");
          };
          return h(
            "div",
            { class: "mt-3 flex items-center justify-between gap-2 rounded-xl border border-border p-2" },
            h(
              "div",
              { class: "min-w-0" },
              h("div", { class: "text-ui-sm font-medium text-foreground" }, L.pluginInstallCardTitle.replaceAll("{name}", pluginName)),
              h("div", { class: "mt-0.5 text-ui-xs/relaxed text-foreground-subtle" }, L.pluginInstallCardDesc),
              installState
            ),
            installBtn
          );
        };
        const renderVision = () => {
          if (!visionRes.ok) {
            paneVision.replaceChildren(
              h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.visionDesc),
              h("p", { class: "mt-2 text-ui-sm text-destructive" }, L.visionLoadFailed + ": " + errText(visionRes))
            );
            return;
          }
          if (!visionRes.hook) {
            paneVision.replaceChildren(
              h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.visionDesc),
              pluginInstallCard("zcode-vision", async () => {
                const meta = await rpc("/vision");
                if (meta.ok) Object.assign(visionRes, meta);
                renderVision();
              })
            );
            return;
          }
          if (!visionCfg) {
            const initBtn = btnSmall(L.visionAddProxy, async () => {
              const res = await rpc("/vision", { method: "POST", body: { config: VISION_DEFAULT_CFG } });
              if (res.ok) {
                visionCfg = structuredClone(res.config);
                renderVision();
              } else showToast(L.failed + ": " + errText(res), "error");
            });
            paneVision.replaceChildren(
              h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.visionDesc),
              ...visionRes.ok ? [] : [h("p", { class: "mt-2 text-ui-sm text-destructive" }, L.visionLoadFailed + ": " + errText(visionRes))],
              // 信息卡（仅版本行；配置未建，启用开关随配置出现）
              h(
                "div",
                { class: "mt-3 rounded-xl border border-border p-2" },
                h(
                  "div",
                  { class: "flex flex-wrap items-center gap-2" },
                  h("span", { class: "shrink-0 whitespace-nowrap text-ui-xs/relaxed text-foreground-subtle" }, `\u63D2\u4EF6 ${visionRes.pluginVersion || "\u2014"}`)
                )
              ),
              h("div", { class: "mt-3 flex justify-end" }, initBtn)
            );
            return;
          }
          const field = (labelText, node) => h(
            "label",
            { class: "block min-w-0" },
            h("span", { class: "mb-1 block text-ui-xs font-medium text-foreground-subtle" }, labelText),
            node
          );
          const smallBtn = (text, onClick, extra = "") => btnSmall(text, onClick, extra);
          const modeBtn = (id, label, desc) => h("button", {
            type: "button",
            class: "zcodepro-tab",
            "data-state": visionCfg.chainMode === id ? "active" : "inactive",
            title: desc,
            onClick: () => {
              visionCfg.chainMode = id;
              void persistVision();
              renderVision();
            }
          }, label);
          const textIn = (value, onInput, { type = "text", placeholder = "" } = {}) => {
            const n = h("input", { type, value: value || "", placeholder, class: visionInputCls });
            n.addEventListener("input", () => onInput(n.value));
            return n;
          };
          const numIn = (value, { min, dflt, title, label, commit }) => {
            const n = h("input", {
              type: "number",
              min: String(min),
              step: "1",
              title,
              class: "h-7 w-16 rounded-lg border border-border bg-input px-2 text-right text-ui-xs tabular-nums text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            });
            n.value = String(Number.isFinite(value) ? value : dflt);
            n.addEventListener("change", () => {
              const v = Math.max(min, Math.round(Number(n.value) || 0));
              n.value = String(v);
              commit(v);
              void persistVision();
            });
            return h(
              "label",
              { class: "flex shrink-0 items-center gap-1.5", title },
              h("span", { class: "text-ui-xs font-medium text-foreground-subtle" }, label),
              n
            );
          };
          const cards = visionCfg.proxies.map((p, i) => {
            const manualConnCard = isManualConn(p.useProvider, titleGenProviders) ? [h(
              "div",
              { class: "mt-2 grid grid-cols-1 gap-2 rounded-xl border border-border p-2 sm:grid-cols-3" },
              field(L.visionBaseUrl, textIn(p.baseUrl, (v) => {
                p.baseUrl = v;
                saveVisionSoon();
              })),
              field(L.visionApiKey, textIn(p.apiKey, (v) => {
                p.apiKey = v;
                saveVisionSoon();
              }, { type: "password" })),
              field(L.titleGenFormat, (() => {
                const sel = h(
                  "select",
                  { class: "h-8 w-full rounded-lg border border-border bg-input px-2 text-ui-sm text-foreground outline-none" },
                  h("option", { value: "anthropic" }, "anthropic"),
                  h("option", { value: "openai" }, "openai")
                );
                sel.value = p.format === "openai" ? "openai" : "anthropic";
                sel.addEventListener("change", () => {
                  p.format = sel.value;
                  void persistVision();
                });
                return sel;
              })())
            )] : [];
            return h("div", { class: "mt-2 rounded-xl border border-border p-2" }, [
              h(
                "div",
                { class: "flex flex-wrap items-center gap-2" },
                h("span", { class: "shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-ui-xs tabular-nums text-foreground-subtle" }, String(i + 1)),
                // 名称输入框用 flex-1 占剩余宽度，与序号同行；textIn 的 w-full 会把序号挤成单独一行
                (() => {
                  const n = h("input", { type: "text", value: p.name || "", placeholder: L.visionName, class: visionInputCls + " min-w-0 flex-1" });
                  n.addEventListener("input", () => {
                    p.name = n.value;
                    saveVisionSoon();
                  });
                  return n;
                })(),
                smallBtn(L.visionMoveUp, () => {
                  if (i <= 0) return;
                  visionCfg.proxies.splice(i - 1, 0, visionCfg.proxies.splice(i, 1)[0]);
                  void persistVision();
                  renderVision();
                }, i === 0 ? "pointer-events-none opacity-40" : ""),
                smallBtn(L.visionMoveDown, () => {
                  if (i >= visionCfg.proxies.length - 1) return;
                  visionCfg.proxies.splice(i + 1, 0, visionCfg.proxies.splice(i, 1)[0]);
                  void persistVision();
                  renderVision();
                }, i === visionCfg.proxies.length - 1 ? "pointer-events-none opacity-40" : ""),
                smallBtn(L.visionRemove, () => {
                  visionCfg.proxies.splice(i, 1);
                  void persistVision();
                  renderVision();
                })
              ),
              h(
                "div",
                { class: "mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2" },
                // 供应商与模型走 provider-fields 共用逻辑：跟随会话时模型下拉为
                // 全部供应商模型汇总，具体供应商为其模型列表；已删 id 标注“已删除”
                field(L.visionUseProvider, comboField(
                  p.useProvider || "",
                  providerOptionsOf(titleGenProviders, L),
                  (v, src) => {
                    p.useProvider = v;
                    saveVisionSoon();
                    if (src === "select") renderVision();
                  },
                  { placeholder: L.titleGenProviderSession, staleLabel: L.titleGenProviderDeleted }
                )),
                // 跟随会话时模型下拉头部有“跟随当前会话当前模型”（值为空，
                // 插件 ≥1.6.1 在调用时解析为会话当前模型）；具体供应商为其模型列表
                field(L.visionModel, comboField(
                  p.model || "",
                  modelOptionsOf(p.useProvider, titleGenProviders, {
                    followSession: (p.useProvider || "").trim() === "session",
                    followSessionLabel: L.titleGenModelFollowSession
                  }),
                  (v) => {
                    p.model = v;
                    saveVisionSoon();
                  },
                  {
                    placeholder: modelPlaceholderOf(p.useProvider, L),
                    emptyLabel: (p.useProvider || "").trim() === "session" ? L.titleGenModelFollowSession : L.titleGenModelEmpty
                  }
                ))
              ),
              ...manualConnCard,
              (() => {
                const n = h("textarea", { class: "zcodepro-textarea zcodepro-textarea-sm", rows: "3", placeholder: L.visionPrompt });
                n.value = p.prompt || "";
                n.addEventListener("input", () => {
                  p.prompt = n.value;
                  saveVisionSoon();
                });
                return field(L.visionPrompt, n);
              })()
            ]);
          });
          let testBtn;
          testBtn = smallBtn(L.visionTest, async () => {
            testBtn.disabled = true;
            testBtn.textContent = L.visionTesting;
            visionTestPre.style.display = "";
            visionTestPre.textContent = L.visionTesting;
            const res = await rpc("/vision/test", { method: "POST", body: {} });
            testBtn.disabled = false;
            testBtn.textContent = L.visionTest;
            visionTestPre.textContent = res.output || res.error || "";
          });
          paneVision.replaceChildren(
            h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.visionDesc),
            // 信息卡：插件版本 + 启用图片识别开关（与 rtk/headroom 面板同款式）
            h(
              "div",
              { class: "mt-3 rounded-xl border border-border p-2" },
              h(
                "div",
                { class: "flex flex-wrap items-center gap-2" },
                h("span", { class: "shrink-0 whitespace-nowrap text-ui-xs/relaxed text-foreground-subtle" }, `\u63D2\u4EF6 ${visionRes.pluginVersion || "\u2014"}`),
                h(
                  "div",
                  { class: "ml-auto" },
                  settingRow(L.visionEnabled, "", visionCfg.enabled !== false, async () => {
                    visionCfg.enabled = !(visionCfg.enabled !== false);
                    await persistVision();
                    renderVision();
                  })
                )
              )
            ),
            // 链模式 + 强制拦截开关合到一行（启用开关已上移信息卡）
            h(
              "div",
              { class: "mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border p-1" },
              h("span", { class: "ml-1.5 shrink-0 text-ui-sm font-medium text-foreground" }, L.visionMode),
              modeBtn("fallback", L.visionModeFallback, L.visionModeFallbackDesc),
              modeBtn("pipeline", L.visionModePipeline, L.visionModePipelineDesc),
              h(
                "div",
                { class: "ml-auto flex items-center gap-4" },
                settingRow(L.visionForceIntercept, "", visionCfg.forceIntercept !== false, async () => {
                  visionCfg.forceIntercept = !(visionCfg.forceIntercept !== false);
                  await persistVision();
                  renderVision();
                })
              )
            ),
            // 压缩阈值 / 连续失败次数 / 跳过分钟数 三个数字一行
            h(
              "div",
              { class: "mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border p-1" },
              (() => {
                const n = h("input", {
                  type: "number",
                  min: "0",
                  step: "128",
                  title: L.visionCompressKBHint,
                  class: "h-7 w-16 rounded-lg border border-border bg-input px-2 text-right text-ui-xs tabular-nums text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                });
                n.value = String(Number.isFinite(visionCfg.compressThresholdKB) ? visionCfg.compressThresholdKB : 1024);
                n.addEventListener("change", () => {
                  visionCfg.compressThresholdKB = Math.max(0, Math.round(Number(n.value) || 0));
                  n.value = String(visionCfg.compressThresholdKB);
                  void persistVision();
                });
                return h(
                  "label",
                  { class: "flex shrink-0 items-center gap-1.5", title: L.visionCompressKBHint },
                  h("span", { class: "text-ui-xs font-medium text-foreground-subtle" }, L.visionCompressKB),
                  n
                );
              })(),
              numIn(visionCfg.skipAfterFailures, { min: 0, dflt: 2, title: L.visionSkipAfterFailuresHint, label: L.visionSkipAfterFailures, commit: (v) => {
                visionCfg.skipAfterFailures = v;
              } }),
              numIn(visionCfg.skipMinutes, { min: 1, dflt: 30, title: L.visionSkipMinutesHint, label: L.visionSkipMinutes, commit: (v) => {
                visionCfg.skipMinutes = v;
              } })
            ),
            ...cards,
            h(
              "div",
              { class: "mt-2 flex items-center justify-between" },
              h(
                "div",
                { class: "flex items-center gap-1.5" },
                smallBtn("+ " + L.visionAddProxy, () => {
                  visionCfg.proxies.push({ name: "", baseUrl: "https://open.bigmodel.cn/api/anthropic", model: "glm-5.3-flash", apiKey: "", format: "anthropic", prompt: VISION_DEFAULT_PROMPT });
                  renderVision();
                }),
                smallBtn(L.visionResetChain, () => {
                  if (!window.confirm(L.visionResetChainConfirm)) return;
                  visionCfg.chainMode = VISION_DEFAULT_CFG.chainMode;
                  visionCfg.proxies = structuredClone(VISION_DEFAULT_CFG.proxies);
                  void persistVision();
                  renderVision();
                })
              ),
              h(
                "div",
                { class: "flex min-w-0 items-center justify-end gap-2" },
                h("span", { class: "min-w-0 text-right text-ui-xs/relaxed text-foreground-subtle" }, L.testNoSessionHint),
                testBtn
              )
            ),
            visionTestPre
          );
        };
        renderVision();
        let rtkCfg = rtkRes.ok ? {
          installed: rtkRes.installed !== false,
          version: rtkRes.version || "",
          binPath: rtkRes.binPath || "",
          mode: rtkRes.mode === "off" ? "off" : "hint",
          whitelist: Array.isArray(rtkRes.whitelist) ? [...rtkRes.whitelist] : [],
          // 钩子内置放行清单（只读展示）
          builtinGit: Array.isArray(rtkRes.builtinGit) ? [...rtkRes.builtinGit] : [],
          builtinPlain: Array.isArray(rtkRes.builtinPlain) ? [...rtkRes.builtinPlain] : []
        } : null;
        const persistRtk = async (partial) => {
          const res = await rpc("/rtk", { method: "POST", body: partial });
          if (!res.ok) showToast(L.failed + ": " + errText(res), "error");
          return res.ok;
        };
        const rtkInputCls = "h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";
        const rtkVersionLine = h("span", { class: "shrink-0 whitespace-nowrap text-ui-xs/relaxed text-foreground-subtle" });
        let rtkLocText = "";
        const renderRtkVersion = (meta) => {
          const v = String(meta.version || "").replace(/^rtk\s+/i, "").trim();
          rtkVersionLine.textContent = `\u63D2\u4EF6 ${meta.pluginVersion || "\u2014"}${v ? ` \xB7 rtk ${v}` : ""}`;
          rtkLocText = meta.binPath || "";
        };
        renderRtkVersion(rtkRes);
        const rtkUp = makeUpgradeControls({
          endpoint: "/rtk",
          idleText: () => rtkLocText,
          metaRefresh: async () => {
            const meta = await rpc("/rtk");
            if (meta.ok) {
              if (rtkCfg) Object.assign(rtkCfg, meta);
              renderRtkVersion(meta);
            }
          }
        });
        rtkUpgradePollStop = rtkUp.stop;
        const rtkSwitchRow = h("div");
        const rtkVersionCard = h(
          "div",
          { class: "mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border p-2" },
          rtkVersionLine,
          rtkUp.state,
          rtkUp.btn,
          h("div", { class: "ml-auto shrink-0" }, rtkSwitchRow)
        );
        const rtkBody = h("div");
        const rtkPluginRow = h("div");
        const renderRtkPluginRow = () => {
          rtkPluginRow.replaceChildren(...rtkRes.hook ? [] : [
            pluginInstallCard("rtk", async () => {
              const meta = await rpc("/rtk");
              if (meta.ok) {
                Object.assign(rtkRes, meta);
                renderRtkVersion(meta);
                rtkCfg = {
                  installed: meta.installed !== false,
                  version: meta.version || "",
                  binPath: meta.binPath || "",
                  mode: meta.mode === "off" ? "off" : "hint",
                  whitelist: Array.isArray(meta.whitelist) ? [...meta.whitelist] : [],
                  builtinGit: Array.isArray(meta.builtinGit) ? [...meta.builtinGit] : [],
                  builtinPlain: Array.isArray(meta.builtinPlain) ? [...meta.builtinPlain] : []
                };
              }
              renderRtkPluginRow();
              renderRtk();
            })
          ]);
        };
        renderRtkPluginRow();
        paneRtk.append(
          h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.rtkDesc),
          rtkPluginRow,
          rtkVersionCard,
          rtkBody
        );
        const renderRtk = () => {
          if (rtkRes.ok && !rtkRes.hook) {
            rtkVersionCard.style.display = "none";
            rtkBody.replaceChildren();
            return;
          }
          rtkVersionCard.style.display = rtkCfg && rtkCfg.installed ? "" : "none";
          if (!rtkCfg) {
            rtkBody.replaceChildren(
              h("p", { class: "text-ui-sm text-destructive" }, L.rtkLoadFailed + ": " + errText(rtkRes))
            );
            return;
          }
          const input = h("input", { type: "text", placeholder: L.rtkWhitelistPlaceholder, class: rtkInputCls + " min-w-0 flex-1" });
          const addEntry = async () => {
            const v = input.value.trim();
            if (!v) return;
            if (!/^(git:)?[A-Za-z0-9._-]+$/.test(v) || rtkCfg.whitelist.includes(v)) {
              showToast(L.rtkWhitelistInvalid, "error");
              return;
            }
            if (await persistRtk({ whitelist: [...rtkCfg.whitelist, v] })) {
              rtkCfg.whitelist.push(v);
              renderRtk();
            }
          };
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addEntry();
            }
          });
          const removeEntry = (entry) => {
            void (async () => {
              const next = rtkCfg.whitelist.filter((x) => x !== entry);
              if (await persistRtk({ whitelist: next })) {
                rtkCfg.whitelist = next;
                renderRtk();
              }
            })();
          };
          rtkSwitchRow.replaceChildren(
            settingRow(L.rtkEnabled, "", rtkCfg.mode === "hint", async () => {
              const next = rtkCfg.mode === "hint" ? "off" : "hint";
              if (await persistRtk({ mode: next })) {
                rtkCfg.mode = next;
                renderRtk();
              }
            })
          );
          rtkBody.replaceChildren(
            ...rtkCfg.installed ? [] : [h(
              "div",
              { class: "flex items-center gap-2" },
              h("p", { class: "min-w-0 flex-1 text-ui-sm text-amber-500" }, L.rtkNotInstalled),
              // 一键安装本体：与“检查更新”同一条 helper 升级管线（未装则装到 ~/.local/bin）
              (() => {
                const b = btnSmall(L.rtkInstallBin, () => {
                  void run();
                }, "shrink-0");
                const run = async () => {
                  b.disabled = true;
                  b.textContent = L.headroomInstalling;
                  const res = await rpc("/rtk", { method: "POST", body: { upgrade: true } });
                  if (!res.ok) {
                    b.disabled = false;
                    b.textContent = L.rtkInstallBin;
                    showToast(L.failed + ": " + errText(res), "error");
                    return;
                  }
                  const done = await new Promise((resolve) => {
                    const iv = setInterval(async () => {
                      const s = await rpc("/rtk/upgrade");
                      if (s.ok && s.upgrade && !s.upgrade.running) {
                        clearInterval(iv);
                        resolve(s.upgrade);
                      }
                    }, 1200);
                    setTimeout(() => {
                      clearInterval(iv);
                      resolve(null);
                    }, 10 * 60 * 1e3);
                  });
                  if (done && !done.error && done.version) {
                    const meta = await rpc("/rtk");
                    if (meta.ok) {
                      Object.assign(rtkRes, meta);
                      rtkCfg = { ...rtkCfg, installed: meta.installed !== false, version: meta.version || "", binPath: meta.binPath || "" };
                    }
                    showToast(L.rtkBinInstalled, "success");
                    renderRtk();
                  } else {
                    b.disabled = false;
                    b.textContent = L.rtkInstallBin;
                    showToast(done && done.error || L.headroomInstallRetry, "error");
                  }
                };
                return b;
              })()
            )],
            h(
              "div",
              { class: "mt-2 rounded-xl border border-border p-2" },
              h("div", { class: "text-ui-sm font-medium text-foreground" }, L.rtkWhitelistTitle),
              h("p", { class: "mt-1 text-ui-xs/relaxed text-foreground-subtle" }, L.rtkWhitelistDesc),
              ...rtkCfg.builtinGit.length > 0 || rtkCfg.builtinPlain.length > 0 ? [
                h("div", { class: "mt-2 text-ui-xs font-medium text-foreground-subtle" }, L.rtkBuiltinLabel),
                h(
                  "div",
                  { class: "mt-1 flex flex-wrap items-center gap-1" },
                  ...rtkCfg.builtinGit.map((g) => `git:${g}`).concat(rtkCfg.builtinPlain).map((entry) => h("span", {
                    class: "inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-ui-xs text-foreground-subtle/80"
                  }, entry))
                )
              ] : [],
              h(
                "div",
                { class: "mt-2 flex flex-wrap items-center gap-1.5" },
                ...rtkCfg.whitelist.map((entry) => h(
                  "span",
                  {
                    class: "inline-flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-ui-xs text-foreground"
                  },
                  entry,
                  h("button", {
                    type: "button",
                    class: "text-foreground-subtle hover:text-destructive",
                    title: L.visionRemove,
                    onClick: () => removeEntry(entry)
                  }, "\xD7")
                )),
                ...rtkCfg.whitelist.length === 0 ? [h("span", { class: "text-ui-xs text-foreground-subtle/70" }, L.defaultValue)] : []
              ),
              h(
                "div",
                { class: "mt-2 flex items-center gap-2" },
                input,
                btnSmall(L.rtkWhitelistAdd, () => {
                  void addEntry();
                }, "shrink-0"),
                btnSmall(L.rtkWhitelistClear, () => {
                  void (async () => {
                    if (rtkCfg.whitelist.length === 0) return;
                    if (await persistRtk({ whitelist: [] })) {
                      rtkCfg.whitelist = [];
                      renderRtk();
                      showToast(L.rtkWhitelistCleared);
                    }
                  })();
                }, "shrink-0")
              )
            )
          );
        };
        renderRtk();
        const hrVersionLine = h("span", { class: "shrink-0 whitespace-nowrap text-ui-xs/relaxed text-foreground-subtle" });
        let hrLocText = "";
        const hrSwitchRow = h("div");
        const renderHrVersion = (meta) => {
          hrVersionLine.textContent = `\u63D2\u4EF6 ${meta.pluginVersion || "\u2014"}${meta.version ? ` \xB7 headroom ${meta.version}` : ""}`;
          hrLocText = meta.binPath || "";
        };
        renderHrVersion(headroomRes);
        const hrUp = makeUpgradeControls({
          endpoint: "/headroom",
          idleText: () => hrLocText,
          metaRefresh: async () => {
            const meta = await rpc("/headroom");
            if (meta.ok) {
              renderHrVersion(meta);
              Object.assign(headroomRes, meta);
            }
          }
        });
        hrUpgradePollStop = hrUp.stop;
        const renderHeadroomPane = () => {
          paneHeadroom.replaceChildren();
          if (!headroomRes.ok || !headroomRes.config) {
            paneHeadroom.append(
              h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.headroomDesc),
              h("p", { class: "mt-2 text-ui-sm text-destructive" }, L.headroomLoadFailed + ": " + errText(headroomRes))
            );
            return;
          }
          if (!headroomRes.hook) {
            const installBtn = btnSmall(L.headroomInstall, () => {
              void runInstall();
            }, "shrink-0");
            const installState = h("div", { class: "mt-0.5 truncate text-ui-xs/relaxed text-foreground-subtle" });
            const runInstall = async () => {
              installBtn.disabled = true;
              installBtn.textContent = L.headroomInstalling;
              installState.textContent = "";
              const res = await rpc("/plugins/update", { method: "POST", body: { name: "headroom" } });
              if (!res.ok) {
                installBtn.disabled = false;
                installBtn.textContent = L.headroomInstall;
                showToast(L.pluginsUpdateFailed + ": " + errText(res), "error");
                return;
              }
              const meta = await rpc("/headroom");
              if (meta.ok) Object.assign(headroomRes, meta);
              if (headroomRes.hook) {
                showToast(L.headroomInstalled, "success");
                renderHrVersion(headroomRes);
                renderHeadroomPane();
              } else {
                installBtn.disabled = false;
                installBtn.textContent = L.headroomInstall;
                installState.textContent = L.headroomInstallRetry;
              }
            };
            paneHeadroom.append(
              h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.headroomDesc),
              h(
                "div",
                { class: "mt-3 flex items-center justify-between gap-2 rounded-xl border border-border p-2" },
                h(
                  "div",
                  { class: "min-w-0" },
                  h("div", { class: "text-ui-sm font-medium text-foreground" }, L.headroomInstallTitle),
                  h("div", { class: "mt-0.5 text-ui-xs/relaxed text-foreground-subtle" }, L.headroomInstallDesc),
                  installState
                ),
                installBtn
              )
            );
            return;
          }
          const hrCfg = { ...headroomRes.config };
          let hrBusy = false;
          const hrRun = async (reqBody, warn) => {
            if (hrBusy) return false;
            hrBusy = true;
            const action = reqBody && reqBody.action;
            const isStart = action === "start" || action === "restart";
            const isStop = action === "stop";
            const rpcDone = rpc("/headroom", { method: "POST", body: reqBody });
            let timerIv = null;
            if (isStart || isStop) {
              const wantUp = isStart;
              const msg = action === "restart" ? L.hrRestarting : isStart ? L.hrStarting : L.hrStopping;
              const doneMsg = isStart ? L.hrStarted : L.hrStopped;
              const timeoutMs = isStart ? 90 * 1e3 : 30 * 1e3;
              const t0 = Date.now();
              const timerSpan = h("span", { class: "text-ui-sm text-foreground-subtle/70" }, msg + " (0s)");
              hrStatusLine.replaceChildren(timerSpan);
              timerIv = setInterval(() => {
                timerSpan.textContent = msg + ` (${Math.round((Date.now() - t0) / 1e3)}s)`;
              }, 1e3);
              void (async () => {
                const kick = await rpcDone;
                if (!kick.ok) return;
                while (Date.now() - t0 < timeoutMs) {
                  await new Promise((r) => setTimeout(r, 2e3));
                  const st = await rpc("/headroom/status");
                  if (!st.ok) continue;
                  const up = !!(st.status && st.status.up);
                  if (up === wantUp) {
                    clearInterval(timerIv);
                    hrBusy = false;
                    await hrRefresh();
                    showToast(doneMsg, isStart ? "success" : void 0);
                    return;
                  }
                }
                clearInterval(timerIv);
                hrBusy = false;
                if (isStart) showToast(L.hrStartTimeout, "error");
                void hrRefresh();
              })();
            }
            const res = await rpcDone;
            if (!res.ok) {
              if (timerIv) clearInterval(timerIv);
              hrBusy = false;
              showToast(L.failed + ": " + errText(res), "error");
              void hrRefresh();
              return false;
            }
            if (res.config) Object.assign(hrCfg, res.config);
            if (warn) showToast(warn);
            if (!isStart && !isStop) {
              hrBusy = false;
              setTimeout(() => {
                void hrRefresh();
              }, 1200);
            }
            return true;
          };
          const hrDevLabel = (v) => v == null ? "\u2014" : v === "auto" ? L.hrValAuto : v === "cpu" ? "CPU" : v;
          const HR_PM = { ac: L.hrPmAc, battery: L.hrPmBattery, saver: L.hrPmSaver, "saver+battery": L.hrPmSaverBat };
          const HR_DETECT = { ok: L.hrDetectOk, missing: L.hrDetectMissing, broken: L.hrDetectBroken };
          const hrStatusLine = h(
            "div",
            { class: "flex items-center gap-2" },
            h("span", { class: "text-ui-sm text-foreground-subtle/70" }, "\u2026")
          );
          const hrFacts = h("div", { class: "mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3" });
          const hrInstList = h("div", { class: "mt-1.5 space-y-1", style: "display:none" });
          const hrHintLine = h("p", { class: "mt-1.5 text-ui-xs/relaxed text-amber-500", style: "display:none" });
          const hrRefresh = async () => {
            const res = await rpc("/headroom/status");
            if (!res.ok) {
              hrStatusLine.replaceChildren(
                h("span", { class: "text-ui-sm text-destructive" }, L.headroomStatusLoadFailed + ": " + errText(res))
              );
              hrFacts.replaceChildren();
              hrInstList.replaceChildren();
              hrInstList.style.display = "none";
              hrHintLine.style.display = "none";
              return;
            }
            const s = res.status || {};
            hrStatusLine.replaceChildren(
              h("span", { class: "inline-block size-2 shrink-0 rounded-full " + (s.up ? "bg-emerald-500" : "bg-red-400") }),
              h("span", { class: "text-ui-sm font-medium text-foreground" }, s.up ? L.headroomProxyUp : L.headroomProxyDown),
              ...s.port ? [h("span", { class: "text-ui-xs text-foreground-subtle" }, `127.0.0.1:${s.port}`)] : []
            );
            const fact = (label, value) => h(
              "div",
              { class: "min-w-0 truncate text-ui-xs text-foreground-subtle" },
              h("span", { class: "text-foreground-subtle/70" }, label + "\uFF1A"),
              String(value ?? "\u2014")
            );
            hrFacts.replaceChildren(
              fact(L.headroomCurrentBackend, hrDevLabel(s.backend)),
              fact(L.headroomDesiredBackend, hrDevLabel(s.desiredBackend)),
              fact(L.headroomPowerState, HR_PM[s.powerMode] || s.powerMode),
              fact(L.headroomWatcher, s.watcherRunning == null ? "\u2014" : s.watcherRunning ? L.headroomWatcherOn : L.headroomWatcherOff),
              fact(L.headroomSaverDetect, HR_DETECT[s.saverDetect] || s.saverDetect)
            );
            const insts = Array.isArray(s.instances) ? s.instances : [];
            hrInstList.replaceChildren(...insts.map((it) => h(
              "div",
              { class: "flex min-w-0 items-center gap-2" },
              h("span", { class: "shrink-0 font-mono text-ui-xs text-foreground-subtle" }, `:${it.port}`),
              h(
                "span",
                { class: "min-w-0 flex-1 truncate text-ui-xs text-foreground-subtle", title: `${it.upstream} | ${it.providers}` },
                `${it.format} \u2192 ${it.upstream}`
              ),
              h("span", { class: "max-w-[40%] shrink-0 truncate text-ui-xs text-foreground-subtle/70", title: it.providers }, it.providers),
              h("span", { class: "shrink-0 text-ui-xs " + (it.up ? "text-emerald-600" : "text-destructive") }, it.up ? L.hrInstRunning : L.hrInstStopped)
            )));
            hrInstList.style.display = insts.length ? "" : "none";
            hrHintLine.textContent = s.saverHint || "";
            hrHintLine.style.display = s.saverHint ? "" : "none";
          };
          const renderHrUsageSwitch = () => {
            const usageOn = !!(headroomRes.usage && headroomRes.usage.enabled);
            hrSwitchRow.replaceChildren(
              settingRow(L.pluginEnable, "", usageOn, async () => {
                const next = !usageOn;
                const res = await rpc("/headroom", { method: "POST", body: { usage: next } });
                if (!res.ok) {
                  showToast(L.failed + ": " + errText(res), "error");
                  return;
                }
                if (res.usage) headroomRes.usage = res.usage;
                renderHrUsageSwitch();
                if (next && !res.changed && !(res.usage && res.usage.enabled)) showToast(L.hrUsageNone);
              })
            );
          };
          renderHrUsageSwitch();
          const hrRefreshBtn = btnSmall(L.headroomRefresh, () => {
            void hrRefresh();
          });
          const hrStartBtn = btnSmall(L.headroomStart, () => {
            void hrRun({ action: "start" });
          });
          const hrRestartBtn = btnSmall(L.headroomRestart, () => {
            void hrRun({ action: "restart" });
          });
          const hrStopBtn = btnSmall(L.headroomStopAction, () => {
            openDialog({
              title: L.headroomStopTitle,
              description: L.headroomStopDesc,
              width: "sm:max-w-md",
              onMount: ({ body: confirmBody, close: closeConfirm }) => {
                confirmBody.append(
                  dialogFooter(
                    btnSecondary(L.cancel, () => closeConfirm()),
                    btnPrimary(L.headroomStopAction, () => {
                      closeConfirm();
                      void hrRun({ action: "stop" }, L.headroomStoppedWarn);
                    }, "min-w-24")
                  )
                );
              }
            });
          });
          void hrRefresh();
          const hrBackendSel = h("select", { class: "h-7 shrink-0 rounded-lg border border-border bg-input px-1.5 text-ui-xs text-foreground outline-none" });
          const hrBackendOpts = [
            ["auto", L.headroomBackendAuto],
            ["cpu", L.headroomBackendCpu]
          ];
          if (!["auto", "cpu"].includes(hrCfg.kompressBackend)) {
            hrBackendOpts.push([hrCfg.kompressBackend, hrCfg.kompressBackend + L.headroomBackendNative]);
          }
          for (const [v, label] of hrBackendOpts) hrBackendSel.append(h("option", { value: v }, label));
          hrBackendSel.value = hrCfg.kompressBackend;
          hrBackendSel.addEventListener("change", () => {
            const v = hrBackendSel.value;
            void (async () => {
              if (await hrRun({ backend: v })) updateHrPwrHint();
              else hrBackendSel.value = hrCfg.kompressBackend;
            })();
          });
          const hrPowerDefs = [
            ["off", L.headroomPowerOff, L.headroomPowerOffDesc],
            ["battery", L.headroomPowerBattery, L.headroomPowerBatteryDesc],
            ["saver", L.headroomPowerSaver, L.headroomPowerSaverDesc]
          ];
          const hrPowerBox = h("div", { class: "flex min-w-0 flex-wrap items-center gap-1.5" });
          const renderHrPower = () => hrPowerBox.replaceChildren(
            h("span", { class: "shrink-0 text-ui-sm font-medium text-foreground" }, L.headroomPower),
            ...hrPowerDefs.map(([id, label, desc]) => h("button", {
              type: "button",
              class: "zcodepro-tab",
              "data-state": hrCfg.powerSaveCpu === id ? "active" : "inactive",
              title: desc,
              onClick: () => {
                void (async () => {
                  if (await hrRun({ power: id })) renderHrPower();
                })();
              }
            }, label))
          );
          renderHrPower();
          const hrIntervalField = numberField({
            value: hrCfg.powerWatchInterval,
            fallback: 60,
            min: 10,
            max: 3600,
            step: 5,
            onCommit: (v) => {
              void (async () => {
                const res = await rpc("/headroom", { method: "POST", body: { interval: v } });
                if (res.ok && res.config) Object.assign(hrCfg, res.config);
                else {
                  showToast(L.failed + ": " + errText(res), "error");
                  hrIntervalField.set(hrCfg.powerWatchInterval);
                }
              })();
            }
          });
          const hrPwrHint = h(
            "p",
            { class: "px-2.5 pb-1.5 text-ui-xs/relaxed text-foreground-subtle", style: "display:none" },
            L.hrCpuPinnedHint
          );
          const updateHrPwrHint = () => {
            hrPwrHint.style.display = hrCfg.kompressBackend === "cpu" ? "" : "none";
          };
          updateHrPwrHint();
          const hrInstallBinBtn = (() => {
            const b = btnSmall(L.hrInstallBin, () => {
              void run();
            }, "shrink-0");
            let busy = false;
            const run = async () => {
              if (busy) return;
              busy = true;
              b.disabled = true;
              b.textContent = L.headroomInstalling;
              const res = await rpc("/headroom", { method: "POST", body: { upgrade: true } });
              if (!res.ok) {
                b.disabled = false;
                b.textContent = L.hrInstallBin;
                showToast(L.failed + ": " + errText(res), "error");
                busy = false;
                return;
              }
              const done = await new Promise((resolve) => {
                const iv = setInterval(async () => {
                  const s = await rpc("/headroom/upgrade");
                  if (s.ok && s.upgrade && !s.upgrade.running) {
                    clearInterval(iv);
                    resolve(s.upgrade);
                  }
                }, 2e3);
                setTimeout(() => {
                  clearInterval(iv);
                  resolve(null);
                }, 12 * 60 * 1e3);
              });
              busy = false;
              if (done && !done.error && done.version) {
                const meta = await rpc("/headroom");
                if (meta.ok) {
                  renderHrVersion(meta);
                  Object.assign(headroomRes, meta);
                }
                showToast(L.hrBinInstalled, "success");
                renderHeadroomPane();
              } else {
                b.disabled = false;
                b.textContent = L.hrInstallBin;
                showToast(done && done.error || L.headroomInstallRetry, "error");
              }
            };
            return b;
          })();
          paneHeadroom.append(
            h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.headroomDesc),
            ...headroomRes.installed === false ? [h(
              "div",
              { class: "mt-2 flex items-center gap-2" },
              h("p", { class: "min-w-0 flex-1 text-ui-sm text-amber-500" }, L.headroomBinMissing),
              hrInstallBinBtn
            )] : [],
            h(
              "div",
              { class: "mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border p-2" },
              hrVersionLine,
              hrUp.state,
              hrUp.btn,
              h("div", { class: "ml-auto shrink-0" }, hrSwitchRow)
            ),
            h(
              "div",
              { class: "mt-2 rounded-xl border border-border p-2" },
              h(
                "div",
                { class: "flex flex-wrap items-center justify-between gap-2" },
                h("span", { class: "text-ui-sm font-medium text-foreground" }, L.headroomStatusTitle),
                h("div", { class: "flex items-center gap-1.5" }, hrRefreshBtn, hrStartBtn, hrRestartBtn, hrStopBtn)
              ),
              hrStatusLine,
              hrFacts,
              hrInstList,
              hrHintLine
            ),
            h(
              "div",
              {
                class: "mt-2 rounded-xl border border-border p-1"
              },
              h(
                "div",
                { class: "flex items-center justify-between gap-2 rounded-lg p-2 transition-colors hover:bg-surface-hover" },
                h("span", { class: "min-w-0 truncate text-ui-sm font-medium text-foreground", title: L.headroomBackendDesc }, L.headroomBackend),
                hrBackendSel
              ),
              h(
                "div",
                { class: "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg p-1.5 transition-colors hover:bg-surface-hover" },
                hrPowerBox,
                h(
                  "div",
                  { class: "ml-auto flex shrink-0 items-center gap-1.5" },
                  h("span", { class: "text-ui-xs font-medium text-foreground-subtle", title: L.headroomIntervalDesc }, L.headroomInterval),
                  hrIntervalField.el,
                  h("span", { class: "w-4 text-ui-xs text-foreground-subtle" }, L.headroomSecUnit)
                )
              ),
              hrPwrHint
            )
          );
        };
        renderHeadroomPane();
        let titleGenCfg = titleGenRes.ok && titleGenRes.titleGen && typeof titleGenRes.titleGen === "object" ? structuredClone(titleGenRes.titleGen) : null;
        const titleGenDefaultPrompt = titleGenRes.ok && typeof titleGenRes.defaultPrompt === "string" ? titleGenRes.defaultPrompt : "";
        let titleGenSaveTimer = null;
        const persistTitleGen = async () => {
          const res = await rpc("/title-gen", { method: "POST", body: { titleGen: titleGenCfg } });
          clearConfigCache();
          if (!res.ok) showToast(L.failed + ": " + errText(res), "error");
          return res.ok;
        };
        const saveTitleGenSoon = () => {
          clearTimeout(titleGenSaveTimer);
          titleGenSaveTimer = setTimeout(() => {
            void persistTitleGen();
          }, 500);
        };
        const renderTitleGenPane = () => {
          if (!titleGenCfg) {
            paneTitleGen.replaceChildren(
              h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.titleGenShortDesc),
              h("p", { class: "mt-2 text-ui-sm text-destructive" }, L.visionLoadFailed + ": " + errText(titleGenRes))
            );
            return;
          }
          const inputCls = "h-8 w-full rounded-lg border border-border bg-input px-2.5 text-ui-sm text-foreground outline-none transition-shadow placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";
          const field = (labelText, node) => h(
            "label",
            { class: "block min-w-0" },
            h("span", { class: "mb-1 block text-ui-xs font-medium text-foreground-subtle" }, labelText),
            node
          );
          const showInlineConn = isManualConn(titleGenCfg.provider, titleGenProviders);
          const providerCombo = comboField(
            titleGenCfg.provider || "",
            providerOptionsOf(titleGenProviders, L),
            (v, src) => {
              titleGenCfg.provider = v;
              if (src === "select") {
                void persistTitleGen();
                renderTitleGenPane();
              } else saveTitleGenSoon();
            },
            { placeholder: L.titleGenProviderSession, staleLabel: L.titleGenProviderDeleted }
          );
          const modelCombo = comboField(
            titleGenCfg.model || "",
            // 跟随会话时选项表头部有“跟随当前会话当前模型”（值为空，生成时用
            // 会话当前模型），选了具体模型后也能再切回它
            modelOptionsOf(titleGenCfg.provider, titleGenProviders, {
              followSession: true,
              followSessionLabel: L.titleGenModelFollowSession
            }),
            (v) => {
              titleGenCfg.model = v;
              saveTitleGenSoon();
            },
            {
              placeholder: modelPlaceholderOf(titleGenCfg.provider, L),
              emptyLabel: (titleGenCfg.provider || "").trim() === "session" ? L.titleGenModelFollowSession : L.titleGenModelEmpty
            }
          );
          const textIn = (value, onInput, { type = "text", placeholder = "" } = {}) => {
            const n = h("input", { type, value: value || "", placeholder, class: inputCls });
            n.addEventListener("input", () => onInput(n.value));
            return n;
          };
          const formatSel = h(
            "select",
            { class: inputCls },
            h("option", { value: "anthropic" }, "anthropic"),
            h("option", { value: "openai" }, "openai")
          );
          formatSel.value = titleGenCfg.format === "openai" ? "openai" : "anthropic";
          formatSel.addEventListener("change", () => {
            titleGenCfg.format = formatSel.value;
            void persistTitleGen();
          });
          const inlineConnCard = h(
            "div",
            {
              class: "mt-2 grid grid-cols-1 gap-2 rounded-xl border border-border p-2 sm:grid-cols-3",
              style: showInlineConn ? "" : "display:none"
            },
            field(L.titleGenBaseUrl, textIn(titleGenCfg.baseUrl, (v) => {
              titleGenCfg.baseUrl = v;
              saveTitleGenSoon();
            }, { placeholder: "https://\u2026" })),
            field(L.titleGenApiKey, textIn(titleGenCfg.apiKey, (v) => {
              titleGenCfg.apiKey = v;
              saveTitleGenSoon();
            }, { type: "password" })),
            field(L.titleGenFormat, formatSel)
          );
          const promptArea = h("textarea", {
            class: "zcodepro-textarea zcodepro-textarea-sm",
            rows: "8",
            placeholder: L.titleGenPromptPlaceholder
          });
          promptArea.value = titleGenCfg.prompt || "";
          promptArea.addEventListener("input", () => {
            titleGenCfg.prompt = promptArea.value;
            saveTitleGenSoon();
          });
          const sampleText = isZhLocale() ? "\u5E2E\u6211\u770B\u4E0B\u8FD9\u4E2A\u62A5\u9519\u662F\u4EC0\u4E48\u539F\u56E0\uFF1ANullPointerException at com.example.OrderService.calculate(OrderService.java:87)" : "Why does my Spring Boot app throw NullPointerException intermittently in OrderService.calculate?";
          const sampleInput = h("input", {
            type: "text",
            class: inputCls + " min-w-0 flex-1",
            value: sampleText
          });
          let testBtn;
          const testState = h("span", { class: "min-w-0 flex-1 truncate text-ui-xs/relaxed text-foreground-subtle" });
          testBtn = btnSmall(L.titleGenTest, async () => {
            testBtn.disabled = true;
            testBtn.textContent = L.titleGenTesting;
            testState.textContent = L.titleGenTesting;
            const res = await rpc("/title-gen/run", {
              method: "POST",
              body: { text: sampleInput.value, test: true }
            });
            testBtn.disabled = false;
            testBtn.textContent = L.titleGenTest;
            if (res && res.ok) {
              testState.textContent = L.titleGenTestOk + res.title;
            } else {
              testState.textContent = res && errText(res) || L.titleGenTestFailed;
              testState.className = "min-w-0 flex-1 truncate text-ui-xs/relaxed text-destructive";
            }
          }, "shrink-0");
          paneTitleGen.replaceChildren(
            // 信息卡：一句话简介在左，启用开关右对齐
            h(
              "div",
              { class: "mt-3 flex items-center justify-between gap-2 rounded-xl border border-border p-2" },
              h("span", { class: "min-w-0 text-ui-sm/relaxed text-foreground-subtle" }, L.titleGenShortDesc),
              h("div", { class: "shrink-0" }, settingRow(L.titleGenEnabled, "", titleGenCfg.enabled === true, async () => {
                titleGenCfg.enabled = !(titleGenCfg.enabled === true);
                await persistTitleGen();
                renderTitleGenPane();
              }))
            ),
            // 供应商 + 模型
            h(
              "div",
              { class: "mt-2 grid grid-cols-1 gap-2 rounded-xl border border-border p-2 sm:grid-cols-2" },
              field(L.titleGenProvider, providerCombo),
              field(L.titleGenModel, modelCombo)
            ),
            inlineConnCard,
            // 提示词 + 载入默认
            h(
              "div",
              { class: "mt-2 rounded-xl border border-border p-2" },
              h(
                "div",
                { class: "mb-1 flex items-center justify-between gap-2" },
                h("span", { class: "text-ui-xs font-medium text-foreground-subtle" }, L.titleGenPrompt),
                btnSmall(L.titleGenPromptReset, () => {
                  promptArea.value = titleGenDefaultPrompt;
                  titleGenCfg.prompt = titleGenDefaultPrompt;
                  void persistTitleGen();
                  promptArea.focus();
                })
              ),
              promptArea
            ),
            // 测试（两行：输入框整行；说明 + 按钮一行。结果只显示在本区下方，
            // 不弹窗；从没对话过时的引导见 testState 错误文案）
            h(
              "div",
              { class: "mt-2 rounded-xl border border-border p-2" },
              sampleInput,
              h(
                "div",
                { class: "mt-2 flex items-center justify-between gap-2" },
                h("span", { class: "min-w-0 text-ui-xs/relaxed text-foreground-subtle" }, L.testNoSessionHint),
                testBtn
              )
            ),
            testState
          );
        };
        renderTitleGenPane();
        body.append(
          statusLine,
          tablist,
          paneFeatures,
          paneAgents,
          paneStyles,
          panePerf,
          paneProxy,
          paneSync,
          paneVision,
          paneHeadroom,
          paneRtk,
          paneDebug
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
    if (document.querySelector(".zcodepro-overlay")) return;
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

  // src/inject/features/session-switch.js
  var MRU_LIMIT = 50;
  var SCAN_DEBOUNCE_MS = 150;
  var SCAN_FALLBACK_MS = 5e3;
  var mru = [];
  var current = null;
  var titles = /* @__PURE__ */ new Map();
  var popupEl = null;
  var aliasesCache = {};
  var highlight = 0;
  var scanDebounce = 0;
  function firstLineOf(item) {
    const tEl = item.querySelector('[class*="truncate"]');
    return (tEl ? tEl.textContent : (item.innerText || "").split("\n")[0])?.trim() || "";
  }
  function workspaceOf(key) {
    const i = key.indexOf(":sess_");
    return i > 0 ? key.slice(0, i) : key;
  }
  function findCurrent() {
    for (const el of document.querySelectorAll("[data-task-item-key]")) {
      if ((el.className + "").includes("bg-selected")) return el;
    }
    return null;
  }
  function record(key) {
    if (key && key !== current) {
      current = key;
      mru = mru.filter((k) => k !== key);
      mru.unshift(key);
      if (mru.length > MRU_LIMIT) mru.length = MRU_LIMIT;
    }
  }
  function scan() {
    const cur = findCurrent();
    if (cur) record(cur.getAttribute("data-task-item-key"));
    for (const el of document.querySelectorAll("[data-task-item-key]")) {
      titles.set(el.getAttribute("data-task-item-key"), firstLineOf(el));
    }
  }
  var rowSel2 = "[data-task-item-key]";
  var inTaskRow = (node) => node instanceof Element && !!node.closest && !!node.closest(rowSel2);
  function taskRowMutations(muts) {
    for (const m of muts) {
      if (m.type === "attributes") {
        if (inTaskRow(m.target)) return true;
      } else if (m.type === "characterData") {
        if (m.target.parentElement && inTaskRow(m.target.parentElement)) return true;
      } else if (inTaskRow(m.target)) {
        return true;
      } else {
        for (const n of m.addedNodes) {
          if (n instanceof Element && (n.matches(rowSel2) || !!n.querySelector(rowSel2))) return true;
        }
      }
    }
    return false;
  }
  function scheduleScan() {
    if (scanDebounce) return;
    scanDebounce = setTimeout(() => {
      scanDebounce = 0;
      scan();
    }, SCAN_DEBOUNCE_MS);
  }
  async function switchTo(key) {
    const find = () => document.querySelector(`[data-task-item-key="${CSS.escape(key)}"]`);
    let item = find();
    if (!item) {
      const ws = workspaceOf(key);
      const header = document.querySelector(`[data-testid="workspace-item-${CSS.escape(ws)}"]`);
      const expander = header && header.querySelector("[aria-expanded]");
      if (expander && expander.getAttribute("aria-expanded") === "false") {
        expander.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        for (let i = 0; i < 20 && !(item = find()); i++) await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!item) return false;
    item.scrollIntoView({ block: "nearest" });
    item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  }
  function closePopup(commit) {
    if (!popupEl) return;
    const idx = highlight;
    popupEl.remove();
    popupEl = null;
    if (commit && idx > 0 && mru[idx] && mru[idx] !== current) {
      void switchTo(mru[idx]).then((ok) => {
        if (!ok) showToast(t().switcherFailed, "error");
      });
    }
  }
  function findTitle(key) {
    const item = document.querySelector(`[data-task-item-key="${CSS.escape(key)}"]`);
    if (item) titles.set(key, firstLineOf(item));
    const id = key.slice(key.indexOf(":sess_") + 1);
    return titles.get(key) || `sess ${id.slice(0, 8)}`;
  }
  function projLabelOf(key, aliases2) {
    const ws = workspaceOf(key);
    if (!ws) return "";
    return aliases2[ws] || ws.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  }
  function renderPopup() {
    if (!popupEl) return;
    const L = t();
    const list = popupEl.querySelector("[data-zcodepro-switcher-list]");
    list.replaceChildren(...mru.map((key, i) => {
      const proj = projLabelOf(key, aliasesCache);
      return h(
        "div",
        {
          class: "zcodepro-switcher-row",
          "data-active": i === highlight ? "" : void 0,
          onClick: () => {
            highlight = i;
            closePopup(true);
          }
        },
        // 标题文本包 span：截断省略作用在文本节点上（flex 容器自身 ellipsis 无效）
        h(
          "div",
          { class: "zcodepro-switcher-title" },
          i === 0 ? h("span", { class: "zcodepro-switcher-tag" }, L.switcherCurrent) : null,
          h("span", null, findTitle(key))
        ),
        // 无项目归属（如置顶）时不渲染空行
        proj ? h("div", { class: "zcodepro-switcher-ws" }, proj) : null
      );
    }));
  }
  async function openPopup() {
    if (popupEl) return;
    const cfg = await getConfig().catch(() => null);
    aliasesCache = cfg && cfg.aliases && typeof cfg.aliases === "object" ? cfg.aliases : {};
    ensureStyle();
    const L = t();
    highlight = 0;
    popupEl = h(
      "div",
      {
        class: "zcodepro-switcher-overlay",
        // 点弹窗外 = 取消（不切）
        onMousedown: (e) => {
          if (e.target === popupEl) closePopup(false);
        }
      },
      h(
        "div",
        { class: "zcodepro-switcher" },
        h("div", { class: "zcodepro-switcher-hint" }, L.switcherHint),
        h("div", { "data-zcodepro-switcher-list": "1", class: "zcodepro-switcher-list" })
      )
    );
    document.body.append(popupEl);
    renderPopup();
  }
  function moveHighlight(delta) {
    if (!popupEl || mru.length < 2) return;
    highlight = (highlight + delta + mru.length) % mru.length;
    renderPopup();
    const row = popupEl.querySelector("[data-active]");
    if (row) row.scrollIntoView({ block: "nearest" });
  }
  function startSessionSwitch() {
    scan();
    new MutationObserver((muts) => {
      if (taskRowMutations(muts)) scheduleScan();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    setInterval(() => {
      if (!document.hidden) scan();
    }, SCAN_FALLBACK_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scan();
    });
    document.addEventListener("click", (e) => {
      const item = e.target instanceof Element && e.target.closest("[data-task-item-key]");
      if (item) record(item.getAttribute("data-task-item-key"));
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && popupEl) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closePopup(false);
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      if (document.querySelector(".zcodepro-overlay")) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "x" && k !== "c") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void (async () => {
        const cfg = await getConfig();
        if (cfg.features && cfg.features.sessionSwitch === false) return;
        if (k === "z") {
          if (e.repeat) return;
          closePopup(false);
          const live = findCurrent();
          if (live) record(live.getAttribute("data-task-item-key"));
          const target = live ? mru[0] === current ? mru[1] : mru.find((mk) => mk !== current) : mru[0];
          if (!target) {
            showToast(t().switcherEmpty);
            return;
          }
          void switchTo(target).then((ok) => {
            if (!ok) showToast(t().switcherFailed, "error");
          });
          return;
        }
        if (mru.length < 2) {
          showToast(t().switcherEmpty);
          return;
        }
        if (!popupEl) await openPopup();
        moveHighlight(k === "x" ? 1 : -1);
      })();
    }, true);
    document.addEventListener("keyup", (e) => {
      if (e.key === "Alt" && popupEl) closePopup(true);
    }, true);
    window.addEventListener("blur", () => closePopup(false));
  }

  // src/inject/features/title-lock.js
  var TASK_SEL = "[data-task-item-key]";
  var SCAN_DEBOUNCE_MS2 = 150;
  var SCAN_FALLBACK_MS2 = 5e3;
  var BOOT_RETRY_MS = 5e3;
  var RECHECK_DELAY_MS = 1e3;
  var REVERIFY_MS = 3e3;
  var MAP_REFRESH_MS = 6e4;
  var installed2 = false;
  var seenRows = /* @__PURE__ */ new WeakSet();
  var enabled2 = true;
  var pinned = null;
  var resolved = false;
  var fetching = null;
  var pendingKeys = /* @__PURE__ */ new Set();
  function sessIdOf(key) {
    const i = key.indexOf(":sess_");
    return i > 0 ? key.slice(i + 1) : key;
  }
  function titleElsOf(item) {
    const copies = item.querySelectorAll("[data-task-title-copy]");
    if (copies.length) return [...copies];
    const t2 = item.querySelector('[class*="truncate"]');
    return t2 ? [t2] : [];
  }
  function findRows(key) {
    return [...document.querySelectorAll(`${TASK_SEL}[data-task-item-key="${CSS.escape(key)}"]`)];
  }
  async function fetchPinned() {
    if (fetching) return fetching;
    const p = (async () => {
      const res = await rpc("/pinned-titles");
      if (!res || !res.ok) return null;
      resolved = true;
      enabled2 = res.enabled !== false;
      if (!enabled2) {
        pinned = null;
        return null;
      }
      pinned = new Map(Object.entries(res.titles || {}));
      return pinned;
    })();
    fetching = p;
    try {
      return await p;
    } finally {
      if (fetching === p) fetching = null;
    }
  }
  function isMismatch(item) {
    if (!enabled2 || !pinned) return null;
    const key = item.getAttribute("data-task-item-key") || "";
    const want = pinned.get(sessIdOf(key));
    if (want === void 0) return null;
    const els = titleElsOf(item);
    if (!els.length) return null;
    if ((els[0].textContent || "").trim() === String(want).trim()) return null;
    if (item.querySelector('input, textarea, [contenteditable="true"]')) return null;
    return key;
  }
  function writeTitle(el, text) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (first && !walker.nextNode()) first.nodeValue = text;
    else el.textContent = text;
  }
  function scheduleEnforce(key, { immediate = false } = {}) {
    if (immediate) {
      if (enabled2 && pinned) {
        const want = pinned.get(sessIdOf(key));
        if (want !== void 0) {
          for (const item of findRows(key)) {
            for (const el of titleElsOf(item)) writeTitle(el, want);
          }
        }
      }
    }
    if (pendingKeys.has(key)) return;
    pendingKeys.add(key);
    setTimeout(() => {
      pendingKeys.delete(key);
      void (async () => {
        const map = await fetchPinned();
        if (!map) return;
        const want = map.get(sessIdOf(key));
        if (want === void 0) return;
        let wrote = false;
        for (const item of findRows(key)) {
          if (isMismatch(item) !== key) continue;
          for (const el of titleElsOf(item)) writeTitle(el, want);
          wrote = true;
        }
        if (wrote) setTimeout(() => {
          void enforceKey(key);
        }, REVERIFY_MS);
      })();
    }, RECHECK_DELAY_MS);
  }
  async function enforceKey(key) {
    const map = await fetchPinned();
    if (!map) return;
    const want = map.get(sessIdOf(key));
    if (want === void 0) return;
    for (const item of findRows(key)) {
      if (isMismatch(item) !== key) continue;
      for (const el of titleElsOf(item)) writeTitle(el, want);
    }
  }
  function scan2() {
    if (!enabled2 || !pinned || pinned.size === 0) return;
    for (const item of document.querySelectorAll(TASK_SEL)) {
      const key = isMismatch(item);
      if (!key) {
        seenRows.add(item);
        continue;
      }
      const fresh = !seenRows.has(item);
      seenRows.add(item);
      scheduleEnforce(key, { immediate: fresh });
    }
  }
  var inTaskRow2 = (node) => !!(node instanceof Element && node.closest && node.closest(TASK_SEL));
  function taskRowMutations2(muts) {
    for (const m of muts) {
      if (m.type === "attributes") {
        if (inTaskRow2(m.target)) return true;
      } else if (m.type === "characterData") {
        if (m.target.parentElement && inTaskRow2(m.target.parentElement)) return true;
      } else if (inTaskRow2(m.target)) {
        return true;
      } else {
        for (const n of m.addedNodes) {
          if (n instanceof Element && (n.matches(TASK_SEL) || !!n.querySelector(TASK_SEL))) return true;
        }
      }
    }
    return false;
  }
  var scanDebounce2 = 0;
  function scheduleScan2() {
    if (scanDebounce2) return;
    scanDebounce2 = setTimeout(() => {
      scanDebounce2 = 0;
      scan2();
    }, SCAN_DEBOUNCE_MS2);
  }
  var mapRefreshTimer = 0;
  function refreshMapSoon() {
    if (mapRefreshTimer) return;
    const tick2 = () => {
      if (document.hidden) {
        mapRefreshTimer = setTimeout(tick2, 1e4);
        return;
      }
      mapRefreshTimer = 0;
      if (enabled2 && resolved) void fetchPinned().then((m) => {
        if (m) scan2();
      });
    };
    mapRefreshTimer = setTimeout(tick2, MAP_REFRESH_MS);
  }
  var editingKey = null;
  var bootDelay = 0;
  function scheduleBootRetry() {
    bootDelay = bootDelay ? Math.min(bootDelay * 2, MAP_REFRESH_MS) : BOOT_RETRY_MS;
    setTimeout(() => {
      if (resolved) return;
      if (!document.hidden) void bootstrap();
      scheduleBootRetry();
    }, bootDelay);
  }
  async function bootstrap() {
    const map = await fetchPinned();
    if (map) scan2();
  }
  function setRowTitle(key, text) {
    for (const item of findRows(key)) {
      for (const el of titleElsOf(item)) writeTitle(el, text);
    }
  }
  function refreshPinnedTitles() {
    return fetchPinned().then((m) => {
      if (m) scan2();
    });
  }
  var RENAME_CTX_VALID_MS = 15e3;
  var renameCtx = null;
  var renamePrefilled = /* @__PURE__ */ new WeakSet();
  function setNativeValue(el, text) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set.call(el, text);
    } else {
      el.textContent = text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function prefillRenameDialog() {
    if (!renameCtx || !renameCtx.armed || Date.now() - renameCtx.at > RENAME_CTX_VALID_MS) {
      renameCtx = null;
      return;
    }
    if (!enabled2 || !pinned) return;
    const want = pinned.get(sessIdOf(renameCtx.key));
    if (want === void 0) return;
    for (const el of document.querySelectorAll('[role="dialog"] input, [role="dialog"] textarea, [role="dialog"] [contenteditable="true"]')) {
      if (renamePrefilled.has(el) || !el.getClientRects().length) continue;
      if (el.closest(TASK_SEL) || el.closest(".zcodepro-overlay")) continue;
      const cur = String(el.value ?? el.textContent ?? "").trim();
      if (!cur) continue;
      renamePrefilled.add(el);
      if (cur !== String(want).trim()) setNativeValue(el, String(want));
      renameCtx = null;
      return;
    }
  }
  function startTitleLock() {
    if (installed2 || typeof document === "undefined") return;
    installed2 = true;
    void bootstrap();
    new MutationObserver((muts) => {
      if (renameCtx) prefillRenameDialog();
      if (!taskRowMutations2(muts)) return;
      refreshMapSoon();
      scheduleScan2();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"], characterData: true });
    document.addEventListener("contextmenu", (e) => {
      const row = e.target instanceof Element && e.target.closest(TASK_SEL);
      renameCtx = row ? { key: row.getAttribute("data-task-item-key") || "", at: 0, armed: false } : null;
    }, true);
    document.addEventListener("click", (e) => {
      if (!renameCtx || renameCtx.armed) return;
      const item = e.target instanceof Element && e.target.closest('[role="menuitem"], [data-radix-collection-item]');
      if (item && /重命名|rename/i.test(item.textContent || "")) {
        renameCtx.armed = true;
        renameCtx.at = Date.now();
      }
    }, true);
    scheduleBootRetry();
    setInterval(() => {
      if (!document.hidden) scan2();
    }, SCAN_FALLBACK_MS2);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scan2();
    });
    window.addEventListener("zcodepro:config-changed", () => {
      void bootstrap();
    });
    document.addEventListener("focusin", (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (!el.matches('input, textarea, [contenteditable="true"]')) return;
      const row = el.closest(TASK_SEL);
      editingKey = row ? row.getAttribute("data-task-item-key") || "" : null;
    });
    document.addEventListener("focusout", () => {
      if (editingKey === null) return;
      editingKey = null;
      void fetchPinned().then((m) => {
        if (m) scan2();
      });
    });
  }

  // src/inject/features/title-gen.js
  var CONV2 = '[class*="@md/conversation"]';
  var USER_ROW = '[class*="user-row"]';
  var SCAN_DEBOUNCE_MS3 = 300;
  var SCAN_FALLBACK_MS3 = 5e3;
  var SELECT_WAIT_MS = 2e3;
  var MSG_WAIT_MS = 1e4;
  var QUIET_FALLBACK_MS = 12e4;
  var COLLECT_MAX_MS = 6e5;
  var installed3 = false;
  var knownKeys = /* @__PURE__ */ new Set();
  var attempted = /* @__PURE__ */ new Set();
  var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
  function sessIdOf2(key) {
    const i = key.indexOf(":sess_");
    return i > 0 ? key.slice(i + 1) : "";
  }
  function currentKey() {
    for (const el of document.querySelectorAll("[data-task-item-key]")) {
      if ((el.className + "").includes("bg-selected")) return el.getAttribute("data-task-item-key") || "";
    }
    return "";
  }
  function userTexts() {
    return [...document.querySelectorAll(`${CONV2} ${USER_ROW}`)].map((r) => {
      const el = r.querySelector(".whitespace-pre-wrap");
      return ((el ? el.textContent : r.innerText) || "").trim();
    }).filter(Boolean);
  }
  var URL_RE = /https?:\/\/[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g;
  function assistantText() {
    const els = [...document.querySelectorAll('[class*="@md/conversation"] [class*="assistant-row"]')].filter((e) => !e.querySelector("[data-is-streaming]"));
    const last = els[els.length - 1];
    if (!last) return "";
    const text = (last.innerText || "").replace(URL_RE, "").trim();
    return text.slice(0, 600);
  }
  function linkDominant(t2) {
    const raw = t2.replace(/\s+/g, "");
    if (!raw) return true;
    const stripped = raw.replace(URL_RE, "");
    return stripped.length < raw.length / 3;
  }
  async function onNewTaskRow(key) {
    const selDeadline = Date.now() + SELECT_WAIT_MS;
    while (currentKey() !== key && Date.now() < selDeadline) await sleep2(200);
    if (currentKey() !== key) return;
    const cfg = await getConfig().catch(() => null);
    if (!cfg || !cfg.titleGen || cfg.titleGen.enabled !== true) return;
    const sessId = sessIdOf2(key);
    if (!sessId || attempted.has(sessId)) return;
    attempted.add(sessId);
    let texts = [];
    const msgDeadline = Date.now() + MSG_WAIT_MS;
    while (Date.now() < msgDeadline) {
      texts = userTexts();
      if (texts.length) break;
      await sleep2(400);
    }
    if (!texts.length) return;
    let assistantSeen = false;
    const convObserver = new MutationObserver((muts) => {
      if (currentKey() !== key) return;
      for (const m of muts) {
        const t2 = m.type === "characterData" ? m.target.parentElement : m.target;
        if (t2 instanceof Element && t2.closest(USER_ROW)) continue;
        for (const n of [t2, ...m.addedNodes]) {
          if (n instanceof Element && n.closest && n.closest(CONV2)) {
            assistantSeen = true;
            return;
          }
        }
      }
    });
    convObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    const startAt = Date.now();
    let lastCount = texts.length;
    let lastChange = Date.now();
    try {
      while (Date.now() - startAt < COLLECT_MAX_MS) {
        await sleep2(500);
        if (currentKey() !== key) {
          lastChange = Date.now();
          continue;
        }
        texts = userTexts();
        if (texts.length !== lastCount) {
          lastCount = texts.length;
          lastChange = Date.now();
        }
        if (assistantSeen) break;
        if (Date.now() - lastChange >= QUIET_FALLBACK_MS) break;
      }
    } finally {
      convObserver.disconnect();
    }
    if (!texts.length) return;
    if (linkDominant(texts.join("\n"))) {
      const deadline = Date.now() + 6e4;
      while (Date.now() < deadline) {
        await sleep2(2e3);
        if (currentKey() !== key) continue;
        const a = assistantText();
        if (a && a.length > 80) {
          texts.push(`\uFF08\u9996\u8F6E\u56DE\u7B54\u6458\u8981\uFF09${a}`);
          break;
        }
      }
    }
    const callTitleGen = () => rpc("/title-gen/run", { method: "POST", body: { sessId, text: texts.join("\n") } }).catch(() => null);
    let res = await callTitleGen();
    for (const delay of [5e3, 2e4]) {
      if (res && res.ok) break;
      await sleep2(delay);
      res = await callTitleGen();
    }
    if (res && res.ok && res.written && res.title) {
      setRowTitle(key, res.title);
      void refreshPinnedTitles();
    }
  }
  function scanForNewRows() {
    for (const el of document.querySelectorAll("[data-task-item-key]")) {
      const key = el.getAttribute("data-task-item-key") || "";
      if (!key || knownKeys.has(key)) continue;
      knownKeys.add(key);
      void onNewTaskRow(key);
    }
  }
  var TASK_SEL2 = "[data-task-item-key]";
  var inTaskRow3 = (node) => !!(node instanceof Element && node.closest && node.closest(TASK_SEL2));
  function taskRowMutations3(muts) {
    for (const m of muts) {
      if (m.type === "attributes") {
        if (inTaskRow3(m.target)) return true;
      } else if (m.type === "characterData") {
        if (m.target.parentElement && inTaskRow3(m.target.parentElement)) return true;
      } else if (inTaskRow3(m.target)) {
        return true;
      } else {
        for (const n of m.addedNodes) {
          if (n instanceof Element && (n.matches(TASK_SEL2) || !!n.querySelector(TASK_SEL2))) return true;
        }
      }
    }
    return false;
  }
  var scanDebounce3 = 0;
  function scheduleScan3() {
    if (scanDebounce3) return;
    scanDebounce3 = setTimeout(() => {
      scanDebounce3 = 0;
      scanForNewRows();
    }, SCAN_DEBOUNCE_MS3);
  }
  function startTitleGen() {
    if (installed3 || typeof document === "undefined") return;
    installed3 = true;
    scanForNewRows();
    new MutationObserver((muts) => {
      if (taskRowMutations3(muts)) scheduleScan3();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"], characterData: true });
    setInterval(() => {
      if (!document.hidden) scanForNewRows();
    }, SCAN_FALLBACK_MS3);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scanForNewRows();
    });
  }

  // src/inject/features/pinned-expand.js
  var installed4 = false;
  var keepCollapsed = false;
  var CONFIG_POLL_MIN_MS = 5e3;
  var CONFIG_POLL_MAX_MS = 6e4;
  var pollMs = CONFIG_POLL_MIN_MS;
  async function refreshConfig() {
    try {
      const res = await rpc("/config");
      if (res && res.ok && res.config && res.config.features) {
        const next = res.config.features.pinnedKeepCollapsed !== false;
        if (next !== keepCollapsed) {
          keepCollapsed = next;
          return true;
        }
      }
    } catch {
    }
    return false;
  }
  function pollConfig() {
    setTimeout(async () => {
      if (document.hidden) pollMs = CONFIG_POLL_MAX_MS;
      else pollMs = await refreshConfig() ? CONFIG_POLL_MIN_MS : Math.min(Math.round(pollMs * 1.5), CONFIG_POLL_MAX_MS);
      pollConfig();
    }, pollMs);
  }
  function startPinnedExpandSuppression() {
    if (installed4 || typeof document === "undefined") return;
    installed4 = true;
    void refreshConfig();
    pollConfig();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void refreshConfig();
    });
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
  function currentTaskRow() {
    for (const el of document.querySelectorAll("[data-task-item-key]")) {
      if ((el.className + "").includes("bg-selected")) return el;
    }
    return null;
  }
  function collapseNavSafe(head) {
    const cur = currentTaskRow();
    const backKey = cur ? cur.getAttribute("data-task-item-key") : "";
    head.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    if (!backKey) return;
    const back = cur && cur.isConnected ? cur : document.querySelector(`[data-task-item-key="${cssEscape(backKey)}"]`);
    if (back) back.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
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
    const userTouched2 = () => wsRow.__zcodeproUserTouched && Date.now() - wsRow.__zcodeproUserTouched < 800;
    const tick2 = () => {
      if (!keepCollapsed || Date.now() > deadline || !wsRow.isConnected) return done();
      const len = (document.querySelector("main") || document.body).innerText.length;
      if (len > lastLen) grewAt = Date.now();
      if (grewAt && Date.now() - grewAt >= 1e3) settledAt = settledAt || Date.now();
      lastLen = len;
      const head = headOf();
      if (head && head.getAttribute("aria-expanded") === "true" && !userTouched2()) {
        collapseNavSafe(head);
      }
      if (settledAt && Date.now() - settledAt >= 1e3) {
        const h2 = headOf();
        if (h2 && h2.getAttribute("aria-expanded") === "true" && !userTouched2()) {
          collapseNavSafe(h2);
        }
        return done();
      }
      setTimeout(tick2, 200);
    };
    const done = () => {
      wsRow.__zcodeproSuppending = false;
    };
    wsRow.__zcodeproSuppending = true;
    setTimeout(tick2, 400);
  }
  function cssEscape(s) {
    return String(s).replace(/(["\\\]])/g, "\\$1");
  }

  // src/inject/features/ws-running.js
  var installed5 = false;
  var enabled3 = true;
  var SCAN_DEBOUNCE_MS4 = 150;
  var SCAN_FALLBACK_MS4 = 5e3;
  var PEEK_FIRST_MS = 2e4;
  var PEEK_REPEAT_MS = 6e4;
  var PEEK_SETTLE_MS = 160;
  var PEEK_MAX_MS = 1500;
  var PEEK_UNMOUNT_WAIT_MS = 800;
  var CONFIG_POLL_MIN_MS2 = 5e3;
  var CONFIG_POLL_MAX_MS2 = 6e4;
  var TASK_SEL3 = "[data-task-item-key]";
  var WS_SEL = '[data-testid^="workspace-item-"]';
  var runningByWs = /* @__PURE__ */ new Map();
  var peekTimers = /* @__PURE__ */ new Map();
  var activePeeks = /* @__PURE__ */ new Set();
  var peekedWs = /* @__PURE__ */ new Set();
  var wsWithRows = /* @__PURE__ */ new Set();
  function workspaceOf2(key) {
    const i = key.indexOf(":sess_");
    return i > 0 ? key.slice(0, i) : key;
  }
  function findWsRow(ws) {
    return document.querySelector(`[data-testid="workspace-item-${CSS.escape(ws)}"]`);
  }
  function wsHead(row) {
    return row.matches("[aria-expanded]") ? row : row.querySelector("[aria-expanded]");
  }
  function isRunningRow(el) {
    const holder = el.firstElementChild && el.firstElementChild.querySelector(":scope > span");
    if (!holder) return false;
    return [...holder.children].some((c) => c.tagName === "svg" && (c.getAttribute("class") || "").includes("lucide-loader"));
  }
  function domRowsOf(ws) {
    return [...document.querySelectorAll(TASK_SEL3)].filter((e) => workspaceOf2(e.getAttribute("data-task-item-key") || "") === ws);
  }
  function currentTaskRow2() {
    for (const el of document.querySelectorAll(TASK_SEL3)) {
      if ((el.className + "").includes("bg-selected")) return el;
    }
    return null;
  }
  var synthClick = (el) => {
    try {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    } catch {
    }
  };
  function toggleNavSafe(head) {
    const cur = currentTaskRow2();
    const backKey = cur ? cur.getAttribute("data-task-item-key") : "";
    synthClick(head);
    if (!backKey) return;
    const back = cur && cur.isConnected ? cur : document.querySelector(`${TASK_SEL3}[data-task-item-key="${CSS.escape(backKey)}"]`);
    if (back) synthClick(back);
  }
  function scan3() {
    wsWithRows = /* @__PURE__ */ new Set();
    for (const el of document.querySelectorAll(TASK_SEL3)) {
      const key = el.getAttribute("data-task-item-key") || "";
      const ws = workspaceOf2(key);
      if (!ws) continue;
      wsWithRows.add(ws);
      const run = isRunningRow(el);
      let set = runningByWs.get(ws);
      if (run) {
        if (!set) {
          set = /* @__PURE__ */ new Set();
          runningByWs.set(ws, set);
        }
        set.add(key);
      } else if (set) {
        set.delete(key);
      }
    }
    syncPeeks();
    apply();
  }
  function handleRemovals(muts) {
    const removed = [];
    for (const m of muts) {
      if (m.type !== "childList") continue;
      for (const n of m.removedNodes) {
        if (!(n instanceof Element)) continue;
        if (n.matches(TASK_SEL3)) removed.push(n);
        else for (const r of n.querySelectorAll(TASK_SEL3)) removed.push(r);
      }
    }
    if (!removed.length) return;
    const infos = removed.map((el) => {
      const key = el.getAttribute("data-task-item-key") || "";
      const ws = workspaceOf2(key);
      return key && ws ? { key, ws, run: isRunningRow(el) } : null;
    }).filter(Boolean);
    if (!infos.length) return;
    setTimeout(() => {
      for (const info of infos) {
        const row = findWsRow(info.ws);
        const head = row && wsHead(row);
        const collapsed = !row || !head || head.getAttribute("aria-expanded") === "false";
        let set = runningByWs.get(info.ws);
        if (collapsed && info.run) {
          if (!set) {
            set = /* @__PURE__ */ new Set();
            runningByWs.set(info.ws, set);
          }
          set.add(info.key);
        } else if (set) {
          set.delete(info.key);
        }
      }
      syncPeeks();
      apply();
    }, 0);
  }
  function apply() {
    const seen = /* @__PURE__ */ new Set();
    for (const row of document.querySelectorAll(WS_SEL)) {
      const path = row.getAttribute("data-testid").slice("workspace-item-".length);
      seen.add(path);
      const head = wsHead(row);
      const collapsed = !head || head.getAttribute("aria-expanded") === "false";
      const running = !!(enabled3 && collapsed && runningByWs.get(path) && runningByWs.get(path).size);
      const icon = row.firstElementChild && row.firstElementChild.querySelector(":scope > span");
      if (icon) icon.classList.toggle("zcodepro-ws-running", running);
    }
    for (const ws of [...runningByWs.keys()]) if (!seen.has(ws)) runningByWs.delete(ws);
  }
  function schedulePeek(ws, delay) {
    clearTimeout(peekTimers.get(ws));
    peekTimers.set(ws, setTimeout(() => {
      peekTimers.delete(ws);
      void peek(ws);
    }, delay));
  }
  function clearPeek(ws) {
    const t2 = peekTimers.get(ws);
    if (t2) {
      clearTimeout(t2);
      peekTimers.delete(ws);
    }
  }
  function syncPeeks() {
    for (const [ws, set] of runningByWs) {
      if (!enabled3 || !set.size) {
        clearPeek(ws);
        continue;
      }
      const row = findWsRow(ws);
      const head = row && wsHead(row);
      if (!row || !head || head.getAttribute("aria-expanded") !== "false" || wsWithRows.has(ws)) {
        clearPeek(ws);
        continue;
      }
      if (!peekTimers.has(ws) && !activePeeks.has(ws)) schedulePeek(ws, peekedWs.has(ws) ? PEEK_REPEAT_MS : PEEK_FIRST_MS);
    }
  }
  var peekChain = Promise.resolve();
  async function peek(ws, opts) {
    const run = () => peekInner(ws, opts);
    const p = peekChain.then(run, run);
    peekChain = p.catch(() => {
    });
    return p;
  }
  async function peekInner(ws, opts) {
    if (!opts?.manual && !enabled3 || document.hidden || activePeeks.has(ws)) return false;
    const row = findWsRow(ws);
    const head = row && wsHead(row);
    if (!row || !head || head.getAttribute("aria-expanded") !== "false") return false;
    if (!currentTaskRow2()) {
      schedulePeek(ws, PEEK_REPEAT_MS);
      return false;
    }
    activePeeks.add(ws);
    peekedWs.add(ws);
    const rect = row.getBoundingClientRect();
    const frozen = row.cloneNode(true);
    frozen.classList.add("zcodepro-ws-frozen");
    frozen.style.left = rect.left + "px";
    frozen.style.top = rect.top + "px";
    frozen.style.width = rect.width + "px";
    frozen.style.height = rect.height + "px";
    document.body.append(frozen);
    row.style.visibility = "hidden";
    const hider = installPeekHider(ws);
    try {
      toggleNavSafe(head);
      await settleAndRead(ws);
      const rowNow = findWsRow(ws) || row;
      const headNow = wsHead(rowNow);
      if (headNow && headNow.getAttribute("aria-expanded") === "true" && !userTouched(rowNow)) {
        toggleNavSafe(headNow);
        await waitForRowsGone(ws);
      }
    } finally {
      removePeekHider(hider);
      row.style.visibility = "";
      frozen.remove();
      activePeeks.delete(ws);
    }
    apply();
    const set = runningByWs.get(ws);
    if (set && set.size && enabled3) schedulePeek(ws, PEEK_REPEAT_MS);
    return true;
  }
  function wsRunningSnapshot() {
    const curKey = currentTaskRow2()?.getAttribute("data-task-item-key") || "";
    return {
      running: [...runningByWs.entries()].filter(([, set]) => set.size > 0).map(([ws]) => ws),
      current: curKey ? workspaceOf2(curKey) || null : null
    };
  }
  async function verifyWorkspaceNotRunning(ws) {
    if (!ws || document.hidden) return false;
    const row = findWsRow(ws);
    const head = row && wsHead(row);
    if (!row || !head) return false;
    if (head.getAttribute("aria-expanded") !== "false") {
      let run = false;
      for (const el of domRowsOf(ws)) if (isRunningRow(el)) run = true;
      return !run;
    }
    let verified = false;
    try {
      verified = await peek(ws, { manual: true }) === true;
    } catch {
    }
    if (!verified) return false;
    const set = runningByWs.get(ws);
    return !(set && set.size);
  }
  function settleAndRead(ws) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      let lastCount = -1;
      let stableAt = 0;
      const timer = setInterval(() => {
        const rows = domRowsOf(ws);
        const elapsed = Date.now() - t0;
        if (rows.length !== lastCount) {
          lastCount = rows.length;
          stableAt = Date.now();
        }
        const settled = rows.length > 0 && rows.length === lastCount && Date.now() - stableAt >= PEEK_SETTLE_MS;
        if (!settled && elapsed < PEEK_MAX_MS) return;
        clearInterval(timer);
        if (lastCount === 0) {
          runningByWs.delete(ws);
        } else {
          let set = runningByWs.get(ws);
          if (!set) {
            set = /* @__PURE__ */ new Set();
            runningByWs.set(ws, set);
          }
          for (const el of rows) {
            const key = el.getAttribute("data-task-item-key") || "";
            if (isRunningRow(el)) set.add(key);
            else set.delete(key);
          }
        }
        resolve();
      }, 80);
    });
  }
  var PEEK_EXEMPT_CLASS = "zcodepro-peek-exempt";
  var cssAttr = (v) => String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  function installPeekHider(ws) {
    const rowSel3 = `${TASK_SEL3}[data-task-item-key^="${cssAttr(ws + ":")}"]`;
    for (const r of document.querySelectorAll(rowSel3)) r.classList.add(PEEK_EXEMPT_CLASS);
    const style = document.createElement("style");
    style.textContent = `${rowSel3}:not(.${PEEK_EXEMPT_CLASS}){display:none!important}`;
    document.head.append(style);
    return { style, sel: rowSel3 };
  }
  function removePeekHider(hider) {
    hider.style.remove();
    for (const r of document.querySelectorAll("." + PEEK_EXEMPT_CLASS)) r.classList.remove(PEEK_EXEMPT_CLASS);
  }
  function waitForRowsGone(ws) {
    const sel = `${TASK_SEL3}[data-task-item-key^="${cssAttr(ws + ":")}"]:not(.${PEEK_EXEMPT_CLASS})`;
    return new Promise((resolve) => {
      const t0 = Date.now();
      const timer = setInterval(() => {
        if (!document.querySelector(sel) || Date.now() - t0 >= PEEK_UNMOUNT_WAIT_MS) {
          clearInterval(timer);
          resolve();
        }
      }, 40);
    });
  }
  var TOUCH_WINDOW_MS = 800;
  var wsTouchAt = /* @__PURE__ */ new WeakMap();
  function userTouched(row) {
    const at = wsTouchAt.get(row);
    return !!at && Date.now() - at < TOUCH_WINDOW_MS;
  }
  function inSel(node, sel) {
    return !!(node instanceof Element && node.closest && node.closest(sel));
  }
  function relevant(muts) {
    for (const m of muts) {
      if (inSel(m.target, TASK_SEL3) || inSel(m.target, WS_SEL)) return true;
      for (const n of m.addedNodes) {
        if (n instanceof Element && (n.matches(TASK_SEL3) || n.matches(WS_SEL) || n.querySelector(TASK_SEL3) || n.querySelector(WS_SEL))) return true;
      }
      for (const n of m.removedNodes) {
        if (n instanceof Element && (n.matches(TASK_SEL3) || n.matches(WS_SEL) || n.querySelector(TASK_SEL3))) return true;
      }
    }
    return false;
  }
  var pollMs2 = CONFIG_POLL_MIN_MS2;
  async function refreshConfig2() {
    try {
      const res = await rpc("/config");
      if (res && res.ok && res.config && res.config.features) {
        const next = res.config.features.wsRunningSpin !== false;
        if (next !== enabled3) {
          enabled3 = next;
          if (!next) {
            for (const ws of [...peekTimers.keys()]) clearPeek(ws);
            apply();
          }
          return true;
        }
      }
    } catch {
    }
    return false;
  }
  function pollConfig2() {
    setTimeout(async () => {
      if (document.hidden) pollMs2 = CONFIG_POLL_MAX_MS2;
      else pollMs2 = await refreshConfig2() ? CONFIG_POLL_MIN_MS2 : Math.min(Math.round(pollMs2 * 1.5), CONFIG_POLL_MAX_MS2);
      pollConfig2();
    }, pollMs2);
  }
  var scanDebounce4 = 0;
  function startWsRunningSpin() {
    if (installed5 || typeof document === "undefined") return;
    installed5 = true;
    void refreshConfig2();
    pollConfig2();
    const observer2 = new MutationObserver((muts) => {
      if (!relevant(muts)) return;
      handleRemovals(muts);
      if (!scanDebounce4) {
        scanDebounce4 = setTimeout(() => {
          scanDebounce4 = 0;
          scan3();
        }, SCAN_DEBOUNCE_MS4);
      }
    });
    observer2.observe(document.body, { childList: true, subtree: true });
    scan3();
    setInterval(() => {
      if (!document.hidden && enabled3) scan3();
    }, SCAN_FALLBACK_MS4);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scan3();
    });
    document.addEventListener("click", (e) => {
      if (!e.isTrusted) return;
      const row = e.target instanceof Element && e.target.closest(WS_SEL);
      if (row) wsTouchAt.set(row, Date.now());
    }, true);
  }

  // src/inject/features/idle-reclaim.js
  var CHECK_MS = 3e4;
  var WS_SEL2 = '[data-testid^="workspace-item-"]';
  var MIN_MINUTES = 1;
  var MAX_MINUTES = 1440;
  var idleSince = /* @__PURE__ */ new Map();
  var blockUntil = /* @__PURE__ */ new Map();
  var scanDisabledLogged = false;
  var bootAt = Date.now();
  var startupSweepDone = false;
  var servicesRef = null;
  function findServices() {
    if (servicesRef) return servicesRef;
    try {
      const rootEl = document.getElementById("root");
      const containerKey = rootEl && Object.keys(rootEl).find((k) => k.startsWith("__reactContainer$"));
      if (!containerKey) return null;
      const seen = /* @__PURE__ */ new Set();
      let found = null;
      const scanObj = (o) => {
        if (!o || typeof o !== "object" || seen.has(o) || found) return;
        seen.add(o);
        const ts = o.zcodeTaskService;
        if (ts && typeof ts === "object" && typeof ts.releaseWorkspacePreparation === "function") found = o;
      };
      let visited = 0;
      const visit = (f) => {
        if (!f || found || visited > 6e4) return;
        visited++;
        for (const holder of [f.memoizedProps, f.memoizedState]) {
          if (!holder || typeof holder !== "object") continue;
          scanObj(holder);
          for (const v of Object.values(holder)) {
            if (v && typeof v === "object") scanObj(v);
          }
        }
        visit(f.child);
        visit(f.sibling);
      };
      visit(rootEl[containerKey]);
      if (found) servicesRef = found;
      return found;
    } catch {
      return null;
    }
  }
  function sidebarWorkspaces() {
    const out = /* @__PURE__ */ new Set();
    for (const el of document.querySelectorAll(WS_SEL2)) {
      out.add(el.getAttribute("data-testid").slice("workspace-item-".length));
    }
    return out;
  }
  async function reclaim(ws) {
    const services = findServices();
    if (!services) return false;
    try {
      await services.zcodeTaskService.releaseWorkspacePreparation({
        workspacePath: ws.endsWith("/") ? ws : ws + "/"
      });
      console.info("[zcodepro] idle-reclaim: \u5DF2\u91CA\u653E\u7A7A\u95F2\u9879\u76EE\u8FDB\u7A0B " + ws);
      return true;
    } catch (err) {
      console.warn("[zcodepro] idle-reclaim: \u91CA\u653E\u5931\u8D25 " + ws, err);
      return false;
    }
  }
  async function tryReclaim(ws, cooldownMs) {
    const verifiedIdle = await verifyWorkspaceNotRunning(ws);
    if (!verifiedIdle) {
      blockUntil.set(ws, Date.now() + cooldownMs);
      return;
    }
    const currentNow = wsRunningSnapshot().current;
    if (!currentNow || currentNow === ws) {
      blockUntil.set(ws, Date.now() + cooldownMs);
      return;
    }
    await reclaim(ws);
    blockUntil.set(ws, Date.now() + cooldownMs);
  }
  async function tick() {
    const cfg = await getConfig();
    if ((cfg.features || {}).idleReclaim === false) {
      idleSince.clear();
      return;
    }
    const minutes = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Number(cfg.idleReclaimMinutes) || 30));
    const threshold = minutes * 6e4;
    let startupMinutes = Number(cfg.idleReclaimStartupMinutes);
    if (!Number.isFinite(startupMinutes)) startupMinutes = 5;
    startupMinutes = Math.min(MAX_MINUTES, Math.max(0, startupMinutes));
    const snap = wsRunningSnapshot();
    if (!snap.current) {
      idleSince.clear();
      return;
    }
    const busy = new Set(snap.running);
    busy.add(snap.current);
    const workspaces = sidebarWorkspaces();
    for (const ws of [...idleSince.keys(), ...blockUntil.keys()]) {
      if (!workspaces.has(ws)) {
        idleSince.delete(ws);
        blockUntil.delete(ws);
      }
    }
    const candidates = [...workspaces].filter((ws) => !busy.has(ws));
    const res = candidates.length ? await rpc("/idle-busy", { method: "POST", body: { paths: candidates } }) : { ok: true, scan: true, busy: [] };
    if (!res.ok || res.scan === false) {
      if (!scanDisabledLogged) {
        scanDisabledLogged = true;
        console.info("[zcodepro] idle-reclaim: \u540E\u53F0\u547D\u4EE4\u626B\u63CF\u4E0D\u53EF\u7528\uFF0C\u7A7A\u95F2\u56DE\u6536\u505C\u7528");
      }
      idleSince.clear();
      return;
    }
    const procBusy = new Set(res.busy || []);
    const idleCandidates = candidates.filter((ws) => !procBusy.has(ws));
    const now = Date.now();
    if (!startupSweepDone && now - bootAt >= startupMinutes * 6e4) {
      startupSweepDone = true;
      for (const ws of idleCandidates) {
        if ((blockUntil.get(ws) || 0) > now) continue;
        await tryReclaim(ws, threshold);
      }
    }
    for (const ws of workspaces) {
      if (busy.has(ws) || procBusy.has(ws)) {
        idleSince.delete(ws);
        continue;
      }
      if (!idleSince.has(ws)) {
        idleSince.set(ws, now);
        continue;
      }
      if (now - idleSince.get(ws) < threshold) continue;
      if ((blockUntil.get(ws) || 0) > now) continue;
      idleSince.delete(ws);
      await tryReclaim(ws, threshold);
    }
  }
  function startIdleReclaim() {
    const loop = () => {
      tick().catch(() => {
      });
    };
    loop();
    setInterval(loop, CHECK_MS);
  }

  // src/inject/features/toolbar-icons.js
  var HIDE_CLASS = "zcodepro-tb-hidden";
  var SYNC_DEBOUNCE_MS = 150;
  var SCAN_FALLBACK_MS5 = 5e3;
  var ROW_SEL = "[data-task-item-key]";
  var MENU_SEL = '[data-testid="task-new-button"], [data-testid="automations-open"], [data-testid="plugin-store-sidebar-open"], [data-testid="sidebar-search-open"], [data-slot="command"], [data-testid="desktop-top-nav-back"]';
  var enabled4 = true;
  var rowEl = null;
  var origs = null;
  var syncTimer = 0;
  var widthObserver = null;
  var widthObserved = null;
  function findParts() {
    const newTask = document.querySelector('[data-testid="task-new-button"]');
    if (!newTask) return null;
    if (!isNewProjectSidebar()) {
      const menu = newTask.parentElement;
      if (!menu || !menu.querySelector('[data-testid="automations-open"]')) return null;
      const search2 = menu.querySelector('button [class*="lucide-search"]')?.closest("button");
      const auto2 = menu.querySelector('[data-testid="automations-open"]');
      const plugin2 = menu.querySelector('[data-testid="plugin-store-sidebar-open"]');
      return search2 && auto2 && plugin2 ? { newTask, search: search2, auto: auto2, plugin: plugin2, hideEls: [menu] } : null;
    }
    const search = document.querySelector('[data-testid="sidebar-search-open"]');
    const auto = document.querySelector('[data-testid="automations-open"]');
    const plugin = document.querySelector('[data-testid="plugin-store-sidebar-open"]');
    if (!search || !auto || !plugin) return null;
    const hideEls = [.../* @__PURE__ */ new Set([
      newTask.closest('[data-testid="sidebar-primary-navigation"]'),
      auto.closest('[data-testid="sidebar-primary-navigation"]'),
      search.closest('[data-testid="sidebar-search-toolbar"]')
    ])].filter(Boolean);
    return hideEls.length ? { newTask, search, auto, plugin, hideEls } : null;
  }
  function nameOf(orig, nameSel, fallback) {
    let name = nameSel && (orig.querySelector(nameSel)?.textContent || "").trim();
    if (!name) name = (orig.textContent || "").trim().split(/\s+/)[0]?.slice(0, 20) || "";
    return name || fallback;
  }
  function tipOf(orig, nameSel, fallback) {
    const name = nameOf(orig, nameSel, fallback);
    const kbd = (orig.querySelector("span.ml-auto")?.textContent || "").trim();
    return kbd ? `${name} \xB7 ${kbd}` : name;
  }
  function iconOf(orig) {
    const svg = orig.querySelector("svg");
    if (!svg) return null;
    const clone = svg.cloneNode(true);
    clone.setAttribute("class", "zcodepro-tb-icon");
    return clone;
  }
  function setActive(kind, on) {
    const btn = rowEl?.querySelector(`[data-kind="${kind}"]`);
    if (!btn) return;
    if (on) btn.setAttribute("data-active", "1");
    else btn.removeAttribute("data-active");
    if (kind === "auto" || kind === "plugin") btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function syncActive() {
    if (!origs || !rowEl) return;
    const auto = origs.auto.getAttribute("aria-pressed") === "true";
    const plugin = origs.plugin.getAttribute("aria-pressed") === "true";
    const palette = !!document.querySelector('[data-slot="command"]');
    let selected = false;
    for (const el of document.querySelectorAll(ROW_SEL)) {
      if ((el.className + "").includes("bg-selected")) {
        selected = true;
        break;
      }
    }
    setActive("newTask", !selected && !auto && !plugin);
    setActive("search", palette);
    setActive("auto", auto);
    setActive("plugin", plugin);
  }
  function rebuild() {
    const parts = findParts();
    const navRow = document.querySelector('[data-testid="desktop-top-nav-back"]')?.parentElement;
    if (!parts || !navRow) return false;
    if (origs && origs.hideEls[0] !== parts.hideEls[0]) {
      for (const el of origs.hideEls) el.classList.remove(HIDE_CLASS);
    }
    for (const el of parts.hideEls) el.classList.add(HIDE_CLASS);
    origs = parts;
    rowEl?.remove();
    navRow.classList.add("zcodepro-tb-hidden-native");
    const L = t();
    const mk = (kind, orig, nameSel, fallback) => h("button", {
      type: "button",
      class: "zcodepro-tb-btn",
      "data-kind": kind,
      "aria-label": nameOf(orig, nameSel, fallback),
      "data-zcodepro-tip": tipOf(orig, nameSel, fallback),
      onClick: () => {
        orig.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        setTimeout(syncActive, 150);
      }
    });
    const newBtn = mk("newTask", parts.newTask, "span.truncate", L.tbNewTask);
    const icon = iconOf(parts.newTask);
    if (icon) newBtn.append(icon);
    const searchBtn = mk("search", parts.search, "span.truncate", L.tbSearch);
    const sIcon = iconOf(parts.search);
    if (sIcon) searchBtn.append(sIcon);
    const autoBtn = mk("auto", parts.auto, null, L.tbAutomations);
    const aIcon = iconOf(parts.auto);
    if (aIcon) autoBtn.append(aIcon);
    const pluginBtn = mk("plugin", parts.plugin, null, L.tbPluginStore);
    const pIcon = iconOf(parts.plugin);
    if (pIcon) pluginBtn.append(pIcon);
    rowEl = h("div", { class: "zcodepro-tb-row" }, newBtn, searchBtn, autoBtn, pluginBtn);
    const updBtn = [...navRow.querySelectorAll("button")].find((b) => /bg-(success|emerald)/.test(b.className || ""));
    if (updBtn) updBtn.before(rowEl);
    else navRow.append(rowEl);
    return true;
  }
  function sidebarCollapsed() {
    const navRow = document.querySelector('[data-testid="desktop-top-nav-back"]')?.parentElement;
    const svg = navRow?.querySelector('button svg[class*="panel-left-"]');
    return !!svg && (svg.getAttribute("class") || "").includes("panel-left-open");
  }
  var NARROW_SIDEBAR_PX = 260;
  function sidebarTooNarrow() {
    const scroll = document.querySelector(".flex.flex-1.min-h-0.flex-col.gap-3.overflow-y-auto") || document.querySelector("aside .min-h-0.flex-1.overflow-y-auto");
    if (!scroll) return false;
    if (!widthObserver) widthObserver = new ResizeObserver(() => scheduleSync());
    if (widthObserved !== scroll) {
      if (widthObserved) widthObserver.unobserve(widthObserved);
      widthObserved = scroll;
      widthObserver.observe(scroll);
    }
    return scroll.getBoundingClientRect().width < NARROW_SIDEBAR_PX;
  }
  function sync() {
    if (!enabled4) return;
    const parts = findParts();
    if (!parts) {
      if (rowEl) rowEl.style.display = "none";
      return;
    }
    if (sidebarCollapsed() || sidebarTooNarrow()) {
      if (rowEl) rowEl.style.display = "none";
      for (const el of parts.hideEls) el.classList.remove(HIDE_CLASS);
      document.querySelectorAll(".zcodepro-tb-hidden-native").forEach((el) => el.classList.remove("zcodepro-tb-hidden-native"));
      return;
    }
    const alive = origs && origs.hideEls[0] === parts.hideEls[0] && origs.newTask.isConnected && origs.search.isConnected && origs.auto.isConnected && origs.plugin.isConnected && rowEl && rowEl.isConnected;
    if (!alive && !rebuild()) {
      if (rowEl) rowEl.style.display = "none";
      setTimeout(scheduleSync, 400);
      setTimeout(scheduleSync, 1200);
      return;
    }
    const navRow = document.querySelector('[data-testid="desktop-top-nav-back"]')?.parentElement;
    if (navRow) navRow.classList.add("zcodepro-tb-hidden-native");
    for (const el of parts.hideEls) el.classList.add(HIDE_CLASS);
    if (rowEl) rowEl.style.display = "";
    syncActive();
  }
  function scheduleSync() {
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = 0;
      sync();
    }, SYNC_DEBOUNCE_MS);
  }
  function relevantMutations(muts) {
    for (const m of muts) {
      if (m.type === "attributes") {
        const target = m.target;
        if (target instanceof Element && (target.matches(ROW_SEL) || target.matches('[data-testid="automations-open"], [data-testid="plugin-store-sidebar-open"]') || target.matches('svg[class*="panel-left-"]'))) {
          return true;
        }
        continue;
      }
      for (const list of [m.addedNodes, m.removedNodes]) {
        for (const n of list) {
          if (!(n instanceof Element)) continue;
          if (n.matches(MENU_SEL) || n.matches(ROW_SEL) || n.querySelector(MENU_SEL) || n.querySelector(ROW_SEL)) return true;
          if (n.matches('svg[class*="panel-left-"]') || n.querySelector?.('svg[class*="panel-left-"]')) return true;
        }
      }
    }
    return false;
  }
  function teardown() {
    rowEl?.remove();
    rowEl = null;
    if (origs) {
      for (const el of origs.hideEls) el.classList.remove(HIDE_CLASS);
      document.querySelectorAll(".zcodepro-tb-hidden-native").forEach((el) => el.classList.remove("zcodepro-tb-hidden-native"));
      origs = null;
    }
  }
  async function refreshConfig3() {
    const cfg = await getConfig(true).catch(() => null);
    enabled4 = !cfg || !cfg.features || cfg.features.toolbarIcons !== false;
    if (enabled4) sync();
    else teardown();
  }
  function startToolbarIcons() {
    ensureStyle();
    window.addEventListener("zcodepro:config-changed", () => {
      void refreshConfig3();
    });
    void refreshConfig3();
    new MutationObserver((muts) => {
      if (relevantMutations(muts)) scheduleSync();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-pressed"] });
    setInterval(() => {
      if (!document.hidden) sync();
    }, SCAN_FALLBACK_MS5);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) sync();
    });
  }

  // src/inject/features/pinned-collapse.js
  var COLLAPSED_CLASS = "zcodepro-pin-collapsed";
  var HEAD_CLASS = "zcodepro-pin-head";
  var STORE_KEY = "zcodepro:pinned-collapsed";
  var SYNC_DEBOUNCE_MS2 = 300;
  var SCAN_FALLBACK_MS6 = 5e3;
  var enabled5 = true;
  var syncTimer2 = 0;
  function findPinnedHeader() {
    for (const h3 of document.querySelectorAll("h3")) {
      const ul = h3.nextElementSibling;
      if (ul && ul.tagName === "UL" && ul.querySelector("li[data-task-item-key]")) return h3;
    }
    return null;
  }
  function chevronSvg() {
    const proto = document.querySelector("svg[data-purpose-section-chevron]");
    if (proto) {
      const clone = proto.cloneNode(true);
      clone.removeAttribute("class");
      clone.removeAttribute("data-purpose-section-chevron");
      return clone;
    }
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "m6 9 6 6 6-6");
    svg.append(path);
    return svg;
  }
  function isCollapsed() {
    try {
      return localStorage.getItem(STORE_KEY) === "1";
    } catch {
      return false;
    }
  }
  function toggle() {
    try {
      localStorage.setItem(STORE_KEY, isCollapsed() ? "0" : "1");
    } catch {
    }
    apply2();
  }
  function apply2() {
    const h3 = findPinnedHeader();
    if (!h3) return false;
    const sect = h3.parentElement;
    const collapsed = isCollapsed();
    sect.classList.toggle(COLLAPSED_CLASS, collapsed);
    const existing = h3.querySelector(".zcodepro-pin-chevron");
    if (h3.classList.contains(HEAD_CLASS) && existing) {
      existing.setAttribute("aria-expanded", collapsed ? "false" : "true");
      return true;
    }
    h3.classList.add(HEAD_CLASS);
    h3.addEventListener("click", () => {
      if (enabled5) toggle();
    });
    const btn = h("button", {
      type: "button",
      class: "zcodepro-pin-chevron",
      "aria-label": t().pinnedToggleAria,
      "aria-expanded": collapsed ? "false" : "true",
      onClick: (e) => {
        e.stopPropagation();
        if (enabled5) toggle();
      }
    });
    btn.append(chevronSvg());
    h3.append(btn);
    return true;
  }
  function sync2() {
    if (enabled5) apply2();
  }
  function scheduleSync2() {
    if (syncTimer2) return;
    syncTimer2 = setTimeout(() => {
      syncTimer2 = 0;
      sync2();
    }, SYNC_DEBOUNCE_MS2);
  }
  function relevantMutations2(muts) {
    for (const m of muts) {
      for (const list of [m.addedNodes, m.removedNodes]) {
        for (const n of list) {
          if (!(n instanceof Element)) continue;
          if (n.tagName === "H3" || n.matches("li[data-task-item-key]") || n.querySelector("h3, li[data-task-item-key]")) return true;
        }
      }
    }
    return false;
  }
  function teardown2() {
    for (const h3 of document.querySelectorAll("." + HEAD_CLASS)) {
      h3.classList.remove(HEAD_CLASS);
      h3.querySelector(".zcodepro-pin-chevron")?.remove();
      h3.parentElement?.classList.remove(COLLAPSED_CLASS);
    }
  }
  async function refreshConfig4() {
    const cfg = await getConfig(true).catch(() => null);
    enabled5 = !cfg || !cfg.features || cfg.features.pinnedCollapse !== false;
    if (enabled5) sync2();
    else teardown2();
  }
  function startPinnedCollapse() {
    ensureStyle();
    window.addEventListener("zcodepro:config-changed", () => {
      void refreshConfig4();
    });
    void refreshConfig4();
    new MutationObserver((muts) => {
      if (relevantMutations2(muts)) scheduleSync2();
    }).observe(document.body, { childList: true, subtree: true });
    setInterval(() => {
      if (!document.hidden) sync2();
    }, SCAN_FALLBACK_MS6);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) sync2();
    });
  }

  // src/inject/features/plugin-updates.js
  var NOTIFIED_KEY = "zcodepro-plugin-updates-notified";
  async function startPluginUpdateCheck() {
    const status = await rpc("/plugins/status");
    if (!status.ok || !Array.isArray(status.updates)) return;
    const L = t();
    if (status.updates.length === 0) return;
    const config = await getConfig();
    if ((config.features || {}).autoUpdatePlugins === true) {
      const res = await rpc("/plugins/update", { method: "POST", body: {} });
      if (res.ok) showToast(L.pluginsAutoUpdated, "success");
      else showToast(L.pluginsUpdateFailed + ": " + (res.error || ""), "error");
      return;
    }
    const sig = status.updates.map((u) => `${u.name}:${u.installed}>${u.latest}`).join(",");
    let seen = "";
    try {
      seen = window.localStorage.getItem(NOTIFIED_KEY) || "";
    } catch {
    }
    if (seen === sig) return;
    try {
      window.localStorage.setItem(NOTIFIED_KEY, sig);
    } catch {
    }
    showToast(L.pluginsUpdatesAvailable.replaceAll("{n}", String(status.updates.length)), "info");
  }

  // src/inject/index.js
  (function zcodeproInject() {
    if (typeof window === "undefined") return;
    if (window.__zcodeproInjected) {
      const boot = window.__ZCODEPRO__ || {};
      const sameGeneration = window.__zcodeproBootedToken && boot.token && window.__zcodeproBootedToken === boot.token;
      if (!sameGeneration) location.reload();
      return;
    }
    window.__zcodeproInjected = true;
    window.__zcodeproBootedToken = (window.__ZCODEPRO__ || {}).token || "";
    try {
      startLocaleResolver();
    } catch {
    }
    const start = () => {
      ensureStyle();
      try {
        startLocaleResolver();
      } catch {
      }
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
        startAliasMigrationWatcher();
      } catch {
      }
      try {
        startTaskOrderWatcher();
      } catch {
      }
      try {
        startSessionSwitch();
      } catch {
      }
      try {
        startTitleLock();
      } catch {
      }
      try {
        startTitleGen();
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
        startWsRunningSpin();
      } catch {
      }
      try {
        startIdleReclaim();
      } catch {
      }
      try {
        startToolbarIcons();
      } catch {
      }
      try {
        startPinnedCollapse();
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
      try {
        void startPluginUpdateCheck();
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
