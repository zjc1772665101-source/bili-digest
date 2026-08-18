import test from "node:test";
import assert from "node:assert/strict";
import {
  TYPOGRAPHY_DEFAULTS,
  TYPOGRAPHY_LIMITS,
  TYPOGRAPHY_PRESETS,
  normalizeTypographySettings,
  typographyFontFamily,
  typographyToCssVars,
  applyTypographySettings,
} from "../lib/typography.js";

test("排版默认值完整且字号上限为 30px", () => {
  assert.deepEqual(normalizeTypographySettings({}), TYPOGRAPHY_DEFAULTS);
  assert.equal(TYPOGRAPHY_LIMITS.readingFontSize.max, 30);
});

test("四种字体预设均映射到安全字体栈", () => {
  assert.deepEqual(TYPOGRAPHY_PRESETS, ["default", "misans", "system", "serif"]);
  for (const preset of TYPOGRAPHY_PRESETS) {
    const stack = typographyFontFamily(preset);
    assert.equal(typeof stack, "string");
    assert.ok(stack.length > 0);
    assert.ok(!/[{};<>]/.test(stack));
  }
  assert.equal(typographyFontFamily("unknown"), typographyFontFamily("default"));
});

test("非法 preset 回退 default，旧设置字段不影响清洗", () => {
  const normalized = normalizeTypographySettings({
    readingFontPreset: "url(javascript:alert(1))",
    aiApiKey: "keep-me",
  });
  assert.equal(normalized.readingFontPreset, "default");
  assert.deepEqual(Object.keys(normalized).sort(), [
    "readingFontPreset",
    "readingFontSize",
    "readingLetterSpacing",
    "readingLineHeight",
  ]);
});

test("字号、行距、字间距分别夹取上下界", () => {
  assert.equal(normalizeTypographySettings({ readingFontSize: 1 }).readingFontSize, 12);
  assert.equal(normalizeTypographySettings({ readingFontSize: 99 }).readingFontSize, 30);
  assert.equal(normalizeTypographySettings({ readingLineHeight: 0 }).readingLineHeight, 1.4);
  assert.equal(normalizeTypographySettings({ readingLineHeight: 9 }).readingLineHeight, 2.2);
  assert.equal(
    normalizeTypographySettings({ readingLetterSpacing: -1 }).readingLetterSpacing,
    0,
  );
  assert.equal(
    normalizeTypographySettings({ readingLetterSpacing: 1 }).readingLetterSpacing,
    0.08,
  );
});

test("数值按步长量化并接受字符串数值", () => {
  assert.equal(normalizeTypographySettings({ readingFontSize: "17" }).readingFontSize, 17);
  assert.equal(normalizeTypographySettings({ readingLineHeight: "1.76" }).readingLineHeight, 1.8);
  assert.equal(normalizeTypographySettings({ readingLineHeight: 1.45 }).readingLineHeight, 1.5);
  assert.equal(
    normalizeTypographySettings({ readingLetterSpacing: "0.034" }).readingLetterSpacing,
    0.03,
  );
  assert.equal(normalizeTypographySettings({ readingFontSize: 17.6 }).readingFontSize, 18);
});

test("NaN、Infinity 与非法字符串回退默认值", () => {
  const normalized = normalizeTypographySettings({
    readingFontSize: NaN,
    readingLineHeight: Infinity,
    readingLetterSpacing: "nope",
  });
  assert.equal(normalized.readingFontSize, 14);
  assert.equal(normalized.readingLineHeight, 1.7);
  assert.equal(normalized.readingLetterSpacing, 0);
});

test("CSS vars 只来自清洗后的固定值，不接受未校验字符串", () => {
  const vars = typographyToCssVars({
    readingFontPreset: "system; color:red",
    readingFontSize: "22px",
    readingLineHeight: "var(--evil)",
    readingLetterSpacing: "0.08em",
  });
  assert.equal(vars["--reading-font-family"], typographyFontFamily("default"));
  assert.equal(vars["--reading-font-size"], "14px");
  assert.equal(vars["--reading-line-height"], "1.7");
  assert.equal(vars["--reading-letter-spacing"], "0em");
  assert.ok(!Object.values(vars).some((value) => /[{};<>]|--evil|pxpx/.test(value)));
});

test("applyTypographySettings 写入 CSS custom properties 并返回规范值", () => {
  const values = new Map();
  const root = { style: { setProperty(name, value) { values.set(name, value); } } };
  const result = applyTypographySettings(root, {
    readingFontPreset: "serif",
    readingFontSize: 30,
    readingLineHeight: 2.2,
    readingLetterSpacing: 0.08,
  });
  assert.equal(result.readingFontPreset, "serif");
  assert.equal(values.get("--reading-font-size"), "30px");
  assert.equal(values.get("--reading-line-height"), "2.2");
  assert.equal(values.get("--reading-letter-spacing"), "0.08em");
});
