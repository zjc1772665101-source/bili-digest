import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_BACKUP_FORMAT,
  SETTINGS_BACKUP_VERSION,
  createSettingsBackup,
  parseSettingsBackup,
} from "../lib/settings-transfer.js";

test("设置导出默认排除 API Key，并包含主题与新增按钮参数", () => {
  const json = createSettingsBackup(
    {
      aiApiKey: "sk-secret",
      aiBaseUrl: "https://example.com/v1",
      aiModel: "demo",
      overviewButtonFontSize: 22,
      videoActionButtonSize: 60,
      unknownField: "drop-me",
    },
    { theme: "dark", exportedAt: "2026-08-18T00:00:00.000Z" },
  );
  const payload = JSON.parse(json);
  assert.equal(payload.format, SETTINGS_BACKUP_FORMAT);
  assert.equal(payload.version, SETTINGS_BACKUP_VERSION);
  assert.equal(payload.theme, "dark");
  assert.equal(payload.includesApiKey, false);
  assert.equal("aiApiKey" in payload.settings, false);
  assert.equal(payload.settings.overviewButtonFontSize, 22);
  assert.equal(payload.settings.videoActionButtonSize, 60);
  assert.equal("unknownField" in payload.settings, false);
});

test("设置导出可显式包含 API Key，导入只保留白名单字段", () => {
  const json = createSettingsBackup(
    { aiApiKey: "sk-secret", aiModel: "demo", showMarkButton: false },
    { includeApiKey: true },
  );
  const payload = JSON.parse(json);
  payload.settings.injection = "ignored";
  const parsed = parseSettingsBackup(JSON.stringify(payload));
  assert.equal(parsed.includesApiKey, true);
  assert.equal(parsed.settings.aiApiKey, "sk-secret");
  assert.equal(parsed.settings.showMarkButton, false);
  assert.equal("injection" in parsed.settings, false);
});

test("无 API Key 的备份导入时不生成空 Key，便于保留当前密钥", () => {
  const parsed = parseSettingsBackup(
    createSettingsBackup({ aiBaseUrl: "https://example.com/v1" }),
  );
  assert.equal(parsed.includesApiKey, false);
  assert.equal("aiApiKey" in parsed.settings, false);
});

test("设置导入拒绝非法 JSON、错误格式和未知版本", () => {
  assert.throws(() => parseSettingsBackup("{"), /不是合法 JSON/);
  assert.throws(() => parseSettingsBackup(JSON.stringify({ settings: {} })), /不是 Bili Digest/);
  assert.throws(
    () =>
      parseSettingsBackup(
        JSON.stringify({
          format: SETTINGS_BACKUP_FORMAT,
          version: 99,
          settings: {},
        }),
      ),
    /暂不支持设置文件版本/,
  );
});
