import assert from "node:assert/strict";
import {
  NAV_TAB_IDS,
  NAVIGATION_DEFAULTS,
  normalizeNavigationSettings,
  visibleNavigationTabs,
} from "../lib/navigation.js";

const defaults = normalizeNavigationSettings({});
assert.deepEqual(defaults.navTabOrder, [...NAV_TAB_IDS]);
assert.deepEqual(defaults.navHiddenTabs, []);
assert.equal(defaults.navDefaultTab, "transcript");
assert.equal(defaults.navRememberLastTab, true);

const malformed = normalizeNavigationSettings({
  navTabOrder: ["comments", "comments", "bogus", "transcript"],
  navHiddenTabs: ["chat", "settings", "bogus", "chat"],
  navDefaultTab: "chat",
  navRememberLastTab: false,
});
assert.deepEqual(malformed.navTabOrder, [
  "comments",
  "transcript",
  "overview",
  "chat",
  "notes",
  "settings",
]);
assert.deepEqual(malformed.navHiddenTabs, ["chat"]);
assert.equal(malformed.navDefaultTab, "comments");
assert.equal(malformed.navRememberLastTab, false);
assert.ok(visibleNavigationTabs(malformed).includes("settings"));

const settingsOnly = normalizeNavigationSettings({
  ...NAVIGATION_DEFAULTS,
  navHiddenTabs: ["transcript", "overview", "chat", "notes", "comments", "settings"],
  navDefaultTab: "comments",
});
assert.deepEqual(visibleNavigationTabs(settingsOnly), ["settings"]);
assert.equal(settingsOnly.navDefaultTab, "settings");

console.log("navigation.test.js: all assertions passed");
