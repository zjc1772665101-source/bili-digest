/**
 * Bili Digest Plus 自动化单元与集成测试套件。
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findActiveSegmentIndex,
  searchSegments,
  highlightTextHtml,
  parseTimestampSeconds,
  findActiveChapterIndex,
  buildBiliVideoUrl,
} from "../lib/transcript-util.js";
import { renderMarkdown, escapeHtml } from "../lib/markdown.js";
import {
  createSettingsBackup,
  parseSettingsBackup,
  TRANSFERABLE_SETTING_KEYS,
} from "../lib/settings-transfer.js";
import {
  TYPOGRAPHY_DEFAULTS,
  TYPOGRAPHY_LIMITS,
  normalizeTypographySettings,
} from "../lib/typography.js";
import {
  isValidBvid,
  sanitizeSeconds,
  sanitizePage,
  isAllowedBiliUrl,
  normalizeHistoryItem,
  handleClearCache,
} from "../background.js";
import {
  normalizeProviderConfig,
  migrateLegacySettings,
  completionUrl,
  modelsUrl,
  buildAiHeaders,
} from "../lib/ai.js";
import {
  buildMarkdown,
  buildChatMarkdown,
  buildOverviewMarkdown,
  buildNotesMarkdown,
} from "../lib/export.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, desc) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${desc}`);
  }
}

console.log("\n=========================================");
console.log("  Bili Digest Plus v0.5.1 测试套件运行");
console.log("=========================================\n");

// --- 1. 字幕与时间戳工具测试 ---
console.log("--- 1. 字幕工具 (transcript-util.js) ---");
const segments = [
  { from: 0.0, to: 3.5, content: "欢迎来到本期视频教程" },
  { from: 4.0, to: 8.2, content: "今天我们来讲解 AI 字幕与排版" },
  { from: 12.0, to: 15.0, content: "欢迎在评论区留言讨论" },
];

assert(findActiveSegmentIndex(segments, -1) === -1, "负数时间返回 -1");
assert(findActiveSegmentIndex(segments, 0) === 0, "0 秒落在第一句 (索引 0)");
assert(findActiveSegmentIndex(segments, 2.0) === 0, "2 秒落在第一句 (索引 0)");
assert(findActiveSegmentIndex(segments, 3.8) === 0, "句尾 2.5s 停顿容错保持索引 0");
assert(findActiveSegmentIndex(segments, 6.0) === 1, "6 秒落在第二句 (索引 1)");
assert(findActiveSegmentIndex(segments, 9.0) === 1, "句尾停顿容错保持索引 1");
assert(findActiveSegmentIndex(segments, 11.0) === -1, "停顿较长 (>2.5s) 返回 -1");
assert(findActiveSegmentIndex(segments, 13.0) === 2, "13 秒落在第三句 (索引 2)");
assert(findActiveSegmentIndex(segments, 18.0) === -1, "句尾停顿超过 2.5s 返回 -1");
assert(findActiveSegmentIndex(segments, 25.0) === -1, "超出视频结束时间返回 -1");
assert(findActiveSegmentIndex([], 5.0) === -1, "空数组安全返回 -1");

const translations = [
  "Welcome to this video tutorial",
  "Today we explain AI subtitles and typography",
  "Feel free to leave comments",
];
const s1 = searchSegments(segments, translations, "欢迎");
assert(s1.count === 2 && s1.matches[0] === 0 && s1.matches[1] === 2, "中文搜索原文命中两句");

const s2 = searchSegments(segments, translations, "typography");
assert(s2.count === 1 && s2.matches[0] === 1, "英文搜索译文命中第二句");

const s3 = searchSegments(segments, translations, "不存在的词汇");
assert(s3.count === 0 && s3.matches.length === 0, "无匹配安全返回 0 项");

assert(parseTimestampSeconds("[00:15]") === 15, "解析 [00:15] 为 15s");
assert(parseTimestampSeconds("[01:23]") === 83, "解析 [01:23] 为 83s");
assert(parseTimestampSeconds("[01:23:45]") === 5025, "解析 [01:23:45] 为 5025s");
assert(parseTimestampSeconds("invalid") === null, "非法格式返回 null");

const chapters = [
  { time: 0, title: "开篇" },
  { time: 60, title: "正文" },
  { time: 180, title: "结语" },
];
assert(findActiveChapterIndex(chapters, 30) === 0, "30s 属于开篇");
assert(findActiveChapterIndex(chapters, 100) === 1, "100s 属于正文");
assert(findActiveChapterIndex(chapters, 300) === 2, "300s 属于结语");

// --- 2. 安全 Markdown 渲染与链接完整性测试 ---
console.log("\n--- 2. 安全 Markdown 渲染 (markdown.js) ---");
const codeBlockMd = '```python\nprint("Hello World [01:23]")\n```';
const codeBlockHtml = renderMarkdown(codeBlockMd);
assert(codeBlockHtml.includes('class="code-block"'), "围栏代码块渲染正确");
assert(codeBlockHtml.includes('class="code-copy-btn"'), "包含代码复制按钮");
assert(!codeBlockHtml.includes('class="timestamp-pill"'), "代码块内部的时间戳不被转为按钮");

const linkWithTimeMd = "请点击 [官方链接](https://www.bilibili.com/video/BV1xx411c7mD?t=01:23) 查看详情";
const linkWithTimeHtml = renderMarkdown(linkWithTimeMd);
assert(
  linkWithTimeHtml.includes('href="https://www.bilibili.com/video/BV1xx411c7mD?t=01:23"'),
  "链接 URL 中的 01:23 不被破坏或插入 button 标签",
);

const pureTimeMd = "视频在 [01:23] 和 02:45 处有关键演示。";
const pureTimeHtml = renderMarkdown(pureTimeMd);
assert(pureTimeHtml.includes('data-seconds="83"'), "[01:23] 正确渲染为跳播按钮");
assert(pureTimeHtml.includes('data-seconds="165"'), "02:45 正确渲染为跳播按钮");

const xssMd = '<script>alert("xss")</script><img src="x" onerror="alert(1)">';
const xssHtml = renderMarkdown(xssMd);
assert(
  !xssHtml.includes("<script>") && xssHtml.includes("&lt;script&gt;"),
  "严格转义原始 HTML 标签杜绝 XSS",
);

// --- 3. 设置、排版与备份测试 ---
console.log("\n--- 3. 设置与排版 (typography.js & settings-transfer.js) ---");
assert(TRANSFERABLE_SETTING_KEYS.includes("transcriptAutoFollow"), "白名单包含 transcriptAutoFollow");

const sampleSettings = {
  ...TYPOGRAPHY_DEFAULTS,
  aiApiKey: "sk-secret-test-key",
  readingFontSize: 16,
  transcriptAutoFollow: true,
};

const backupNoKey = createSettingsBackup(sampleSettings, { includeApiKey: false });
const parsedNoKey = parseSettingsBackup(backupNoKey);
assert(!parsedNoKey.includesApiKey && parsedNoKey.settings.aiApiKey === undefined, "导出默认安全排除 API Key");
assert(parsedNoKey.settings.transcriptAutoFollow === true, "备份完整保留 transcriptAutoFollow");

const backupWithKey = createSettingsBackup(sampleSettings, { includeApiKey: true });
const parsedWithKey = parseSettingsBackup(backupWithKey);
assert(parsedWithKey.includesApiKey && parsedWithKey.settings.aiApiKey === "sk-secret-test-key", "导出正确包含 API Key");

const clamped = normalizeTypographySettings({ readingFontSize: 45, brandFontSize: 8 });
assert(clamped.readingFontSize <= TYPOGRAPHY_LIMITS.readingFontSize.max, "超范围字号被安全限制在最大值以内");
assert(clamped.brandFontSize >= TYPOGRAPHY_LIMITS.brandFontSize.min, "过小字号被安全限制在最小值以内");
assert(TYPOGRAPHY_LIMITS.videoActionButtonSize.max === 80, "videoActionButtonSize 最大限制为 80px");

const normalizedWithCustomBtnSize = normalizeTypographySettings({ videoActionButtonSize: 76 });
assert(normalizedWithCustomBtnSize.videoActionButtonSize === 76, "76px 视频页按钮尺寸在 36-80 范围内被正确保留");

// --- 4. 后台安全与输入校验 (background.js & ai.js) ---
console.log("\n--- 4. 后台安全与输入校验 (background.js & ai.js) ---");
assert(isValidBvid("BV1xx411c7mD") === true, "合法 BV 号验证通过");
assert(isValidBvid("AV12345678") === false, "非 BV 号被拒绝");
assert(isValidBvid("BV123") === false, "过短 BV 号被拒绝");
assert(isValidBvid("../../../etc/passwd") === false, "路径穿越字符被拒绝");

assert(sanitizeSeconds(45.5) === 45.5, "有效秒数通过");
assert(sanitizeSeconds(-10) === 0, "负数秒数归零");
assert(sanitizeSeconds(Infinity) === 0, "Infinity 秒数归零");

assert(sanitizePage(3) === 3, "有效分 P 保持");
assert(sanitizePage(0) === 1, "0 分 P 纠正为 1");
assert(sanitizePage(99999) === 1000, "超大分 P 限制在 1000 内");

assert(isAllowedBiliUrl("https://api.bilibili.com/x/player/wbi/v2") === true, "bilibili.com HTTPS 域名放行");
assert(isAllowedBiliUrl("http://api.bilibili.com/x/player/wbi/v2") === false, "bilibili.com 明文 HTTP 严格拦截");
assert(isAllowedBiliUrl("https://aisubtitle.hdslb.com/bfs/subtitle/test.json") === true, "hdslb.com HTTPS 域名放行");
assert(isAllowedBiliUrl("https://d1.bilivideo.com/audio/test.mp4") === true, "bilivideo.com HTTPS 域名放行");
assert(isAllowedBiliUrl("http://localhost:11434/api/generate") === false, "B站媒体白名单严格拦截明文 localhost 防止凭据泄露");
assert(isAllowedBiliUrl("http://127.0.0.1:8000/v1/chat") === false, "B站媒体白名单严格拦截明文 127.0.0.1 防止凭据泄露");
assert(isAllowedBiliUrl("https://attacker.com/fake-subtitle.json") === false, "非白名单域名被拦截");
assert(isAllowedBiliUrl("javascript:alert(1)") === false, "危险协议被拦截");

assert(modelsUrl("https://api.openai.com/v1") === "https://api.openai.com/v1/models", "modelsUrl 规范解析正确");
assert(completionUrl("https://api.openai.com/v1") === "https://api.openai.com/v1/chat/completions", "completionUrl 规范解析正确");

const migrated = migrateLegacySettings({
  aiProvider: "openai",
  providers: {
    openai: { apiKey: "legacy-sk", baseUrl: "https://legacy.api.com", model: "gpt-4" },
  },
});
assert(migrated.aiApiKey === "legacy-sk" && migrated.aiModel === "gpt-4", "旧版设置字段成功向下兼容迁移");

// --- 5. B站跳播 URL 生成与 Markdown 导出契约测试 ---
console.log("\n--- 5. 跳播 URL 构造与导出契约 ---");
assert(
  buildBiliVideoUrl("BV1xx411c7mD", 1, 30) === "https://www.bilibili.com/video/BV1xx411c7mD?t=30",
  "P1 视频跳转包含 ?t=30 且无冗余 p 参数",
);
assert(
  buildBiliVideoUrl("BV1xx411c7mD", 2, 85) === "https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=85",
  "P2 视频跳转正确组合 ?p=2&t=85",
);
assert(
  buildBiliVideoUrl("BV1xx411c7mD", 1, 0) === "https://www.bilibili.com/video/BV1xx411c7mD",
  "0 秒与 P1 生成干净的视频首页 URL",
);
assert(
  buildBiliVideoUrl("BV1xx411c7mD", 3, 0) === "https://www.bilibili.com/video/BV1xx411c7mD?p=3",
  "0 秒与 P3 仅生成 ?p=3",
);

// 导出 P2 视频 Markdown 校验
const p2VideoExport = buildMarkdown({
  video: { bvid: "BV1xx411c7mD", page: 2, title: "分P测试视频" },
  overview: { chapters: [{ time: 45, title: "第二章节" }] },
});
assert(p2VideoExport.includes("https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=45"), "导出 Markdown 中 P2 章节跳播链接包含 ?p=2&t=45");
assert(p2VideoExport.includes("BV：BV1xx411c7mD (P2)"), "导出 Markdown 标题元数据标注 P2");

// 全 P 笔记导出契约
const exportNotesVideoAll = buildNotesMarkdown({
  video: { bvid: "BV1xx411c7mD", title: "系列课程" },
  notes: [
    { videoId: "BV1xx411c7mD", page: 1, timestamp: 15, text: "P1 基础笔记" },
    { videoId: "BV1xx411c7mD", page: 2, timestamp: 45, text: "P2 高级笔记" },
  ],
  scope: "video_all",
});
assert(exportNotesVideoAll.includes("(全P合集)"), "全P笔记导出标题标注全P合集");
assert(exportNotesVideoAll.includes("(P1)") && exportNotesVideoAll.includes("(P2)"), "全P笔记导出条目标注分P序号");

// --- 6. Prompt 模板文件与占位符契约测试 ---
console.log("\n--- 6. Prompt 模板与契约测试 ---");
const promptFiles = ["analysis.md", "translation.md", "chat.md", "explain.md", "polish.md"];
for (const pFile of promptFiles) {
  const pPath = join(rootDir, "prompts", pFile);
  assert(existsSync(pPath), `Prompt 模板文件存在: ${pFile}`);
  const content = readFileSync(pPath, "utf8");
  assert(content.length > 20, `Prompt 模板内容非空: ${pFile}`);
}

function testRenderPrompt(fileName, vars) {
  const pPath = join(rootDir, "prompts", fileName);
  let text = readFileSync(pPath, "utf8");
  for (const [key, val] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, String(val ?? ""));
    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    text = text.replaceAll(`{{${snakeKey}}}`, String(val ?? ""));
  }
  return text;
}

const analysisRendered = testRenderPrompt("analysis.md", { transcript: "[00:01] 测试字幕内容" });
assert(!analysisRendered.includes("{{transcript}}") && analysisRendered.includes("测试字幕内容"), "analysis.md 变量渲染完整");

const translationRendered = testRenderPrompt("translation.md", {
  target_language: "English",
  segments_json: '[{"id":"0","content":"测试"}]',
});
assert(!translationRendered.includes("{{target_language}}") && !translationRendered.includes("{{segments_json}}"), "translation.md 变量渲染完整");

const explainRendered = testRenderPrompt("explain.md", { text: "待解释", context: "上下文" });
assert(!explainRendered.includes("{{text}}") && !explainRendered.includes("{{context}}"), "explain.md 变量渲染完整");

const polishRendered = testRenderPrompt("polish.md", { draft: "草稿" });
assert(!polishRendered.includes("{{draft}}"), "polish.md 变量渲染完整");

// 真正调用 renderPrompt / renderPromptTemplate 别名
globalThis.chrome = {
  runtime: {
    getURL: (p) => p,
  },
};
globalThis.fetch = async (url) => {
  const filePath = join(rootDir, url);
  if (!existsSync(filePath)) throw new Error(`Not found: ${url}`);
  const text = readFileSync(filePath, "utf8");
  return {
    ok: true,
    text: async () => text,
  };
};

const { renderPrompt: liveRenderPrompt, renderPromptTemplate: liveRenderPromptTemplate } = await import("../background.js");
assert(typeof liveRenderPrompt === "function", "renderPrompt 导出的确为函数");
assert(liveRenderPrompt === liveRenderPromptTemplate, "renderPromptTemplate 与 renderPrompt 引用严格一致");
const liveExplainOutput = await liveRenderPromptTemplate("explain.md", { text: "微服务", context: "分布式架构" });
assert(liveExplainOutput.includes("微服务") && !liveExplainOutput.includes("{{text}}"), "renderPromptTemplate 实机渲染成功");

// --- 7. DOM 结构与唯一 ID 校验 ---
console.log("\n--- 7. DOM 唯一 ID 与脚本绑定校验 ---");
const optionsHtml = readFileSync(join(rootDir, "options.html"), "utf8");
const sidepanelHtml = readFileSync(join(rootDir, "sidepanel.html"), "utf8");

function getDomIds(html) {
  const ids = [];
  const regex = /\bid=["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

const optionsIds = getDomIds(optionsHtml);
const uniqueOptionsIds = new Set(optionsIds);
assert(optionsIds.length === uniqueOptionsIds.size, `options.html 无重复 ID (共 ${optionsIds.length} 个)`);
assert(optionsHtml.includes('id="codeFontSizeOutput"'), "options.html 包含 codeFontSizeOutput 且无重复");
assert(optionsHtml.includes('id="clearCacheBtn"'), "options.html 包含 clearCacheBtn 缓存清理按钮");

const sidepanelIds = getDomIds(sidepanelHtml);
const uniqueSidepanelIds = new Set(sidepanelIds);
assert(sidepanelIds.length === uniqueSidepanelIds.size, `sidepanel.html 无重复 ID (共 ${sidepanelIds.length} 个)`);
assert(sidepanelHtml.includes('id="historyDrawer"'), "sidepanel.html 包含 historyDrawer");
assert(sidepanelHtml.includes('id="historyBtn"'), "sidepanel.html 包含 historyBtn");
assert(sidepanelHtml.includes('id="explainSheet"'), "sidepanel.html 包含 explainSheet");
assert(sidepanelHtml.includes('id="clearCacheBtn"'), "sidepanel.html 包含 clearCacheBtn 缓存清理按钮");

// 校验 background.js 和 sidepanel.js 中关键路由与 token 存在
const backgroundJs = readFileSync(join(rootDir, "background.js"), "utf8");
assert(backgroundJs.includes('case "openSidePanel":'), "background.js 包含 openSidePanel 路由");
assert(backgroundJs.includes('case "getContentSettings":'), "background.js 包含 getContentSettings 最小权限路由");
assert(backgroundJs.includes('case "clearCache":'), "background.js 包含 clearCache 缓存清理路由");
assert(backgroundJs.includes("renderPromptTemplate"), "background.js 包含 renderPromptTemplate 兼容别名");
assert(backgroundJs.includes("contentDisplayConfig"), "background.js 包含 contentDisplayConfig 存储逻辑");
assert(backgroundJs.includes('referrer: "https://www.bilibili.com/"'), "B站 fetchJson 显式设置 referrer");
assert(backgroundJs.includes('referrerPolicy: "strict-origin-when-cross-origin"'), "B站 fetchJson 显式设置 referrerPolicy");
assert(backgroundJs.includes('cache: "no-store"'), "B站 fetchJson 禁用缓存");

const sidepanelJs = readFileSync(join(rootDir, "sidepanel.js"), "utf8");
assert(sidepanelJs.includes("asrReqToken: 0"), "sidepanel.js 正确初始化 asrReqToken 为 0");
assert(sidepanelJs.includes("viewToken: 0"), "sidepanel.js 正确初始化 viewToken 为 0");
assert(sidepanelJs.includes("explainReqToken: 0"), "sidepanel.js 正确初始化 explainReqToken 为 0");
assert(sidepanelJs.includes("polishReqToken: 0"), "sidepanel.js 正确初始化 polishReqToken 为 0");
assert(sidepanelJs.includes("function setProgress"), "sidepanel.js 包含 setProgress 进度条更新逻辑");
assert(sidepanelJs.includes("function clearVideoBinding"), "sidepanel.js 包含统一无视频上下文清理函数");
assert(sidepanelJs.includes("renderPartSelect();") && sidepanelJs.includes("renderTrackSelect();"), "无视频上下文清理会重置分 P 与字幕轨道下拉");
assert(sidepanelJs.includes("lastHistoryWriteAt") && sidepanelJs.includes("maybeRecordHistoryPlayback"), "播放时间同步包含节流历史写回 bookkeeping");
assert(sidepanelJs.includes("HISTORY_WRITE_DISTANCE_SECONDS") && sidepanelJs.includes("HISTORY_WRITE_INTERVAL_MS"), "历史写回同时具备位置与时间阈值");
assert(/finally \{\s*if \(isCurrentTarget\(expected, "asrReqToken"\)\)/.test(sidepanelJs), "ASR finally 仅在当前目标仍匹配时渲染空态");
assert(sidepanelJs.includes('expected.cid = Number(state.video?.cid) || 0;'), "概览等待 ASR 后重新绑定当前 cid");
assert(sidepanelJs.includes("ensureTranscriptForOverview(expected)"), "概览生成前统一确保字幕可用");
assert(sidepanelJs.includes("await generateAsrTranscript({ force: false })"), "无字幕时概览会先自动生成 AI 字幕");
assert(sidepanelJs.includes("queueReadingAppearanceSave"), "阅读外观支持自动持久化");
assert(backgroundJs.includes("normalizeTypographySettings({ ...target, ...source })"), "部分设置更新会保留既有排版字段");
assert(/finally \{\s*if \(isCurrentTarget\(expected, "overviewReqToken"\)\)/.test(sidepanelJs), "概览 finally 仅在当前目标仍匹配时更新 UI");

const sidepanelCss = readFileSync(join(rootDir, "sidepanel.css"), "utf8");
assert(sidepanelCss.includes(".chapter-card:hover .chapter-title"), "章节标题悬停时支持展开");
assert(sidepanelCss.includes(".chapter-card:focus-visible .chapter-title"), "章节标题键盘聚焦时支持展开");
assert(sidepanelCss.includes("overflow-wrap: anywhere"), "超长章节标题可安全换行显示完整内容");

// 确保 sidepanel.js 中顶层显式声明了所有排版与缓存相关变量，杜绝 ReferenceError
const requiredDeclarations = [
  "brandFontSizeRange",
  "brandFontSizeOutput",
  "titleFontSizeRange",
  "titleFontSizeOutput",
  "navigationFontSizeRange",
  "navigationFontSizeOutput",
  "controlFontSizeRange",
  "controlFontSizeOutput",
  "overviewButtonFontSizeRange",
  "overviewButtonFontSizeOutput",
  "videoActionButtonSizeRange",
  "videoActionButtonSizeOutput",
  "metaFontSizeRange",
  "metaFontSizeOutput",
  "codeFontSizeRange",
  "codeFontSizeOutput",
  "fontSearchInput",
  "fontSearchStatus",
  "readLocalFontsBtn",
  "localFontsStatus",
  "clearCacheBtn",
];
for (const varName of requiredDeclarations) {
  assert(
    sidepanelJs.includes(`const ${varName} = $("${varName}");`),
    `sidepanel.js 显式声明顶层变量 ${varName}`,
  );
}

// --- 8. 历史记录 Schema 归一化与管理测试 ---
console.log("\n--- 8. 历史记录 Schema 归一化与管理 ---");
const validItem = normalizeHistoryItem({
  bvid: "BV1xx411c7mD",
  cid: 12345,
  title: "全栈开发课程",
  author: "极客UP主",
  page: 2,
  currentTime: 125,
});
assert(
  validItem && validItem.bvid === "BV1xx411c7mD" && validItem.page === 2 && validItem.currentTime === 125,
  "合法历史条目正确归一化并保留 currentTime 播放位置",
);

const invalidItem1 = normalizeHistoryItem({ bvid: "invalid_bv" });
assert(invalidItem1 === null, "非法 BV 号历史条目安全被丢弃");

const invalidItem2 = normalizeHistoryItem(null);
assert(invalidItem2 === null, "非对象历史条目安全被丢弃");

const mockHistory = [
  { bvid: "BV1xx411c7mD", page: 1, title: "Vue3 快速上手", author: "UP_A", lastVisitedAt: 1000 },
  { bvid: "BV2yy411c7mE", page: 1, title: "React 19 全解", author: "UP_B", lastVisitedAt: 2000 },
];

function recordHistoryMock(history, video) {
  const normalized = normalizeHistoryItem({ ...video, lastVisitedAt: Date.now() });
  if (!normalized) return history;
  const existingIdx = history.findIndex((i) => i.bvid === normalized.bvid && sanitizePage(i.page || 1) === normalized.page);
  if (existingIdx >= 0) history.splice(existingIdx, 1);
  history.unshift(normalized);
  return history.slice(0, 50);
}

const h1 = recordHistoryMock([...mockHistory], {
  bvid: "BV3zz411c7mF",
  page: 1,
  title: "TypeScript 进阶",
  author: "UP_C",
});
assert(h1.length === 3 && h1[0].bvid === "BV3zz411c7mF", "新增视频置于历史列表首位");

const h2 = recordHistoryMock(h1, {
  bvid: "BV1xx411c7mD",
  page: 1,
  title: "Vue3 快速上手（更新）",
  author: "UP_A",
});
assert(h2.length === 3 && h2[0].bvid === "BV1xx411c7mD" && h2[0].title.includes("更新"), "重复视频更新至首位并去重");

// 多 P 隔离测试 (同一 BV 不同分 P 为独立历史条目)
const h3 = recordHistoryMock(h2, {
  bvid: "BV1xx411c7mD",
  page: 2,
  title: "Vue3 快速上手 P2",
  author: "UP_A",
});
assert(h3.length === 4 && h3[0].bvid === "BV1xx411c7mD" && h3[0].page === 2, "同一 BV 不同分 P 独立保留历史条目");

function filterHistory(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) => i.title.toLowerCase().includes(q) || i.author.toLowerCase().includes(q) || i.bvid.toLowerCase().includes(q),
  );
}
assert(filterHistory(h3, "React").length === 1, "按标题搜索历史匹配成功");
assert(filterHistory(h3, "UP_C").length === 1, "按 UP 主搜索历史匹配成功");
assert(filterHistory(h3, "BV1xx").length === 2, "按 BV 号搜索命中多分 P 历史");
assert(filterHistory(h3, "未知内容").length === 0, "未匹配项安全返回空");

// --- 9. 多 P 笔记隔离过滤测试 ---
console.log("\n--- 9. 多 P 笔记隔离过滤逻辑 ---");
const sampleNotes = [
  { id: "1", videoId: "BV1xx411c7mD", page: 1, text: "P1 核心笔记", timestamp: 10 },
  { id: "2", videoId: "BV1xx411c7mD", page: 2, text: "P2 进阶笔记", timestamp: 20 },
  { id: "3", videoId: "BV2yy411c7mE", page: 1, text: "另一视频笔记", timestamp: 30 },
];

function filterNotesByScope(notes, scope, currentVideo) {
  if (scope === "all") return notes;
  const bvNotes = notes.filter((n) => n.videoId === currentVideo.bvid);
  if (scope === "video_all") return bvNotes;
  return bvNotes.filter((n) => Number(n.page || 1) === Number(currentVideo.page || 1));
}

const currentP1 = { bvid: "BV1xx411c7mD", page: 1 };
const p1Notes = filterNotesByScope(sampleNotes, "current", currentP1);
assert(p1Notes.length === 1 && p1Notes[0].id === "1", "当前分 P 笔记范围严格只包含 P1 笔记");

const currentP2 = { bvid: "BV1xx411c7mD", page: 2 };
const p2Notes = filterNotesByScope(sampleNotes, "current", currentP2);
assert(p2Notes.length === 1 && p2Notes[0].id === "2", "当前分 P 笔记范围严格只包含 P2 笔记");

const allPartNotes = filterNotesByScope(sampleNotes, "video_all", currentP1);
assert(allPartNotes.length === 2, "本视频全 P 范围包含该 BV 的 P1 和 P2 笔记");

const globalNotes = filterNotesByScope(sampleNotes, "all", currentP1);
assert(globalNotes.length === 3, "全部视频范围包含跨视频所有笔记");

// --- 10. 缓存清理与翻译进度多 Token 隔离测试 ---
console.log("\n--- 10. 缓存清理与翻译进度身份隔离 ---");
const mockStorage = {
  "transcript:BV1:100:zh-CN": { segments: [] },
  "asr_transcript:BV1:100": { segments: [] },
  "active_track:BV1:100": "zh-CN",
  "translation:BV1:100:zh-CN:English": { texts: [] },
  "digest:BV1:100:zh-CN": { summary: "..." },
  "chat:BV1:100": [{ role: "user", text: "..." }],
  "notes:BV1": [{ text: "笔记不可删" }],
  settings: { aiApiKey: "xxx" },
  theme: "dark",
};

let removedStorageKeys = [];
globalThis.chrome = {
  ...globalThis.chrome,
  storage: {
    local: {
      get: (keys, cb) => {
        if (keys === null) {
          if (cb) cb(mockStorage);
          return Promise.resolve(mockStorage);
        }
        if (typeof keys === "string") {
          const res = { [keys]: mockStorage[keys] };
          if (cb) cb(res);
          return Promise.resolve(res);
        }
        if (cb) cb(mockStorage);
        return Promise.resolve(mockStorage);
      },
      set: (obj, cb) => {
        Object.assign(mockStorage, obj);
        if (cb) cb();
        return Promise.resolve();
      },
      remove: (keys, cb) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        removedStorageKeys = arr;
        for (const k of arr) {
          delete mockStorage[k];
        }
        if (cb) cb();
        return Promise.resolve();
      },
    },
  },
};

const clearCacheResult = await handleClearCache({ type: "all_cache" });
assert(clearCacheResult.success === true && clearCacheResult.removedCount === 6, "handleClearCache 生产函数清理成功，移除 6 项真实缓存");
assert(removedStorageKeys.includes("transcript:BV1:100:zh-CN"), "清理列表包含 transcript:");
assert(removedStorageKeys.includes("asr_transcript:BV1:100"), "清理列表包含 asr_transcript:");
assert(removedStorageKeys.includes("translation:BV1:100:zh-CN:English"), "清理列表包含 translation:");
assert(removedStorageKeys.includes("digest:BV1:100:zh-CN"), "清理列表包含 digest:");
assert(removedStorageKeys.includes("chat:BV1:100"), "清理列表包含 chat:");
assert(removedStorageKeys.includes("active_track:BV1:100"), "清理列表包含 active_track:");
assert(!removedStorageKeys.includes("notes:BV1"), "缓存清理安全保留 notes");
assert(!removedStorageKeys.includes("settings") && !removedStorageKeys.includes("theme"), "缓存清理安全保留 settings 和 theme");

// 翻译进度完整身份匹配校验
function isTranslationEventForCurrentTarget(message, state) {
  return (
    state.translating &&
    message.bvid === state.video?.bvid &&
    (!message.cid || Number(message.cid) === Number(state.video?.cid)) &&
    (message.page === undefined || Number(message.page) === Number(state.video?.page || 1)) &&
    (message.viewToken === undefined || message.viewToken === state.viewToken) &&
    (message.token === undefined || message.token === state.translationReqToken)
  );
}

const mockState = {
  translating: true,
  viewToken: 5,
  translationReqToken: 12,
  video: { bvid: "BV1xx411c7mD", cid: 1001, page: 2 },
};

const validEvent = {
  action: "translationProgress",
  bvid: "BV1xx411c7mD",
  cid: 1001,
  page: 2,
  token: 12,
  viewToken: 5,
  progress: 50,
};
assert(isTranslationEventForCurrentTarget(validEvent, mockState) === true, "同 BV 同 P 同 Token 进度事件放行");

const oldTokenEvent = {
  action: "translationProgress",
  bvid: "BV1xx411c7mD",
  cid: 1001,
  page: 2,
  token: 11, // 旧 token
  viewToken: 5,
  progress: 100,
};
assert(isTranslationEventForCurrentTarget(oldTokenEvent, mockState) === false, "旧 Token 进度事件被严格拒绝");

const diffPageEvent = {
  action: "translationProgress",
  bvid: "BV1xx411c7mD",
  cid: 1001,
  page: 1, // 不同分 P
  token: 12,
  viewToken: 5,
  progress: 100,
};
assert(isTranslationEventForCurrentTarget(diffPageEvent, mockState) === false, "不同分 P 进度事件被严格拒绝");

// --- 11. 冒烟场景流程验证 ---
console.log("\n--- 11. 冒烟场景流程验证 ---");
const mockVideoContext = {
  bvid: "BV1xx411c7mD",
  cid: 123456,
  aid: "987654",
  title: "测试视频",
  author: "测试UP主",
  page: 1,
};
assert(isValidBvid(mockVideoContext.bvid), "视频上下文含有有效 BV 号");
assert(mockVideoContext.cid > 0, "视频上下文含有有效 cid");

console.log("\n=========================================");
console.log(`  测试结果: ${passedTests} 通过, ${failedTests} 失败 (共 ${totalTests} 项)`);
console.log("=========================================\n");

if (failedTests > 0) {
  process.exit(1);
}
