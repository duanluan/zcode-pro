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
    settingsTitle: "ZCode Pro",
    tabFeatures: "\u529F\u80FD",
    tabStyles: "\u6837\u5F0F",
    tabProxy: "\u4EE3\u7406",
    tabAgents: "\u5168\u5C40\u63D0\u793A\u8BCD",
    agentsDesc: "\u5199\u5165 ~/.zcode/AGENTS.md\uFF0C\u4F5C\u4E3A\u9ED8\u8BA4\u6307\u4EE4\u7528\u4E8E\u6240\u6709\u9879\u76EE\u7684\u6BCF\u6B21\u4F1A\u8BDD\uFF1B\u4FDD\u5B58\u540E\u4ECE\u65B0\u4F1A\u8BDD\u8D77\u751F\u6548\uFF0C\u9879\u76EE\u5185\u7684 AGENTS.md \u53EF\u8865\u5145\u6216\u8986\u76D6\u3002\u5185\u5BB9\u8D85\u8FC7 100KB \u4F1A\u88AB\u5E94\u7528\u622A\u65AD\u3002",
    agentsPlaceholder: "\u586B\u5199\u5E0C\u671B\u6240\u6709\u9879\u76EE\u9ED8\u8BA4\u9075\u5FAA\u7684\u6307\u4EE4\uFF1B\u6E05\u7A7A\u5E76\u4FDD\u5B58\u5373\u79FB\u9664\u5168\u5C40\u63D0\u793A\u8BCD",
    agentsSave: "\u4FDD\u5B58",
    agentsSaved: "\u5168\u5C40\u63D0\u793A\u8BCD\u5DF2\u4FDD\u5B58",
    agentsLoadFailed: "\u8BFB\u53D6\u5168\u5C40\u63D0\u793A\u8BCD\u5931\u8D25",
    proxyDesc: "\u4E3A ZCode Pro \u672C\u5730\u52A9\u624B\u53D1\u8D77\u7684\u7F51\u7EDC\u8BBF\u95EE\u8BBE\u7F6E HTTP \u4EE3\u7406\uFF1A\u63D2\u4EF6\u5E02\u573A\u7684\u66F4\u65B0\u4E0E\u5B89\u88C5\u3001Headroom \u672C\u4F53\u7684\u68C0\u67E5\u66F4\u65B0\u4E0E\u5347\u7EA7\u90FD\u4F1A\u8D70\u8BE5\u4EE3\u7406\u3002\u4E0D\u5F71\u54CD ZCode \u5E94\u7528\u672C\u8EAB\u4E0E\u6A21\u578B\u8BF7\u6C42\uFF0C\u4FDD\u5B58\u540E\u7ACB\u5373\u751F\u6548\u3002",
    proxyPlaceholder: "http://127.0.0.1:7890",
    proxySave: "\u4FDD\u5B58",
    proxySaved: "\u4EE3\u7406\u8BBE\u7F6E\u5DF2\u4FDD\u5B58",
    proxyHint: "\u7559\u7A7A\u4FDD\u5B58\u5373\u6E05\u9664\u4EE3\u7406\u3002",
    proxyTest: "\u68C0\u6D4B",
    proxyTesting: "\u68C0\u6D4B\u4E2D\u2026",
    proxyTestFailed: "\u68C0\u6D4B\u5931\u8D25",
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
    userLineHeightName: "\u63D0\u95EE\u884C\u9AD8",
    userLineHeightDesc: "\u63D0\u95EE\u5185\u5BB9\u7684\u884C\u9AD8\uFF08\u500D\u6570\uFF09\u3002",
    contentWidthName: "\u5185\u5BB9\u5BBD\u5EA6",
    contentWidthDesc: "\u4F1A\u8BDD\u5185\u5BB9\u7684\u6700\u5927\u5BBD\u5EA6\uFF0C\u53EF\u8F93\u5165 px \u6216 %\uFF08\u5982 900px\u300185%\uFF09\uFF1B\u9ED8\u8BA4\u663E\u793A\u5F53\u524D\u5B9E\u9645\u5BBD\u5EA6\uFF0C% \u76F8\u5BF9\u4F1A\u8BDD\u533A\u57DF\u3002",
    defaultValue: "\u9ED8\u8BA4",
    resetDefault: "\u6062\u590D\u9ED8\u8BA4",
    featureProjectMenu: "\u9879\u76EE\u83DC\u5355\u589E\u5F3A",
    featureProjectMenuDesc: "\u9879\u76EE\u300C\u66F4\u591A\u300D\u83DC\u5355\u4E2D\u7684\u81EA\u5B9A\u4E49\u522B\u540D\u3001\u5207\u6362\u6587\u4EF6\u5939\u3001\u6253\u5F00\u6587\u4EF6\u5939\u4E0E\u590D\u5236\u8DEF\u5F84\uFF08\u522B\u540D\u540C\u65F6\u4F5C\u7528\u4E8E\u4FA7\u8FB9\u680F\u663E\u793A\uFF09\u3002",
    featureTaskOrder: "\u4FA7\u8FB9\u680F\u4F1A\u8BDD\u62D6\u52A8\u6392\u5E8F",
    featureTaskOrderDesc: "\u8BA9\u7F6E\u9876\u3001\u9879\u76EE\u4E0E\u5206\u7EC4\u4E2D\u7684\u4F1A\u8BDD\u62D6\u52A8\u540E\u8BB0\u4F4F\u987A\u5E8F\uFF0C\u5237\u65B0\u540E\u4FDD\u6301\u3002",
    featureSessionSwitch: "\u4F1A\u8BDD\u5FEB\u6377\u5207\u6362",
    featureSessionSwitchDesc: "alt+z \u5728\u5F53\u524D\u4E0E\u4E0A\u6B21\u4F1A\u8BDD\u95F4\u6765\u56DE\u5207\u6362\uFF1B\u6309\u4F4F alt \u518D\u6309 x/c \u5F39\u51FA\u6700\u8FD1\u4F1A\u8BDD\u5217\u8868\u524D\u540E\u9009\u62E9\uFF0C\u677E\u5F00 alt \u5207\u6362\uFF08\u7C7B alt+tab\uFF09\u3002",
    featureWsRunning: "\u6298\u53E0\u9879\u76EE\u8FD0\u884C\u63D0\u793A",
    featureWsRunningDesc: "\u6298\u53E0\u7684\u9879\u76EE\u91CC\u4ECD\u6709\u4F1A\u8BDD\u5728\u8FD0\u884C\u65F6\uFF0C\u9879\u76EE\u56FE\u6807\u65CB\u8F6C\u63D0\u793A\uFF1B\u5168\u90E8\u7ED3\u675F\u6216\u5C55\u5F00\u9879\u76EE\u540E\u6062\u590D\u3002",
    featureToolbarIcons: "\u4FA7\u680F\u83DC\u5355\u5E76\u5165\u9876\u680F",
    featureToolbarIconsDesc: "\u628A\u4FA7\u8FB9\u680F\u9876\u90E8\u7684\u300C\u65B0\u5EFA\u4EFB\u52A1 / \u641C\u7D22 / \u81EA\u52A8\u5316 / \u63D2\u4EF6\u5E02\u573A\u300D\u6536\u6210\u9876\u90E8\u5BFC\u822A\u680F\uFF08\u540E\u9000/\u524D\u8FDB\u65C1\uFF09\u7684\u56FE\u6807\u6309\u94AE\uFF1A\u60AC\u505C\u663E\u793A\u540D\u79F0\uFF0C\u5BF9\u5E94\u754C\u9762\u6253\u5F00\u65F6\u9AD8\u4EAE\uFF0C\u5FEB\u6377\u952E\u7167\u5E38\u53EF\u7528\uFF1B\u4FA7\u8FB9\u680F\u539F\u83DC\u5355\u9690\u85CF\u3002",
    tbNewTask: "\u65B0\u5EFA\u4EFB\u52A1",
    tbSearch: "\u641C\u7D22",
    tbAutomations: "\u81EA\u52A8\u5316",
    tbPluginStore: "\u63D2\u4EF6\u5E02\u573A",
    featurePinnedCollapse: "\u5DF2\u7F6E\u9876\u5206\u533A\u53EF\u6298\u53E0",
    featurePinnedCollapseDesc: "\u4FA7\u8FB9\u680F\u300C\u5DF2\u7F6E\u9876\u300D\u6807\u9898\u53EF\u70B9\u51FB\u6298\u53E0/\u5C55\u5F00\u5176\u4EFB\u52A1\u5217\u8868\uFF08\u4E0E\u300C\u9879\u76EE\u300D\u300C\u5206\u7EC4\u300D\u5206\u533A\u4E00\u81F4\uFF09\uFF0C\u72B6\u6001\u8BB0\u4F4F\u3002",
    pinnedToggleAria: "\u6298\u53E0/\u5C55\u5F00\u5DF2\u7F6E\u9876",
    sidebarProjectSpacingName: "\u9879\u76EE\u95F4\u8DDD",
    sidebarProjectSpacingDesc: "\u4FA7\u8FB9\u680F\u4E2D\u76F8\u90BB\u9879\u76EE\u884C\u4E4B\u95F4\u7684\u89C6\u89C9\u95F4\u8DDD\uFF08\u542B\u884C\u5185\u7559\u767D\uFF09\uFF1B\u8BBE\u7F6E\u540E\u5404\u5206\u533A\uFF08\u5DF2\u7F6E\u9876/\u9879\u76EE/\u4EFB\u52A1\uFF09\u4E4B\u95F4\u7684\u95F4\u8DDD\u4E5F\u7EDF\u4E00\u4E3A\u8BE5\u503C\u3002",
    sidebarTaskSpacingName: "\u4EFB\u52A1\u95F4\u8DDD",
    sidebarTaskSpacingDesc: "\u4FA7\u8FB9\u680F\u4E2D\u76F8\u90BB\u4EFB\u52A1\u884C\u4E4B\u95F4\u7684\u5782\u76F4\u95F4\u8DDD\uFF08\u542B\u884C\u5185\u4E0A\u4E0B\u7559\u767D\uFF09\u3002",
    switcherHint: "x / c \u9009\u62E9\uFF0C\u677E\u5F00 alt \u5207\u6362\uFF0CEsc \u53D6\u6D88",
    switcherCurrent: "\u5F53\u524D",
    switcherEmpty: "\u6682\u65E0\u4E0A\u6B21\u4F1A\u8BDD\uFF08\u5207\u6362\u8FC7\u4F1A\u8BDD\u540E\u53EF\u7528\uFF09",
    switcherFailed: "\u672A\u80FD\u5207\u6362\u5230\u8BE5\u4F1A\u8BDD\uFF08\u53EF\u80FD\u5DF2\u5220\u9664\uFF09",
    featureFileActions: "\u6587\u4EF6\u83DC\u5355\u589E\u5F3A",
    featureFileActionsDesc: "\u5728\u4F1A\u8BDD\u4E2D\u6587\u4EF6\u94FE\u63A5\u7684\u53F3\u952E\u83DC\u5355\u91CC\u65B0\u589E\u300C\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00\u300D\u4E0E\u300C\u6253\u5F00\u6240\u5728\u76EE\u5F55\u300D\u3002",
    featureImageCopy: "\u56FE\u7247\u53F3\u952E\u590D\u5236",
    featureImageCopyDesc: "\u53F3\u952E\u4F1A\u8BDD\u4E2D\u7684\u56FE\u7247\u6216\u70B9\u51FB\u653E\u5927\u7684\u9884\u89C8\u56FE\uFF0C\u53EF\u5C06\u56FE\u7247\u590D\u5236\u5230\u526A\u8D34\u677F\u3002",
    imageCopy: "\u590D\u5236\u56FE\u7247",
    imageCopied: "\u56FE\u7247\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F",
    imageCopyFailed: "\u590D\u5236\u56FE\u7247\u5931\u8D25",
    openFolderItem: "\u6253\u5F00\u6587\u4EF6\u5939",
    copyPathItem: "\u590D\u5236\u8DEF\u5F84",
    pathCopied: "\u8DEF\u5F84\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F",
    pathCopyFailed: "\u590D\u5236\u8DEF\u5F84\u5931\u8D25",
    fileOpenDefault: "\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00",
    fileReveal: "\u6253\u5F00\u6240\u5728\u76EE\u5F55",
    featurePinnedExpand: "\u7F6E\u9876\u4F1A\u8BDD\u4FDD\u6301\u9879\u76EE\u6298\u53E0\uFF08\u5B9E\u9A8C\u6027\uFF09",
    featurePinnedExpandDesc: "\u70B9\u51FB\u6298\u53E0\u9879\u76EE\u7684\u7F6E\u9876\u4F1A\u8BDD\u540E\u5C06\u5176\u4FDD\u6301\u6298\u53E0\u3002\u53D7\u9650\u4E8E\u5E94\u7528\u673A\u5236\uFF0C\u9879\u76EE\u4F1A\u5148\u77ED\u6682\u5C55\u5F00\u518D\u7F29\u8D77\u3002",
    featureAutoUpdatePlugins: "\u81EA\u52A8\u66F4\u65B0 zcode-plugins \u63D2\u4EF6",
    featureAutoUpdatePluginsDesc: "\u542F\u52A8\u65F6\u81EA\u52A8\u68C0\u67E5\u5E76\u66F4\u65B0\u5DF2\u88C5\u7684 zcode-plugins \u63D2\u4EF6\uFF08\u542B\u5B89\u88C5\u5E02\u573A\u91CC\u65B0\u589E\u7684\u63D2\u4EF6\uFF09\uFF0C\u66F4\u65B0\u5728\u65B0\u4F1A\u8BDD\u751F\u6548\u3002",
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
    visionEnabled: "\u542F\u7528\u56FE\u7247\u8BC6\u522B",
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
    visionUseProviderHint: "\u4E0B\u62C9\u9009\u62E9\u6216\u624B\u52A8\u8F93\u5165\uFF1Asession=\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD\u4F9B\u5E94\u5546\uFF0C\u6216\u4F9B\u5E94\u5546\u540D/ID\uFF1B\u8BBE\u7F6E\u540E baseUrl/API Key/\u683C\u5F0F\u81EA\u52A8\u53D6\u8BE5\u4F9B\u5E94\u5546",
    visionUseProviderNone: "\u4E0D\u8DDF\u968F\uFF08\u81EA\u586B\u5730\u5740\uFF09",
    visionUseProviderSession: "\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD\uFF08session\uFF09",
    visionUseProviderUnknown: "\u672A\u627E\u5230\u8BE5\u4F9B\u5E94\u5546\uFF0C\u8BC6\u522B\u65F6\u4F1A\u62A5\u9519\uFF1B\u8BF7\u4ECE\u4E0B\u62C9\u9009\u62E9\uFF0C\u6216\u8F93\u5165 session",
    visionSkipAfterFailures: "\u8FDE\u7EED\u5931\u8D25\u6B21\u6570",
    visionSkipAfterFailuresHint: "\u67D0\u4EE3\u7406\u8FDE\u7EED\u5931\u8D25\u6EE1\u6B21\u6570\u540E\u6682\u65F6\u8DF3\u8FC7\u5B83\uFF0C\u76F4\u63A5\u8BD5\u4E0B\u4E00\u4E2A\uFF1B0 = \u4E0D\u8DF3\u8FC7",
    visionSkipMinutes: "\u8DF3\u8FC7\u5206\u949F\u6570",
    visionSkipMinutesHint: "\u8DF3\u8FC7\u591A\u4E45\u540E\u81EA\u52A8\u6062\u590D\u5C1D\u8BD5\uFF1B\u671F\u95F4\u4EFB\u4E00\u6B21\u6210\u529F\u5373\u6E05\u96F6\u8BA1\u6570",
    visionResetChain: "\u6062\u590D\u9ED8\u8BA4\u94FE",
    visionResetChainConfirm: "\u5C06\u94FE\u6A21\u5F0F\u4E0E\u4EE3\u7406\u5217\u8868\u6062\u590D\u4E3A\u9ED8\u8BA4\u4E24\u7EA7\uFF08glm-session \u2192 glm-flash\uFF09\uFF0C\u5F53\u524D\u5BF9\u4EE3\u7406\u7684\u4FEE\u6539\u4F1A\u4E22\u5931\u3002\u7EE7\u7EED\uFF1F",
    visionBaseUrl: "\u63A5\u53E3\u5730\u5740 baseUrl",
    visionModel: "\u6A21\u578B",
    visionFormat: "\u683C\u5F0F",
    visionApiKey: "API Key",
    visionApiKeyHint: "\u7559\u7A7A\u81EA\u52A8\u53D6 GLM \u8BA2\u9605 key",
    visionPrompt: "\u8BC6\u522B\u63D0\u793A\u8BCD\uFF08pipeline \u540E\u7EED\u6B65\u53EF\u7528 {prev} \u5F15\u7528\u4E0A\u4E00\u6B65\uFF09",
    visionTest: "\u6D4B\u8BD5",
    visionTesting: "\u6D4B\u8BD5\u4E2D\u2026",
    visionTestFailed: "\u89C6\u89C9\u4EE3\u7406\u6D4B\u8BD5\u5931\u8D25",
    visionTestOutput: "\u6D4B\u8BD5\u8F93\u51FA",
    visionCompressKB: "\u538B\u7F29\u9608\u503C KB",
    visionCompressKBHint: "\u8D85\u8FC7\u8BE5\u5927\u5C0F\u7684\u56FE\u5148\u538B\u7F29\u518D\u8BC6\u522B\uFF08\u6700\u957F\u8FB9 2000\u3001JPEG\uFF09\uFF1B0 = \u4E0D\u538B\u7F29",
    visionLoadFailed: "\u8BFB\u53D6\u89C6\u89C9\u4EE3\u7406\u914D\u7F6E\u5931\u8D25",
    tabRtk: "rtk",
    rtkDesc: "rtk \u63D2\u4EF6\uFF1A\u628A\u5E38\u89C1\u5F00\u53D1\u547D\u4EE4\u7684\u8F93\u51FA\u538B\u7F29 60-90% \u518D\u8FDB\u5165\u4E0A\u4E0B\u6587\uFF08/rtk-* \u547D\u4EE4\u7F16\u8F91\u540C\u4E00\u914D\u7F6E\uFF09\u3002\u6539\u52A8\u81EA\u52A8\u4FDD\u5B58\u5E76\u7ACB\u5373\u751F\u6548\u3002",
    rtkEnabled: "\u542F\u7528 rtk \u538B\u7F29",
    rtkNotInstalled: "\u672A\u5B89\u88C5 rtk\uFF0C\u4EE5\u4E0B\u914D\u7F6E\u5C06\u5728\u5B89\u88C5\u540E\u751F\u6548\uFF08\u4F1A\u8BDD\u91CC\u53EF\u7528 /rtk-setup \u5B89\u88C5\uFF09",
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
    headroomInstallTitle: "\u672A\u5B89\u88C5 headroom \u63D2\u4EF6",
    headroomInstallDesc: "\u4ECE zcode-plugins \u5E02\u573A\u5B89\u88C5\u540E\u5373\u53EF\u5728\u6B64\u7BA1\u7406\u538B\u7F29\u4EE3\u7406\uFF1B\u5EFA\u8BAE\u5B89\u88C5\u540E\u91CD\u542F\u4F1A\u8BDD\u751F\u6548\u3002",
    headroomInstall: "\u5B89\u88C5",
    headroomInstalling: "\u5B89\u88C5\u4E2D\u2026",
    headroomInstalled: "\u5DF2\u5B89\u88C5 headroom \u63D2\u4EF6",
    headroomInstallRetry: "\u5B89\u88C5\u672A\u751F\u6548\uFF0C\u8BF7\u91CD\u8BD5\u6216\u624B\u52A8\u5728\u63D2\u4EF6\u5E02\u573A\u5B89\u88C5",
    headroomLoadFailed: "\u8BFB\u53D6 Headroom \u914D\u7F6E\u5931\u8D25",
    headroomStatusTitle: "\u8FD0\u884C\u72B6\u6001",
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
    headroomStopDesc: "\u505C\u6B62\u540E\uFF0CZCode \u4E2D\u6307\u5411\u8BE5\u4EE3\u7406\uFF08127.0.0.1\uFF09\u7684\u4F9B\u5E94\u5546\u5C06\u65E0\u6CD5\u8FDE\u63A5\uFF0C\u76F4\u81F3\u91CD\u65B0\u542F\u52A8\u4EE3\u7406\u3002\u786E\u8BA4\u505C\u6B62\uFF1F",
    headroomStoppedWarn: "\u4EE3\u7406\u5DF2\u505C\u6B62\uFF1B\u6307\u5411 127.0.0.1 \u7684\u4F9B\u5E94\u5546\u5C06\u65E0\u6CD5\u8FDE\u63A5",
    headroomBackend: "\u538B\u7F29\u8BBE\u5907",
    headroomBackendAuto: "\u81EA\u52A8 \xB7 \u663E\u5361\u4F18\u5148",
    headroomBackendCpu: "CPU \xB7 \u7701\u7535",
    headroomBackendNative: "\uFF08\u539F\u751F\u503C\uFF09",
    headroomBackendDesc: "\u81EA\u52A8\uFF1Aheadroom \u9009\u6700\u5FEB\u8BBE\u5907\uFF08CUDA/MPS \u663E\u5361\u4F18\u5148\uFF09\uFF1BCPU\uFF1A\u5F3A\u5236 CPU \u538B\u7F29\uFF0C\u7701\u7535\u4E14\u4E0D\u5360\u663E\u5B58\u3002\u4E5F\u652F\u6301 headroom \u539F\u751F\u503C\uFF08onnx\u3001pytorch_mps \u7B49\uFF09\u3002\u5207\u6362\u4F1A\u91CD\u542F\u4EE3\u7406\u7ACB\u5373\u751F\u6548\u3002",
    headroomPower: "\u7701\u7535\u81EA\u52A8\u5207\u6362",
    headroomPowerOff: "\u5173\u95ED",
    headroomPowerOffDesc: "\u4E0D\u81EA\u52A8\u5207\u6362\uFF0C\u59CB\u7EC8\u6309\u300C\u538B\u7F29\u8BBE\u5907\u300D\u8FD0\u884C\u3002",
    headroomPowerBattery: "\u7528\u7535\u6C60\u65F6",
    headroomPowerBatteryDesc: "\u62D4\u7535\uFF08\u7535\u6C60\u653E\u7535\uFF09\u2192 CPU \u538B\u7F29\uFF0C\u63D2\u7535\u81EA\u52A8\u5207\u56DE\u3002",
    headroomPowerSaver: "\u7701\u7535\u6A21\u5F0F\u65F6",
    headroomPowerSaverDesc: "\u4EC5\u7CFB\u7EDF\u8FDB\u5165\u7701\u7535\u6A21\u5F0F \u2192 CPU \u538B\u7F29\uFF0C\u9000\u51FA\u5207\u56DE\u3002",
    hrCpuPinnedHint: "\u538B\u7F29\u8BBE\u5907\u5DF2\u56FA\u5B9A\u4E3A CPU\uFF0C\u7701\u7535\u81EA\u52A8\u5207\u6362\u4E0D\u4F1A\u518D\u6539\u53D8\u5B83\u3002",
    headroomInterval: "\u76D1\u89C6\u95F4\u9694",
    headroomIntervalDesc: "\u7701\u7535\u76D1\u89C6\u5668\u8F6E\u8BE2\u7535\u6E90\u72B6\u6001\u7684\u95F4\u9694\uFF0810\u20133600 \u79D2\uFF0C\u9ED8\u8BA4 60\uFF09\uFF1B\u4FDD\u5B58\u540E\u4ECE\u4E0B\u4E00\u8F6E\u5DE1\u68C0\u8D77\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F\u3002",
    headroomSecUnit: "\u79D2",
    headroomVersionPlugin: "\u63D2\u4EF6",
    headroomVersionBin: "\u7A0B\u5E8F",
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
    relocateHint: "\u76EE\u6807\u6587\u4EF6\u5939\u9700\u5DF2\u5B58\u5728\uFF0C\u53EF\u8F93\u5165\u8DEF\u5F84\u6216\u70B9\u51FB\u300C\u6D4F\u89C8\u300D\u9009\u62E9\uFF1B\u5B8C\u6210\u540E\u754C\u9762\u5C06\u81EA\u52A8\u5237\u65B0\u3002",
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
    tabAgents: "Global Prompt",
    agentsDesc: "Written to ~/.zcode/AGENTS.md and used as default instructions in every session across all projects. Takes effect for new sessions; per-project AGENTS.md can extend or override it. Content over 100 KB is truncated by the app.",
    agentsPlaceholder: "Instructions followed by all projects by default; save empty to remove the global prompt",
    agentsSave: "Save",
    agentsSaved: "Global prompt saved.",
    agentsLoadFailed: "Failed to load the global prompt",
    proxyDesc: "Set an HTTP proxy for network access made by the local helper: plugin marketplace updates and installs, headroom update checks and upgrades. Does not affect the ZCode app itself or model requests. Applies immediately.",
    proxyPlaceholder: "http://127.0.0.1:7890",
    proxySave: "Save",
    proxySaved: "Proxy settings saved.",
    proxyHint: "Save empty to clear the proxy.",
    proxyTest: "Test",
    proxyTesting: "Testing\u2026",
    proxyTestFailed: "Test failed",
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
    featureWsRunning: "Running indicator on collapsed projects",
    featureWsRunningDesc: "Spins a collapsed project's icon while any of its sessions is still running; stops when they all finish or the project is expanded.",
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
    copyPathItem: "Copy path",
    pathCopied: "Path copied to the clipboard.",
    pathCopyFailed: "Failed to copy the path.",
    fileOpenDefault: "Open with default app",
    fileReveal: "Reveal in file manager",
    featurePinnedExpand: "Keep projects collapsed for pinned sessions (experimental)",
    featurePinnedExpandDesc: "Keeps the project collapsed after clicking a pinned session. Note: it briefly expands first, then collapses.",
    featureAutoUpdatePlugins: "Auto-update zcode-plugins plugins",
    featureAutoUpdatePluginsDesc: "Checks and updates installed zcode-plugins plugins on startup (including newly added ones). Updates apply to new sessions.",
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
    visionEnabled: "Enable image recognition",
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
    visionUseProviderHint: "Pick from the list or type: session = follow the current session provider, or a provider name/ID; baseUrl/API key/format follow that provider",
    visionUseProviderNone: "Not following (enter base URL)",
    visionUseProviderSession: "Follow session provider (session)",
    visionUseProviderUnknown: "Unknown provider; recognition will fail. Pick from the list or type session",
    visionSkipAfterFailures: "Skip after failures",
    visionSkipAfterFailuresHint: "After this many consecutive failures a proxy is skipped and the next one is tried; 0 = never skip",
    visionSkipMinutes: "Skip minutes",
    visionSkipMinutesHint: "How long a skipped proxy rests before being retried; any success resets the counter",
    visionResetChain: "Reset default chain",
    visionResetChainConfirm: "Reset chain mode and the proxy list to the default 2-level chain (glm-session \u2192 glm-flash)? Current proxy edits will be lost. Continue?",
    visionBaseUrl: "Base URL",
    visionModel: "Model",
    visionFormat: "Format",
    visionApiKey: "API Key",
    visionApiKeyHint: "Leave empty to reuse the GLM subscription key",
    visionPrompt: "Recognition prompt ({prev} = previous step in pipeline)",
    visionTest: "Test",
    visionTesting: "Testing\u2026",
    visionTestFailed: "Vision proxy test failed",
    visionTestOutput: "Test output",
    visionCompressKB: "Compress threshold KB",
    visionCompressKBHint: "Images above this size are compressed first (max edge 2000, JPEG); 0 = never",
    visionLoadFailed: "Failed to load the vision config",
    tabRtk: "rtk",
    rtkDesc: "rtk plugin: compresses common dev command output by 60-90% before it reaches the context (/rtk-* commands edit the same files). Changes save automatically and apply immediately.",
    rtkEnabled: "Enable rtk compression",
    rtkNotInstalled: "rtk is not installed. The settings below take effect after installation (/rtk-setup in a session).",
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
    headroomInstallTitle: "headroom plugin not installed",
    headroomInstallDesc: "Install it from the zcode-plugins marketplace to manage the compression proxy here; restarting the session afterwards is recommended.",
    headroomInstall: "Install",
    headroomInstalling: "Installing\u2026",
    headroomInstalled: "headroom plugin installed",
    headroomInstallRetry: "Installation did not take effect; retry or install it from the marketplace manually",
    headroomLoadFailed: "Failed to load the Headroom config",
    headroomStatusTitle: "Status",
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
    headroomStopDesc: "Providers in ZCode that point at this proxy (127.0.0.1) will fail to connect until it is started again. Stop it?",
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
    headroomVersionPlugin: "plugin",
    headroomVersionBin: "program",
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
    "plugins-update": "Failed to update plugins"
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
  var dialogStack = [];
  function openDialog({ title, description, onMount, onClose, width = "sm:max-w-md", overlay = "dim", draggable = false, posKey = "", dismissOnOutside = true }) {
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
    content.append(
      titleEl,
      ...description ? [h("p", { class: "mt-2 text-ui-sm/relaxed text-foreground-subtle" }, description)] : []
    );
    const body = h("div", { class: "mt-4 zcodepro-dialog-body" });
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
    const norm2 = (v) => {
      if (!v || !RANGES[v.unit]) return null;
      const [min, max] = RANGES[v.unit];
      const n = v.unit === "px" ? Math.round(v.value) : Math.round(v.value * 10) / 10;
      return Number.isFinite(n) ? { value: Math.min(max, Math.max(min, n)), unit: v.unit } : null;
    };
    let current2 = norm2(value) || norm2(fallback) || { value: 100, unit: "%" };
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
      const next = norm2(v);
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
        current2 = norm2(fallback) || current2;
        display();
      },
      get() {
        return { ...current2 };
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
        class: `flex cursor-pointer items-start gap-2 rounded-lg ${desc ? "p-2" : "p-1.5"} transition-colors hover:bg-surface-hover`,
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
    /* \u4E24\u884C\u5E03\u5C40\uFF08\u6807\u9898 + \u9879\u76EE\u540D\uFF09\u5168\u90E8\u5C45\u5DE6\uFF1B\u6807\u9898\u884C\u7684\u300C\u5F53\u524D\u300D\u6807\u7B7E\u4E0E\u6587\u672C\u5782\u76F4\u5C45\u4E2D */
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
      padding-left: 8px;
      border-left: 1px solid var(--color-border, rgba(127, 127, 127, 0.25));
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
    /* \u5DF2\u7F6E\u9876\u5206\u533A\u53EF\u6298\u53E0\uFF08pinned-collapse.js\uFF09\uFF1A\u6807\u9898\u6574\u884C\u53EF\u70B9\uFF0C\u6298\u53E0\u65F6\u85CF\u8D77\u4EFB\u52A1\u5217\u8868\uFF0C
       chevron \u65CB\u5411\u4E0E\u300C\u9879\u76EE\u300D\u5206\u533A\u4E00\u81F4\uFF08\u6536\u8D77\u6307\u5411\u53F3\u4FA7\uFF09 */
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
      if (config.features && config.features.projectMenu === false) return;
      const project = await resolveProjectPath(removeItem);
      if (!project) return;
      appendAliasItem(content, removeItem, project);
      appendRelocateItem(content, removeItem, project);
      appendOpenFolderItem(content, removeItem, project);
      appendCopyPathItem(content, removeItem, project);
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
      const noApps = items.find((el) => NO_APPS_TEXTS.some((x) => itemText(el) === x)) || content.querySelector('[data-disabled][role="menuitem"]');
      const openAnchor = noApps && content.contains(noApps) ? noApps : copyAbs;
      appendMenuItem(content, copyAbs, openAnchor, {
        marker: "file-open-default",
        label: L.fileOpenDefault,
        icon: ICON_OPEN_DEFAULT,
        onPick: () => {
          try {
            void rpc("/open-path", { method: "POST", body: { path } });
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
    let enabled5 = true;
    const refresh = () => {
      void getConfig().then((c) => {
        enabled5 = !(c.features && c.features.imageCopy === false);
      });
    };
    refresh();
    document.addEventListener("contextmenu", (e) => {
      if (e.defaultPrevented) return;
      const img = copyTargetOf(e.target, e.clientX, e.clientY);
      if (!img) return;
      e.preventDefault();
      if (enabled5) showMenu(e.clientX, e.clientY, img);
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
    userLineHeight: 1.5,
    // 提问行高（用户消息文本容器，默认 normal=1.5）
    contentWidth: null,
    // 内容宽度：默认 100%（跟随应用，不覆盖）
    sidebarProjectSpacing: 20,
    // 侧栏项目间距：项目行视觉间距（行内留白 12 + 边距 8）
    sidebarTaskSpacing: 10
    // 侧栏任务间距：行内留白加行间边距（py-1 + space-y-0.5）
  };
  var styleEl = null;
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
        // 工具/状态卡片（「N 个文件已更改」等）上方间距下限 8px：
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
        `${SEL_TABLE}{margin-block:${tsp}px !important;position:relative !important;}`,
        `${SEL_TABLE} > .flex.items-center.justify-end{position:absolute !important;top:0;right:0;}`,
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
    const ulh = styles.userLineHeight;
    if (typeof ulh === "number" && Number.isFinite(ulh) && ulh >= 0.8) {
      parts.push(`${CONV} [class*="user-row"] .whitespace-pre-wrap{line-height:${ulh} !important;}`);
    }
    const cw = styles.contentWidth;
    if (cw && (cw.unit === "px" || cw.unit === "%") && Number.isFinite(cw.value)) {
      parts.push(`[data-v4-timeline-content-column]{max-width:${cw.value}${cw.unit} !important;}`);
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
    lineHeight: `${CONV} .space-y-4`,
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
  function makeUpgradeControls({ endpoint, metaRefresh }) {
    const L = t();
    const state = h("span", { class: "min-w-0 flex-1 truncate text-left text-ui-xs/relaxed text-foreground-subtle" });
    const setState = (text, kind = "") => {
      state.textContent = text;
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
    const tick = async () => {
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
        void tick();
      }, 1500);
      void tick();
    };
    void (async () => {
      const res = await rpc(endpoint + "/upgrade");
      if (res.ok && res.upgrade && res.upgrade.running) pollStart();
    })();
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
      // sm:max-w-3xl 不存在会失去约束拉满全屏；max-w-2xl=42rem 存在且尺寸合适
      width: "max-w-2xl",
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
        const visionProvidersRes = await rpc("/vision/providers");
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
          h("span", { class: "text-foreground-subtle/70" }, `${L.version} ${health.version} \xB7 ${HELPER_URL}`)
        );
        const rows = h("div", { class: "divide-y divide-border rounded-xl border border-border" });
        const refreshRows = () => {
          const f = config.features || {};
          rows.replaceChildren(
            settingRow(L.featureProjectMenu, L.featureProjectMenuDesc, f.projectMenu !== false, async () => {
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
            settingRow(L.featureWsRunning, L.featureWsRunningDesc, f.wsRunningSpin !== false, async () => {
              const next = !(f.wsRunningSpin !== false);
              if (await setFeature("wsRunningSpin", next)) f.wsRunningSpin = next;
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
          const res = await rpc("/plugins/update", { method: "POST", body: { installMissing: true } });
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
        const paneAgents = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneProxy = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneVision = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneRtk = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const paneHeadroom = h("div", { role: "tabpanel", class: "mt-4", style: "display:none" });
        const panes = { features: paneFeatures, styles: paneStyles, agents: paneAgents, proxy: paneProxy, vision: paneVision, headroom: paneHeadroom, rtk: paneRtk };
        const tabDefs = [
          ["features", L.tabFeatures],
          ["styles", L.tabStyles],
          ["agents", L.tabAgents],
          ["proxy", L.tabProxy],
          ["vision", L.tabVision],
          ["headroom", L.tabHeadroom],
          ["rtk", L.tabRtk]
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
        renderToolbarSwitch();
        paneStyles.append(
          toolbarSwitchWrap,
          h(
            "div",
            { class: "mt-2 grid grid-cols-2 gap-2 rounded-xl border border-border p-1" },
            ...cells.map((c) => h("div", { class: "rounded-lg transition-colors hover:bg-surface-hover" }, c.el))
          ),
          h(
            "div",
            { class: "mt-2 flex justify-end" },
            btnSmall(L.resetDefault, () => {
              for (const c of cells) c.field.reset();
              persistStyles(Object.fromEntries(Object.keys(STYLE_DEFAULTS).map((k) => [k, null])));
            })
          )
        );
        const agentsArea = h("textarea", {
          class: "zcodepro-textarea",
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
        paneAgents.append(
          h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.agentsDesc),
          ...agentsFailed ? [h("p", { class: "mt-2 text-ui-sm text-destructive" }, L.agentsLoadFailed + ": " + errText(agentsRes))] : [],
          h("div", { class: "mt-3" }, agentsArea),
          h("div", { class: "mt-3 flex justify-end" }, agentsSaveBtn)
        );
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
          proxyTestState
        );
        const VISION_DEFAULT_PROMPT = "\u8BF7\u8BE6\u7EC6\u63CF\u8FF0\u8FD9\u5F20\u56FE\u7247\u7684\u5168\u90E8\u5185\u5BB9\u3002\u82E5\u662F\u754C\u9762\u6216\u56FE\u8868\u622A\u56FE\uFF0C\u8BF7\u5148\u628A\u6240\u6709\u9519\u8BEF\u3001\u8B66\u544A\u3001\u5F02\u5E38\u72B6\u6001\u9010\u5B57\u5F15\u7528\u51FA\u6765\uFF08\u542B\u5B8C\u6574\u539F\u6587\uFF09\uFF0C\u518D\u63CF\u8FF0\u6574\u4F53\u5E03\u5C40\u3001\u6587\u5B57\u4E0E\u5173\u952E\u6570\u636E\u3002";
        const VISION_DEFAULT_CFG = {
          enabled: true,
          chainMode: "fallback",
          chain: ["glm-session", "glm-flash"],
          proxies: [
            { name: "glm-session", useProvider: "session", model: "glm-5.3-flash", prompt: VISION_DEFAULT_PROMPT },
            { name: "glm-flash", baseUrl: "https://open.bigmodel.cn/api/anthropic", model: "glm-5.3-flash", apiKey: "", format: "anthropic", prompt: VISION_DEFAULT_PROMPT }
          ],
          pollMs: 3e3,
          apiTimeoutMs: 12e4,
          // 视觉上游冷启动可能近 2 分钟，与插件 DEFAULT_CONFIG 一致
          compressThresholdKB: 1024,
          skipAfterFailures: 4,
          skipMinutes: 30,
          forceIntercept: true
        };
        const visionProviders = visionProvidersRes.ok && Array.isArray(visionProvidersRes.providers) ? visionProvidersRes.providers : [];
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
        const renderVision = () => {
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
          const cards = visionCfg.proxies.map((p, i) => h(
            "div",
            { class: "mt-2 rounded-xl border border-border p-2" },
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
              (() => {
                const sel = h(
                  "select",
                  { class: "h-7 shrink-0 rounded-lg border border-border bg-input px-1.5 text-ui-xs text-foreground outline-none" },
                  h("option", { value: "anthropic" }, "anthropic"),
                  h("option", { value: "openai" }, "openai")
                );
                sel.value = p.format === "openai" ? "openai" : "anthropic";
                sel.addEventListener("change", () => {
                  p.format = sel.value;
                  void persistVision();
                });
                return sel;
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
              field(L.visionUseProvider, (() => {
                const wrap = h("div", { class: "flex flex-col gap-1" });
                const input = h("input", { type: "text", value: p.useProvider || "", placeholder: L.visionUseProviderHint, class: visionInputCls });
                const warn = h("p", { class: "text-ui-xs text-destructive", style: "display:none" }, L.visionUseProviderUnknown);
                const isKnown = (v) => !v || v === "session" || visionProviders.some((pr) => pr.id === v || pr.name === v || (pr.aliases || []).includes(v));
                const sel = h("select", { class: visionInputCls });
                const syncSelect = () => {
                  const cur = (p.useProvider || "").trim();
                  const opts = [h("option", { value: "" }, L.visionUseProviderNone), h("option", { value: "session" }, L.visionUseProviderSession)];
                  for (const pr of visionProviders) {
                    opts.push(h("option", { value: pr.id }, pr.name && pr.name !== pr.id ? `${pr.name}\uFF08${pr.id}\uFF09` : pr.id));
                  }
                  if (cur && !opts.some((o) => o.value === cur)) opts.push(h("option", { value: cur }, `${cur}\uFF08${L.visionUseProvider}\uFF09`));
                  sel.replaceChildren(...opts);
                  sel.value = cur;
                };
                sel.addEventListener("change", () => {
                  input.value = sel.value;
                  p.useProvider = sel.value.trim();
                  warn.style.display = "none";
                  saveVisionSoon();
                });
                input.addEventListener("input", () => {
                  p.useProvider = input.value.trim();
                  saveVisionSoon();
                });
                input.addEventListener("blur", () => {
                  p.useProvider = input.value.trim();
                  warn.style.display = isKnown(p.useProvider) ? "none" : "";
                  syncSelect();
                });
                syncSelect();
                wrap.append(sel, input, warn);
                return wrap;
              })()),
              field(L.visionModel, textIn(p.model, (v) => {
                p.model = v;
                saveVisionSoon();
              })),
              field(L.visionBaseUrl, textIn(p.baseUrl, (v) => {
                p.baseUrl = v;
                saveVisionSoon();
              })),
              field(L.visionApiKey + " \xB7 " + L.visionApiKeyHint, textIn(p.apiKey, (v) => {
                p.apiKey = v;
                saveVisionSoon();
              }, { type: "password" }))
            ),
            (() => {
              const n = h("textarea", { class: "zcodepro-textarea zcodepro-textarea-sm", rows: "3", placeholder: L.visionPrompt });
              n.value = p.prompt || "";
              n.addEventListener("input", () => {
                p.prompt = n.value;
                saveVisionSoon();
              });
              return field(L.visionPrompt, n);
            })()
          ));
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
            if (!res.ok) showToast(L.visionTestFailed + ": " + errText(res), "error");
          });
          paneVision.replaceChildren(
            h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.visionDesc),
            // 链模式 + 两个开关合到一行（顶部已有简介，开关不再单占一块、不带描述）
            h(
              "div",
              { class: "mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border p-1" },
              h("span", { class: "ml-1.5 shrink-0 text-ui-sm font-medium text-foreground" }, L.visionMode),
              modeBtn("fallback", L.visionModeFallback, L.visionModeFallbackDesc),
              modeBtn("pipeline", L.visionModePipeline, L.visionModePipelineDesc),
              h(
                "div",
                { class: "ml-auto flex items-center gap-4" },
                settingRow(L.visionEnabled, "", visionCfg.enabled !== false, async () => {
                  visionCfg.enabled = !(visionCfg.enabled !== false);
                  await persistVision();
                  renderVision();
                }),
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
              numIn(visionCfg.skipAfterFailures, { min: 0, dflt: 4, title: L.visionSkipAfterFailuresHint, label: L.visionSkipAfterFailures, commit: (v) => {
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
                  visionCfg.proxies.push({ name: "", baseUrl: "https://open.bigmodel.cn/api/anthropic", model: "glm-5.3-flash", apiKey: "", format: "anthropic", prompt: "" });
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
              testBtn
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
        const renderRtkVersion = (meta) => {
          const v = meta.version || "rtk";
          rtkVersionLine.textContent = meta.binPath ? `${v} \xB7 ${meta.binPath}` : v;
        };
        renderRtkVersion(rtkRes);
        const rtkUp = makeUpgradeControls({
          endpoint: "/rtk",
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
          { class: "mt-3 flex items-center gap-2 rounded-xl border border-border p-2" },
          rtkVersionLine,
          rtkUp.state,
          rtkUp.btn,
          rtkSwitchRow
        );
        const rtkBody = h("div");
        paneRtk.append(
          h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.rtkDesc),
          rtkVersionCard,
          rtkBody
        );
        const renderRtk = () => {
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
            ...rtkCfg.installed ? [] : [h("p", { class: "text-ui-sm text-amber-500" }, L.rtkNotInstalled)],
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
        const renderHrVersion = (meta) => {
          const parts = [];
          if (meta.pluginVersion) parts.push(`${L.headroomVersionPlugin} ${meta.pluginVersion}`);
          if (meta.version) parts.push(`${L.headroomVersionBin} ${meta.version}`);
          hrVersionLine.textContent = parts.length ? parts.join(" \xB7 ") : `${L.headroomVersionPlugin} \u2014`;
        };
        renderHrVersion(headroomRes);
        const hrUp = makeUpgradeControls({
          endpoint: "/headroom",
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
              const res = await rpc("/plugins/update", { method: "POST", body: { name: "headroom", installMissing: true } });
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
            const res = await rpc("/headroom", { method: "POST", body: reqBody });
            hrBusy = false;
            if (!res.ok) {
              showToast(L.failed + ": " + errText(res), "error");
              return false;
            }
            if (res.config) Object.assign(hrCfg, res.config);
            if (warn) showToast(warn);
            setTimeout(() => {
              void hrRefresh();
            }, 1200);
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
          const hrHintLine = h("p", { class: "mt-1.5 text-ui-xs/relaxed text-amber-500", style: "display:none" });
          const hrRefresh = async () => {
            const res = await rpc("/headroom/status");
            if (!res.ok) {
              hrStatusLine.replaceChildren(
                h("span", { class: "text-ui-sm text-destructive" }, L.headroomStatusLoadFailed + ": " + errText(res))
              );
              hrFacts.replaceChildren();
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
              fact(L.headroomWatcher, s.watcherRunning ? L.headroomWatcherOn : L.headroomWatcherOff),
              fact(L.headroomSaverDetect, HR_DETECT[s.saverDetect] || s.saverDetect)
            );
            hrHintLine.textContent = s.saverHint || "";
            hrHintLine.style.display = s.saverHint ? "" : "none";
          };
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
          paneHeadroom.append(
            h("p", { class: "text-ui-sm/relaxed text-foreground-subtle" }, L.headroomDesc),
            ...headroomRes.installed === false ? [h("p", { class: "mt-2 text-ui-sm text-amber-500" }, L.headroomBinMissing)] : [],
            h(
              "div",
              { class: "mt-3 flex items-center justify-between gap-2 rounded-xl border border-border p-2" },
              h("div", { class: "flex min-w-0 items-center gap-2" }, hrVersionLine, hrUp.state),
              hrUp.btn
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
        body.append(
          statusLine,
          tablist,
          paneFeatures,
          paneStyles,
          paneAgents,
          paneProxy,
          paneVision,
          paneHeadroom,
          paneRtk
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

  // src/inject/features/pinned-expand.js
  var installed2 = false;
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
    if (installed2 || typeof document === "undefined") return;
    installed2 = true;
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
    head.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const cur = currentTaskRow();
    if (cur) cur.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
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
    const tick = () => {
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

  // src/inject/features/ws-running.js
  var installed3 = false;
  var enabled2 = true;
  var SCAN_DEBOUNCE_MS2 = 150;
  var SCAN_FALLBACK_MS2 = 5e3;
  var PEEK_FIRST_MS = 2e4;
  var PEEK_REPEAT_MS = 6e4;
  var PEEK_SETTLE_MS = 160;
  var PEEK_MAX_MS = 1500;
  var CONFIG_POLL_MIN_MS2 = 5e3;
  var CONFIG_POLL_MAX_MS2 = 6e4;
  var TASK_SEL = "[data-task-item-key]";
  var WS_SEL = '[data-testid^="workspace-item-"]';
  var runningByWs = /* @__PURE__ */ new Map();
  var peekTimers = /* @__PURE__ */ new Map();
  var activePeeks = /* @__PURE__ */ new Set();
  var peekedWs = /* @__PURE__ */ new Set();
  var peekHidden = /* @__PURE__ */ new Map();
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
    return [...document.querySelectorAll(TASK_SEL)].filter((e) => workspaceOf2(e.getAttribute("data-task-item-key") || "") === ws);
  }
  function currentTaskRow2() {
    for (const el of document.querySelectorAll(TASK_SEL)) {
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
    synthClick(head);
    const cur = currentTaskRow2();
    if (cur) synthClick(cur);
  }
  function scan2() {
    wsWithRows = /* @__PURE__ */ new Set();
    for (const el of document.querySelectorAll(TASK_SEL)) {
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
        if (n.matches(TASK_SEL)) removed.push(n);
        else for (const r of n.querySelectorAll(TASK_SEL)) removed.push(r);
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
      const running = !!(enabled2 && collapsed && runningByWs.get(path) && runningByWs.get(path).size);
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
      if (!enabled2 || !set.size) {
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
  async function peek(ws) {
    const run = () => peekInner(ws);
    const p = peekChain.then(run, run);
    peekChain = p.catch(() => {
    });
    return p;
  }
  async function peekInner(ws) {
    if (!enabled2 || document.hidden || activePeeks.has(ws)) return;
    const row = findWsRow(ws);
    const head = row && wsHead(row);
    if (!row || !head || head.getAttribute("aria-expanded") !== "false") return;
    if (!currentTaskRow2() && !document.querySelector('[data-testid^="conversation-new-task"]')) {
      schedulePeek(ws, PEEK_REPEAT_MS);
      return;
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
    try {
      toggleNavSafe(head);
      await settleAndRead(ws);
      const rowNow = findWsRow(ws) || row;
      const headNow = wsHead(rowNow);
      if (headNow && headNow.getAttribute("aria-expanded") === "true" && !userTouched(rowNow)) {
        toggleNavSafe(headNow);
      }
    } finally {
      cleanupPeekHidden(ws);
      row.style.visibility = "";
      frozen.remove();
      activePeeks.delete(ws);
    }
    apply();
    const set = runningByWs.get(ws);
    if (set && set.size && enabled2) schedulePeek(ws, PEEK_REPEAT_MS);
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
  function hidePeekRows(muts) {
    if (!activePeeks.size) return;
    for (const m of muts) {
      if (m.type !== "childList") continue;
      for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue;
        const rows = n.matches(TASK_SEL) ? [n] : [...n.querySelectorAll(TASK_SEL)];
        for (const r of rows) {
          const ws = workspaceOf2(r.getAttribute("data-task-item-key") || "");
          if (!activePeeks.has(ws)) continue;
          r.style.display = "none";
          pushHidden(ws, r);
          const ul = r.closest("ul");
          if (ul && !ul.__zcodeproPeekHidden) {
            ul.__zcodeproPeekHidden = true;
            ul.style.display = "none";
            pushHidden(ws, ul);
            const holder = ul.parentElement;
            if (holder && [...holder.classList].includes("empty:hidden") && !holder.__zcodeproPeekHidden) {
              holder.__zcodeproPeekHidden = true;
              holder.style.display = "none";
              pushHidden(ws, holder);
            }
          }
        }
      }
    }
  }
  function pushHidden(ws, el) {
    if (!peekHidden.has(ws)) peekHidden.set(ws, []);
    peekHidden.get(ws).push(el);
  }
  function cleanupPeekHidden(ws) {
    const els = peekHidden.get(ws) || [];
    for (const el of els) {
      el.style.display = "";
      delete el.__zcodeproPeekHidden;
    }
    peekHidden.delete(ws);
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
      if (inSel(m.target, TASK_SEL) || inSel(m.target, WS_SEL)) return true;
      for (const n of m.addedNodes) {
        if (n instanceof Element && (n.matches(TASK_SEL) || n.matches(WS_SEL) || n.querySelector(TASK_SEL) || n.querySelector(WS_SEL))) return true;
      }
      for (const n of m.removedNodes) {
        if (n instanceof Element && (n.matches(TASK_SEL) || n.matches(WS_SEL) || n.querySelector(TASK_SEL))) return true;
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
        if (next !== enabled2) {
          enabled2 = next;
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
  var scanDebounce2 = 0;
  function startWsRunningSpin() {
    if (installed3 || typeof document === "undefined") return;
    installed3 = true;
    void refreshConfig2();
    pollConfig2();
    const observer2 = new MutationObserver((muts) => {
      if (!relevant(muts)) return;
      handleRemovals(muts);
      hidePeekRows(muts);
      if (!scanDebounce2) {
        scanDebounce2 = setTimeout(() => {
          scanDebounce2 = 0;
          scan2();
        }, SCAN_DEBOUNCE_MS2);
      }
    });
    observer2.observe(document.body, { childList: true, subtree: true });
    scan2();
    setInterval(() => {
      if (!document.hidden && enabled2) scan2();
    }, SCAN_FALLBACK_MS2);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scan2();
    });
    document.addEventListener("click", (e) => {
      if (!e.isTrusted) return;
      const row = e.target instanceof Element && e.target.closest(WS_SEL);
      if (row) wsTouchAt.set(row, Date.now());
    }, true);
  }

  // src/inject/features/toolbar-icons.js
  var HIDE_CLASS = "zcodepro-tb-hidden";
  var SYNC_DEBOUNCE_MS = 150;
  var SCAN_FALLBACK_MS3 = 5e3;
  var ROW_SEL = "[data-task-item-key]";
  var MENU_SEL = '[data-testid="task-new-button"], [data-testid="automations-open"], [data-testid="plugin-store-sidebar-open"], [data-slot="command"], [data-testid="desktop-top-nav-back"]';
  var enabled3 = true;
  var rowEl = null;
  var origs = null;
  var syncTimer = 0;
  var widthObserver = null;
  var widthObserved = null;
  function findMenu() {
    const nt = document.querySelector('[data-testid="task-new-button"]');
    const menu = nt?.parentElement;
    return menu && menu.querySelector('[data-testid="automations-open"]') ? menu : null;
  }
  function originalsOf(menu) {
    const newTask = menu.querySelector('[data-testid="task-new-button"]');
    const search = newTask && menu.querySelector('button [class*="lucide-search"]')?.closest("button");
    const auto = menu.querySelector('[data-testid="automations-open"]');
    const plugin = menu.querySelector('[data-testid="plugin-store-sidebar-open"]');
    return newTask && search && auto && plugin ? { menu, newTask, search, auto, plugin } : null;
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
    const menu = findMenu();
    if (!menu) return false;
    const next = originalsOf(menu);
    const navRow = document.querySelector('[data-testid="desktop-top-nav-back"]')?.parentElement;
    if (!next || !navRow) return false;
    if (origs && origs.menu !== menu) origs.menu.classList.remove(HIDE_CLASS);
    menu.classList.add(HIDE_CLASS);
    origs = next;
    rowEl?.remove();
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
    const newBtn = mk("newTask", next.newTask, "span.truncate", L.tbNewTask);
    const icon = iconOf(next.newTask);
    if (icon) newBtn.append(icon);
    const searchBtn = mk("search", next.search, "span.truncate", L.tbSearch);
    const sIcon = iconOf(next.search);
    if (sIcon) searchBtn.append(sIcon);
    const autoBtn = mk("auto", next.auto, null, L.tbAutomations);
    const aIcon = iconOf(next.auto);
    if (aIcon) autoBtn.append(aIcon);
    const pluginBtn = mk("plugin", next.plugin, null, L.tbPluginStore);
    const pIcon = iconOf(next.plugin);
    if (pIcon) pluginBtn.append(pIcon);
    rowEl = h("div", { class: "zcodepro-tb-row" }, newBtn, searchBtn, autoBtn, pluginBtn);
    navRow.append(rowEl);
    return true;
  }
  function sidebarCollapsed() {
    const navRow = document.querySelector('[data-testid="desktop-top-nav-back"]')?.parentElement;
    const svg = navRow?.querySelector('button svg[class*="panel-left-"]');
    return !!svg && (svg.getAttribute("class") || "").includes("panel-left-open");
  }
  var NARROW_SIDEBAR_PX = 260;
  function sidebarTooNarrow() {
    const scroll = document.querySelector(".flex.flex-1.min-h-0.flex-col.gap-3.overflow-y-auto");
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
    if (!enabled3) return;
    const menu = findMenu();
    if (!menu) {
      if (rowEl) rowEl.style.display = "none";
      return;
    }
    if (sidebarCollapsed() || sidebarTooNarrow()) {
      if (rowEl) rowEl.style.display = "none";
      menu.classList.remove(HIDE_CLASS);
      return;
    }
    const alive = origs && origs.menu === menu && origs.newTask.isConnected && origs.search.isConnected && origs.auto.isConnected && origs.plugin.isConnected && rowEl && rowEl.isConnected;
    if (!alive && !rebuild()) return;
    menu.classList.add(HIDE_CLASS);
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
      origs.menu.classList.remove(HIDE_CLASS);
      origs = null;
    }
  }
  async function refreshConfig3() {
    const cfg = await getConfig(true).catch(() => null);
    enabled3 = !cfg || !cfg.features || cfg.features.toolbarIcons !== false;
    if (enabled3) sync();
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
    }, SCAN_FALLBACK_MS3);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) sync();
    });
  }

  // src/inject/features/pinned-collapse.js
  var COLLAPSED_CLASS = "zcodepro-pin-collapsed";
  var HEAD_CLASS = "zcodepro-pin-head";
  var STORE_KEY = "zcodepro:pinned-collapsed";
  var SYNC_DEBOUNCE_MS2 = 300;
  var SCAN_FALLBACK_MS4 = 5e3;
  var enabled4 = true;
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
      if (enabled4) toggle();
    });
    const btn = h("button", {
      type: "button",
      class: "zcodepro-pin-chevron",
      "aria-label": t().pinnedToggleAria,
      "aria-expanded": collapsed ? "false" : "true",
      onClick: (e) => {
        e.stopPropagation();
        if (enabled4) toggle();
      }
    });
    btn.append(chevronSvg());
    h3.append(btn);
    return true;
  }
  function sync2() {
    if (enabled4) apply2();
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
    enabled4 = !cfg || !cfg.features || cfg.features.pinnedCollapse !== false;
    if (enabled4) sync2();
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
    }, SCAN_FALLBACK_MS4);
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
      const res = await rpc("/plugins/update", { method: "POST", body: { installMissing: true } });
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
        startSessionSwitch();
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
