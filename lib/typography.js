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
  transcriptFontPreset: "default",
  overviewFontPreset: "default",
  notesFontPreset: "default",
  chatFontPreset: "default",
  settingsFontPreset: "default",
  brandFontSize: 12,
  titleFontSize: 17,
  navigationFontSize: 13,
  controlFontSize: 13,
  overviewButtonFontSize: 13,
  videoActionButtonSize: 44,
  metaFontSize: 12,
  codeFontSize: 12,
  readingFontSize: 14,
  transcriptFontSize: 14,
  overviewFontSize: 14,
  notesFontSize: 14,
  chatFontSize: 14,
  settingsFontSize: 14,
  readingLineHeight: 1.7,
  readingLetterSpacing: 0,
});

export const TYPOGRAPHY_LIMITS = Object.freeze({
  brandFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  titleFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  navigationFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  controlFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  overviewButtonFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  videoActionButtonSize: Object.freeze({ min: 36, max: 80, step: 2 }),
  metaFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  codeFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  readingFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  transcriptFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  overviewFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  notesFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  chatFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
  settingsFontSize: Object.freeze({ min: 12, max: 50, step: 1 }),
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
  microsoftYaHeiUi:
    '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif',
  microsoftJhengHei:
    '"Microsoft JhengHei", "PingFang TC", "Microsoft YaHei", sans-serif',
  nsimsun: '"NSimSun", "SimSun", "Songti SC", serif',
  pingfang: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  hiraginoSansGb: '"Hiragino Sans GB", "PingFang SC", "Microsoft YaHei", sans-serif',
  heitiSc: '"Heiti SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  songtiSc: '"Songti SC", "STSong", "SimSun", serif',
  notoSansSc: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  notoSerifSc: '"Noto Serif SC", "Songti SC", "SimSun", serif',
  sourceHanSansSc: '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", sans-serif',
  sourceHanSerifSc: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", serif',
  lxgwWenKai: '"LXGW WenKai", "Kaiti SC", "Songti SC", serif',
  harmonyOsSansSc: '"HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  sarasaGothicSc: '"Sarasa Gothic SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  segoeVariable: '"Segoe UI Variable", "Segoe UI", "Microsoft YaHei", sans-serif',
  aptos: 'Aptos, "Segoe UI", "Microsoft YaHei", sans-serif',
  calibri: 'Calibri, "Segoe UI", "Microsoft YaHei", sans-serif',
  cambria: 'Cambria, "Noto Serif SC", "Songti SC", serif',
  verdana: 'Verdana, "Microsoft YaHei", sans-serif',
  tahoma: 'Tahoma, "Microsoft YaHei", sans-serif',
  trebuchetMs: '"Trebuchet MS", "Microsoft YaHei", sans-serif',
  helveticaNeue: '"Helvetica Neue", Arial, "Microsoft YaHei", sans-serif',
  inter: 'Inter, "Segoe UI", "Microsoft YaHei", sans-serif',
  roboto: 'Roboto, "Noto Sans SC", "Microsoft YaHei", sans-serif',
  openSans: '"Open Sans", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  garamond: 'Garamond, "Noto Serif SC", "Songti SC", serif',
  palatinoLinotype: '"Palatino Linotype", "Noto Serif SC", "Songti SC", serif',
  cascadiaMono: '"Cascadia Mono", "Cascadia Code", Consolas, "SF Mono", monospace',
  firaCode: '"Fira Code", "Cascadia Code", Consolas, monospace',
  sourceCodePro: '"Source Code Pro", "Cascadia Code", Consolas, monospace',
  iosevka: 'Iosevka, "Cascadia Code", Consolas, monospace',
  mapleMono: '"Maple Mono", "Cascadia Code", Consolas, monospace',
  ibmPlexMono: '"IBM Plex Mono", "Cascadia Code", Consolas, monospace',
  ubuntuMono: '"Ubuntu Mono", Consolas, monospace',
  lucidaConsole: '"Lucida Console", Consolas, monospace',
  courierNew: '"Courier New", Consolas, monospace',
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
  microsoftYaHeiUi: "Microsoft YaHei UI",
  microsoftJhengHei: "Microsoft JhengHei",
  nsimsun: "NSimSun",
  pingfang: "PingFang SC",
  hiraginoSansGb: "Hiragino Sans GB",
  heitiSc: "Heiti SC",
  songtiSc: "Songti SC",
  notoSansSc: "Noto Sans SC",
  notoSerifSc: "Noto Serif SC",
  sourceHanSansSc: "Source Han Sans SC",
  sourceHanSerifSc: "Source Han Serif SC",
  lxgwWenKai: "LXGW WenKai",
  harmonyOsSansSc: "HarmonyOS Sans SC",
  sarasaGothicSc: "Sarasa Gothic SC",
  segoeVariable: "Segoe UI Variable",
  aptos: "Aptos",
  calibri: "Calibri",
  cambria: "Cambria",
  verdana: "Verdana",
  tahoma: "Tahoma",
  trebuchetMs: "Trebuchet MS",
  helveticaNeue: "Helvetica Neue",
  inter: "Inter",
  roboto: "Roboto",
  openSans: "Open Sans",
  garamond: "Garamond",
  palatinoLinotype: "Palatino Linotype",
  cascadiaMono: "Cascadia Mono",
  firaCode: "Fira Code",
  sourceCodePro: "Source Code Pro",
  iosevka: "Iosevka",
  mapleMono: "Maple Mono",
  ibmPlexMono: "IBM Plex Mono",
  ubuntuMono: "Ubuntu Mono",
  lucidaConsole: "Lucida Console",
  courierNew: "Courier New",
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

/** 将设置中的布尔显示开关规范化，旧设置缺失时保持开启。 */
export function normalizeBooleanSetting(value, fallback = true) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  if (typeof value === "string") {
    const normalized = value.normalize("NFKC").trim().toLowerCase();
    if (["false", "0", "off", "no"].includes(normalized)) return false;
    if (["true", "1", "on", "yes"].includes(normalized)) return true;
  }
  return Boolean(value);
}

export function normalizeShowMarkButton(value, fallback = true) {
  return normalizeBooleanSetting(value, fallback);
}

export function normalizeShowBrandText(value, fallback = true) {
  return normalizeBooleanSetting(value, fallback);
}

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

/** 返回供所有字体选择器共享的 option 数据。 */
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

function normalizeFontSearchText(value) {
  if (typeof value !== "string") return "";
  try {
    return value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[\s\-‐‑‒–—―_]+/gu, "");
  } catch {
    return "";
  }
}

/**
 * 按字体 label/value 做安全的 NFKC、不区分大小写、空白/连字符容错搜索。
 * 返回新数组，不修改传入 option 对象；查询文本永远不会成为字体选择值。
 */
export function filterFontOptions(options, query = "") {
  const source = Array.isArray(options) ? options : [];
  const normalizedQuery = normalizeFontSearchText(String(query ?? ""));
  if (!normalizedQuery) return source.slice();
  return source.filter((option) => {
    const haystack = normalizeFontSearchText(
      `${String(option?.label ?? "")} ${String(option?.value ?? "")}`,
    );
    return haystack.includes(normalizedQuery);
  });
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

async function callChromeMethod(target, methodName, args = [], chromeApi = globalThis.chrome) {
  const method = target?.[methodName];
  if (typeof method !== "function") return undefined;
  if (method.length > args.length) {
    return new Promise((resolve, reject) => {
      try {
        method.call(target, ...args, (result) => {
          const runtimeError = chromeApi?.runtime?.lastError ?? globalThis.chrome?.runtime?.lastError;
          if (runtimeError?.message) {
            reject(new Error(runtimeError.message));
            return;
          }
          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  try {
    const result = method.call(target, ...args);
    return result && typeof result.then === "function" ? await result : result;
  } catch (error) {
    throw error;
  }
}

function describeFontError(error) {
  if (!error) return "未知错误";
  const name = typeof error?.name === "string" ? error.name.trim() : "";
  const message = typeof error?.message === "string" ? error.message.trim() : String(error);
  if (name && message && !message.toLowerCase().startsWith(name.toLowerCase())) {
    return `${name}: ${message}`;
  }
  return message || name || "未知错误";
}

function mapLocalFontRecords(fonts) {
  if (!Array.isArray(fonts)) return [];
  return fonts.map((font) => ({
    fontId: font?.family ?? font?.fontId ?? font?.id ?? font?.name ?? "",
    displayName: font?.fullName ?? font?.displayName ?? font?.family ?? "",
  })).filter((font) => font.fontId || font.displayName);
}

/** 在用户点击“读取本机字体”后枚举本机字体；优先 Local Font Access，兼容 chrome.fontSettings。 */
export async function requestLocalFontList(chromeApi = globalThis.chrome, options = {}) {
  const optionFontQuery = options?.queryLocalFonts;
  const chromeFontQuery = chromeApi?.queryLocalFonts;
  const windowFontQuery = globalThis.queryLocalFonts;
  const localFontQuery = optionFontQuery ?? chromeFontQuery ?? windowFontQuery;
  const localFontQueryOwner = optionFontQuery
    ? options
    : chromeFontQuery
      ? chromeApi
      : globalThis;
  // 必须从原始点击调用链同步启动，否则浏览器会丢失 user activation。
  if (typeof localFontQuery === "function") {
    let queryResult;
    try {
      queryResult = localFontQuery.call(localFontQueryOwner);
    } catch (error) {
      return { supported: true, granted: false, fonts: [], error: `读取本机字体失败：${describeFontError(error)}` };
    }
    try {
      const fonts = await queryResult;
      return { supported: true, granted: true, fonts: mapLocalFontRecords(fonts), error: "" };
    } catch (error) {
      return { supported: true, granted: false, fonts: [], error: `读取本机字体失败：${describeFontError(error)}` };
    }
  }
  const permissions = chromeApi?.permissions;
  if (
    typeof permissions?.contains !== "function" &&
    typeof permissions?.request !== "function"
  ) {
    return { supported: false, granted: false, fonts: [], error: "当前浏览器不支持读取本机字体" };
  }
  const permissionRequest = { permissions: ["fontSettings"] };
  let granted = false;
  let requestError = null;

  // Chrome requires permissions.request to be invoked during the originating
  // user gesture. Start it before any await/contains call; the returned
  // promise is awaited only after the API has been called synchronously.
  if (typeof permissions.request === "function") {
    try {
      granted = Boolean(await callChromeMethod(permissions, "request", [permissionRequest], chromeApi));
    } catch (error) {
      requestError = error;
    }
    // A rejected request can be a stale test/runtime shim; contains is only a
    // post-error recovery and is never consulted before request.
    if (!granted && requestError && typeof permissions.contains === "function") {
      try {
        granted = Boolean(await callChromeMethod(permissions, "contains", [permissionRequest], chromeApi));
      } catch {
        // Keep the original request failure below.
      }
    }
    if (!granted && requestError) {
      return { supported: true, granted: false, fonts: [], error: `读取本机字体权限申请失败：${describeFontError(requestError)}` };
    }
  } else if (typeof permissions.contains === "function") {
    try {
      granted = Boolean(await callChromeMethod(permissions, "contains", [permissionRequest], chromeApi));
    } catch (error) {
      return { supported: true, granted: false, fonts: [], error: `读取本机字体权限检查失败：${describeFontError(error)}` };
    }
  } else {
    return { supported: false, granted: false, fonts: [], error: "当前浏览器不支持读取本机字体" };
  }
  if (!granted) {
    return { supported: true, granted: false, fonts: [], error: "未获得读取本机字体权限" };
  }
  // 权限授予后 Chrome 可能才暴露 fontSettings；必须重新读取而不是使用旧引用。
  const fontSettings = chromeApi?.fontSettings;
  if (typeof fontSettings?.getFontList !== "function") {
    return {
      supported: true,
      granted: true,
      reloadRequired: true,
      fonts: [],
      error: "字体权限已获得，但扩展尚未加载字体读取接口；请重新加载扩展并重新打开设置页",
    };
  }
  try {
    const fonts = await readFontList(fontSettings);
    return { supported: true, granted: true, fonts: Array.isArray(fonts) ? fonts : [], error: "" };
  } catch (error) {
    return { supported: true, granted: true, fonts: [], error: `读取本机字体列表失败：${describeFontError(error)}` };
  }
}

export function normalizeTypographySettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const readingFontPreset = normalizeFontChoice(
    source.readingFontPreset,
    TYPOGRAPHY_DEFAULTS.readingFontPreset,
  );
  const readingFontSize = quantize(
    source.readingFontSize,
    TYPOGRAPHY_LIMITS.readingFontSize,
    TYPOGRAPHY_DEFAULTS.readingFontSize,
  );
  return {
    readingFontPreset,
    interfaceFontPreset: normalizeFontChoice(
      source.interfaceFontPreset,
      TYPOGRAPHY_DEFAULTS.interfaceFontPreset,
    ),
    codeFontPreset: normalizeFontChoice(source.codeFontPreset, TYPOGRAPHY_DEFAULTS.codeFontPreset),
    transcriptFontPreset: normalizeFontChoice(source.transcriptFontPreset, readingFontPreset),
    overviewFontPreset: normalizeFontChoice(source.overviewFontPreset, readingFontPreset),
    notesFontPreset: normalizeFontChoice(source.notesFontPreset, readingFontPreset),
    chatFontPreset: normalizeFontChoice(source.chatFontPreset, readingFontPreset),
    settingsFontPreset: normalizeFontChoice(source.settingsFontPreset, readingFontPreset),
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
    overviewButtonFontSize: quantize(
      source.overviewButtonFontSize,
      TYPOGRAPHY_LIMITS.overviewButtonFontSize,
      TYPOGRAPHY_DEFAULTS.overviewButtonFontSize,
    ),
    videoActionButtonSize: quantize(
      source.videoActionButtonSize,
      TYPOGRAPHY_LIMITS.videoActionButtonSize,
      TYPOGRAPHY_DEFAULTS.videoActionButtonSize,
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
    readingFontSize,
    transcriptFontSize: quantize(
      source.transcriptFontSize,
      TYPOGRAPHY_LIMITS.transcriptFontSize,
      readingFontSize,
    ),
    overviewFontSize: quantize(
      source.overviewFontSize,
      TYPOGRAPHY_LIMITS.overviewFontSize,
      readingFontSize,
    ),
    notesFontSize: quantize(
      source.notesFontSize,
      TYPOGRAPHY_LIMITS.notesFontSize,
      readingFontSize,
    ),
    chatFontSize: quantize(
      source.chatFontSize,
      TYPOGRAPHY_LIMITS.chatFontSize,
      readingFontSize,
    ),
    settingsFontSize: quantize(
      source.settingsFontSize,
      TYPOGRAPHY_LIMITS.settingsFontSize,
      readingFontSize,
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
    "--transcript-font-family": typographyFontFamily(settings.transcriptFontPreset, "default"),
    "--overview-font-family": typographyFontFamily(settings.overviewFontPreset, "default"),
    "--notes-font-family": typographyFontFamily(settings.notesFontPreset, "default"),
    "--chat-font-family": typographyFontFamily(settings.chatFontPreset, "default"),
    "--settings-font-family": typographyFontFamily(settings.settingsFontPreset, "default"),
    "--type-brand-size": `${settings.brandFontSize}px`,
    "--type-title-size": `${settings.titleFontSize}px`,
    "--type-nav-size": `${settings.navigationFontSize}px`,
    "--type-control-size": `${settings.controlFontSize}px`,
    "--overview-button-font-size": `${settings.overviewButtonFontSize}px`,
    "--video-action-button-size": `${settings.videoActionButtonSize}px`,
    "--type-meta-size": `${settings.metaFontSize}px`,
    "--type-code-size": `${settings.codeFontSize}px`,
    "--reading-font-size": `${settings.readingFontSize}px`,
    "--transcript-font-size": `${settings.transcriptFontSize}px`,
    "--overview-font-size": `${settings.overviewFontSize}px`,
    "--notes-font-size": `${settings.notesFontSize}px`,
    "--chat-font-size": `${settings.chatFontSize}px`,
    "--settings-font-size": `${settings.settingsFontSize}px`,
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
