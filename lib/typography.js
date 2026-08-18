/**
 * 阅读区域排版设置的纯函数模块。
 *
 * 这里只允许白名单字体预设与有限数值进入 CSS，页面和后台共用同一套
 * 默认值、清洗规则与 CSS custom properties，避免旧设置或手工消息污染样式。
 */

export const TYPOGRAPHY_DEFAULTS = Object.freeze({
  readingFontPreset: "default",
  readingFontSize: 14,
  readingLineHeight: 1.7,
  readingLetterSpacing: 0,
});

export const TYPOGRAPHY_LIMITS = Object.freeze({
  readingFontSize: Object.freeze({ min: 12, max: 30, step: 1 }),
  readingLineHeight: Object.freeze({ min: 1.4, max: 2.2, step: 0.1 }),
  readingLetterSpacing: Object.freeze({ min: 0, max: 0.08, step: 0.01 }),
});

const FONT_STACKS = Object.freeze({
  default:
    '"Stack Sans Text", "MiSans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  misans:
    '"MiSans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  system:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif:
    '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif',
});

const PRESETS = Object.freeze(Object.keys(FONT_STACKS));

function finiteNumber(value) {
  if (value === null || value === "" || typeof value === "boolean") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function quantize(value, { min, max, step }, fallback) {
  const number = finiteNumber(value);
  if (number === null) return fallback;
  const clamped = Math.min(max, Math.max(min, number));
  const rounded = min + Math.round((clamped - min) / step + 1e-9) * step;
  const decimals = String(step).split(".")[1]?.length || 0;
  return Number(Math.min(max, Math.max(min, rounded)).toFixed(decimals));
}

export function normalizeTypographySettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const preset = PRESETS.includes(String(source.readingFontPreset))
    ? String(source.readingFontPreset)
    : TYPOGRAPHY_DEFAULTS.readingFontPreset;
  return {
    readingFontPreset: preset,
    readingFontSize: quantize(
      source.readingFontSize,
      TYPOGRAPHY_LIMITS.readingFontSize,
      TYPOGRAPHY_DEFAULTS.readingFontSize,
    ),
    readingLineHeight: quantize(
      source.readingLineHeight,
      TYPOGRAPHY_LIMITS.readingLineHeight,
      TYPOGRAPHY_DEFAULTS.readingLineHeight,
    ),
    readingLetterSpacing: quantize(
      source.readingLetterSpacing,
      TYPOGRAPHY_LIMITS.readingLetterSpacing,
      TYPOGRAPHY_DEFAULTS.readingLetterSpacing,
    ),
  };
}

export function typographyFontFamily(preset = TYPOGRAPHY_DEFAULTS.readingFontPreset) {
  const key = PRESETS.includes(String(preset))
    ? String(preset)
    : TYPOGRAPHY_DEFAULTS.readingFontPreset;
  return FONT_STACKS[key];
}

export function typographyToCssVars(input = {}) {
  const settings = normalizeTypographySettings(input);
  return {
    "--reading-font-family": typographyFontFamily(settings.readingFontPreset),
    "--reading-font-size": `${settings.readingFontSize}px`,
    "--reading-line-height": String(settings.readingLineHeight),
    "--reading-letter-spacing": `${settings.readingLetterSpacing}em`,
  };
}

/**
 * 将排版设置应用到指定根节点。返回清洗后的设置，方便页面同步状态。
 * 不依赖 Node API；在没有 document 的单元测试环境中也可安全调用（传入节点即可）。
 */
export function applyTypographySettings(root, input = {}) {
  const settings = normalizeTypographySettings(input);
  const target = root || (typeof document !== "undefined" ? document.documentElement : null);
  if (target?.style?.setProperty) {
    for (const [name, value] of Object.entries(typographyToCssVars(settings))) {
      target.style.setProperty(name, value);
    }
  }
  return settings;
}

export const TYPOGRAPHY_PRESETS = PRESETS;
