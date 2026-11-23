# 设置弹窗：一级/二级标签页布局

设置弹窗（`src/inject/features/settings-dialog.js`）里有很多“标签页下再分标签页”的界面。
一级标签栏在弹窗顶部，二级标签栏放在对应面板内部（`subTabBars` 登记，切换一级标签时
统一显隐）。

## 必须遵守：二级标签的内容面板要留上间距

二级标签栏下方的内容面板必须带 `class: 'mt-2'`，否则标签按钮和第一行文字贴在一起，
看起来像挤在同一个块里。

```js
// 对：内容面板带 mt-2
const paneProxySoftware = h('div', { class: 'mt-2' });
const paneProxyVendor = h('div', { class: 'mt-2' });

// 错：内容面板没有间距，和上方 tab 栏粘在一起
const paneProxySoftware = h('div');
const paneProxyVendor = h('div');
```

**原因**：`zcodepro-tablist` 本身没有下边距，间距统一由内容面板的上边距提供。

**参照实现**：“行为”标签页（`agentsSubPanes`）里每个二级面板都是 `h('div', { class: 'mt-2' })`。
新增二级标签时照它写。

## 结构模板

```js
let subTab = 'first';
const subTablist = h('div', { role: 'tablist', 'aria-orientation': 'horizontal', class: 'zcodepro-tablist' });
const paneFirst = h('div', { class: 'mt-2' });   // 内容面板必须 mt-2
const paneSecond = h('div', { class: 'mt-2' });
const renderSubTabs = () => subTablist.replaceChildren(...[
  ['first', L.someLabel],
  ['second', L.anotherLabel],
].map(([id, label]) => h('button', {
  type: 'button', role: 'tab', class: 'zcodepro-tab',
  'aria-selected': String(subTab === id),
  'data-state': subTab === id ? 'active' : 'inactive',
  onClick: () => {
    subTab = id;
    paneFirst.style.display = id === 'first' ? '' : 'none';
    paneSecond.style.display = id === 'second' ? '' : 'none';
    renderSubTabs();
  },
}, label)));
renderSubTabs();
subTabBars.proxy = subTablist;                  // 登记后随一级标签切换显隐
paneProxy.append(subTablist, paneFirst, paneSecond);
paneSecond.style.display = 'none';              // 非当前页初始隐藏
```

## 现状

| 一级标签 | 二级标签 | 二级内容是否带 mt-2 |
|---|---|---|
| 外观（styles） | 壁纸 / 颜色 / 样式 / 状态栏 | 是 |
| 行为（agents） | ZCode / 全局提示词 / 任务名 / 自动继续 | 是（`agentsSubPanes`） |
| 代理（proxy） | 软件代理 / 供应商代理 | 是 |
