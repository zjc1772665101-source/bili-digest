import test from "node:test";
import assert from "node:assert/strict";
import {
  TYPOGRAPHY_DEFAULTS,
  TYPOGRAPHY_PRESETS,
  TYPOGRAPHY_FONT_OPTIONS,
  normalizeShowMarkButton,
  normalizeShowBrandText,
  sanitizeLocalFontName,
  normalizeFontChoice,
  getFontOptions,
  filterFontOptions,
  requestLocalFontList,
  normalizeTypographySettings,
  typographyFontFamily,
  typographyToCssVars,
  applyTypographySettings,
} from "../lib/typography.js";

test("v0.4.2 排版默认值与预设存在", () => {
  assert.equal(TYPOGRAPHY_DEFAULTS.readingFontPreset, "sans");
  assert.equal(TYPOGRAPHY_DEFAULTS.uiFontPreset, "sans");
  assert.ok(TYPOGRAPHY_PRESETS.default);
  assert.ok(TYPOGRAPHY_PRESETS.compact);
  assert.ok(TYPOGRAPHY_PRESETS.large);
  assert.ok(TYPOGRAPHY_FONT_OPTIONS.some((item) => item.value === "sans"));
  assert.ok(TYPOGRAPHY_FONT_OPTIONS.some((item) => item.value === "mono"));
});

test("布尔显示设置兼容历史值", () => {
  assert.equal(normalizeShowMarkButton(false), false);
  assert.equal(normalizeShowMarkButton("false"), false);
  assert.equal(normalizeShowMarkButton(undefined), true);
  assert.equal(normalizeShowBrandText(false), false);
  assert.equal(normalizeShowBrandText("0"), false);
  assert.equal(normalizeShowBrandText(undefined), true);
});

test("本机字体名只接受安全 CSS family 名称", () => {
  assert.equal(sanitizeLocalFontName("Commit Mono"), "Commit Mono");
  assert.equal(sanitizeLocalFontName("  IBM Plex Mono  "), "IBM Plex Mono");
  assert.equal(sanitizeLocalFontName("'bad'"), "");
  assert.equal(sanitizeLocalFontName("bad; color:red"), "");
  assert.equal(normalizeFontChoice("local:Commit Mono"), "local:Commit Mono");
  assert.equal(normalizeFontChoice("local:bad; color:red", "mono"), "mono");
});

test("本机字体可合并、去重并搜索", () => {
  const options = getFontOptions([
    { fontId: "Commit Mono", displayName: "Commit Mono" },
    { fontId: "Commit Mono", displayName: "Commit Mono Duplicate" },
    { fontId: "IBM Plex Mono", displayName: "IBM Plex Mono" },
  ]);
  assert.equal(options.filter((item) => item.value === "local:Commit Mono").length, 1);
  assert.ok(options.some((item) => item.value === "local:IBM Plex Mono"));
  assert.ok(filterFontOptions(options, "plex mono").some((item) => item.value === "local:IBM Plex Mono"));
  assert.ok(filterFontOptions(options, "commit-mono").some((item) => item.value === "local:Commit Mono"));
});

test("fontSettings 是扩展环境读取本机字体的首选路径", async () => {
  const chromeApi = {
    fontSettings: {
      getFontList(callback) {
        callback([
          { fontId: "Commit Mono", displayName: "Commit Mono" },
          { fontId: "IBM Plex Mono", displayName: "IBM Plex Mono" },
        ]);
      },
    },
  };
  const result = await requestLocalFontList(chromeApi, {
    queryLocalFonts() {
      throw new Error("不应调用备用接口");
    },
  });
  assert.equal(result.supported, true);
  assert.equal(result.granted, true);
  assert.equal(result.error, "");
  assert.equal(result.fonts.length, 2);
});

test("fontSettings 返回空列表时继续使用 Local Font Access 备用", async () => {
  const chromeApi = {
    fontSettings: {
      getFontList(callback) {
        callback([]);
      },
    },
  };
  const result = await requestLocalFontList(chromeApi, {
    async queryLocalFonts() {
      return [
        { family: "Maple Mono CN", fullName: "Maple Mono CN Regular" },
      ];
    },
  });
  assert.equal(result.granted, true);
  assert.equal(result.error, "");
  assert.equal(result.fonts[0].fontId, "Maple Mono CN");
});

test("两个本机字体接口都为空时返回明确错误，而不是伪报成功读取 0 个", async () => {
  const chromeApi = {
    fontSettings: {
      getFontList(callback) {
        callback([]);
      },
    },
  };
  const result = await requestLocalFontList(chromeApi, {
    async queryLocalFonts() {
      return [];
    },
  });
  assert.equal(result.supported, true);
  assert.equal(result.fonts.length, 0);
  assert.match(result.error, /空的本机字体列表/);
});

test("normalizeTypographySettings 会归一化范围和本机字体", () => {
  const settings = normalizeTypographySettings({
    readingFontPreset: "local:Commit Mono",
    uiFontPreset: "mono",
    readingFontSize: 999,
    uiFontSize: -20,
    readingLineHeight: 99,
    videoMarkButtonSize: 1,
    showMarkButton: "false",
    showBrandText: "0",
  });
  assert.equal(settings.readingFontPreset, "local:Commit Mono");
  assert.equal(settings.uiFontPreset, "mono");
  assert.ok(settings.readingFontSize <= 50);
  assert.ok(settings.uiFontSize >= 12);
  assert.ok(settings.readingLineHeight <= 2.4);
  assert.ok(settings.videoMarkButtonSize >= 36);
  assert.equal(settings.showMarkButton, false);
  assert.equal(settings.showBrandText, false);
});

test("本机字体 family 与 CSS 变量安全生成", () => {
  assert.match(typographyFontFamily("local:Commit Mono"), /Commit Mono/);
  assert.equal(typographyFontFamily("local:bad; color:red"), typographyFontFamily("sans"));
  const css = typographyToCssVars({ readingFontPreset: "local:Commit Mono" });
  assert.match(css["--font-reading"], /Commit Mono/);
  assert.match(css["--reading-font-size"], /px$/);
});

test("applyTypographySettings 可应用到任意 style.setProperty 根节点", () => {
  const values = new Map();
  const root = {
    style: {
      setProperty(key, value) {
        values.set(key, value);
      },
    },
  };
  const normalized = applyTypographySettings({ readingFontSize: 19 }, root);
  assert.equal(normalized.readingFontSize, 19);
  assert.equal(values.get("--reading-font-size"), "19px");
});
