/**
 * Bili Digest Plus 本地增强版侧边栏主脚本 (v0.5.0)。
 *
 * 关键特性与防护机制：
 * 1. 严格的异步请求代次校验 (Request Token) 与 bvid/cid 身份比对，杜绝跨视频/分 P 竞态；
 * 2. 视频分 P 列表加载 (loadParts) 与精准上下文解析；
 * 3. 字幕智能自动跟随：区分程序滚动与真实用户滚动，提供恢复跟随悬浮胶囊；
 * 4. 字幕中英双语搜索高亮与 Enter/Shift+Enter 上下跳转；
 * 5. 单句多功能操作栏（解释/复制/存笔记/复制链接）；
 * 6. AI 概览：分步骨架屏状态流转与播放章节实时动态高亮；
 * 7. AI 对话：Prompt 快捷提问词、流式代码复制与时间戳跳播事件委托、重新回答功能；
 * 8. 笔记工作流：AI 润色接线、行内原位编辑（Ctrl+Enter/Esc）、搜索过滤、多维排序、跨视频跳播；
 * 9. 设置与排版：5 大手风琴动态 Badge、字体搜索过滤、12–30px 范围即时预览；
 * 10. 完备的键盘与屏幕阅读器无障碍（/ 快捷键、Tab Roving Tabindex、aria-live、焦点环）。
 */

import {
  findActiveSegmentIndex,
  searchSegments,
  highlightTextHtml,
  findActiveChapterIndex,
  buildBiliVideoUrl,
} from "./lib/transcript-util.js";
import { renderMarkdown, escapeHtml } from "./lib/markdown.js";
import {
  buildMarkdown,
  buildChatMarkdown,
  buildOverviewMarkdown,
  buildNotesMarkdown,
} from "./lib/export.js";
import { normalizeProviderConfig, requestAiCompletionStream } from "./lib/ai.js";
import {
  TYPOGRAPHY_DEFAULTS,
  applyTypographySettings,
  filterFontOptions,
  getFontOptions,
  normalizeShowBrandText,
  normalizeTypographySettings,
  requestLocalFontList,
} from "./lib/typography.js";
import { createSettingsBackup, parseSettingsBackup } from "./lib/settings-transfer.js";

const DEBUG = false;
const debugLog = (...args) => {
  if (DEBUG) console.log("[BiliDigest Sidepanel]", ...args);
};

const EMPTY_GLYPHS = {
  video: '<svg class="empty-glyph" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 3.5l4 3 4-3"/></svg>',
  mute: '<svg class="empty-glyph" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><line x1="16" y1="9" x2="20" y2="15"/><line x1="20" y1="9" x2="16" y2="15"/></svg>',
  lock: '<svg class="empty-glyph" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  overview: '<svg class="empty-glyph" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><line x1="10" y1="12" x2="17" y2="12"/><line x1="10" y1="15" x2="14" y2="15"/></svg>',
  notes: '<svg class="empty-glyph" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z"/><line x1="14.5" y1="6.5" x2="17.5" y2="9.5"/></svg>',
  chat: '<svg class="empty-glyph" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.4-.66L3 21l1.66-5.09A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/><circle cx="8.5" cy="11.5" r="0.85" fill="currentColor"/><circle cx="12.5" cy="11.5" r="0.85" fill="currentColor"/><circle cx="16.5" cy="11.5" r="0.85" fill="currentColor"/></svg>',
};

const state = {
  video: null,
  currentTime: 0,
  segments: [],
  tracks: [],
  track: null,
  pages: [],
  mode: "original",
  hideOriginal: false,
  translations: [],
  translating: false,
  asrGenerating: false,
  overview: null,
  overviewGenerating: false,
  settings: {
    aiApiKey: "",
    aiBaseUrl: "",
    aiModel: "",
    asrGroqApiKey: "",
    asrModel: "whisper-large-v3",
    asrLanguage: "auto",
    targetLanguage: "English",
    customLanguage: "",
    thinkingLevel: "off",
    showMarkButton: true,
    showBrandText: true,
    transcriptAutoFollow: true,
    ...TYPOGRAPHY_DEFAULTS,
  },
  settingsLoaded: false,
  notes: [],
  notesScope: "current",
  notesSort: "timestamp",
  notesSearchQuery: "",
  editingNoteId: null,
  noteSeconds: 0,
  deleteConfirmNoteId: null,
  deleteConfirmTimer: null,
  chatMessages: [],
  chatLoaded: false,
  chatSending: false,
  currentTab: "transcript",

  // 宿主标签页绑定
  hostTabId: null,
  hostWindowId: null,

  // 历史视频切换与浏览
  // 历史视频切换与浏览
  historyItems: [],
  historySearchQuery: "",
  isBrowsingHistory: false,
  lastFocusedElBeforeDrawer: null,
  lastFocusedElBeforeExplain: null,

  // 异步竞态代次防护
  viewToken: 0,
  transcriptReqToken: 0,
  asrReqToken: 0,
  overviewReqToken: 0,
  chatReqToken: 0,
  notesReqToken: 0,
  translationReqToken: 0,
  explainReqToken: 0,
  polishReqToken: 0,

  // 字幕搜索与自动跟随
  searchOpen: false,
  searchQuery: "",
  searchMatches: [],
  currentMatchIndex: -1,
  activeSegmentIndex: -1,
  autoFollowPausedByUser: false,
  isProgrammaticScroll: false,
  userInteracting: false,
  userInteractTimer: null,
  activeChapterIndex: -1,
  lastHistoryWriteAt: 0,
  lastHistoryWriteSeconds: 0,
  lastHistoryWriteTarget: "",
};

// ============================================================
// DOM 引用
// ============================================================

const $ = (id) => document.getElementById(id);

const videoTitleEl = $("videoTitle");
const videoMetaEl = $("videoMeta");
const themeToggleBtn = $("themeToggleBtn");
const historyBtn = $("historyBtn");
const historyBanner = $("historyBanner");
const historyBannerTitle = $("historyBannerTitle");
const exitHistoryBtn = $("exitHistoryBtn");
const historyDrawer = $("historyDrawer");
const historyTotalBadge = $("historyTotalBadge");
const clearHistoryBtn = $("clearHistoryBtn");
const closeHistoryBtn = $("closeHistoryBtn");
const historySearchInput = $("historySearchInput");
const historyList = $("historyList");
const toastEl = $("toast");

// 字幕相关 DOM
const partSelect = $("partSelect");
const trackSelect = $("trackSelect");
const hideOriginalBtn = $("hideOriginalBtn");
const searchToggleBtn = $("searchToggleBtn");
const autoFollowBtn = $("autoFollowBtn");
const translateBtn = $("translateBtn");
const copyTranscriptBtn = $("copyTranscriptBtn");
const exportBtn = $("exportBtn");
const exportWithOverviewBtn = $("exportWithOverviewBtn");
const refreshBtn = $("refreshBtn");
const transcriptStatusEl = $("transcriptStatus");
const translationTrackEl = $("translationTrack");
const translationFillEl = $("translationFill");
const segmentsEl = $("segments");
const resumeFollowPill = $("resumeFollowPill");

// 搜索栏 DOM
const transcriptSearchContainer = $("transcriptSearchContainer");
const transcriptSearchInput = $("transcriptSearchInput");
const transcriptMatchCount = $("transcriptMatchCount");
const searchPrevBtn = $("searchPrevBtn");
const searchNextBtn = $("searchNextBtn");
const searchCloseBtn = $("searchCloseBtn");

// 概览相关 DOM
const generateOverviewBtn = $("generateOverviewBtn");
const regenerateOverviewBtn = $("regenerateOverviewBtn");
const exportOverviewBtn = $("exportOverviewBtn");
const overviewStatusEl = $("overviewStatus");
const overviewSkeleton = $("overviewSkeleton");
const overviewSkeletonStatus = $("overviewSkeletonStatus");
const overviewContentEl = $("overviewContent");

// 笔记相关 DOM
const noteTextEl = $("noteText");
const noteTimeChipEl = $("noteTimeChip");
const noteCharCountEl = $("noteCharCount");
const polishNoteBtn = $("polishNoteBtn");
const saveNoteBtn = $("saveNoteBtn");
const notesSortSelect = $("notesSortSelect");
const exportNotesBtn = $("exportNotesBtn");
const notesSearchInput = $("notesSearchInput");
const notesStatusEl = $("notesStatus");
const notesListEl = $("notesList");

// 对话相关 DOM
const regenerateChatBtn = $("regenerateChatBtn");
const exportChatBtn = $("exportChatBtn");
const clearChatBtn = $("clearChatBtn");
const chatStatusEl = $("chatStatus");
const chatMessagesEl = $("chatMessages");
const chatQuickPrompts = $("chatQuickPrompts");
const chatInput = $("chatInput");
const sendChatBtn = $("sendChatBtn");

// 设置相关 DOM
const aiConfigBadge = $("aiConfigBadge");
const groqConfigBadge = $("groqConfigBadge");
const typographyConfigBadge = $("typographyConfigBadge");
const translationConfigBadge = $("translationConfigBadge");

const apiKeyInput = $("apiKeyInput");
const toggleKeyBtn = $("toggleKeyBtn");
const baseUrlInput = $("baseUrlInput");
const modelSelect = $("modelSelect");
const modelInput = $("modelInput");
const thinkingLevelSelect = $("thinkingLevelSelect");
const listModelsBtn = $("listModelsBtn");
const testKeyBtn = $("testKeyBtn");
const modelListHint = $("modelListHint");
const keyTestResultEl = $("keyTestResult");

const asrGroqApiKeyInput = $("asrGroqApiKeyInput");
const toggleAsrKeyBtn = $("toggleAsrKeyBtn");
const asrModelSelect = $("asrModelSelect");
const asrLanguageSelect = $("asrLanguageSelect");
const testAsrBtn = $("testAsrBtn");
const asrTestResultEl = $("asrTestResult");

const targetLanguageSelect = $("targetLanguageSelect");
const customLanguageInput = $("customLanguageInput");
const customLanguageGroup = $("customLanguageGroup");
const saveSettingsBtn = $("saveSettingsBtn");
const savedHint = $("savedHint");
const openFullOptionsBtn = $("openFullOptionsBtn");

// 侧栏排版控制器
const readingFontPresetSelect = $("readingFontPresetSelect");
const readingFontSizeRange = $("readingFontSizeRange");
const readingFontSizeOutput = $("readingFontSizeOutput");
const readingLineHeightRange = $("readingLineHeightRange");
const readingLineHeightOutput = $("readingLineHeightOutput");
const readingLetterSpacingRange = $("readingLetterSpacingRange");
const readingLetterSpacingOutput = $("readingLetterSpacingOutput");
const interfaceFontPresetSelect = $("interfaceFontPresetSelect");
const codeFontPresetSelect = $("codeFontPresetSelect");
const brandFontSizeRange = $("brandFontSizeRange");
const brandFontSizeOutput = $("brandFontSizeOutput");
const titleFontSizeRange = $("titleFontSizeRange");
const titleFontSizeOutput = $("titleFontSizeOutput");
const navigationFontSizeRange = $("navigationFontSizeRange");
const navigationFontSizeOutput = $("navigationFontSizeOutput");
const controlFontSizeRange = $("controlFontSizeRange");
const controlFontSizeOutput = $("controlFontSizeOutput");
const overviewButtonFontSizeRange = $("overviewButtonFontSizeRange");
const overviewButtonFontSizeOutput = $("overviewButtonFontSizeOutput");
const videoActionButtonSizeRange = $("videoActionButtonSizeRange");
const videoActionButtonSizeOutput = $("videoActionButtonSizeOutput");
const metaFontSizeRange = $("metaFontSizeRange");
const metaFontSizeOutput = $("metaFontSizeOutput");
const codeFontSizeRange = $("codeFontSizeRange");
const codeFontSizeOutput = $("codeFontSizeOutput");
const fontSearchInput = $("fontSearchInput");
const fontSearchStatus = $("fontSearchStatus");
const readLocalFontsBtn = $("readLocalFontsBtn");
const localFontsStatus = $("localFontsStatus");
const showMarkButtonCheckbox = $("showMarkButtonCheckbox");
const showBrandTextCheckbox = $("showBrandTextCheckbox");
const transcriptAutoFollowCheckbox = $("transcriptAutoFollowCheckbox");
const resetTypographyBtn = $("resetTypographyBtn");
const typographyStatus = $("typographyStatus");

// 设置导入导出与缓存
const includeApiKeyExportCheckbox = $("includeApiKeyExportCheckbox");
const exportSettingsBtn = $("exportSettingsBtn");
const importSettingsBtn = $("importSettingsBtn");
const settingsImportFile = $("settingsImportFile");
const settingsTransferStatus = $("settingsTransferStatus");
const clearCacheBtn = $("clearCacheBtn");

// 逐句解释浮层
const explainSheetEl = $("explainSheet");
const explainOriginalEl = $("explainOriginal");
const explainResultEl = $("explainResult");
const closeExplainBtn = $("closeExplainBtn");

const regionTypographyControls = [
  ["transcript", $("transcriptFontPresetSelect"), $("transcriptFontSizeRange"), $("transcriptFontSizeOutput")],
  ["overview", $("overviewFontPresetSelect"), $("overviewFontSizeRange"), $("overviewFontSizeOutput")],
  ["notes", $("notesFontPresetSelect"), $("notesFontSizeRange"), $("notesFontSizeOutput")],
  ["chat", $("chatFontPresetSelect"), $("chatFontSizeRange"), $("chatFontSizeOutput")],
  ["settings", $("settingsFontPresetSelect"), $("settingsFontSizeRange"), $("settingsFontSizeOutput")],
];

const fontSelects = [
  readingFontPresetSelect,
  interfaceFontPresetSelect,
  codeFontPresetSelect,
  ...regionTypographyControls.map(([, select]) => select),
];
const localFontEntries = [];

// ============================================================
// 基础工具与通信
// ============================================================

function isCurrentTarget(expected, tokenKey = null) {
  if (!state.video) return false;
  if (expected.viewToken !== undefined && expected.viewToken !== state.viewToken) return false;
  if (expected.bvid && expected.bvid !== state.video.bvid) return false;
  if (expected.page !== undefined && Number(expected.page || 1) !== Number(state.video.page || 1)) return false;
  if (expected.cid !== undefined && expected.cid > 0 && state.video.cid > 0 && Number(expected.cid) !== Number(state.video.cid)) return false;
  if (tokenKey && expected.token !== undefined && state[tokenKey] !== expected.token) return false;
  return true;
}

function cancelPendingRequests() {
  ++state.viewToken;
  ++state.transcriptReqToken;
  ++state.asrReqToken;
  ++state.overviewReqToken;
  ++state.chatReqToken;
  ++state.translationReqToken;
  ++state.notesReqToken;
  ++state.explainReqToken;
  ++state.polishReqToken;

  state.asrGenerating = false;
  state.chatSending = false;
  state.translating = false;
  state.explaining = false;
  state.polishing = false;

  if (generateOverviewBtn) generateOverviewBtn.disabled = false;
  if (regenerateOverviewBtn) regenerateOverviewBtn.classList.remove("spinning");
  if (overviewSkeleton) overviewSkeleton.classList.add("hidden");
  if (overviewContentEl) overviewContentEl.classList.remove("hidden");
  if (translationTrackEl) translationTrackEl.classList.add("hidden");
  if (sendChatBtn) sendChatBtn.disabled = false;
  if (polishNoteBtn) polishNoteBtn.disabled = false;
  updateTranslateButton();
}

function secondsToTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

const HISTORY_WRITE_DISTANCE_SECONDS = 5;
const HISTORY_WRITE_INTERVAL_MS = 10_000;

function getHistoryWriteTarget(video = state.video) {
  if (!video?.bvid) return "";
  return `${video.bvid}:${Number(video.page || 1)}:${Number(video.cid) || 0}`;
}

function resetHistoryWriteBookkeeping(video = state.video) {
  state.lastHistoryWriteTarget = getHistoryWriteTarget(video);
  state.lastHistoryWriteSeconds = Number(video?.currentTime) || 0;
  state.lastHistoryWriteAt = Date.now();
}

function maybeRecordHistoryPlayback(currentTime, expected) {
  if (!isCurrentTarget(expected)) return;
  const target = getHistoryWriteTarget();
  if (!target) return;

  const now = Date.now();
  const targetChanged = state.lastHistoryWriteTarget !== target;
  const movedEnough = targetChanged || Math.abs(currentTime - state.lastHistoryWriteSeconds) >= HISTORY_WRITE_DISTANCE_SECONDS;
  const waitedEnough = targetChanged || now - state.lastHistoryWriteAt >= HISTORY_WRITE_INTERVAL_MS;
  if (!movedEnough && !waitedEnough) return;

  // 先更新 bookkeeping，再发请求，避免 500ms 轮询在请求未返回时重复写入。
  state.lastHistoryWriteTarget = target;
  state.lastHistoryWriteSeconds = currentTime;
  state.lastHistoryWriteAt = now;
  send("recordHistory", { video: { ...state.video, currentTime } }).catch(() => {});
}

async function send(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...payload });
  if (!response || response.success === false) {
    throw new Error(response?.error || "请求失败");
  }
  return response;
}

async function getVideoTab() {
  const isVideoPage = (url) => /^https:\/\/(www\.)?bilibili\.com\/video\//i.test(url || "");

  // 1. 优先复用已绑定的宿主标签页（防止多窗口或点击侧栏导致串页）
  if (state.hostTabId) {
    try {
      const boundTab = await chrome.tabs.get(state.hostTabId);
      if (boundTab && isVideoPage(boundTab.url)) {
        return boundTab;
      }
    } catch {
      state.hostTabId = null;
    }
  }

  // 2. 最后聚焦窗口的活动标签
  try {
    const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const focused = activeTabs.find((t) => isVideoPage(t.url));
    if (focused) {
      state.hostTabId = focused.id;
      state.hostWindowId = focused.windowId;
      return focused;
    }
  } catch {}

  // 3. 当前窗口的活动标签
  try {
    const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const cur = currentTabs.find((t) => isVideoPage(t.url));
    if (cur) {
      state.hostTabId = cur.id;
      state.hostWindowId = cur.windowId;
      return cur;
    }
  } catch {}

  // 4. 优先精确查询相同窗口的 B站视频标签页（遵循窗口隔离与最小权限）
  if (state.hostWindowId) {
    try {
      const windowTabs = await chrome.tabs.query({
        windowId: state.hostWindowId,
        url: "*://*.bilibili.com/video/*",
      });
      if (windowTabs && windowTabs.length > 0) {
        const target = windowTabs.find((t) => t.active) || windowTabs[0];
        state.hostTabId = target.id;
        return target;
      }
    } catch {}
  }

  // 5. 跨窗口 fallback 查询 B站视频标签页
  try {
    const biliTabs = await chrome.tabs.query({ url: "*://*.bilibili.com/video/*" });
    if (biliTabs && biliTabs.length > 0) {
      const target = biliTabs.find((t) => t.active) || biliTabs[0];
      state.hostTabId = target.id;
      state.hostWindowId = target.windowId;
      return target;
    }
  } catch {}

  return null;
}

async function sendToTab(action, payload = {}) {
  const tab = await getVideoTab();
  if (!tab?.id) throw new Error("未找到 B站视频标签页");
  const response = await chrome.tabs.sendMessage(tab.id, { action, ...payload });
  if (!response) throw new Error("视频页没有响应，请刷新视频页后重试");
  if (response.success === false) {
    throw new Error(response.error || "视频页操作失败");
  }
  return response;
}

async function seekTo(seconds) {
  const sec = Math.max(0, Number(seconds) || 0);
  if (state.isBrowsingHistory && state.video?.bvid) {
    try {
      const activeTab = await getVideoTab();
      const ctx = activeTab?.id ? await chrome.tabs.sendMessage(activeTab.id, { action: "getVideoContext" }).catch(() => null) : null;
      if (!ctx || ctx.bvid !== state.video.bvid || Number(ctx.page || 1) !== Number(state.video.page || 1)) {
        const url = buildBiliVideoUrl(state.video.bvid, state.video.page, sec);
        try {
          const newTab = await chrome.tabs.create({ url });
          if (newTab?.id) {
            state.hostTabId = newTab.id;
            state.hostWindowId = newTab.windowId;
          }
        } catch {
          window.open(url, "_blank");
        }
        showToast("已在新标签页打开该历史视频并跳转播放");
        return;
      }
    } catch {
      const url = buildBiliVideoUrl(state.video.bvid, state.video.page, sec);
      try {
        const newTab = await chrome.tabs.create({ url });
        if (newTab?.id) {
          state.hostTabId = newTab.id;
          state.hostWindowId = newTab.windowId;
        }
      } catch {
        window.open(url, "_blank");
      }
      return;
    }
  }

  try {
    await sendToTab("seekTo", { seconds: sec });
  } catch (err) {
    debugLog("seekTo 错误", err.message);
  }
}

let toastTimer = null;
function showToast(text, kind = "info") {
  toastEl.textContent = text;
  toastEl.className = `toast show${kind === "error" ? " error" : ""}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.className = "toast";
  }, 2600);
}

function setProgress(percent) {
  translationFillEl.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function effectiveTargetLanguage() {
  if (state.settings.targetLanguage === "custom") {
    return state.settings.customLanguage || "English";
  }
  return state.settings.targetLanguage;
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeToggleBtn.textContent = isDark ? "☀" : "☾";
}

async function loadTheme() {
  try {
    const { theme } = await chrome.storage.local.get("theme");
    applyTheme(theme === "dark" ? "dark" : "light");
  } catch {
    applyTheme("light");
  }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  chrome.storage.local.set({ theme: next }).catch(() => {});
}

function renderEmpty(targetEl, glyph, lines, { glyphHtml = false } = {}) {
  targetEl.replaceChildren();
  const box = document.createElement("div");
  box.className = "empty-state";
  const glyphMarkup = glyphHtml ? glyph : `<span class="glyph">${escapeHtml(glyph)}</span>`;
  box.innerHTML = `${glyphMarkup}${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}`;
  targetEl.appendChild(box);
}

// ============================================================
// 视频检测、分 P 与同步
// ============================================================

function updateHeader() {
  if (!state.video?.bvid) {
    videoTitleEl.textContent = "尚未检测到视频";
    videoMetaEl.replaceChildren();
    return;
  }
  videoTitleEl.textContent = state.video.title || state.video.bvid;
  videoMetaEl.replaceChildren();

  if (state.video.author) {
    const author = document.createElement("button");
    author.className = "video-meta-author";
    author.type = "button";
    author.textContent = state.video.author;
    if (state.video.authorMid) {
      author.title = "打开作者主页";
      author.addEventListener("click", () => {
        const url = `https://space.bilibili.com/${state.video.authorMid}`;
        chrome.tabs.create({ url }).catch(() => window.open(url, "_blank"));
      });
    }
    videoMetaEl.appendChild(author);
  }

  if (state.video.bvid) {
    if (videoMetaEl.childElementCount > 0) {
      const sep = document.createElement("span");
      sep.className = "video-meta-sep";
      sep.textContent = "·";
      videoMetaEl.appendChild(sep);
    }
    const bv = document.createElement("button");
    bv.className = "video-meta-bv";
    bv.type = "button";
    bv.textContent = state.video.bvid;
    bv.title = "点击复制 BV 号";
    bv.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(state.video.bvid);
        showToast("已复制 BV 号");
      } catch {
        showToast("复制失败", "error");
      }
    });
    videoMetaEl.appendChild(bv);
  }
}

async function loadParts() {
  const bvid = state.video?.bvid;
  const page = Number(state.video?.page || 1);
  const viewToken = state.viewToken;
  if (!bvid) return;
  try {
    const info = await send("getVideoInfo", { bvid, page });
    if (viewToken !== state.viewToken || state.video?.bvid !== bvid || Number(state.video?.page || 1) !== page) return;
    state.pages = info.pages || [];
    renderPartSelect();
  } catch (err) {
    debugLog("loadParts 异常", err);
  }
}

function clearVideoBinding() {
  if (state.video || state.segments.length || state.tracks.length || state.pages.length || state.overview || state.asrGenerating) {
    cancelPendingRequests();
  }

  state.video = null;
  state.currentTime = 0;
  state.segments = [];
  state.tracks = [];
  state.track = null;
  state.pages = [];
  state.translations = [];
  state.overview = null;
  state.notes = [];
  state.notesSearchQuery = "";
  state.editingNoteId = null;
  state.chatMessages = [];
  state.chatLoaded = false;
  state.noteSeconds = 0;
  state.activeSegmentIndex = -1;
  state.activeChapterIndex = -1;
  state.autoFollowPausedByUser = false;
  state.searchOpen = false;
  state.searchQuery = "";
  state.searchMatches = [];
  state.currentMatchIndex = -1;
  resetHistoryWriteBookkeeping(null);

  updateHeader();
  transcriptStatusEl.textContent = "";
  overviewStatusEl.textContent = "";
  overviewSkeletonStatus.textContent = "准备字幕中…";
  notesStatusEl.textContent = "";
  chatStatusEl.textContent = "";
  noteTimeChipEl.textContent = secondsToTimestamp(0);
  transcriptSearchContainer.classList.add("hidden");
  searchToggleBtn.classList.remove("active");
  transcriptSearchInput.value = "";
  transcriptMatchCount.textContent = "0 / 0";
  notesSearchInput.value = "";
  hideOriginalBtn.classList.add("hidden");
  hideOriginalBtn.textContent = "隐藏原文";
  state.hideOriginal = false;
  translationTrackEl.classList.add("hidden");
  translationFillEl.style.width = "0%";
  resumeFollowPill.classList.add("hidden");
  updateTranslateButton();
  renderPartSelect();
  renderTrackSelect();
  renderSegments();
  renderEmpty(
    segmentsEl,
    EMPTY_GLYPHS.video,
    ["请打开一个 B站视频页面", "字幕和笔记会出现在这里"],
    { glyphHtml: true },
  );
  renderOverview();
  renderNotes();
  renderChat();
}

async function detectVideo() {
  if (state.isBrowsingHistory) {
    // 处于历史浏览模式时不被当前标签页轮询打断
    return;
  }
  try {
    const context = await sendToTab("getVideoContext");
    if (!context?.bvid) {
      clearVideoBinding();
      return;
    }

    const previousCid = Number(state.video?.cid) || 0;
    const incomingCid = Number(context.cid) || 0;
    const changed =
      !state.video ||
      state.video.bvid !== context.bvid ||
      Number(state.video.page || 1) !== Number(context.page || 1) ||
      (incomingCid && previousCid && incomingCid !== previousCid);

    if (changed) {
      cancelPendingRequests();
      const viewToken = state.viewToken;
      state.video = context;
      state.currentTime = Number(context.currentTime) || 0;
      state.noteSeconds = state.currentTime;
      noteTimeChipEl.textContent = secondsToTimestamp(state.currentTime);
      resetHistoryWriteBookkeeping(context);
      state.segments = [];
      state.tracks = [];
      state.track = null;
      state.pages = [];
      state.translations = [];
      state.overview = null;
      state.notes = [];
      state.chatMessages = [];
      state.chatLoaded = false;
      state.searchQuery = "";
      state.searchMatches = [];
      state.currentMatchIndex = -1;
      state.activeSegmentIndex = -1;
      state.activeChapterIndex = -1;
      state.hideOriginal = false;
      hideOriginalBtn.textContent = "隐藏原文";
      hideOriginalBtn.classList.toggle("hidden", state.mode !== "bilingual");
      updateHeader();
      ensureAuthorMid();
      send("recordHistory", { video: context }).catch(() => {});
      await loadParts();
      await loadTranscript();
      if (viewToken === state.viewToken) {
        if (state.currentTab === "overview") await loadCachedOverview();
        else if (state.currentTab === "notes") await refreshNotes();
        else if (state.currentTab === "chat") await loadChat();
      }
    } else {
      state.video = {
        ...state.video,
        ...context,
        cid: incomingCid || previousCid,
      };
      updateHeader();
      ensureAuthorMid();
    }
  } catch (err) {
    debugLog("detectVideo 轮询", err.message);
  }
}

// ============================================================
// 历史视频切换与浏览
// ============================================================

async function openHistoryDrawer() {
  state.lastFocusedElBeforeDrawer = document.activeElement;
  historyDrawer.classList.remove("hidden");
  historySearchInput.value = "";
  state.historySearchQuery = "";
  historySearchInput.focus();
  await loadAndRenderHistory();
}

function closeHistoryDrawer() {
  historyDrawer.classList.add("hidden");
  if (state.lastFocusedElBeforeDrawer && typeof state.lastFocusedElBeforeDrawer.focus === "function") {
    try {
      state.lastFocusedElBeforeDrawer.focus();
    } catch {
      historyBtn.focus();
    }
  } else {
    historyBtn.focus();
  }
}

async function loadAndRenderHistory() {
  historyList.setAttribute("aria-busy", "true");
  try {
    const res = await send("getHistory");
    state.historyItems = res?.history || [];
    historyTotalBadge.textContent = `${state.historyItems.length} 个视频`;
    renderHistory();
  } catch (err) {
    showToast(err.message || "加载历史失败", "error");
  } finally {
    historyList.setAttribute("aria-busy", "false");
  }
}

function renderHistory() {
  historyList.replaceChildren();
  let list = [...state.historyItems];
  const q = state.historySearchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (item) =>
        (item.title || "").toLowerCase().includes(q) ||
        (item.author || "").toLowerCase().includes(q) ||
        (item.bvid || "").toLowerCase().includes(q),
    );
  }

  if (!list.length) {
    renderEmpty(
      historyList,
      EMPTY_GLYPHS.video,
      ["没有找到匹配的历史记录", "浏览视频后会自动记录到这里"],
      { glyphHtml: true },
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of list) {
    const card = document.createElement("div");
    card.className = "history-card";
    const pageLabel = Number(item.page) > 1 ? ` · P${item.page}` : "";
    const dateStr = item.lastVisitedAt ? new Date(item.lastVisitedAt).toLocaleString() : "";
    const lastWatchedText = Number(item.currentTime) > 0 ? ` · 上次看到 ${secondsToTimestamp(item.currentTime)}` : "";

    card.innerHTML = `
      <div class="history-card-head">
        <button class="history-card-title-btn" type="button">${escapeHtml(item.title)}</button>
        <button class="history-card-delete" type="button" title="从历史中删除" aria-label="删除历史记录：${escapeHtml(item.title)}">✕</button>
      </div>
      <div class="history-card-meta">
        <span>${escapeHtml(item.author || "UP主")}${pageLabel} · ${escapeHtml(item.bvid)}${lastWatchedText}</span>
        <span>${dateStr}</span>
      </div>
      <div class="history-card-actions">
        <button class="primary-btn history-view-btn" type="button">重看字幕与概览</button>
        <button class="ghost-btn history-open-tab-btn" type="button">在 B站继续播放</button>
      </div>
    `;

    card.querySelector(".history-card-title-btn").addEventListener("click", () => {
      viewHistoricalVideo(item);
    });

    card.querySelector(".history-view-btn").addEventListener("click", () => {
      viewHistoricalVideo(item);
    });

    card.querySelector(".history-open-tab-btn").addEventListener("click", async () => {
      const url = buildBiliVideoUrl(item.bvid, item.page, item.currentTime || 0);
      try {
        const newTab = await chrome.tabs.create({ url });
        if (newTab?.id) {
          state.hostTabId = newTab.id;
          state.hostWindowId = newTab.windowId;
        }
      } catch {
        window.open(url, "_blank");
      }
    });

    card.querySelector(".history-card-delete").addEventListener("click", async () => {
      await send("deleteHistoryItem", { bvid: item.bvid, page: item.page });
      showToast("已删除该条历史记录");
      await loadAndRenderHistory();
    });

    fragment.appendChild(card);
  }

  historyList.appendChild(fragment);
}

async function viewHistoricalVideo(item) {
  cancelPendingRequests();
  const viewToken = state.viewToken;
  if (!state.isBrowsingHistory) {
    state.savedLiveHostTabId = state.hostTabId;
    state.savedLiveHostWindowId = state.hostWindowId;
  }
  state.isBrowsingHistory = true;
  state.currentTime = Number(item.currentTime) || 0;
  state.video = {
    bvid: item.bvid,
    cid: item.cid,
    aid: item.aid,
    title: item.title,
    author: item.author,
    authorMid: item.authorMid,
    page: item.page || 1,
    duration: item.duration || 0,
    currentTime: item.currentTime || 0,
  };
  state.noteSeconds = state.currentTime;
  noteTimeChipEl.textContent = secondsToTimestamp(state.currentTime);
  resetHistoryWriteBookkeeping(state.video);

  historyBannerTitle.textContent = `${item.title}${Number(item.page) > 1 ? ` (P${item.page})` : ""}`;
  historyBanner.classList.remove("hidden");

  state.segments = [];
  state.tracks = [];
  state.track = null;
  state.pages = [];
  state.translations = [];
  state.overview = null;
  state.notes = [];
  state.chatMessages = [];
  state.chatLoaded = false;
  state.searchQuery = "";
  state.searchMatches = [];
  state.currentMatchIndex = -1;

  updateHeader();
  closeHistoryDrawer();

  await loadParts();
  await loadTranscript();
  if (viewToken === state.viewToken) {
    if (state.currentTab === "overview") await loadCachedOverview();
    else if (state.currentTab === "notes") await refreshNotes();
    else if (state.currentTab === "chat") await loadChat();
  }

  showToast(`已切换至历史视频：${item.title}`);
}

async function exitHistoricalView() {
  cancelPendingRequests();
  state.isBrowsingHistory = false;
  historyBanner.classList.add("hidden");
  if (state.savedLiveHostTabId) {
    state.hostTabId = state.savedLiveHostTabId;
    state.hostWindowId = state.savedLiveHostWindowId;
    state.savedLiveHostTabId = null;
    state.savedLiveHostWindowId = null;
  }
  state.video = null;
  showToast("已切回当前播放视频");
  await detectVideo();
}

async function ensureAuthorMid() {
  const bvid = state.video?.bvid;
  if (!bvid || state.video.authorMid) return;
  try {
    const info = await send("getVideoInfo", { bvid });
    const mid = Number(info.authorMid) || 0;
    if (mid && state.video?.bvid === bvid) {
      state.video.authorMid = mid;
      updateHeader();
    }
  } catch {}
}

async function syncPlaybackTime() {
  const expected = {
    viewToken: state.viewToken,
    bvid: state.video?.bvid,
    cid: Number(state.video?.cid) || 0,
    page: Number(state.video?.page || 1),
  };
  if (!expected.bvid) return;

  if (state.isBrowsingHistory) {
    try {
      const activeTab = await getVideoTab();
      const ctx = activeTab?.id ? await chrome.tabs.sendMessage(activeTab.id, { action: "getVideoContext" }).catch(() => null) : null;
      if (
        !ctx?.bvid ||
        ctx.bvid !== state.video?.bvid ||
        Number(ctx.page || 1) !== Number(state.video?.page || 1)
      ) {
        return;
      }
    } catch {
      return;
    }
  }

  try {
    const result = await sendToTab("getCurrentTime");
    if (!isCurrentTarget(expected) || Number(expected.cid) !== Number(state.video?.cid || 0)) return;
    const currentTime = Number(result.currentTime) || 0;
    state.currentTime = currentTime;
    state.noteSeconds = state.currentTime;
    noteTimeChipEl.textContent = secondsToTimestamp(state.currentTime);
    maybeRecordHistoryPlayback(currentTime, expected);

    // 同步字幕高亮与自动跟随
    updateActiveSegment();

    // 同步概览章节高亮
    updateActiveChapter();
  } catch {}
}

// ============================================================
// 字幕与渲染 (Transcript)
// ============================================================

async function loadTranscript({ lan } = {}) {
  const { bvid, cid, aid, page } = state.video || {};
  if (!bvid) return;

  const currentToken = ++state.transcriptReqToken;
  const expected = {
    viewToken: state.viewToken,
    bvid,
    cid: Number(cid) || 0,
    page: Number(page) || 1,
    token: currentToken,
  };

  transcriptStatusEl.textContent = "正在读取字幕…";
  transcriptStatusEl.className = "status-line";

  try {
    const result = await send("fetchTranscript", {
      bvid,
      cid: cid || 0,
      aid,
      page: page || 1,
      lan,
    });

    if (!isCurrentTarget(expected, "transcriptReqToken")) {
      return;
    }

    if (result.cid && Number(result.cid) > 0 && Number(result.cid) !== Number(state.video?.cid)) {
      state.video.cid = Number(result.cid);
      send("recordHistory", { video: state.video }).catch(() => {});
    }
    state.segments = result.segments || [];
    state.tracks = result.tracks || [];
    state.track = result.track || null;
    state.translations = [];

    if (state.segments.length === 0) {
      if (!result.tracks?.length) {
        renderAsrEmpty();
      } else {
        renderEmpty(
          segmentsEl,
          EMPTY_GLYPHS.mute,
          ["字幕文件为空", "可以刷新字幕，或检查视频的原生字幕"],
          { glyphHtml: true },
        );
      }
      transcriptStatusEl.textContent = "";
      return;
    }

    renderTrackSelect();
    const trackLabel = state.track?.lan_doc || state.track?.lan || "字幕";
    const partLabel = Number(state.video?.page) > 1 ? `P${state.video.page} · ` : "";
    transcriptStatusEl.textContent = `${partLabel}已加载 ${state.segments.length} 条字幕 · ${trackLabel}`;

    send("setActiveTrack", {
      bvid,
      cid: state.video.cid,
      aid: state.video.aid,
      page: state.video.page || 1,
      lan: state.track?.lan || "",
    }).catch(() => {});

    renderSegments();
    updateTranslateButton();
  } catch (error) {
    if (!isCurrentTarget(expected, "transcriptReqToken")) return;
    transcriptStatusEl.textContent = "";
    const msg = error.message || "未知错误";
    renderEmpty(
      segmentsEl,
      EMPTY_GLYPHS.lock,
      [`读取字幕失败：${msg}`, "请确认 bilibili.com 登录状态并刷新视频页"],
      { glyphHtml: true },
    );
  }
}

function renderAsrEmpty(detail = "") {
  renderEmpty(
    segmentsEl,
    EMPTY_GLYPHS.mute,
    ["没有找到 B站原生字幕轨道", detail || "可使用 Groq Whisper 从音轨生成时间轴字幕"],
    { glyphHtml: true },
  );
  const box = segmentsEl.querySelector(".empty-state");
  if (!box) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary-btn asr-generate-btn";
  button.textContent = state.asrGenerating ? "正在生成 AI 字幕…" : "AI 生成字幕";
  button.disabled = state.asrGenerating;
  button.addEventListener("click", () => generateAsrTranscript());
  box.appendChild(button);
}

async function generateAsrTranscript({ force = false } = {}) {
  if (state.asrGenerating || !state.video?.bvid) return false;
  if (!state.settingsLoaded) await loadSettings();
  if (!state.settings.asrGroqApiKey) {
    showToast("请先在设置中填写 Groq API Key", "error");
    switchTab("settings");
    return false;
  }

  const token = ++state.asrReqToken;
  const expected = {
    viewToken: state.viewToken,
    bvid: state.video.bvid,
    cid: Number(state.video.cid) || 0,
    page: Number(state.video.page) || 1,
    token,
  };

  state.asrGenerating = true;
  transcriptStatusEl.textContent = "正在获取 B站最低码率音轨并上传 Groq…";
  transcriptStatusEl.className = "status-line";
  renderAsrEmpty("正在处理音频，请不要关闭当前视频页");

  try {
    const result = await send("generateAsrTranscript", {
      bvid: state.video.bvid,
      cid: state.video.cid || 0,
      aid: state.video.aid,
      page: state.video.page || 1,
      title: state.video.title || "",
      force,
    });

    if (!isCurrentTarget(expected, "asrReqToken")) {
      return false;
    }

    state.video.cid = Number(result.cid) || state.video.cid;
    expected.cid = Number(state.video.cid) || 0;
    state.segments = result.segments || [];
    state.tracks = result.tracks || [];
    state.track = result.track || null;
    state.translations = [];
    state.overview = null;
    renderTrackSelect();
    renderSegments();
    updateTranslateButton();
    const cacheText = result.cached ? "（本机缓存）" : "";
    transcriptStatusEl.textContent = `已生成 ${state.segments.length} 条 AI 字幕 ${cacheText}`.trim();
    showToast(result.cached ? "已读取本机 AI 字幕缓存" : "AI 字幕生成完成");
    return state.segments.length > 0;
  } catch (error) {
    if (!isCurrentTarget(expected, "asrReqToken")) return false;
    transcriptStatusEl.textContent = "";
    showToast(error.message || "AI 字幕生成失败", "error");
    return false;
  } finally {
    if (isCurrentTarget(expected, "asrReqToken")) {
      state.asrGenerating = false;
      if (!state.segments.length) {
        renderAsrEmpty();
      }
    }
  }
}

function renderPartSelect() {
  partSelect.replaceChildren();
  if (state.pages.length <= 1) {
    partSelect.classList.add("hidden");
    return;
  }
  for (const part of state.pages) {
    const option = document.createElement("option");
    option.value = String(part.page);
    option.textContent = `P${part.page} ${part.part || ""}`;
    partSelect.appendChild(option);
  }
  partSelect.value = String(Number(state.video?.page) || 1);
  partSelect.classList.remove("hidden");
}

function renderTrackSelect() {
  trackSelect.replaceChildren();
  const tracks = state.tracks || [];
  if (tracks.length <= 1) {
    trackSelect.classList.add("hidden");
    return;
  }
  for (const track of tracks) {
    const option = document.createElement("option");
    option.value = String(track.lan || "");
    option.textContent = String(track.lan_doc || track.lan || "");
    trackSelect.appendChild(option);
  }
  if (state.track?.lan) trackSelect.value = state.track.lan;
  trackSelect.classList.remove("hidden");
}

function renderSegments() {
  segmentsEl.replaceChildren();
  if (!state.segments.length) return;

  const fragment = document.createDocumentFragment();
  const isBilingual = state.mode === "bilingual";
  const showOriginal = state.mode === "original" || (isBilingual && !state.hideOriginal);
  const currentFocusedSegmentIndex = state.searchMatches[state.currentMatchIndex] ?? -1;

  state.segments.forEach((segment, index) => {
    const row = document.createElement("div");
    row.className = "segment";
    row.dataset.index = String(index);
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-label", `时间 ${secondsToTimestamp(segment.from)}: ${segment.content}`);
    if (index === state.activeSegmentIndex) row.classList.add("active");

    const isCurrentSearchFocus = index === currentFocusedSegmentIndex;
    const zhHtml = showOriginal
      ? `<div class="segment-zh">${highlightTextHtml(segment.content, state.searchQuery, isCurrentSearchFocus)}</div>`
      : "";
    const trText = state.translations[index] || (isBilingual ? "…" : "");
    const trHtml = isBilingual
      ? `<div class="segment-tr${state.hideOriginal ? " tr-inline" : ""}">${highlightTextHtml(trText, state.searchQuery, isCurrentSearchFocus)}</div>`
      : "";

    row.innerHTML = `
      <div class="segment-header">
        <button class="segment-time" type="button" title="跳转播放" tabindex="-1">${secondsToTimestamp(segment.from)}</button>
        <div class="segment-actions">
          <button class="segment-action-btn" data-action="explain" type="button" title="AI 解释">解释</button>
          <button class="segment-action-btn" data-action="copy" type="button" title="复制文本">复制</button>
          <button class="segment-action-btn" data-action="note" type="button" title="存为笔记">记笔记</button>
          <button class="segment-action-btn" data-action="link" type="button" title="复制时间戳链接">链接</button>
        </div>
      </div>
      ${zhHtml}
      ${trHtml}
    `;

    row.addEventListener("click", (e) => {
      if (e.target.closest(".segment-action-btn")) return;
      seekTo(segment.from);
    });
    row.addEventListener("keydown", (e) => {
      if (e.target !== row) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        seekTo(segment.from);
      }
    });

    row.querySelectorAll(".segment-action-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleSegmentAction(btn.dataset.action, index);
      });
    });

    fragment.appendChild(row);
  });

  segmentsEl.appendChild(fragment);
}

async function handleSegmentAction(action, index) {
  const segment = state.segments[index];
  if (!segment) return;

  if (action === "explain") {
    openExplain(index);
  } else if (action === "copy") {
    try {
      await navigator.clipboard.writeText(segment.content);
      showToast("已复制单句字幕");
    } catch {
      showToast("复制失败", "error");
    }
  } else if (action === "note") {
    if (!state.video?.bvid) return;
    try {
      await send("saveNote", {
        videoId: state.video.bvid,
        timestamp: segment.from,
        videoTitle: state.video.title,
        author: state.video.author,
        page: state.video.page || 1,
        text: segment.content,
      });
      showToast("字幕已保存为笔记");
      if (state.currentTab === "notes") refreshNotes();
    } catch (err) {
      showToast(err.message, "error");
    }
  } else if (action === "link") {
    const url = buildBiliVideoUrl(state.video?.bvid, state.video?.page, segment.from);
    try {
      await navigator.clipboard.writeText(url);
      showToast("已复制时间戳链接");
    } catch {
      showToast("复制链接失败", "error");
    }
  }
}

function updateActiveSegment() {
  if (!state.segments.length) return;
  const newIndex = findActiveSegmentIndex(state.segments, state.currentTime);
  if (newIndex === state.activeSegmentIndex) return;

  const prevEl = segmentsEl.querySelector(`.segment[data-index="${state.activeSegmentIndex}"]`);
  if (prevEl) prevEl.classList.remove("active");

  state.activeSegmentIndex = newIndex;
  if (newIndex >= 0) {
    const nextEl = segmentsEl.querySelector(`.segment[data-index="${newIndex}"]`);
    if (nextEl) {
      nextEl.classList.add("active");
      if (
        state.settings.transcriptAutoFollow &&
        !state.autoFollowPausedByUser &&
        state.currentTab === "transcript"
      ) {
        state.isProgrammaticScroll = true;
        nextEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setTimeout(() => {
          state.isProgrammaticScroll = false;
        }, 400);
      }
    }
  }
}

function scrollToActiveSegment() {
  if (state.activeSegmentIndex >= 0) {
    const el = segmentsEl.querySelector(`.segment[data-index="${state.activeSegmentIndex}"]`);
    if (el) {
      state.isProgrammaticScroll = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        state.isProgrammaticScroll = false;
      }, 400);
    }
  }
}

// ============================================================
// 字幕搜索与定位
// ============================================================

function toggleSearch(force) {
  const open = typeof force === "boolean" ? force : !state.searchOpen;
  state.searchOpen = open;
  transcriptSearchContainer.classList.toggle("hidden", !open);
  searchToggleBtn.classList.toggle("active", open);
  if (open) {
    transcriptSearchInput.focus();
    transcriptSearchInput.select();
  } else {
    state.searchQuery = "";
    state.searchMatches = [];
    state.currentMatchIndex = -1;
    transcriptMatchCount.textContent = "0 / 0";
    renderSegments();
  }
}

function executeSearch(query) {
  state.searchQuery = query.trim();
  const { matches, count } = searchSegments(
    state.segments,
    state.translations,
    state.searchQuery,
  );
  state.searchMatches = matches;
  state.currentMatchIndex = count > 0 ? 0 : -1;
  transcriptMatchCount.textContent = count > 0 ? `1 / ${count}` : "0 / 0";
  renderSegments();
  jumpToMatch(state.currentMatchIndex);
}

function navigateSearch(direction) {
  if (!state.searchMatches.length) return;
  const count = state.searchMatches.length;
  state.currentMatchIndex = (state.currentMatchIndex + direction + count) % count;
  transcriptMatchCount.textContent = `${state.currentMatchIndex + 1} / ${count}`;
  renderSegments();
  jumpToMatch(state.currentMatchIndex);
}

function jumpToMatch(matchIdx) {
  if (matchIdx < 0 || matchIdx >= state.searchMatches.length) return;
  const segmentIdx = state.searchMatches[matchIdx];
  const el = segmentsEl.querySelector(`.segment[data-index="${segmentIdx}"]`);
  if (el) {
    state.isProgrammaticScroll = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      state.isProgrammaticScroll = false;
    }, 400);
  }
}

// ============================================================
// AI 概览 (Overview)
// ============================================================

async function loadOverview({ force = false } = {}) {
  if (!state.video?.bvid) {
    renderEmpty(overviewContentEl, EMPTY_GLYPHS.overview, ["先打开一个 B站视频"], { glyphHtml: true });
    return;
  }

  const token = ++state.overviewReqToken;
  const expected = {
    viewToken: state.viewToken,
    bvid: state.video.bvid,
    cid: Number(state.video.cid) || 0,
    page: Number(state.video.page) || 1,
    token,
  };

  generateOverviewBtn.disabled = true;
  regenerateOverviewBtn.classList.add("spinning");
  overviewSkeleton.classList.remove("hidden");
  overviewContentEl.classList.add("hidden");
  overviewStatusEl.textContent = "";

  try {
    if (!state.segments.length) {
      overviewSkeletonStatus.textContent = "正在生成 AI 字幕…";
      const ready = await generateAsrTranscript({ force: false });
      if (!isCurrentTarget({ ...expected, cid: 0 }, "overviewReqToken")) return;
      expected.cid = Number(state.video?.cid) || 0;
      if (!ready || !state.segments.length) throw new Error("没有可用字幕");
    }

    overviewSkeletonStatus.textContent = "AI 正在深入精读与梳理概览…";
    const result = await send("generateOverview", {
      bvid: state.video.bvid,
      cid: state.video.cid,
      lan: state.track?.lan || "",
      segments: state.segments,
      force,
    });

    if (!isCurrentTarget(expected, "overviewReqToken")) return;

    state.overview = result;
    renderOverview();
  } catch (err) {
    if (!isCurrentTarget(expected, "overviewReqToken")) return;
    overviewStatusEl.className = "status-line error";
    overviewStatusEl.textContent = `生成失败：${err.message}`;
  } finally {
    if (isCurrentTarget(expected, "overviewReqToken")) {
      generateOverviewBtn.disabled = false;
      regenerateOverviewBtn.classList.remove("spinning");
      overviewSkeleton.classList.add("hidden");
      overviewContentEl.classList.remove("hidden");
    }
  }
}

async function loadCachedOverview() {
  if (!state.video?.bvid) {
    renderEmpty(overviewContentEl, EMPTY_GLYPHS.overview, ["先打开一个 B站视频"], { glyphHtml: true });
    return;
  }
  const token = ++state.overviewReqToken;
  const expected = {
    viewToken: state.viewToken,
    bvid: state.video.bvid,
    cid: Number(state.video.cid) || 0,
    page: Number(state.video.page) || 1,
    token,
  };
  try {
    const key = `digest:${state.video.bvid}:${state.video.cid || 0}:${state.track?.lan || ""}`;
    const res = await chrome.storage.local.get(key);
    const cached = res[key];
    if (!isCurrentTarget(expected, "overviewReqToken")) return;
    if (cached?.summary || cached?.chapters?.length) {
      state.overview = { ...cached, cached: true };
      renderOverview();
      return;
    }
  } catch {}

  if (!isCurrentTarget(expected, "overviewReqToken")) return;
  state.overview = null;
  renderEmpty(
    overviewContentEl,
    EMPTY_GLYPHS.overview,
    ["这个视频还没有概览", "点击上方「生成 AI 概览」开始"],
    { glyphHtml: true },
  );
}

function renderOverview() {
  overviewContentEl.replaceChildren();
  if (!state.overview) return;

  const fragment = document.createDocumentFragment();

  if (state.overview.summary) {
    const summary = document.createElement("div");
    summary.className = "summary-card";
    summary.innerHTML = `
      <p class="card-label">内容概要</p>
      <p class="summary-text">${escapeHtml(state.overview.summary)}</p>
    `;
    fragment.appendChild(summary);
  }

  if (state.overview.chapters?.length) {
    const section = document.createElement("div");
    section.className = "chapters-section";
    const label = document.createElement("p");
    label.className = "card-label";
    label.textContent = "章节导航";
    section.appendChild(label);

    state.overview.chapters.forEach((chapter, idx) => {
      const card = document.createElement("div");
      card.className = "chapter-card";
      card.dataset.index = String(idx);
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", `章节 ${chapter.title}，时间 ${secondsToTimestamp(chapter.time)}`);
      if (idx === state.activeChapterIndex) card.classList.add("active");
      card.innerHTML = `
        <div class="chapter-timeline-node"><span class="timeline-dot"></span></div>
        <div class="chapter-info">
          <span class="chapter-title">${escapeHtml(chapter.title)}</span>
          <span class="chapter-time">${secondsToTimestamp(chapter.time)}</span>
        </div>
      `;
      card.addEventListener("click", () => seekTo(chapter.time));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          seekTo(chapter.time);
        }
      });
      section.appendChild(card);
    });
    fragment.appendChild(section);
  }

  if (state.overview.keyPoints?.length) {
    const section = document.createElement("div");
    section.className = "summary-card";
    section.innerHTML = `<p class="card-label">关键要点</p>`;
    const list = document.createElement("ul");
    list.className = "keypoints";
    for (const pt of state.overview.keyPoints) {
      const li = document.createElement("li");
      li.textContent = pt;
      list.appendChild(li);
    }
    section.appendChild(list);
    fragment.appendChild(section);
  }

  if (state.overview.keyQuotes?.length) {
    const section = document.createElement("div");
    section.innerHTML = `<p class="card-label">金句摘录</p>`;
    for (const quote of state.overview.keyQuotes) {
      const card = document.createElement("div");
      card.className = "quote-item";
      card.innerHTML = `
        <p class="quote-text">${escapeHtml(quote.text)}</p>
        <div class="quote-meta">
          <button class="quote-time timestamp-pill" data-seconds="${quote.time}" type="button">${secondsToTimestamp(quote.time)}</button>
          <div class="quote-actions">
            <button class="ghost-btn quote-copy-btn" type="button">复制</button>
            <button class="ghost-btn quote-save-btn" type="button">存为笔记</button>
          </div>
        </div>
      `;
      card.querySelector(".quote-copy-btn").addEventListener("click", async () => {
        await navigator.clipboard.writeText(quote.text);
        showToast("已复制金句");
      });
      card.querySelector(".quote-save-btn").addEventListener("click", async () => {
        await send("saveNote", {
          videoId: state.video.bvid,
          page: Number(state.video?.page || 1),
          timestamp: Number(quote.time) || 0,
          videoTitle: state.video.title,
          author: state.video.author,
          text: quote.text,
        });
        showToast("金句已存为笔记");
        if (state.currentTab === "notes") refreshNotes();
      });
      section.appendChild(card);
    }
    fragment.appendChild(section);
  }

  overviewContentEl.appendChild(fragment);
}

function updateActiveChapter() {
  if (!state.overview?.chapters?.length) return;
  const newIdx = findActiveChapterIndex(state.overview.chapters, state.currentTime);
  if (newIdx === state.activeChapterIndex) return;

  const prev = overviewContentEl.querySelector(`.chapter-card[data-index="${state.activeChapterIndex}"]`);
  if (prev) prev.classList.remove("active");

  state.activeChapterIndex = newIdx;
  if (newIdx >= 0) {
    const next = overviewContentEl.querySelector(`.chapter-card[data-index="${newIdx}"]`);
    if (next) next.classList.add("active");
  }
}

// ============================================================
// AI 对话 (Chat)
// ============================================================

function chatKey(videoId, cid) {
  return `chat:${videoId}:${cid}`;
}

async function loadChat() {
  if (!state.video?.bvid) {
    state.chatMessages = [];
    renderChat();
    state.chatLoaded = true;
    return;
  }
  const token = ++state.chatReqToken;
  const expected = {
    viewToken: state.viewToken,
    bvid: state.video.bvid,
    cid: Number(state.video.cid) || 0,
    page: Number(state.video.page) || 1,
    token,
  };
  const key = chatKey(state.video.bvid, state.video.cid || 0);
  try {
    const res = await chrome.storage.local.get(key);
    if (!isCurrentTarget(expected, "chatReqToken")) return;
    state.chatMessages = Array.isArray(res[key]) ? res[key] : [];
  } catch {
    if (!isCurrentTarget(expected, "chatReqToken")) return;
    state.chatMessages = [];
  }
  renderChat();
  state.chatLoaded = true;
}

function saveChat() {
  if (!state.video?.bvid) return;
  chrome.storage.local
    .set({ [chatKey(state.video.bvid, state.video.cid || 0)]: state.chatMessages })
    .catch(() => {});
}

function renderChat() {
  chatMessagesEl.replaceChildren();
  const hasMessages = state.chatMessages.length > 0;
  chatQuickPrompts.classList.toggle("hidden", hasMessages);

  if (!hasMessages) {
    renderEmpty(
      chatMessagesEl,
      EMPTY_GLYPHS.chat,
      ["就当前视频的字幕向 AI 提问", "回答基于字幕事实，杜绝虚构"],
      { glyphHtml: true },
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  state.chatMessages.forEach((msg, idx) => {
    const isUser = msg.role === "user";
    const wrapper = document.createElement("div");
    wrapper.className = `chat-msg ${isUser ? "user" : "ai"}`;

    const contentHtml = isUser ? escapeHtml(msg.content) : renderMarkdown(msg.content);

    wrapper.innerHTML = `
      <div class="chat-msg-head">
        <span>${isUser ? "你" : "AI 助手"}</span>
        <span class="chat-msg-actions">
          <button class="chat-msg-action" data-action="copy" type="button">复制</button>
          <button class="chat-msg-action" data-action="delete" type="button">删除</button>
        </span>
      </div>
      <div class="chat-msg-text">${contentHtml}</div>
    `;

    wrapper.querySelector('[data-action="copy"]').addEventListener("click", async () => {
      await navigator.clipboard.writeText(msg.content);
      showToast("已复制消息内容");
    });

    wrapper.querySelector('[data-action="delete"]').addEventListener("click", () => {
      state.chatMessages.splice(idx, 1);
      if (isUser && state.chatMessages[idx]?.role === "assistant") {
        state.chatMessages.splice(idx, 1);
      }
      saveChat();
      renderChat();
    });

    fragment.appendChild(wrapper);
  });

  chatMessagesEl.appendChild(fragment);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text || state.chatSending) return;
  if (!state.video?.bvid || !state.segments.length) {
    showToast("请先加载视频字幕后再进行对话", "error");
    return;
  }

  const token = ++state.chatReqToken;
  const expected = {
    viewToken: state.viewToken,
    bvid: state.video.bvid,
    cid: Number(state.video.cid) || 0,
    page: Number(state.video.page) || 1,
    token,
  };

  state.chatSending = true;
  sendChatBtn.disabled = true;
  state.chatMessages.push({ role: "user", content: text, ts: Date.now() });
  state.chatMessages.push({ role: "assistant", content: "", ts: Date.now() });
  chatInput.value = "";
  resizeChatInput();
  renderChat();

  try {
    if (!state.settingsLoaded) await loadSettings();
    const config = normalizeProviderConfig(state.settings);
    if (!config.apiKey || !config.baseUrl || !config.model) {
      throw new Error("请先在设置中配置好 AI 接口");
    }

    const transcriptText = state.segments
      .slice(0, 500)
      .map((s) => `[${secondsToTimestamp(s.from)}] ${s.content}`)
      .join("\n");

    const promptUrl = chrome.runtime.getURL("prompts/chat.md");
    const res = await fetch(promptUrl);
    const tpl = await res.text();
    const systemPrompt = tpl.replace("{{transcript}}", transcriptText);

    const history = state.chatMessages
      .filter((m) => m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    let fullReply = "";
    await requestAiCompletionStream(
      config,
      [{ role: "system", content: systemPrompt }, ...history],
      {
        onDelta: (delta) => {
          if (!isCurrentTarget(expected, "chatReqToken")) return;
          fullReply += delta;
          const last = state.chatMessages[state.chatMessages.length - 1];
          if (last) last.content = fullReply;
          const textEl = chatMessagesEl.querySelector(".chat-msg:last-child .chat-msg-text");
          if (textEl) textEl.innerHTML = renderMarkdown(fullReply);
          chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        },
      },
    );
  } catch (err) {
    if (isCurrentTarget(expected, "chatReqToken")) {
      const last = state.chatMessages[state.chatMessages.length - 1];
      if (last) last.content = `回答中断：${err.message}`;
      renderChat();
    }
  } finally {
    if (isCurrentTarget(expected, "chatReqToken")) {
      state.chatSending = false;
      sendChatBtn.disabled = false;
      saveChat();
    }
  }
}

async function regenerateChat() {
  if (state.chatSending || !state.chatMessages.length) return;
  const lastUserIdx = state.chatMessages.findLastIndex((m) => m.role === "user");
  if (lastUserIdx === -1) return;
  const lastText = state.chatMessages[lastUserIdx].content;
  state.chatMessages.splice(lastUserIdx);
  chatInput.value = lastText;
  await sendChat();
}

function resizeChatInput() {
  chatInput.style.height = "auto";
  chatInput.style.height = `${Math.min(160, Math.max(48, chatInput.scrollHeight))}px`;
}

// ============================================================
// 笔记 (Notes)
// ============================================================

async function refreshNotes() {
  const token = ++state.notesReqToken;
  const expected = {
    viewToken: state.viewToken,
    bvid: state.video?.bvid,
    page: Number(state.video?.page || 1),
    token,
  };
  try {
    if (state.notesScope === "all") {
      const result = await send("getAllNotes");
      if (!isCurrentTarget(expected, "notesReqToken")) return;
      state.notes = result.notes || [];
    } else {
      if (!state.video?.bvid) {
        renderEmpty(notesListEl, EMPTY_GLYPHS.notes, ["先打开一个 B站视频"], { glyphHtml: true });
        return;
      }
      const result = await send("getNotes", { videoId: state.video.bvid });
      if (!isCurrentTarget(expected, "notesReqToken")) return;
      const allNotes = result.notes || [];
      if (state.notesScope === "current") {
        state.notes = allNotes.filter((n) => Number(n.page || 1) === Number(state.video?.page || 1));
      } else {
        state.notes = allNotes;
      }
    }
    renderNotes();
  } catch (err) {
    if (isCurrentTarget(expected, "notesReqToken")) notesStatusEl.textContent = err.message;
  }
}

function renderNotes() {
  notesListEl.replaceChildren();
  let list = [...state.notes];

  const q = state.notesSearchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((n) =>
      (n.text || "").toLowerCase().includes(q) ||
      (n.videoTitle || "").toLowerCase().includes(q) ||
      (n.author || "").toLowerCase().includes(q),
    );
  }

  if (state.notesSort === "timestamp") {
    list.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
  } else if (state.notesSort === "newest") {
    list.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  } else if (state.notesSort === "oldest") {
    list.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  }

  if (!list.length) {
    renderEmpty(notesListEl, EMPTY_GLYPHS.notes, ["还没有匹配的笔记"], { glyphHtml: true });
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const note of list) {
    const card = document.createElement("div");
    card.className = "note-card";
    card.dataset.noteId = note.id;

    if (state.editingNoteId === note.id) {
      card.innerHTML = `
        <div class="note-edit-box">
          <textarea rows="3" aria-label="编辑笔记">${escapeHtml(note.text)}</textarea>
          <div class="note-edit-actions">
            <button class="ghost-btn note-edit-cancel" type="button">取消 (Esc)</button>
            <button class="primary-btn note-edit-save" type="button">保存 (Ctrl+Enter)</button>
          </div>
        </div>
      `;
      const textarea = card.querySelector("textarea");
      card.querySelector(".note-edit-cancel").addEventListener("click", () => {
        state.editingNoteId = null;
        renderNotes();
      });
      card.querySelector(".note-edit-save").addEventListener("click", () => {
        saveNoteEdit(note, textarea.value);
      });
      textarea.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          saveNoteEdit(note, textarea.value);
        } else if (e.key === "Escape") {
          state.editingNoteId = null;
          renderNotes();
        }
      });
      fragment.appendChild(card);
      continue;
    }

    const isConfirming = state.deleteConfirmNoteId === note.id;
    const isMark = note.type === "mark" || note.isMark || (note.text && note.text.startsWith("【标记】"));
    const noteBadgeHtml = `<span class="note-type-badge ${isMark ? "mark" : "custom"}">${isMark ? "标记" : "笔记"}</span>`;
    card.innerHTML = `
      <div class="note-head">
        <div class="note-head-left">
          <button class="note-time timestamp-pill" data-seconds="${note.timestamp}" type="button">${secondsToTimestamp(note.timestamp)}</button>
          ${noteBadgeHtml}
        </div>
        ${state.notesScope !== "current" ? `<span class="note-video-title" style="font-size:11px; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${escapeHtml(note.videoTitle || "")}${Number(note.page) > 1 ? ` (P${note.page})` : ""}</span>` : ""}
        <button class="note-delete${isConfirming ? " confirming" : ""}" type="button" aria-label="删除笔记">${isConfirming ? "确定删除？" : "✕"}</button>
      </div>
      <p class="note-text">${escapeHtml(note.text)}</p>
      <div class="note-actions">
        <button class="note-btn-edit" type="button">编辑</button>
        <button class="note-btn-copy" type="button">复制</button>
        <button class="note-btn-link" type="button">复制链接</button>
        <button class="note-btn-play" type="button">跳转播放</button>
      </div>
    `;

    card.querySelector(".note-time").addEventListener("click", () => playNote(note));
    card.querySelector(".note-btn-play").addEventListener("click", () => playNote(note));

    card.querySelector(".note-btn-edit").addEventListener("click", () => {
      state.editingNoteId = note.id;
      renderNotes();
    });

    card.querySelector(".note-btn-copy").addEventListener("click", async () => {
      await navigator.clipboard.writeText(note.text);
      showToast("已复制笔记文本");
    });

    card.querySelector(".note-btn-link").addEventListener("click", async () => {
      const url = buildBiliVideoUrl(note.videoId, note.page, note.timestamp);
      await navigator.clipboard.writeText(url);
      showToast("已复制时间戳链接");
    });

    const delBtn = card.querySelector(".note-delete");
    delBtn.addEventListener("click", async () => {
      if (state.deleteConfirmNoteId === note.id) {
        if (state.deleteConfirmTimer) clearTimeout(state.deleteConfirmTimer);
        state.deleteConfirmNoteId = null;
        await send("deleteNote", { videoId: note.videoId, noteId: note.id });
        showToast("已删除笔记");
        await refreshNotes();
      } else {
        state.deleteConfirmNoteId = note.id;
        delBtn.classList.add("confirming");
        delBtn.textContent = "确定删除？";
        if (state.deleteConfirmTimer) clearTimeout(state.deleteConfirmTimer);
        state.deleteConfirmTimer = setTimeout(() => {
          state.deleteConfirmNoteId = null;
          delBtn.classList.remove("confirming");
          delBtn.textContent = "✕";
        }, 3000);
      }
    });

    fragment.appendChild(card);
  }
  notesListEl.appendChild(fragment);
}

async function playNote(note) {
  const currentBvid = state.video?.bvid;
  const currentPage = Number(state.video?.page || 1);
  const notePage = Number(note.page || 1);

  if (note.videoId === currentBvid && notePage === currentPage) {
    await seekTo(note.timestamp);
  } else {
    const url = note.url || buildBiliVideoUrl(note.videoId, note.page, note.timestamp);
    try {
      const newTab = await chrome.tabs.create({ url });
      if (newTab?.id) {
        state.hostTabId = newTab.id;
        state.hostWindowId = newTab.windowId;
      }
    } catch {
      window.open(url, "_blank");
    }
  }
}

async function saveNoteEdit(note, newText) {
  const trimmed = newText.trim();
  if (!trimmed) {
    showToast("笔记内容不能为空", "error");
    return;
  }
  try {
    await send("updateNote", {
      videoId: note.videoId,
      noteId: note.id,
      text: trimmed,
    });
    state.editingNoteId = null;
    showToast("笔记已更新");
    await refreshNotes();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function saveCurrentNote() {
  const text = noteTextEl.value.trim();
  if (!text || !state.video?.bvid) {
    showToast("请先输入笔记内容", "error");
    return;
  }
  try {
    await send("saveNote", {
      videoId: state.video.bvid,
      timestamp: state.noteSeconds,
      videoTitle: state.video.title,
      author: state.video.author,
      page: state.video.page || 1,
      text,
    });
    noteTextEl.value = "";
    if (noteCharCountEl) noteCharCountEl.textContent = "0 字";
    showToast("笔记已保存");
    await refreshNotes();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function polishCurrentNote() {
  const draft = noteTextEl.value.trim();
  if (!draft) {
    showToast("请先在笔记框中输入草稿", "error");
    return;
  }
  const token = ++state.polishReqToken;
  const expected = {
    viewToken: state.viewToken,
    bvid: state.video?.bvid,
    page: Number(state.video?.page || 1),
    token,
  };
  polishNoteBtn.disabled = true;
  polishNoteBtn.textContent = "润色中…";
  try {
    const res = await send("polishText", { draft, text: draft });
    if (!isCurrentTarget(expected, "polishReqToken")) return;
    noteTextEl.value = res.text;
    if (noteCharCountEl) noteCharCountEl.textContent = `${res.text.length} 字`;
    showToast("笔记已由 AI 润色");
  } catch (err) {
    if (isCurrentTarget(expected, "polishReqToken")) {
      showToast(err.message, "error");
    }
  } finally {
    if (isCurrentTarget(expected, "polishReqToken")) {
      polishNoteBtn.disabled = false;
      polishNoteBtn.textContent = "AI 润色";
    }
  }
}

// ============================================================
// 设置 (Settings)
// ============================================================

async function loadSettings() {
  try {
    const result = await send("getSettings");
    state.settings = result.settings;
    apiKeyInput.value = state.settings.aiApiKey || "";
    asrGroqApiKeyInput.value = state.settings.asrGroqApiKey || "";
    asrModelSelect.value = state.settings.asrModel || "whisper-large-v3";
    asrLanguageSelect.value = state.settings.asrLanguage || "auto";
    baseUrlInput.value = state.settings.aiBaseUrl || "";
    const savedModel = String(state.settings.aiModel || "").trim();
    if (savedModel) {
      setModelSelectOptions([savedModel], savedModel);
    } else {
      setModelSelectOptions([], "__custom__");
    }
    modelInput.value = "";
    thinkingLevelSelect.value = state.settings.thinkingLevel || "off";
    targetLanguageSelect.value = state.settings.targetLanguage || "English";
    customLanguageInput.value = state.settings.customLanguage || "";
    showMarkButtonCheckbox.checked = state.settings.showMarkButton !== false;
    showBrandTextCheckbox.checked = normalizeShowBrandText(state.settings.showBrandText, true);
    transcriptAutoFollowCheckbox.checked = state.settings.transcriptAutoFollow !== false;
    updateCustomVisibility();
    setTypographyControls(state.settings);
    updateSettingsBadges();
    state.settingsLoaded = true;
  } catch (error) {
    showToast(error.message, "error");
  }
}

function updateSettingsBadges() {
  if (apiKeyInput.value.trim()) {
    aiConfigBadge.textContent = "已就绪";
    aiConfigBadge.className = "accordion-badge ok";
  } else {
    aiConfigBadge.textContent = "未配置";
    aiConfigBadge.className = "accordion-badge";
  }

  if (asrGroqApiKeyInput.value.trim()) {
    const modelLabel = asrModelSelect.value.includes("turbo") ? "Turbo" : "Large V3";
    groqConfigBadge.textContent = modelLabel;
    groqConfigBadge.className = "accordion-badge ok";
  } else {
    groqConfigBadge.textContent = "未配置";
    groqConfigBadge.className = "accordion-badge";
  }

  typographyConfigBadge.textContent = `${readingFontSizeRange.value}px`;
  translationConfigBadge.textContent = targetLanguageSelect.value;
}

function setModelSelectOptions(names, selected) {
  modelSelect.replaceChildren();
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    modelSelect.appendChild(opt);
  }
  const custom = document.createElement("option");
  custom.value = "__custom__";
  custom.textContent = "自定义…";
  modelSelect.appendChild(custom);
  modelSelect.value = selected || "__custom__";
  modelInput.classList.toggle("hidden", modelSelect.value !== "__custom__");
}

function typographyFromControls() {
  const input = {
    readingFontPreset: readingFontPresetSelect.value,
    interfaceFontPreset: interfaceFontPresetSelect.value,
    codeFontPreset: codeFontPresetSelect.value,
    brandFontSize: brandFontSizeRange.value,
    titleFontSize: titleFontSizeRange.value,
    navigationFontSize: navigationFontSizeRange.value,
    controlFontSize: controlFontSizeRange.value,
    overviewButtonFontSize: overviewButtonFontSizeRange.value,
    videoActionButtonSize: videoActionButtonSizeRange.value,
    metaFontSize: metaFontSizeRange.value,
    codeFontSize: codeFontSizeRange.value,
    readingFontSize: readingFontSizeRange.value,
    readingLineHeight: readingLineHeightRange.value,
    readingLetterSpacing: readingLetterSpacingRange.value,
  };
  for (const [region, select, range] of regionTypographyControls) {
    input[`${region}FontPreset`] = select.value;
    input[`${region}FontSize`] = range.value;
  }
  return normalizeTypographySettings(input);
}

function setTypographyControls(input) {
  const settings = normalizeTypographySettings(input);
  populateFontOptions();
  readingFontPresetSelect.value = settings.readingFontPreset;
  interfaceFontPresetSelect.value = settings.interfaceFontPreset;
  codeFontPresetSelect.value = settings.codeFontPreset;

  for (const [region, select, range, output] of regionTypographyControls) {
    select.value = settings[`${region}FontPreset`];
    range.value = String(settings[`${region}FontSize`]);
    output.value = `${settings[`${region}FontSize`]} px`;
  }

  for (const [range, output, key] of [
    [brandFontSizeRange, brandFontSizeOutput, "brandFontSize"],
    [titleFontSizeRange, titleFontSizeOutput, "titleFontSize"],
    [navigationFontSizeRange, navigationFontSizeOutput, "navigationFontSize"],
    [controlFontSizeRange, controlFontSizeOutput, "controlFontSize"],
    [overviewButtonFontSizeRange, overviewButtonFontSizeOutput, "overviewButtonFontSize"],
    [videoActionButtonSizeRange, videoActionButtonSizeOutput, "videoActionButtonSize"],
    [metaFontSizeRange, metaFontSizeOutput, "metaFontSize"],
    [codeFontSizeRange, codeFontSizeOutput, "codeFontSize"],
  ]) {
    range.value = String(settings[key]);
    output.value = `${settings[key]} px`;
  }

  readingFontSizeRange.value = String(settings.readingFontSize);
  readingFontSizeOutput.value = `${settings.readingFontSize} px`;
  readingLineHeightRange.value = settings.readingLineHeight.toFixed(1);
  readingLineHeightOutput.value = settings.readingLineHeight.toFixed(1);
  readingLetterSpacingRange.value = settings.readingLetterSpacing.toFixed(2);
  readingLetterSpacingOutput.value = `${settings.readingLetterSpacing.toFixed(2)} em`;

  applyTypographySettings(document.documentElement, settings);
  return settings;
}

function populateFontOptions() {
  const allOptions = getFontOptions(localFontEntries);
  const filtered = filterFontOptions(allOptions, fontSearchInput?.value || "");
  for (const select of fontSelects) {
    if (!select) continue;
    const cur = select.value;
    select.replaceChildren();
    for (const opt of filtered) {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      select.appendChild(el);
    }
    if (cur) select.value = cur;
  }
}

async function saveSettings() {
  const modelVal = modelSelect.value === "__custom__" ? modelInput.value.trim() : modelSelect.value;
  const settings = {
    aiApiKey: apiKeyInput.value.trim(),
    asrGroqApiKey: asrGroqApiKeyInput.value.trim(),
    asrModel: asrModelSelect.value,
    asrLanguage: asrLanguageSelect.value,
    aiBaseUrl: baseUrlInput.value.trim(),
    aiModel: modelVal,
    thinkingLevel: thinkingLevelSelect.value,
    targetLanguage: targetLanguageSelect.value,
    customLanguage: customLanguageInput.value.trim(),
    showMarkButton: showMarkButtonCheckbox.checked,
    showBrandText: showBrandTextCheckbox.checked,
    transcriptAutoFollow: transcriptAutoFollowCheckbox.checked,
    ...typographyFromControls(),
  };
  try {
    const res = await send("setSettings", { settings });
    state.settings = res.settings;
    updateSettingsBadges();
    showToast("设置已保存");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ============================================================
// 标签页切换与键盘无障碍
// ============================================================

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll(".tabs .tab").forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
    btn.setAttribute("tabindex", isActive ? "0" : "-1");
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tab}`);
  });

  if (tab === "transcript") {
    scrollToActiveSegment();
  } else if (tab === "overview" && !state.overview) {
    loadCachedOverview();
  } else if (tab === "notes") {
    refreshNotes();
  } else if (tab === "chat" && !state.chatLoaded) {
    loadChat();
  } else if (tab === "settings" && !state.settingsLoaded) {
    loadSettings();
  }
}

function updateTranslateButton() {
  const has = state.segments.length > 0;
  const complete = has && state.translations.length === state.segments.length;
  translateBtn.disabled = !has || complete || state.translating;
  translateBtn.textContent = state.translating ? "翻译中…" : complete ? "已翻译" : "翻译";
}

async function openExplain(index) {
  const seg = state.segments[index];
  if (!seg) return;
  const token = ++state.explainReqToken;
  const expected = {
    viewToken: state.viewToken,
    bvid: state.video?.bvid,
    cid: Number(state.video?.cid) || 0,
    page: Number(state.video?.page) || 1,
    token,
  };

  state.lastFocusedElBeforeExplain = document.activeElement;
  explainOriginalEl.textContent = seg.content;
  explainResultEl.textContent = "AI 正在深入分析该句背景与含义…";
  explainSheetEl.classList.remove("hidden");
  closeExplainBtn.focus();

  try {
    const res = await send("explainSelection", {
      text: seg.content,
      context: state.segments.slice(Math.max(0, index - 2), index + 3).map((s) => s.content).join("\n"),
    });
    if (!isCurrentTarget(expected, "explainReqToken")) return;
    explainResultEl.innerHTML = renderMarkdown(res.text);
  } catch (err) {
    if (isCurrentTarget(expected, "explainReqToken")) {
      explainResultEl.textContent = `解释失败：${err.message}`;
    }
  }
}

function closeExplainSheet() {
  explainSheetEl.classList.add("hidden");
  if (state.lastFocusedElBeforeExplain && typeof state.lastFocusedElBeforeExplain.focus === "function") {
    try {
      state.lastFocusedElBeforeExplain.focus();
    } catch {}
  }
}

function updateCustomVisibility() {
  customLanguageInput.classList.toggle("hidden", targetLanguageSelect.value !== "custom");
}

// ============================================================
// 事件绑定
// ============================================================

// 1. 顶层 Tab 切换与方向键导航
const tabButtons = Array.from(document.querySelectorAll(".tabs .tab"));
tabButtons.forEach((btn, idx) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      const next = tabButtons[(idx + 1) % tabButtons.length];
      next.focus();
      switchTab(next.dataset.tab);
    } else if (e.key === "ArrowLeft") {
      const prev = tabButtons[(idx - 1 + tabButtons.length) % tabButtons.length];
      prev.focus();
      switchTab(prev.dataset.tab);
    }
  });
});

themeToggleBtn.addEventListener("click", toggleTheme);

// 2. 字幕工具栏与模式切换
const modeButtons = Array.from(document.querySelectorAll(".mode-switch [data-mode]"));
modeButtons.forEach((btn, idx) => {
  btn.addEventListener("click", () => {
    state.mode = btn.dataset.mode;
    modeButtons.forEach((b) => {
      const active = b === btn;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
      b.setAttribute("tabindex", active ? "0" : "-1");
    });
    hideOriginalBtn.classList.toggle("hidden", state.mode !== "bilingual");
    renderSegments();
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      const next = modeButtons[(idx + 1) % modeButtons.length];
      next.focus();
      next.click();
    } else if (e.key === "ArrowLeft") {
      const prev = modeButtons[(idx - 1 + modeButtons.length) % modeButtons.length];
      prev.focus();
      prev.click();
    }
  });
});

hideOriginalBtn.addEventListener("click", () => {
  state.hideOriginal = !state.hideOriginal;
  hideOriginalBtn.textContent = state.hideOriginal ? "显示原文" : "隐藏原文";
  renderSegments();
});

trackSelect.addEventListener("change", () => {
  if (trackSelect.value && trackSelect.value !== state.track?.lan) {
    ++state.translationReqToken;
    state.translating = false;
    translationTrackEl.classList.add("hidden");
    state.translations = [];
    loadTranscript({ lan: trackSelect.value });
  }
});

partSelect.addEventListener("change", () => {
  sendToTab("switchPart", { page: Number(partSelect.value) || 1 });
});

searchToggleBtn.addEventListener("click", () => toggleSearch());
searchCloseBtn.addEventListener("click", () => toggleSearch(false));
transcriptSearchInput.addEventListener("input", () => executeSearch(transcriptSearchInput.value));
transcriptSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    navigateSearch(e.shiftKey ? -1 : 1);
  } else if (e.key === "Escape") {
    toggleSearch(false);
  }
});
searchPrevBtn.addEventListener("click", () => navigateSearch(-1));
searchNextBtn.addEventListener("click", () => navigateSearch(1));

autoFollowBtn.addEventListener("click", () => {
  state.settings.transcriptAutoFollow = !state.settings.transcriptAutoFollow;
  autoFollowBtn.classList.toggle("active", state.settings.transcriptAutoFollow);
  transcriptAutoFollowCheckbox.checked = state.settings.transcriptAutoFollow;
  showToast(state.settings.transcriptAutoFollow ? "已开启自动跟随播放" : "已关闭自动跟随");
});

// 3. 用户真实交互监听（防程序自身滚动误判）
function markUserInteraction() {
  state.userInteracting = true;
  if (state.userInteractTimer) clearTimeout(state.userInteractTimer);
  state.userInteractTimer = setTimeout(() => {
    state.userInteracting = false;
  }, 1000);
}

segmentsEl.addEventListener("wheel", markUserInteraction, { passive: true });
segmentsEl.addEventListener("touchmove", markUserInteraction, { passive: true });
segmentsEl.addEventListener("pointerdown", markUserInteraction, { passive: true });
segmentsEl.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) {
    markUserInteraction();
  }
});

segmentsEl.addEventListener("scroll", () => {
  if (state.isProgrammaticScroll) return;
  if (state.userInteracting && !state.autoFollowPausedByUser && state.settings.transcriptAutoFollow) {
    state.autoFollowPausedByUser = true;
    resumeFollowPill.classList.remove("hidden");
  }
});

resumeFollowPill.addEventListener("click", () => {
  state.autoFollowPausedByUser = false;
  resumeFollowPill.classList.add("hidden");
  scrollToActiveSegment();
});

translateBtn.addEventListener("click", async () => {
  if (state.translating || !state.segments.length) return;
  const token = ++state.translationReqToken;
  const expected = {
    viewToken: state.viewToken,
    bvid: state.video.bvid,
    cid: Number(state.video.cid) || 0,
    page: Number(state.video.page) || 1,
    token,
  };
  state.translating = true;
  updateTranslateButton();
  translationTrackEl.classList.remove("hidden");
  setProgress(0);
  try {
    const res = await send("translate", {
      bvid: state.video.bvid,
      cid: state.video.cid,
      page: state.video.page || 1,
      token,
      viewToken: state.viewToken,
      lan: state.track?.lan || "",
      segments: state.segments,
      targetLanguage: effectiveTargetLanguage(),
    });
    if (isCurrentTarget(expected, "translationReqToken")) {
      state.translations = res.texts || [];
      renderSegments();
    }
  } catch (err) {
    if (isCurrentTarget(expected, "translationReqToken")) showToast(err.message, "error");
  } finally {
    if (isCurrentTarget(expected, "translationReqToken")) {
      state.translating = false;
      translationTrackEl.classList.add("hidden");
      updateTranslateButton();
    }
  }
});

copyTranscriptBtn.addEventListener("click", async () => {
  if (!state.segments.length) return;
  const text = state.segments.map((s, i) => {
    const t = secondsToTimestamp(s.from);
    const tr = state.mode === "bilingual" && state.translations[i] ? `\n   ${state.translations[i]}` : "";
    return `[${t}] ${s.content}${tr}`;
  }).join("\n");
  await navigator.clipboard.writeText(text);
  showToast("已复制全部字幕");
});

exportBtn.addEventListener("click", () => exportMarkdownFile(false));
exportWithOverviewBtn.addEventListener("click", () => exportMarkdownFile(true));
refreshBtn.addEventListener("click", () => loadTranscript());

async function exportMarkdownFile(includeOverview) {
  if (!state.video?.bvid) return;
  let notesToExport = state.notes;
  try {
    const res = await send("getNotes", { videoId: state.video.bvid });
    if (res?.notes) {
      notesToExport = res.notes.filter((n) => Number(n.page || 1) === Number(state.video.page || 1));
      state.notes = notesToExport;
    }
  } catch {}
  const md = buildMarkdown({
    video: state.video,
    overview: includeOverview ? state.overview : null,
    includeOverview,
    segments: state.segments,
    translations: state.translations,
    notes: notesToExport,
  });
  downloadFile(md, `${state.video.title || state.video.bvid}.md`, "text/markdown");
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 4. 概览
generateOverviewBtn.addEventListener("click", () => loadOverview({ force: false }));
regenerateOverviewBtn.addEventListener("click", () => loadOverview({ force: true }));
exportOverviewBtn.addEventListener("click", () => {
  if (!state.overview) return;
  const md = buildOverviewMarkdown({ video: state.video, overview: state.overview });
  downloadFile(md, `${state.video.title || state.video.bvid}-概览.md`, "text/markdown");
});

// 5. 对话
sendChatBtn.addEventListener("click", sendChat);
regenerateChatBtn.addEventListener("click", regenerateChat);
chatInput.addEventListener("input", resizeChatInput);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendChat();
  }
});

chatQuickPrompts.querySelectorAll(".prompt-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    chatInput.value = chip.dataset.prompt;
    chatInput.focus();
    resizeChatInput();
  });
});

clearChatBtn.addEventListener("click", async () => {
  if (!window.confirm("确定清空当前对话记录吗？")) return;
  state.chatMessages = [];
  await chrome.storage.local.remove(chatKey(state.video.bvid, state.video.cid));
  renderChat();
});

exportChatBtn.addEventListener("click", () => {
  if (!state.chatMessages.length) return;
  const md = buildChatMarkdown({ video: state.video, messages: state.chatMessages });
  downloadFile(md, `${state.video.title || state.video.bvid}-对话.md`, "text/markdown");
});

// 对话消息区事件委托（代码复制与时间戳跳播）
chatMessagesEl.addEventListener("click", async (e) => {
  const copyBtn = e.target.closest(".code-copy-btn");
  if (copyBtn) {
    const codeText = copyBtn.closest(".code-block")?.querySelector("pre code")?.textContent || "";
    await navigator.clipboard.writeText(codeText);
    copyBtn.textContent = "已复制";
    setTimeout(() => (copyBtn.textContent = "复制"), 1500);
    return;
  }

  const pill = e.target.closest(".timestamp-pill");
  if (pill) {
    const sec = Number(pill.dataset.seconds);
    if (Number.isFinite(sec)) seekTo(sec);
  }
});

// 概览区事件委托（代码与时间戳）
overviewContentEl.addEventListener("click", (e) => {
  const pill = e.target.closest(".timestamp-pill");
  if (pill) {
    const sec = Number(pill.dataset.seconds);
    if (Number.isFinite(sec)) seekTo(sec);
  }
});

// 6. 笔记
saveNoteBtn.addEventListener("click", saveCurrentNote);
polishNoteBtn.addEventListener("click", polishCurrentNote);
noteTextEl.addEventListener("input", () => {
  if (noteCharCountEl) {
    noteCharCountEl.textContent = `${noteTextEl.value.length} 字`;
  }
});
noteTextEl.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    saveCurrentNote();
  }
});

const scopeButtons = Array.from(document.querySelectorAll(".notes-scope [data-scope]"));
scopeButtons.forEach((btn, idx) => {
  btn.addEventListener("click", () => {
    state.notesScope = btn.dataset.scope;
    scopeButtons.forEach((b) => {
      const active = b === btn;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
      b.setAttribute("tabindex", active ? "0" : "-1");
    });
    refreshNotes();
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      const next = scopeButtons[(idx + 1) % scopeButtons.length];
      next.focus();
      next.click();
    } else if (e.key === "ArrowLeft") {
      const prev = scopeButtons[(idx - 1 + scopeButtons.length) % scopeButtons.length];
      prev.focus();
      prev.click();
    }
  });
});

notesSortSelect.addEventListener("change", () => {
  state.notesSort = notesSortSelect.value;
  renderNotes();
});

notesSearchInput.addEventListener("input", () => {
  state.notesSearchQuery = notesSearchInput.value;
  renderNotes();
});

exportNotesBtn.addEventListener("click", () => {
  if (!state.notes.length) return;
  const md = buildNotesMarkdown({ video: state.video || {}, notes: state.notes, scope: state.notesScope });
  downloadFile(md, `笔记-${state.video?.title || "导出"}.md`, "text/markdown");
});

// 7. 设置
saveSettingsBtn.addEventListener("click", saveSettings);
testKeyBtn.addEventListener("click", async () => {
  keyTestResultEl.textContent = "正在测试连接…";
  keyTestResultEl.className = "hint";
  try {
    const res = await send("testApiKey", {
      apiKey: apiKeyInput.value.trim(),
      baseUrl: baseUrlInput.value.trim(),
      model: modelSelect.value === "__custom__" ? modelInput.value.trim() : modelSelect.value,
    });
    keyTestResultEl.textContent = `连接成功：${res.text}`;
    keyTestResultEl.className = "hint ok";
    updateSettingsBadges();
  } catch (err) {
    keyTestResultEl.textContent = err.message;
    keyTestResultEl.className = "hint error";
  }
});

listModelsBtn.addEventListener("click", async () => {
  modelListHint.classList.remove("hidden");
  modelListHint.textContent = "正在拉取模型…";
  try {
    const res = await send("listModels", {
      apiKey: apiKeyInput.value.trim(),
      baseUrl: baseUrlInput.value.trim(),
    });
    setModelSelectOptions(res.models, res.models[0]);
    modelListHint.textContent = `已获取 ${res.models.length} 个模型`;
    modelListHint.className = "hint ok";
  } catch (err) {
    modelListHint.textContent = err.message;
    modelListHint.className = "hint error";
  }
});

testAsrBtn.addEventListener("click", async () => {
  asrTestResultEl.textContent = "正在测试 Groq…";
  asrTestResultEl.className = "hint";
  try {
    const res = await send("testGroqAsr", { apiKey: asrGroqApiKeyInput.value.trim() });
    asrTestResultEl.textContent = res.available ? "Groq 连接成功，Whisper 可用" : "Groq 连接成功";
    asrTestResultEl.className = "hint ok";
    updateSettingsBadges();
  } catch (err) {
    asrTestResultEl.textContent = err.message;
    asrTestResultEl.className = "hint error";
  }
});

const PROVIDER_PRESETS = {
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    thinkingLevel: "off",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    thinkingLevel: "off",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    thinkingLevel: "off",
  },
  siliconflow: {
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "deepseek-ai/DeepSeek-V3",
    thinkingLevel: "off",
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5:7b",
    thinkingLevel: "off",
  },
};

document.querySelectorAll(".provider-preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.provider;
    const preset = PROVIDER_PRESETS[key];
    if (!preset) return;
    baseUrlInput.value = preset.baseUrl;
    thinkingLevelSelect.value = preset.thinkingLevel || "off";
    let matched = false;
    for (const opt of modelSelect.options) {
      if (opt.value === preset.model) {
        modelSelect.value = preset.model;
        matched = true;
        break;
      }
    }
    if (!matched) {
      modelSelect.value = "__custom__";
      modelInput.classList.remove("hidden");
      modelInput.value = preset.model;
    } else {
      modelInput.classList.add("hidden");
    }
    showToast(`已填充 ${btn.textContent.trim()} 预设配置`);
  });
});

modelSelect.addEventListener("change", () => {
  modelInput.classList.toggle("hidden", modelSelect.value !== "__custom__");
});

targetLanguageSelect.addEventListener("change", updateCustomVisibility);
toggleKeyBtn.addEventListener("click", () => {
  apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
});
toggleAsrKeyBtn.addEventListener("click", () => {
  asrGroqApiKeyInput.type = asrGroqApiKeyInput.type === "password" ? "text" : "password";
});

// 排版即时预览
for (const input of [
  readingFontPresetSelect,
  interfaceFontPresetSelect,
  codeFontPresetSelect,
  readingFontSizeRange,
  readingLineHeightRange,
  readingLetterSpacingRange,
  brandFontSizeRange,
  titleFontSizeRange,
  navigationFontSizeRange,
  controlFontSizeRange,
  overviewButtonFontSizeRange,
  videoActionButtonSizeRange,
  metaFontSizeRange,
  codeFontSizeRange,
  ...regionTypographyControls.flatMap(([, select, range]) => [select, range]),
]) {
  input.addEventListener("input", () => {
    setTypographyControls(typographyFromControls());
    updateSettingsBadges();
  });
}

fontSearchInput.addEventListener("input", () => {
  populateFontOptions();
});

readLocalFontsBtn.addEventListener("click", async () => {
  try {
    localFontsStatus.textContent = "正在读取系统字体…";
    const res = await requestLocalFontList();
    if (res.granted) {
      localFontEntries.splice(0, localFontEntries.length, ...res.fonts);
      populateFontOptions();
      localFontsStatus.textContent = `已读取 ${res.fonts.length} 个本机字体`;
      localFontsStatus.className = "hint ok";
    }
  } catch (err) {
    localFontsStatus.textContent = err.message;
    localFontsStatus.className = "hint error";
  }
});

resetTypographyBtn.addEventListener("click", () => {
  setTypographyControls(TYPOGRAPHY_DEFAULTS);
  updateSettingsBadges();
  showToast("已恢复排版默认值");
});

exportSettingsBtn.addEventListener("click", async () => {
  const json = createSettingsBackup(state.settings, {
    includeApiKey: includeApiKeyExportCheckbox.checked,
    theme: document.documentElement.dataset.theme,
  });
  downloadFile(json, "bili-digest-settings.json", "application/json");
  showToast("设置已导出");
});

importSettingsBtn.addEventListener("click", () => settingsImportFile.click());
settingsImportFile.addEventListener("change", async () => {
  const file = settingsImportFile.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) {
      throw new Error("备份文件过大（超过 1MB）");
    }
    const text = await file.text();
    const imported = parseSettingsBackup(text);
    if (imported.includesApiKey) {
      const confirmed = window.confirm("该备份文件包含 API Key，确定导入并覆盖当前密钥吗？");
      if (!confirmed) return;
    }
    const res = await send("setSettings", { settings: imported.settings });
    state.settings = res.settings;
    if (imported.theme) {
      applyTheme(imported.theme);
      chrome.storage.local.set({ theme: imported.theme }).catch(() => {});
    }
    await loadSettings();
    showToast("设置已导入");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    settingsImportFile.value = "";
  }
});

if (clearCacheBtn) {
  clearCacheBtn.addEventListener("click", async () => {
    if (!window.confirm("确定清理所有已缓存的字幕、翻译、概览与对话吗？\n（此操作将释放存储空间，不会删除您的笔记、设置或历史记录）")) {
      return;
    }
    try {
      const res = await send("clearCache", { type: "all_cache" });
      showToast(`已清理 ${res.removedCount || 0} 项缓存数据`);
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

// 8. 历史视频切换与抽屉
historyBtn.addEventListener("click", openHistoryDrawer);
closeHistoryBtn.addEventListener("click", closeHistoryDrawer);
exitHistoryBtn.addEventListener("click", exitHistoricalView);
clearHistoryBtn.addEventListener("click", async () => {
  if (window.confirm("确定清空历史记录列表吗？（此操作仅清除历史列表，不会删除已保存的笔记或字幕缓存）")) {
    await send("clearHistory");
    showToast("已清空历史记录列表");
    await loadAndRenderHistory();
  }
});
historySearchInput.addEventListener("input", () => {
  state.historySearchQuery = historySearchInput.value;
  renderHistory();
});

historyDrawer.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    const focusable = historyDrawer.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

closeExplainBtn.addEventListener("click", closeExplainSheet);

explainSheetEl.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    const focusable = explainSheetEl.querySelectorAll('button:not([disabled]), [tabindex="0"]');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

// 9. 全局键盘快捷键
document.addEventListener("keydown", (e) => {
  const activeTag = document.activeElement?.tagName?.toLowerCase();
  const isInput = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && state.currentTab === "transcript") {
    e.preventDefault();
    toggleSearch(true);
  } else if (e.key === "/" && !isInput && state.currentTab === "transcript") {
    e.preventDefault();
    toggleSearch(true);
  } else if (e.key === "Escape") {
    if (state.searchOpen) toggleSearch(false);
    if (!explainSheetEl.classList.contains("hidden")) closeExplainSheet();
    if (!historyDrawer.classList.contains("hidden")) closeHistoryDrawer();
  }
});

// 全局委托：代码块一键复制与 Markdown 时间戳胶囊点击跳播
document.addEventListener("click", async (e) => {
  const copyBtn = e.target.closest(".code-copy-btn");
  if (copyBtn) {
    const codeBlock = copyBtn.closest(".code-block");
    const code = codeBlock?.querySelector("code")?.textContent || "";
    if (code) {
      await navigator.clipboard.writeText(code);
      const prevText = copyBtn.textContent;
      copyBtn.textContent = "已复制 ✓";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = prevText;
        copyBtn.classList.remove("copied");
      }, 2000);
      showToast("代码已复制到剪贴板");
    }
    return;
  }

  const timePill = e.target.closest(".timestamp-pill");
  if (timePill && timePill.dataset.seconds !== undefined) {
    const sec = Number(timePill.dataset.seconds);
    if (!Number.isNaN(sec)) {
      seekTo(sec);
    }
  }
});

// 10. 后台广播事件监听 (noteSaved, translationProgress)
if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return;
    if (message.action === "noteSaved") {
      if (state.currentTab === "notes") {
        refreshNotes();
      }
    } else if (message.action === "translationProgress") {
      if (
        state.translating &&
        message.bvid === state.video?.bvid &&
        (!message.cid || Number(message.cid) === Number(state.video?.cid)) &&
        (message.page === undefined || Number(message.page) === Number(state.video?.page || 1)) &&
        (message.viewToken === undefined || message.viewToken === state.viewToken) &&
        (message.token === undefined || message.token === state.translationReqToken)
      ) {
        const p = Number.isFinite(message.progress)
          ? message.progress
          : message.total > 0
            ? Math.round((message.done / message.total) * 100)
            : 0;
        setProgress(p);
      }
    }
  });
}

// ============================================================
// 初始化与轮询
// ============================================================

loadTheme();
loadSettings();
detectVideo();

setInterval(detectVideo, 2000);
setInterval(() => {
  if (state.video?.bvid) {
    syncPlaybackTime();
  }
}, 500);
