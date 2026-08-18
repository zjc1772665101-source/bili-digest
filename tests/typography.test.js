import test from "node:test";
import assert from "node:assert/strict";
import {
  TYPOGRAPHY_DEFAULTS,
  TYPOGRAPHY_LIMITS,
  TYPOGRAPHY_PRESETS,
  applyTypographySettings,
  getFontOptions,
  normalizeFontChoice,
  normalizeTypographySettings,
  requestLocalFontList,
  sanitizeLocalFontName,
  typographyFontFamily,
  typographyToCssVars,
} from "../lib/typography.js";

test("默认 schema 覆盖三个字体选择和所有区域字号", () => {
  assert.deepEqual(normalizeTypographySettings({}), TYPOGRAPHY_DEFAULTS);
  assert.equal(TYPOGRAPHY_DEFAULTS.interfaceFontPreset, "default");
  assert.equal(TYPOGRAPHY_DEFAULTS.codeFontPreset, "mono");
  for (const key of [
    "brandFontSize",
    "titleFontSize",
    "navigationFontSize",
    "controlFontSize",
    "metaFontSize",
    "codeFontSize",
    "readingFontSize",
  ]) {
    assert.ok(TYPOGRAPHY_LIMITS[key].min <= TYPOGRAPHY_DEFAULTS[key]);
    assert.ok(TYPOGRAPHY_DEFAULTS[key] <= TYPOGRAPHY_LIMITS[key].max);
  }
});

test("字号全部夹取到边界并按步长量化", () => {
  for (const [key, limit] of Object.entries(TYPOGRAPHY_LIMITS)) {
    if (key === "readingLineHeight" || key === "readingLetterSpacing") continue;
    assert.equal(normalizeTypographySettings({ [key]: -999 })[key], limit.min);
    assert.equal(normalizeTypographySettings({ [key]: 999 })[key], limit.max);
  }
  assert.equal(normalizeTypographySettings({ brandFontSize: "17.6" }).brandFontSize, 18);
  assert.equal(normalizeTypographySettings({ titleFontSize: "12" }).titleFontSize, 12);
  assert.equal(normalizeTypographySettings({ readingLineHeight: "1.76" }).readingLineHeight, 1.8);
  assert.equal(normalizeTypographySettings({ readingLetterSpacing: "0.034" }).readingLetterSpacing, 0.03);
});

test("所有固定字体预设都有安全栈，未知值回退", () => {
  for (const preset of TYPOGRAPHY_PRESETS) {
    const stack = typographyFontFamily(preset);
    assert.equal(typeof stack, "string");
    assert.ok(stack.length > 0);
    assert.ok(!/[{};<>]/.test(stack));
  }
  assert.ok(TYPOGRAPHY_PRESETS.includes("microsoftYaHei"));
  assert.ok(TYPOGRAPHY_PRESETS.includes("jetbrains"));
  assert.equal(typographyFontFamily("unknown"), typographyFontFamily("default"));
});

test("本机字体 token 只允许安全名称，并保留合法 local 设置", () => {
  assert.equal(sanitizeLocalFontName("  Ａｒｉａｌ\u0000 Next  "), "Arial Next");
  assert.equal(sanitizeLocalFontName("思源黑体-Regular (CN)+1"), "思源黑体-Regular (CN)+1");
  assert.equal(sanitizeLocalFontName(""), "");
  for (const value of [
    'Arial"',
    "Arial\\\\", // 反斜杠
    "Arial; color:red",
    "Arial{font-family:x}",
    "Arial<svg>",
    "local:Arial",
    "A:B",
    "x".repeat(121),
  ]) {
    assert.equal(sanitizeLocalFontName(value), "", value);
  }
  assert.equal(normalizeFontChoice("local:My Font"), "local:My Font");
  assert.equal(normalizeFontChoice("local:Arial; color:red"), "default");
  const localStack = typographyFontFamily("local:My Font");
  assert.match(localStack, /^"My Font",/);
  assert.ok(!/[{};<>\\]/.test(localStack));
});

test("字体 option 覆盖预设、去重并允许安全本机字体", () => {
  const options = getFontOptions([
    { fontId: "My Font", displayName: "我的字体" },
    { fontId: "My Font", displayName: "重复" },
    { fontId: "Bad;font", displayName: "Bad" },
  ]);
  assert.ok(options.some((option) => option.value === "local:My Font"));
  assert.equal(options.filter((option) => option.value === "local:My Font").length, 1);
  assert.ok(!options.some((option) => option.value.includes("Bad")));
  assert.ok(options.some((option) => option.value === "jetbrains"));
});

test("CSS vars 完整且只来自清洗值", () => {
  const vars = typographyToCssVars({
    readingFontPreset: "local:My Font",
    interfaceFontPreset: "url(javascript:alert(1))",
    codeFontPreset: "local:Code; color:red",
    brandFontSize: 30,
    titleFontSize: 999,
    navigationFontSize: 10,
    controlFontSize: 21,
    metaFontSize: 8,
    codeFontSize: 18,
    readingFontSize: "22px",
    readingLineHeight: "var(--evil)",
    readingLetterSpacing: "0.08em",
  });
  for (const name of [
    "--interface-font-family",
    "--code-font-family",
    "--type-brand-size",
    "--type-title-size",
    "--type-nav-size",
    "--type-control-size",
    "--type-meta-size",
    "--type-code-size",
    "--reading-font-family",
    "--reading-font-size",
    "--reading-line-height",
    "--reading-letter-spacing",
  ]) {
    assert.ok(name in vars, name);
  }
  assert.equal(vars["--interface-font-family"], typographyFontFamily("default"));
  assert.equal(vars["--code-font-family"], typographyFontFamily("mono"));
  assert.equal(vars["--type-title-size"], "30px");
  assert.equal(vars["--reading-font-size"], "14px");
  assert.equal(vars["--reading-line-height"], "1.7");
  assert.ok(!Object.values(vars).some((value) => /[{};<>]|--evil|pxpx/.test(value)));
});

test("applyTypographySettings 写入所有 CSS custom properties", () => {
  const values = new Map();
  const root = { style: { setProperty(name, value) { values.set(name, value); } } };
  const result = applyTypographySettings(root, {
    interfaceFontPreset: "segoe",
    codeFontPreset: "consolas",
    titleFontSize: 30,
    controlFontSize: 20,
    readingFontSize: 30,
    readingLineHeight: 2.2,
    readingLetterSpacing: 0.08,
  });
  assert.equal(result.interfaceFontPreset, "segoe");
  assert.equal(result.codeFontPreset, "consolas");
  assert.equal(values.get("--type-title-size"), "30px");
  assert.equal(values.get("--type-control-size"), "20px");
  assert.equal(values.get("--reading-font-size"), "30px");
  assert.equal(values.get("--reading-line-height"), "2.2");
  assert.equal(values.get("--reading-letter-spacing"), "0.08em");
});

test("旧 reading 设置兼容且不混入 AI/翻译字段", () => {
  const normalized = normalizeTypographySettings({
    readingFontPreset: "serif",
    readingFontSize: 22,
    readingLineHeight: 1.8,
    readingLetterSpacing: 0.03,
    aiApiKey: "keep-me",
    targetLanguage: "日本語",
  });
  assert.deepEqual(normalized, {
    ...TYPOGRAPHY_DEFAULTS,
    readingFontPreset: "serif",
    readingFontSize: 22,
    readingLineHeight: 1.8,
    readingLetterSpacing: 0.03,
  });
  assert.equal(normalized.aiApiKey, undefined);
});

test("本机字体权限仅在显式 requestLocalFontList 时调用且兼容回调 API", async () => {
  const calls = [];
  const result = await requestLocalFontList({
    permissions: {
      async request(value) {
        calls.push(value);
        return true;
      },
    },
    fontSettings: {
      getFontList(callback) {
        callback([{ fontId: "Arial", displayName: "Arial" }]);
      },
    },
  });
  assert.deepEqual(calls, [{ permissions: ["fontSettings"] }]);
  assert.equal(result.granted, true);
  assert.equal(result.fonts[0].fontId, "Arial");
});
