/**
 * 统一排版设置模块。
 *
 * 字体选择和字号清洗在后台、设置页、侧边栏共用。这里不接受任意 CSS
 * 字体栈，所有内置字体都来自固定白名单；本机字体只以安全的 local: token
 * 保存，最终始终拼接固定 fallback，避免设置值变成 CSS 注入入口。
 */

export const TYPOGRAPHY_DEFAULTS = Object.freeze({
  readingFontPreset: "default",
  interfaceFontPreset: "default",
  codeFontPreset: "mono",
  brandFontSize: 12,
  titleFontSize: 17,
  navigationFontSize: 13,
  controlFontSize: 13,
  metaFontSize: 11,
  codeFontSize: 12,
  readingFontSize: 14,
  readingLineHeight: 1.7,
  readingLetterSpacing: 0,
});

export const TYPOGRAPHY_LIMITS = Object.freeze({
  brandFontSize: Object.freeze({ min: 10, max: 30, step: 1 }),
  titleFontSize: Object.freeze({ min: 12, max: 30, step: 1 }),
  navigationFontSize: Object.freeze({ min: 10, max: 30, step: 1 }),
  controlFontSize: Object.freeze({ min: 10, max: 30, step: 1 }),
  metaFontSize: Object.freeze({ min: 8, max: 30, step: 1 }),
  codeFontSize: Object.freeze({ min: 8, max: 30, step: 1 }),
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
  serif: '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif',
  microsoftYaHei: '"Microsoft YaHei", "PingFang SC", sans-serif',
  dengxian: '"DengXian", "Microsoft YaHei", sans-serif',
  simsun: '"SimSun", "Songti SC", serif',
  kaiti: '"KaiTi", "Kaiti SC", serif',
  fangsong: '"FangSong", "Fangsong SC", serif',
  segoe: '"Segoe UI", "Microsoft YaHei", sans-serif',
  arial: 'Arial, "Microsoft YaHei", sans-serif',
  georgia: 'Georgia, "Songti SC", serif',
  times: '"Times New Roman", "Songti SC", serif',
  mono: 'ui-monospace, "Cascadia Code", Consolas, "SF Mono", monospace',
  cascadia: '"Cascadia Code", Consolas, "SF Mono", monospace',
  consolas: 'Consolas, "Cascadia Code", "SF Mono", monospace',
  jetbrains: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
});

const FONT_LABELS = Object.freeze({
  default: "默认（Stack Sans Text → MiSans）",
  misans: "MiSans",
  system: "系统无衬线",
  serif: "衬线阅读",
  microsoftYaHei: "微软雅黑",
  dengxian: "等线",
  simsun: "宋体",
  kaiti: "楷体",
  fangsong: "仿宋",
  segoe: "Segoe UI",
  arial: "Arial",
  georgia: "Georgia",
  times: "Times New Roman",
  mono: "等宽（系统）",
  cascadia: "Cascadia Code",
  consolas: "Consolas",
  jetbrains: "JetBrains Mono",
});

const PRESETS = Object.freeze(Object.keys(FONT_STACKS));
const CONTROL_CHARACTERS = /\p{Cc}/gu;
const SAFE_LOCAL_FONT_NAME = /^[\p{L}\p{N} _().+\-]+$/u;

export const TYPOGRAPHY_PRESETS = PRESETS;
export const TYPOGRAPHY_FONT_OPTIONS = Object.freeze(
  PRESETS.map((value) =>
    Object.freeze({ value, label: FONT_LABELS[value] || value, group: "内置字体" }),
  ),
);

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

/**
 * 清洗 Chrome fontSettings 返回的 fontId/displayName。
 * 控制字符会被移除；引号、反斜杠、分号、花括号、尖括号、冒号等
 * 不在白名单内，任何不符合白名单或超过 120 个字符的值都被拒绝。
 */
export function sanitizeLocalFontName(value) {
  if (typeof value !== "string") return "";
  let name;
  try {
    name = value.normalize("NFKC").replace(CONTROL_CHARACTERS, "").trim();
  } catch {
    return "";
  }
  if (!name || name.length > 120 || !SAFE_LOCAL_FONT_NAME.test(name)) return "";
  return name;
}

function localTokenName(value) {
  if (typeof value !== "string" || !value.startsWith("local:")) return "";
  return sanitizeLocalFontName(value.slice("local:".length));
}

/** 将一个字体选择规范化成内置 preset 或安全的 local: token。 */
export function normalizeFontChoice(value, fallback = "default") {
  const fallbackValue = PRESETS.includes(String(fallback))
    ? String(fallback)
    : "default";
  if (typeof value !== "string") return fallbackValue;
  const normalized = value.normalize("NFKC");
  if (PRESETS.includes(normalized)) return normalized;
  const localName = localTokenName(normalized);
  return localName ? `local:${localName}` : fallbackValue;
}

function normalizeLocalFontEntry(entry) {
  const rawId =
    typeof entry === "string"
      ? entry
      : entry?.fontId ?? entry?.id ?? entry?.name ?? entry?.displayName ?? "";
  const rawDisplay =
    typeof entry === "string"
      ? entry
      : entry?.displayName ?? entry?.fontId ?? entry?.name ?? "";
  const fontName = sanitizeLocalFontName(String(rawId));
  const displayName = sanitizeLocalFontName(String(rawDisplay)) || fontName;
  return fontName
    ? { value: `local:${fontName}`, label: `本机：${displayName}`, group: "本机字体" }
    : null;
}

/** 返回供三个字体选择器共享的 option 数据。 */
export function getFontOptions(input = {}) {
  const localFonts = Array.isArray(input)
    ? input
    : Array.isArray(input?.localFonts)
      ? input.localFonts
      : [];
  const options = TYPOGRAPHY_FONT_OPTIONS.map((option) => ({ ...option }));
  const seen = new Set(options.map((option) => option.value));
  for (const entry of localFonts) {
    const option = normalizeLocalFontEntry(entry);
    if (option && !seen.has(option.value)) {
      seen.add(option.value);
      options.push(option);
    }
  }
  return options;
}

async function readFontList(fontSettings) {
  const getFontList = fontSettings?.getFontList;
  if (typeof getFontList !== "function") return null;
  if (getFontList.length > 0) {
    return new Promise((resolve, reject) => {
      try {
        getFontList.call(fontSettings, (fonts) => resolve(Array.isArray(fonts) ? fonts : []));
      } catch (error) {
        reject(error);
      }
    });
  }
  const result = getFontList.call(fontSettings);
  if (result && typeof result.then === "function") return result;
  return Array.isArray(result) ? result : [];
}

/** 在用户点击“读取本机字体”后申请 optional permission 并枚举本机字体。 */
export async function requestLocalFontList(chromeApi = globalThis.chrome) {
  const permissions = chromeApi?.permissions;
  const fontSettings = chromeApi?.fontSettings;
  if (
    typeof permissions?.request !== "function" ||
    typeof fontSettings?.getFontList !== "function"
  ) {
    return { supported: false, granted: false, fonts: [], error: "当前浏览器不支持读取本机字体" };
  }
  let granted = false;
  try {
    granted = Boolean(await permissions.request({ permissions: ["fontSettings"] }));
  } catch {
    return { supported: true, granted: false, fonts: [], error: "读取本机字体权限申请失败" };
  }
  if (!granted) {
    return { supported: true, granted: false, fonts: [], error: "未获得读取本机字体权限" };
  }
  try {
    const fonts = await readFontList(fontSettings);
    return { supported: true, granted: true, fonts: Array.isArray(fonts) ? fonts : [], error: "" };
  } catch {
    return { supported: true, granted: true, fonts: [], error: "读取本机字体列表失败" };
  }
}

export function normalizeTypographySettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    readingFontPreset: normalizeFontChoice(
      source.readingFontPreset,
      TYPOGRAPHY_DEFAULTS.readingFontPreset,
    ),
    interfaceFontPreset: normalizeFontChoice(
      source.interfaceFontPreset,
      TYPOGRAPHY_DEFAULTS.interfaceFontPreset,
    ),
    codeFontPreset: normalizeFontChoice(source.codeFontPreset, TYPOGRAPHY_DEFAULTS.codeFontPreset),
    brandFontSize: quantize(
      source.brandFontSize,
      TYPOGRAPHY_LIMITS.brandFontSize,
      TYPOGRAPHY_DEFAULTS.brandFontSize,
    ),
    titleFontSize: quantize(
      source.titleFontSize,
      TYPOGRAPHY_LIMITS.titleFontSize,
      TYPOGRAPHY_DEFAULTS.titleFontSize,
    ),
    navigationFontSize: quantize(
      source.navigationFontSize,
      TYPOGRAPHY_LIMITS.navigationFontSize,
      TYPOGRAPHY_DEFAULTS.navigationFontSize,
    ),
    controlFontSize: quantize(
      source.controlFontSize,
      TYPOGRAPHY_LIMITS.controlFontSize,
      TYPOGRAPHY_DEFAULTS.controlFontSize,
    ),
    metaFontSize: quantize(
      source.metaFontSize,
      TYPOGRAPHY_LIMITS.metaFontSize,
      TYPOGRAPHY_DEFAULTS.metaFontSize,
    ),
    codeFontSize: quantize(
      source.codeFontSize,
      TYPOGRAPHY_LIMITS.codeFontSize,
      TYPOGRAPHY_DEFAULTS.codeFontSize,
    ),
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

function fixedFontStack(preset) {
  return FONT_STACKS[preset] || FONT_STACKS.default;
}

export function typographyFontFamily(
  choice = TYPOGRAPHY_DEFAULTS.readingFontPreset,
  fallbackPreset = TYPOGRAPHY_DEFAULTS.readingFontPreset,
) {
  const normalized = normalizeFontChoice(choice, fallbackPreset);
  const localName = localTokenName(normalized);
  if (localName) {
    // sanitizeLocalFontName 已排除引号、反斜杠和所有 CSS 结构字符。
    return `"${localName}", ${fixedFontStack(normalizeFontChoice(fallbackPreset))}`;
  }
  return fixedFontStack(normalized);
}

export function typographyToCssVars(input = {}) {
  const settings = normalizeTypographySettings(input);
  return {
    "--reading-font-family": typographyFontFamily(settings.readingFontPreset, "default"),
    "--interface-font-family": typographyFontFamily(settings.interfaceFontPreset, "default"),
    "--code-font-family": typographyFontFamily(settings.codeFontPreset, "mono"),
    "--type-brand-size": `${settings.brandFontSize}px`,
    "--type-title-size": `${settings.titleFontSize}px`,
    "--type-nav-size": `${settings.navigationFontSize}px`,
    "--type-control-size": `${settings.controlFontSize}px`,
    "--type-meta-size": `${settings.metaFontSize}px`,
    "--type-code-size": `${settings.codeFontSize}px`,
    "--reading-font-size": `${settings.readingFontSize}px`,
    "--reading-line-height": String(settings.readingLineHeight),
    "--reading-letter-spacing": `${settings.readingLetterSpacing}em`,
  };
}

/** 将排版设置应用到指定根节点，并返回清洗后的设置。 */
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
