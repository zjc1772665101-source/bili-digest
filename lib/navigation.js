export const NAV_TAB_IDS = Object.freeze([
  "transcript",
  "overview",
  "chat",
  "notes",
  "comments",
  "settings",
]);

export const NAV_TAB_LABELS = Object.freeze({
  transcript: "字幕",
  overview: "概览",
  chat: "对话",
  notes: "笔记",
  comments: "评论",
  settings: "设置",
});

export const NAVIGATION_DEFAULTS = Object.freeze({
  navTabOrder: Object.freeze([...NAV_TAB_IDS]),
  navHiddenTabs: Object.freeze([]),
  navDefaultTab: "transcript",
  navRememberLastTab: true,
});

function uniqueValidTabs(value) {
  const seen = new Set();
  const result = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const id = String(raw || "");
    if (!NAV_TAB_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function normalizeNavigationSettings(source = {}) {
  const input = source && typeof source === "object" ? source : {};
  const order = uniqueValidTabs(input.navTabOrder);
  for (const id of NAV_TAB_IDS) {
    if (!order.includes(id)) order.push(id);
  }

  const hidden = uniqueValidTabs(input.navHiddenTabs).filter((id) => id !== "settings");
  const visible = order.filter((id) => !hidden.includes(id));

  let defaultTab = String(input.navDefaultTab || NAVIGATION_DEFAULTS.navDefaultTab);
  if (!visible.includes(defaultTab)) defaultTab = visible[0] || "settings";

  return {
    navTabOrder: order,
    navHiddenTabs: hidden,
    navDefaultTab: defaultTab,
    navRememberLastTab: input.navRememberLastTab !== false,
  };
}

export function visibleNavigationTabs(source = {}) {
  const normalized = normalizeNavigationSettings(source);
  return normalized.navTabOrder.filter((id) => !normalized.navHiddenTabs.includes(id));
}
