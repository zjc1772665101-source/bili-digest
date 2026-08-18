import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  TYPOGRAPHY_DEFAULTS,
  TYPOGRAPHY_LIMITS,
  TYPOGRAPHY_PRESETS,
  applyTypographySettings,
  filterFontOptions,
  getFontOptions,
  normalizeFontChoice,
  normalizeTypographySettings,
  normalizeShowBrandText,
  requestLocalFontList,
  sanitizeLocalFontName,
  typographyFontFamily,
  typographyToCssVars,
  normalizeShowMarkButton,
} from "../lib/typography.js";

test("默认 schema 覆盖全局与五个功能区字体/字号", () => {
  assert.deepEqual(normalizeTypographySettings({}), TYPOGRAPHY_DEFAULTS);
  assert.equal(TYPOGRAPHY_DEFAULTS.interfaceFontPreset, "default");
  assert.equal(TYPOGRAPHY_DEFAULTS.codeFontPreset, "mono");
  for (const region of ["transcript", "overview", "notes", "chat", "settings"]) {
    assert.equal(TYPOGRAPHY_DEFAULTS[`${region}FontPreset`], "default");
    assert.equal(TYPOGRAPHY_DEFAULTS[`${region}FontSize`], 14);
  }
  for (const key of [
    "brandFontSize",
    "titleFontSize",
    "navigationFontSize",
    "controlFontSize",
    "metaFontSize",
    "codeFontSize",
    "readingFontSize",
    "transcriptFontSize",
    "overviewFontSize",
    "notesFontSize",
    "chatFontSize",
    "settingsFontSize",
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

test("旧 reading 字体和字号会作为缺失功能区设置的回退", () => {
  const normalized = normalizeTypographySettings({
    readingFontPreset: "serif",
    readingFontSize: 22,
  });
  for (const region of ["transcript", "overview", "notes", "chat", "settings"]) {
    assert.equal(normalized[`${region}FontPreset`], "serif");
    assert.equal(normalized[`${region}FontSize`], 22);
  }
  const explicit = normalizeTypographySettings({
    readingFontPreset: "serif",
    readingFontSize: 22,
    transcriptFontPreset: "jetbrains",
    transcriptFontSize: 30,
    overviewFontPreset: "not-safe",
    overviewFontSize: -10,
  });
  assert.equal(explicit.transcriptFontPreset, "jetbrains");
  assert.equal(explicit.transcriptFontSize, 30);
  assert.equal(explicit.overviewFontPreset, "serif");
  assert.equal(explicit.overviewFontSize, 12);
});

test("所有固定字体预设都有安全栈，未知值回退", () => {
  assert.ok(TYPOGRAPHY_PRESETS.length >= 35);
  for (const preset of TYPOGRAPHY_PRESETS) {
    const stack = typographyFontFamily(preset);
    assert.equal(typeof stack, "string");
    assert.ok(stack.length > 0);
    assert.ok(!/[{};<>]/.test(stack));
  }
  assert.ok(TYPOGRAPHY_PRESETS.includes("microsoftYaHei"));
  assert.ok(TYPOGRAPHY_PRESETS.includes("jetbrains"));
  for (const preset of [
    "microsoftYaHeiUi",
    "microsoftJhengHei",
    "nsimsun",
    "pingfang",
    "notoSansSc",
    "notoSerifSc",
    "sourceHanSansSc",
    "sourceHanSerifSc",
    "lxgwWenKai",
    "harmonyOsSansSc",
    "sarasaGothicSc",
    "segoeVariable",
    "aptos",
    "inter",
    "roboto",
    "cascadiaMono",
    "firaCode",
    "sourceCodePro",
    "iosevka",
    "mapleMono",
    "ibmPlexMono",
    "ubuntuMono",
    "lucidaConsole",
    "courierNew",
  ]) {
    assert.ok(TYPOGRAPHY_PRESETS.includes(preset), preset);
  }
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

test("字体搜索按 NFKC、大小写、空白和连字符容错，且不改写 option", () => {
  const options = getFontOptions([
    { fontId: "Source Sans", displayName: "思源黑体" },
    { fontId: "Cascadia Code", displayName: "Cascadia Code" },
  ]);
  const original = options[0];
  assert.equal(filterFontOptions(options, "" ).length, options.length);
  assert.ok(filterFontOptions(options, "cascadia-code").some((item) => item.value === "local:Cascadia Code"));
  assert.ok(filterFontOptions(options, "思源 黑体").some((item) => item.value === "local:Source Sans"));
  assert.ok(filterFontOptions(options, "ＳＥＲＩＦ").some((item) => item.value === "serif"));
  const builtInOptions = getFontOptions();
  assert.ok(filterFontOptions(builtInOptions, "Noto Sans SC").some((item) => item.value === "notoSansSc"));
  assert.ok(filterFontOptions(builtInOptions, "cascadia-mono").some((item) => item.value === "cascadiaMono"));
  assert.equal(filterFontOptions(options, "no-such-font").length, 0);
  assert.equal(options[0], original);
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
    "--transcript-font-family",
    "--overview-font-family",
    "--notes-font-family",
    "--chat-font-family",
    "--settings-font-family",
    "--transcript-font-size",
    "--overview-font-size",
    "--notes-font-size",
    "--chat-font-size",
    "--settings-font-size",
    "--reading-line-height",
    "--reading-letter-spacing",
  ]) {
    assert.ok(name in vars, name);
  }
  assert.equal(vars["--interface-font-family"], typographyFontFamily("default"));
  assert.equal(vars["--code-font-family"], typographyFontFamily("mono"));
  assert.equal(vars["--type-title-size"], "50px");
  assert.equal(vars["--reading-font-size"], "14px");
  assert.equal(vars["--transcript-font-size"], "14px");
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
    transcriptFontPreset: "serif",
    overviewFontPreset: "serif",
    notesFontPreset: "serif",
    chatFontPreset: "serif",
    settingsFontPreset: "serif",
    transcriptFontSize: 22,
    overviewFontSize: 22,
    notesFontSize: 22,
    chatFontSize: 22,
    settingsFontSize: 22,
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

test("Local Font Access 成功时优先同步调用并映射 family/fullName", async () => {
  const calls = [];
  const result = await requestLocalFontList({}, {
    queryLocalFonts() {
      calls.push("query");
      return Promise.resolve([
        { family: "Arial", fullName: "Arial Regular" },
        { family: "思源黑体", fullName: "思源黑体 Bold" },
      ]);
    },
  });
  assert.deepEqual(calls, ["query"]);
  assert.equal(result.granted, true);
  assert.deepEqual(result.fonts[0], { fontId: "Arial", displayName: "Arial Regular" });
  assert.deepEqual(result.fonts[1], { fontId: "思源黑体", displayName: "思源黑体 Bold" });
});

test("Local Font Access 拒绝时显示真实 DOMException，并且不申请 fontSettings", async () => {
  let requestCalls = 0;
  const result = await requestLocalFontList({
    permissions: { request() { requestCalls += 1; return Promise.resolve(true); } },
  }, {
    queryLocalFonts() {
      return Promise.reject(new DOMException("用户拒绝了字体访问", "NotAllowedError"));
    },
  });
  assert.equal(requestCalls, 0);
  assert.equal(result.granted, false);
  assert.match(result.error, /读取本机字体失败：NotAllowedError: 用户拒绝了字体访问/);
});

test("fontSettings callback 的 chrome.runtime.lastError 使用传入 chromeApi", async () => {
  const chromeApi = {
    runtime: { lastError: { message: "权限 API 不可用" } },
    permissions: {
      request(_value, callback) { callback(false); },
    },
  };
  const result = await requestLocalFontList(chromeApi);
  assert.equal(result.granted, false);
  assert.match(result.error, /权限 API 不可用/);
});

test("字体权限先无 API，授权后重新读取并发现 fontSettings", async () => {
  const chromeApi = {
    permissions: {
      async contains() {
        return false;
      },
      async request() {
        chromeApi.fontSettings = {
          getFontList() {
            return Promise.resolve([{ fontId: "Arial", displayName: "Arial" }]);
          },
        };
        return true;
      },
    },
  };
  const result = await requestLocalFontList(chromeApi);
  assert.equal(result.granted, true);
  assert.equal(result.fonts[0].fontId, "Arial");
});

test("字体权限 request 的回调 API 也能工作且先于 contains", async () => {
  const calls = [];
  const result = await requestLocalFontList({
    permissions: {
      contains(value, callback) {
        calls.push(["contains", value]);
        callback(false);
      },
      request(value, callback) {
        calls.push(["request", value]);
        callback(true);
      },
    },
    fontSettings: {
      getFontList(callback) {
        callback([{ fontId: "Arial", displayName: "Arial" }]);
      },
    },
  });
  assert.deepEqual(calls.map(([name]) => name), ["request"]);
  assert.equal(result.granted, true);
  assert.equal(result.fonts.length, 1);
});

test("已授予字体权限时 request 仍可幂等调用", async () => {
  let requestCalls = 0;
  const result = await requestLocalFontList({
    permissions: {
      async contains() {
        return true;
      },
      async request() {
        requestCalls += 1;
        return true;
      },
    },
    fontSettings: {
      getFontList: async () => [{ fontId: "MiSans", displayName: "MiSans" }],
    },
  });
  assert.equal(requestCalls, 1);
  assert.equal(result.granted, true);
  assert.equal(result.fonts[0].fontId, "MiSans");
});

test("字体权限拒绝和 request 异常分别返回可识别结果", async () => {
  const denied = await requestLocalFontList({
    permissions: {
      async contains() {
        return false;
      },
      async request() {
        return false;
      },
    },
  });
  assert.equal(denied.supported, true);
  assert.equal(denied.granted, false);
  assert.match(denied.error, /未获得/);

  const rejected = await requestLocalFontList({
    permissions: {
      async request() {
        throw new Error("denied");
      },
    },
  });
  assert.equal(rejected.supported, true);
  assert.equal(rejected.granted, false);
  assert.match(rejected.error, /申请失败/);
});

test("request 异常后允许 contains 恢复已授予状态", async () => {
  const order = [];
  const result = await requestLocalFontList({
    permissions: {
      async request() {
        order.push("request");
        throw new Error("temporary runtime failure");
      },
      async contains() {
        order.push("contains");
        return true;
      },
    },
    fontSettings: {
      getFontList: async () => [{ fontId: "MiSans", displayName: "MiSans" }],
    },
  });
  assert.deepEqual(order, ["request", "contains"]);
  assert.equal(result.granted, true);
  assert.equal(result.fonts[0].fontId, "MiSans");
});

test("fontSettings request 在用户激活仍有效时同步调用", async () => {
  let activation = true;
  const order = [];
  const result = await requestLocalFontList({
    permissions: {
      request(value) {
        order.push(activation ? "request-active" : "request-late");
        activation = false;
        return Promise.resolve(true);
      },
      contains() {
        order.push("contains");
        return Promise.resolve(true);
      },
    },
    fontSettings: {
      getFontList: async () => [{ fontId: "Arial", displayName: "Arial" }],
    },
  });
  assert.deepEqual(order, ["request-active"]);
  assert.equal(result.granted, true);
});

test("授权后 fontSettings 仍缺失时提示重新加载，而不是 unsupported", async () => {
  const result = await requestLocalFontList({
    permissions: {
      async request() {
        return true;
      },
    },
  });
  assert.equal(result.supported, true);
  assert.equal(result.granted, true);
  assert.equal(result.reloadRequired, true);
  assert.match(result.error, /重新加载扩展/);
});

test("showMarkButton 缺失默认开启并严格归一化布尔值", () => {
  assert.equal(normalizeShowMarkButton(undefined), true);
  assert.equal(normalizeShowMarkButton("false"), false);
  assert.equal(normalizeShowMarkButton("0"), false);
  assert.equal(normalizeShowMarkButton("true"), true);
  assert.equal(normalizeShowMarkButton(false), false);
});

test("showBrandText 缺失默认开启并独立归一化", () => {
  assert.equal(normalizeShowBrandText(undefined), true);
  assert.equal(normalizeShowBrandText("false"), false);
  assert.equal(normalizeShowBrandText("0"), false);
  assert.equal(normalizeShowBrandText("true"), true);
  assert.equal(normalizeShowBrandText(false), false);
});

test("选项页与侧边栏共享五个功能区控件，CSS 具备对应变量和作用域", async () => {
  const [optionsHtml, sidepanelHtml, sidepanelCss, optionsJs, sidepanelJs, backgroundJs, contentJs, manifestJson, privacyMd, plusManifestJson] = await Promise.all([
    readFile(new URL("../options.html", import.meta.url), "utf8"),
    readFile(new URL("../sidepanel.html", import.meta.url), "utf8"),
    readFile(new URL("../sidepanel.css", import.meta.url), "utf8"),
    readFile(new URL("../options.js", import.meta.url), "utf8"),
    readFile(new URL("../sidepanel.js", import.meta.url), "utf8"),
    readFile(new URL("../background.js", import.meta.url), "utf8"),
    readFile(new URL("../content.js", import.meta.url), "utf8"),
    readFile(new URL("../manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../PRIVACY.md", import.meta.url), "utf8"),
    readFile(new URL("../../bili-digest-plus/manifest.json", import.meta.url), "utf8"),
  ]);
  for (const html of [optionsHtml, sidepanelHtml]) {
    assert.match(html, /id="fontSearchInput"/);
    assert.match(html, /id="fontSearchStatus"[^>]*role="status"/);
    assert.match(html, /id="showMarkButtonCheckbox"/);
    for (const region of ["transcript", "overview", "notes", "chat", "settings"]) {
      assert.match(html, new RegExp(`id="${region}FontPresetSelect"`));
      assert.match(html, new RegExp(`id="${region}FontSizeRange"[^>]*min="12"[^>]*max="50"`));
      assert.match(html, new RegExp(`id="${region}FontSizeOutput"`));
    }
  }
  for (const region of ["transcript", "overview", "notes", "chat", "settings"]) {
    assert.match(sidepanelCss, new RegExp(`--${region}-font-family`));
    assert.match(sidepanelCss, new RegExp(`--${region}-font-size`));
    assert.match(sidepanelCss, new RegExp(`#tab-${region}`));
  }
  assert.match(optionsJs, /filterFontOptions/);
  assert.match(sidepanelJs, /filterFontOptions/);
  assert.match(optionsJs, /showMarkButtonCheckbox\.checked/);
  assert.match(sidepanelJs, /showMarkButtonCheckbox\.checked/);
  assert.match(optionsJs, /showBrandTextCheckbox/);
  assert.match(sidepanelJs, /showBrandTextCheckbox/);
  assert.match(backgroundJs, /showMarkButton: true/);
  assert.match(backgroundJs, /showBrandText: true/);
  assert.match(backgroundJs, /normalizeShowMarkButton/);
  assert.match(backgroundJs, /normalizeShowBrandText/);
  for (const html of [optionsHtml, sidepanelHtml]) {
    assert.match(html, /id="showBrandTextCheckbox"/);
    assert.match(html, /字幕<\/span><span>概览<\/span><span>笔记<\/span><span>对话<\/span><span>设置<\/span>/);
  }
  assert.doesNotMatch(sidepanelCss, /\.tab\[data-tab=/);
  assert.match(sidepanelCss, /\.tabs \.tab[\s\S]*--type-nav-size/);
  assert.match(sidepanelCss, /#tab-settings \.typography-preview \.typography-preview-region\[data-region="transcript"\]/);
  assert.match(contentJs, /storage\?\.onChanged/);
  assert.match(contentJs, /removeNoteButtonHost/);
  assert.doesNotMatch(manifestJson, /optional_permissions[\s\S]*fontSettings/);
  assert.match(privacyMd, /queryLocalFonts\(\)/);
  assert.doesNotMatch(privacyMd, /fontSettings/);
  assert.match(JSON.parse(plusManifestJson).name, /Bili Digest Plus/);
});
