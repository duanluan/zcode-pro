// 编辑上一条消息时保持输入框当前模型：官方进入编辑态会载入这条消息提交时的模型，
// 把用户刚在输入框里切好的模型换回去。这里在点编辑按钮时记下当前模型，
// 编辑态出现后直接调用模型选择器的 onValueChange 改回去（找不到回调时退回菜单）；
// 重跑就使用当前选择的模型。
import { getConfig } from '../core.js';

const TRIGGER_SEL = '[data-testid="chat-model-select-trigger"]';
const PROVIDER_TRIGGER_SEL = '[data-testid="composer-provider-trigger"]';
const EDIT_BAR_SEL = '[data-testid="v4-composer-edit-bar"]';
const EDIT_BTN_PREFIX = 'v4-edit-';
const ITEM_PREFIX = 'chat-model-select-item-';
const GROUP_PREFIX = 'chat-model-select-group-';

let installed = false;
let enabled = true;
let modelBeforeEdit = null;
let pendingEdit = false;
let editRequestAt = 0;
let providerListAt = 0;
let applying = false;

function currentModelValue() {
  const trigger = document.querySelector(TRIGGER_SEL);
  return trigger ? trigger.getAttribute('data-model-current-value') || '' : '';
}

// 与官方 encodeCustomModelValue 对应：custom:<providerId>:<modelName>
export function decodeProviderId(value) {
  if (!value || !value.startsWith('custom:')) return null;
  const body = value.slice('custom:'.length);
  const index = body.indexOf(':');
  const encoded = index < 0 ? body : body.slice(0, index);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function findByTestId(exact) {
  return (
    [...document.querySelectorAll('[data-testid]')].find(
      (el) => el.getAttribute('data-testid') === exact,
    ) || null
  );
}

function clickModelItem(value) {
  const item = findByTestId(ITEM_PREFIX + value);
  if (!item) return false;
  item.click();
  return true;
}

// 自定义 provider 的模型在别的供应商下：先点模型菜单顶部的供应商行展开列表，
// 列表里的分组项才是 chat-model-select-group-registry-provider:<providerId>。
function openProviderList() {
  const trigger = document.querySelector(PROVIDER_TRIGGER_SEL);
  if (!trigger) return false;
  trigger.focus();
  for (const name of ['pointerenter', 'mouseenter', 'mousemove']) {
    trigger.dispatchEvent(new MouseEvent(name, { bubbles: true, cancelable: true, view: window }));
  }
  trigger.click();
  return true;
}

function openProviderGroup(providerId) {
  const group = findByTestId(GROUP_PREFIX + 'registry-provider:' + providerId);
  if (!group) {
    // 列表还没展开或点空了：等下一轮再看，别在同一轮里反复点把已展开的列表收起来。
    if (Date.now() - providerListAt > 400) {
      providerListAt = Date.now();
      openProviderList();
    }
    return false;
  }
  group.focus();
  for (const name of ['pointerenter', 'mouseenter', 'mousemove']) {
    group.dispatchEvent(new MouseEvent(name, { bubbles: true, cancelable: true, view: window }));
  }
  group.click();
  return true;
}

function menuIsOpen() {
  return Boolean(
    document.querySelector(`[data-testid^="${ITEM_PREFIX}"]`) ||
      document.querySelector(`[data-testid^="${GROUP_PREFIX}"]`),
  );
}

// 模型菜单是 Radix 的受控下拉菜单，只派发 click 打不开，要按真实指针操作走一遍 pointerdown。
function openModelMenu() {
  const trigger = document.querySelector(TRIGGER_SEL);
  if (!trigger || trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') {
    return false;
  }
  if (trigger.getAttribute('aria-expanded') === 'true' || menuIsOpen()) return true;
  trigger.focus();
  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };
  trigger.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
  trigger.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
  trigger.click();
  return true;
}

// 直接改模型：模型选择器组件的 props 里有 onValueChange（菜单项选中时调用的同一个
// 函数），顺着触发按钮的 React fiber 往上找即可，不用打开菜单。找不到时退回菜单。
function setModelDirect(value) {
  const trigger = document.querySelector(TRIGGER_SEL);
  if (!trigger) return false;
  const fiberKey = Object.keys(trigger).find((k) => k.startsWith('__reactFiber$'));
  if (!fiberKey) return false;
  let fiber = trigger[fiberKey];
  for (let i = 0; fiber && i < 80; i += 1) {
    const props = fiber.memoizedProps || {};
    if (
      props.composerOptions &&
      typeof props.composerOptions === 'object' &&
      typeof props.onValueChange === 'function'
    ) {
      try {
        props.onValueChange(value);
        return true;
      } catch {
        return false;
      }
    }
    fiber = fiber.return;
  }
  return false;
}

// 先直接改；直接改没生效（结构变化/被拒）再走菜单。
function applyModel(value) {
  if (!setModelDirect(value)) {
    selectModel(value);
    return;
  }
  setTimeout(() => {
    if (!enabled || !document.querySelector(EDIT_BAR_SEL)) return;
    if (currentModelValue() !== value) selectModel(value);
  }, 300);
}

// 合并菜单选中模型后官方故意不关（方便继续调思考强度），这里点一下菜单外面收掉。
function closeModelMenu() {
  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };
  document.body.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
  document.body.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
  document.body.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
}

// 打开模型菜单并选中 value。菜单可能按 provider 分组，目标是二级菜单里的模型项。
function selectModel(value) {
  if (applying || !enabled) return;
  if (currentModelValue() === value) return;
  applying = true;
  let attempts = 0;
  let groupOpened = false;
  const step = () => {
    if (!enabled || currentModelValue() === value) {
      applying = false;
      return;
    }
    if (!menuIsOpen()) {
      openModelMenu();
      groupOpened = false;
    }
    if (clickModelItem(value)) {
      // 给官方提交选择留一帧，再收菜单并释放 applying。
      setTimeout(() => {
        closeModelMenu();
        applying = false;
      }, 100);
      return;
    }
    const providerId = decodeProviderId(value);
    if (providerId) {
      // 子菜单开一次就够，反复点会把已经展开的菜单又收起来。
      if (!groupOpened) groupOpened = openProviderGroup(providerId);
    } else {
      // 非 custom 值：逐个展开分组找目标项。
      for (const group of document.querySelectorAll(`[data-testid^="${GROUP_PREFIX}"]`)) {
        group.focus();
        for (const name of ['pointerenter', 'mouseenter', 'mousemove']) {
          group.dispatchEvent(
            new MouseEvent(name, { bubbles: true, cancelable: true, view: window }),
          );
        }
        group.click();
        if (clickModelItem(value)) {
          applying = false;
          return;
        }
      }
    }
    attempts += 1;
    if (attempts < 20) setTimeout(step, 120);
    else {
      applying = false;
      console.warn('[zcodepro] composer-edit-model: 没能选回模型 ' + value);
    }
  };
  if (!menuIsOpen() && !openModelMenu()) {
    applying = false;
    return;
  }
  setTimeout(step, 80);
}

function onEditClick(event) {
  if (!enabled) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(`[data-testid^="${EDIT_BTN_PREFIX}"]`)) return;
  const value = currentModelValue();
  if (document.querySelector(EDIT_BAR_SEL)) return;
  if (!value) return;
  modelBeforeEdit = value;
  pendingEdit = true;
  editRequestAt = Date.now();
}

function onMutate() {
  if (!enabled) return;
  const bar = document.querySelector(EDIT_BAR_SEL);
  if (!bar) {
    // 点完编辑到编辑条出现之间有若干帧，期间别的 DOM 变化不能把刚记下的模型清掉；
    // 超过 3 秒还没等到编辑条，说明这次点击没有进入编辑态，再清。
    if (!pendingEdit || Date.now() - editRequestAt > 3000) {
      pendingEdit = false;
      modelBeforeEdit = null;
    }
    applying = false;
    return;
  }
  if (!pendingEdit || !modelBeforeEdit) return;
  if (Date.now() - editRequestAt > 3000) {
    pendingEdit = false;
    modelBeforeEdit = null;
    return;
  }
  pendingEdit = false;
  const target = modelBeforeEdit;
  let checks = 0;
  // 官方载入原消息模型可能晚一帧到几帧；等它稳定后再比较，避免改在它前面被它覆盖。
  const tick = () => {
    if (!enabled || !document.querySelector(EDIT_BAR_SEL)) return;
    const current = currentModelValue();
    if (current && current !== target) {
      const official = current;
      applyModel(target);
      // 官方如果在后面又改回原消息的模型，再选回来；用户自己选的其它模型不干预。
      const watch = (left) => {
        if (!enabled || !document.querySelector(EDIT_BAR_SEL)) return;
        if (currentModelValue() === official && left > 0) {
          applyModel(target);
          setTimeout(() => watch(left - 1), 400);
        }
      };
      setTimeout(() => watch(2), 400);
      return;
    }
    checks += 1;
    if (checks < 16) setTimeout(tick, 50);
  };
  setTimeout(tick, 60);
}

export function startComposerEditModel() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  void getConfig()
    .then((cfg) => {
      enabled = cfg.features ? cfg.features.composerEditModel !== false : true;
    })
    .catch(() => {});
  window.addEventListener('zcodepro:config-changed', () => {
    void getConfig(true)
      .then((cfg) => {
        enabled = cfg.features ? cfg.features.composerEditModel !== false : true;
        if (!enabled) {
          pendingEdit = false;
          modelBeforeEdit = null;
        }
      })
      .catch(() => {});
  });
  document.addEventListener('click', onEditClick, true);
  new MutationObserver(onMutate).observe(document.body, { childList: true, subtree: true });
  onMutate();
}
