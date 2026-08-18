import { TYPOGRAPHY_DEFAULTS } from "./typography.js";

export const SETTINGS_BACKUP_FORMAT = "bili-digest-settings";
export const SETTINGS_BACKUP_VERSION = 1;

const BASE_SETTING_KEYS = Object.freeze([
  "aiBaseUrl",
  "aiModel",
  "asrModel",
  "asrLanguage",
  "thinkingLevel",
  "targetLanguage",
  "customLanguage",
  "showMarkButton",
  "showBrandText",
]);

export const TRANSFERABLE_SETTING_KEYS = Object.freeze([
  ...BASE_SETTING_KEYS,
  ...Object.keys(TYPOGRAPHY_DEFAULTS),
]);

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function pickSettings(source, includeApiKey) {
  const settings = {};
  for (const key of TRANSFERABLE_SETTING_KEYS) {
    if (own(source, key)) settings[key] = source[key];
  }
  if (includeApiKey && own(source, "aiApiKey")) {
    settings.aiApiKey = String(source.aiApiKey || "");
  }
  if (includeApiKey && own(source, "asrGroqApiKey")) {
    settings.asrGroqApiKey = String(source.asrGroqApiKey || "");
  }
  return settings;
}

export function createSettingsBackup(
  settings,
  { includeApiKey = false, theme = "light", exportedAt = new Date().toISOString() } = {},
) {
  const source = settings && typeof settings === "object" ? settings : {};
  return JSON.stringify(
    {
      format: SETTINGS_BACKUP_FORMAT,
      version: SETTINGS_BACKUP_VERSION,
      exportedAt,
      theme: theme === "dark" ? "dark" : "light",
      includesApiKey: Boolean(includeApiKey),
      settings: pickSettings(source, includeApiKey),
    },
    null,
    2,
  );
}

export function parseSettingsBackup(text) {
  let payload;
  try {
    payload = JSON.parse(String(text || ""));
  } catch {
    throw new Error("设置文件不是合法 JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("设置文件结构无效");
  }
  if (payload.format !== SETTINGS_BACKUP_FORMAT) {
    throw new Error("这不是 Bili Digest 设置文件");
  }
  if (payload.version !== SETTINGS_BACKUP_VERSION) {
    throw new Error(`暂不支持设置文件版本：${String(payload.version ?? "未知")}`);
  }
  if (!payload.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings)) {
    throw new Error("设置文件缺少 settings 对象");
  }
  const includesApiKey =
    own(payload.settings, "aiApiKey") || own(payload.settings, "asrGroqApiKey");
  return {
    settings: pickSettings(payload.settings, includesApiKey),
    theme: payload.theme === "dark" || payload.theme === "light" ? payload.theme : null,
    includesApiKey,
  };
}
