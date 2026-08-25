/**
 * Bili Digest 后台 Service Worker (v0.5.3 本地增强版)。
 *
 * 核心职能：
 * 1. 视频与分 P 上下文解析；
 * 2. 官方原生字幕拉取（WBI 签名、主/备端点自动重试、域名白名单）；
 * 3. 智能 Groq Whisper ASR 音轨转写；
 * 4. 笔记安全存储与行内原子并发队列（withLock 锁机制）；
 * 5. OpenAI / DeepSeek 兼容接口中转与模型列表拉取；
 * 6. 设置与排版配置统一持久化。
 */

import {
  pickChineseTrack,
  parseSubtitleJson,
  secondsToTimestamp,
  parseTimeToSeconds,
  snapToNearestSegment,
} from "./lib/subtitle.js";
import { encWbi, getMixinKey, extractWbiKey } from "./lib/wbi.js";
import { buildNoteContext, segmentsToText } from "./lib/note-context.js";
import {
  TYPOGRAPHY_DEFAULTS,
  normalizeTypographySettings,
  normalizeShowBrandText,
} from "./lib/typography.js";
import {
  normalizeProviderConfig,
  migrateLegacySettings,
  requestAiCompletion,
  requestAiCompletionStream,
  requestModelList,
  parseLooseJson,
} from "./lib/ai.js";
import { transcribeGroqAudio, testGroqApiKey } from "./lib/asr.js";

const DEBUG = false;
const debugLog = (...args) => {
  if (DEBUG) console.log("[BiliDigest Background]", ...args);
};

const DEFAULT_SETTINGS = {
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
};

const TRANSCRIPT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ============================================================
// 输入校验与安全白名单
// ============================================================

export function isValidBvid(bvid) {
  return typeof bvid === "string" && /^BV[0-9A-Za-z]{10}$/.test(bvid);
}

export function sanitizeSeconds(val) {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(86400 * 10, num);
}

export function sanitizePage(val) {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 1) return 1;
  return Math.min(1000, Math.floor(num));
}

export function isAllowedBiliUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") {
      return false;
    }

    return (
      host === "bilibili.com" ||
      host.endsWith(".bilibili.com") ||
      host === "hdslb.com" ||
      host.endsWith(".hdslb.com") ||
      host === "bilivideo.com" ||
      host.endsWith(".bilivideo.com") ||
      host === "bilivideo.cn" ||
      host.endsWith(".bilivideo.cn")
    );
  } catch {
    return false;
  }
}

// ============================================================
// 并发原子存储锁 (Mutex Lock)
// ============================================================

const storageLocks = new Map();

async function withLock(key, fn) {
  const current = storageLocks.get(key) || Promise.resolve();
  let release;
  const p = new Promise((resolve) => (release = resolve));
  const next = current.then(async () => {
    try {
      return await fn();
    } finally {
      release();
    }
  });
  storageLocks.set(key, p);
  try {
    return await next;
  } finally {
    if (storageLocks.get(key) === p) {
      storageLocks.delete(key);
    }
  }
}

// ============================================================
// 存储适配器
// ============================================================

const store = {
  async get(key, defaultValue = null) {
    const res = await chrome.storage.local.get(key);
    return res[key] !== undefined ? res[key] : defaultValue;
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await chrome.storage.local.remove(key);
  },
  async getAll() {
    const res = await chrome.storage.local.get(null);
    return res || {};
  },
};

function transcriptKey(bvid, cid, lan) {
  return `transcript:${bvid}:${cid}:${lan}`;
}

function activeTrackKey(bvid, cid) {
  return `active_track:${bvid}:${cid}`;
}

function asrTranscriptKey(bvid, cid) {
  return `asr_transcript:${bvid}:${cid}`;
}

function notesKey(videoId) {
  return `notes:${videoId}`;
}

// ============================================================
// 设置持久化
// ============================================================

async function getSettings() {
  const raw = (await store.get("settings", {})) || {};
  return mergeSettings(DEFAULT_SETTINGS, migrateLegacySettings(raw));
}

function mergeSettings(target, source) {
  if (!source || typeof source !== "object") return { ...target };
  // setSettings accepts partial updates (for example, typography autosave and
  // imported backups). Normalize against the stored values so an omitted
  // typography field is preserved instead of silently reverting to defaults.
  const normalizedTypography = normalizeTypographySettings({ ...target, ...source });
  return {
    ...target,
    aiApiKey: typeof source.aiApiKey === "string" ? source.aiApiKey : target.aiApiKey,
    aiBaseUrl: typeof source.aiBaseUrl === "string" ? source.aiBaseUrl : target.aiBaseUrl,
    aiModel: typeof source.aiModel === "string" ? source.aiModel : target.aiModel,
    asrGroqApiKey: typeof source.asrGroqApiKey === "string" ? source.asrGroqApiKey : target.asrGroqApiKey,
    asrModel: typeof source.asrModel === "string" ? source.asrModel : target.asrModel,
    asrLanguage: typeof source.asrLanguage === "string" ? source.asrLanguage : target.asrLanguage,
    targetLanguage: typeof source.targetLanguage === "string" ? source.targetLanguage : target.targetLanguage,
    customLanguage: typeof source.customLanguage === "string" ? source.customLanguage : target.customLanguage,
    thinkingLevel: typeof source.thinkingLevel === "string" ? source.thinkingLevel : target.thinkingLevel,
    showMarkButton: typeof source.showMarkButton === "boolean" ? source.showMarkButton : target.showMarkButton,
    showBrandText: normalizeShowBrandText(source.showBrandText, target.showBrandText),
    transcriptAutoFollow: typeof source.transcriptAutoFollow === "boolean" ? source.transcriptAutoFollow : target.transcriptAutoFollow,
    ...normalizedTypography,
  };
}

async function saveSettings(settings) {
  await store.set("settings", settings);
  await store.set("contentDisplayConfig", {
    showMarkButton: settings.showMarkButton !== false,
    videoActionButtonSize: settings.videoActionButtonSize || 44,
  });
}

// ============================================================
// HTTP 工具
// ============================================================

async function fetchJson(url, { credentials = "include", skipCodeCheck = false } = {}) {
  if (!isAllowedBiliUrl(url)) {
    throw new Error("请求地址不属于 B站安全白名单");
  }
  const response = await fetch(url, {
    credentials,
    referrer: "https://www.bilibili.com/",
    referrerPolicy: "strict-origin-when-cross-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  if (!skipCodeCheck && data && typeof data.code === "number" && data.code !== 0) {
    throw new Error(data.message || `B站接口返回错误码 ${data.code}`);
  }
  return data;
}

const WBI_KEYS_TTL_MS = 12 * 60 * 60 * 1000;

async function getMixinKeyCached(force = false) {
  const cached = await store.get("wbiKeys", null);
  if (!force && cached?.mixinKey && Date.now() - (cached.fetchedAt || 0) < WBI_KEYS_TTL_MS) {
    return cached.mixinKey;
  }

  const nav = await fetchJson("https://api.bilibili.com/x/web-interface/nav", { skipCodeCheck: true });
  const imgUrl = nav?.data?.wbi_img?.img_url;
  const subUrl = nav?.data?.wbi_img?.sub_url;
  if (!imgUrl || !subUrl) {
    throw new Error("获取 WBI 密钥失败：nav 接口未返回 wbi_img");
  }
  const mixinKey = getMixinKey(extractWbiKey(imgUrl), extractWbiKey(subUrl));
  await store.set("wbiKeys", { mixinKey, fetchedAt: Date.now() });
  return mixinKey;
}

async function signedGet(path, params) {
  const attempt = async (forceRefresh) => {
    const mixinKey = await getMixinKeyCached(forceRefresh);
    const { w_rid, wts } = await encWbi(params, mixinKey);
    const qs = new URLSearchParams({ ...params, w_rid, wts });
    return fetchJson(`https://api.bilibili.com${path}?${qs.toString()}`);
  };

  try {
    return await attempt(false);
  } catch (error) {
    const message = String(error.message);
    if (
      message.includes("-403") ||
      message.includes("-412") ||
      message.includes("HTTP 403") ||
      message.includes("HTTP 412")
    ) {
      return attempt(true);
    }
    throw error;
  }
}

function normalizeSubtitleUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

// ============================================================
// 视频信息与分 P 解析
// ============================================================

async function handleGetVideoInfo(bvid, page = 1) {
  if (!isValidBvid(bvid)) throw new Error("无效的视频 BV 号");
  const view = await fetchJson(
    `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
  );
  const data = view.data;
  return {
    bvid,
    aid: data.aid,
    title: data.title,
    desc: data.desc || "",
    author: data.owner?.name || "",
    authorMid: Number(data.owner?.mid) || 0,
    duration: data.duration,
    cid: data.cid,
    pages: Array.isArray(data.pages)
      ? data.pages.map((p) => ({
          cid: p.cid,
          page: p.page,
          part: p.part,
        }))
      : [],
  };
}

async function resolvePartIdentity(bvid, cid, aid, page) {
  const normalizedPage = sanitizePage(page);
  const knownCid = Number(cid) || 0;
  const knownAid = String(aid || "");

  try {
    const info = await handleGetVideoInfo(bvid, normalizedPage);
    const pages = Array.isArray(info.pages) ? info.pages : [];
    const target = pages[normalizedPage - 1];
    return {
      cid: Number(target?.cid) || Number(info.cid) || knownCid,
      aid: String(info.aid || knownAid),
    };
  } catch {
    return { cid: knownCid, aid: knownAid };
  }
}

// ============================================================
// 字幕与 ASR
// ============================================================

async function fetchSubtitleTracks(bvid, cid, aid = "", page = 0) {
  if (!isValidBvid(bvid)) throw new Error("无效的视频 BV 号");
  if (!aid || !cid) {
    const info = await handleGetVideoInfo(bvid, page);
    aid = String(info.aid || "");
    cid = cid || info.cid;
  }

  const primaryUrl =
    "https://api.bilibili.com/x/player/wbi/v2" +
    `?aid=${encodeURIComponent(aid)}` +
    `&cid=${encodeURIComponent(String(cid))}` +
    `&bvid=${encodeURIComponent(bvid)}`;
  const fallbackUrl =
    "https://api.bilibili.com/x/player/v2" +
    `?bvid=${encodeURIComponent(bvid)}` +
    `&cid=${encodeURIComponent(String(cid))}` +
    (aid ? `&aid=${encodeURIComponent(aid)}` : "");

  let playerData;
  try {
    playerData = (await fetchJson(primaryUrl)).data;
  } catch (primaryError) {
    debugLog("主来源失败，回退 player/v2", primaryError);
    try {
      playerData = (await fetchJson(fallbackUrl)).data;
    } catch (fallbackError) {
      debugLog("player/v2 也失败，改用 WBI 签名请求", fallbackError);
      const params = { bvid, cid };
      if (aid) params.aid = aid;
      playerData = (await signedGet("/x/player/wbi/v2", params)).data;
    }
  }

  return { tracks: playerData?.subtitle?.subtitles || [] };
}

async function fetchTranscriptFromServer(bvid, cid, aid = "", preferredLan = "", page = 0) {
  const { tracks } = await fetchSubtitleTracks(bvid, cid, aid, page);
  if (tracks.length === 0) {
    return { bvid, cid, tracks: [], track: null, segments: [] };
  }

  const track = preferredLan
    ? tracks.find((item) => String(item?.lan) === String(preferredLan))
    : pickChineseTrack(tracks);
  if (!track?.subtitle_url) {
    return { bvid, cid, tracks, track: track || null, segments: [] };
  }

  const subtitleUrl = normalizeSubtitleUrl(track.subtitle_url);
  if (!isAllowedBiliUrl(subtitleUrl)) {
    throw new Error("字幕地址不属于白名单域名");
  }
  const json = await fetchJson(subtitleUrl, { skipCodeCheck: true });
  const segments = parseSubtitleJson(json);
  return { bvid, cid, tracks, track, segments };
}

async function handleFetchTranscript({ bvid, cid, aid, lan, page }) {
  if (!isValidBvid(bvid)) throw new Error("无效的视频 BV 号");
  ({ cid, aid } = await resolvePartIdentity(bvid, cid, aid, page));
  let trackLan = String(lan || "");
  if (!trackLan) {
    const { tracks } = await fetchSubtitleTracks(bvid, cid, aid, page);
    trackLan = String(pickChineseTrack(tracks)?.lan || "");
    if (!trackLan) {
      const cachedAsr = await store.get(asrTranscriptKey(bvid, cid), null);
      if (cachedAsr?.segments?.length) return { ...cachedAsr, cached: true };
      return { bvid, cid, tracks, track: null, segments: [] };
    }
  }

  const key = transcriptKey(bvid, cid, trackLan);
  const cached = await store.get(key, null);
  if (cached && Date.now() - cached.fetchedAt < TRANSCRIPT_CACHE_TTL_MS) {
    return cached;
  }
  const data = await fetchTranscriptFromServer(bvid, cid, aid, trackLan, page);
  if (data.segments?.length > 0) {
    const record = { ...data, fetchedAt: Date.now() };
    await store.set(key, record);
    return record;
  }
  return data;
}

function collectAudioUrls(item) {
  const urls = [];
  if (item?.baseUrl) urls.push(item.baseUrl);
  if (item?.base_url) urls.push(item.base_url);
  if (Array.isArray(item?.backupUrl)) urls.push(...item.backupUrl);
  if (Array.isArray(item?.backup_url)) urls.push(...item.backup_url);
  return urls.filter(Boolean);
}

async function fetchLowestBiliAudioStream(bvid, cid) {
  const params = {
    bvid,
    cid: String(cid),
    qn: "16",
    fnval: "16",
    fnver: "0",
    fourk: "0",
  };
  let data;
  try {
    data = (await signedGet("/x/player/wbi/playurl", params)).data;
  } catch (wbiError) {
    debugLog("WBI playurl 失败，回退旧 playurl", wbiError);
    const qs = new URLSearchParams(params);
    data = (await fetchJson(`https://api.bilibili.com/x/player/playurl?${qs.toString()}`)).data;
  }
  const audio = Array.isArray(data?.dash?.audio) ? data.dash.audio : [];
  if (!audio.length) throw new Error("B站播放接口没有返回可用的 DASH 音轨");

  const sorted = [...audio].sort((a, b) => {
    const aId = Number(a?.id) || 0;
    const bId = Number(b?.id) || 0;
    if (aId === 30216 && bId !== 30216) return -1;
    if (bId === 30216 && aId !== 30216) return 1;
    return (Number(a?.bandwidth) || Infinity) - (Number(b?.bandwidth) || Infinity);
  });
  const stream = sorted.find((item) => collectAudioUrls(item).length > 0);
  if (!stream) throw new Error("B站返回了音轨信息，但没有可下载的媒体地址");
  return stream;
}

async function downloadBiliAudio(stream) {
  const urls = collectAudioUrls(stream).filter(isAllowedBiliUrl);
  if (!urls.length) throw new Error("音轨地址不属于白名单域名");
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "audio/mp4,audio/*;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        referrer: "https://www.bilibili.com/",
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("音频响应为空");
      return new Blob([blob], { type: stream?.mimeType || stream?.mime_type || blob.type || "audio/mp4" });
    } catch (error) {
      lastError = error;
      debugLog("B站音轨下载地址失败，尝试备用地址", url, error);
    }
  }
  throw new Error(`浏览器下载音频失败：${lastError?.message || "未知错误"}`);
}

async function handleGenerateAsrTranscript({ bvid, cid, aid, page, title = "", force = false }) {
  if (!isValidBvid(bvid)) throw new Error("无效的视频 BV 号");
  ({ cid, aid } = await resolvePartIdentity(bvid, cid, aid, page));
  if (!cid) {
    const info = await handleGetVideoInfo(bvid, page);
    cid = Number(info.cid) || 0;
  }
  if (!cid) throw new Error("无法确定当前视频 cid");

  const cacheKey = asrTranscriptKey(bvid, cid);
  if (!force) {
    const cached = await store.get(cacheKey, null);
    if (cached?.segments?.length) return { ...cached, cached: true };
  }

  const settings = await getSettings();
  if (!settings.asrGroqApiKey) throw new Error("请先在设置中填写 Groq API Key");

  const stream = await fetchLowestBiliAudioStream(bvid, cid);
  const audioBlob = await downloadBiliAudio(stream);
  const prompt = title ? `视频标题：${String(title).slice(0, 180)}` : "";
  const result = await transcribeGroqAudio({
    apiKey: settings.asrGroqApiKey,
    blob: audioBlob,
    model: settings.asrModel,
    language: settings.asrLanguage,
    prompt,
  });

  const track = {
    id: 0,
    lan: result.language || settings.asrLanguage || "zh",
    lan_doc: "AI 字幕 (Groq Whisper)",
    subtitle_url: "",
    source: "groq-asr",
  };
  const record = {
    bvid,
    cid,
    tracks: [track],
    track,
    segments: result.segments,
    source: "groq-asr",
    asrModel: settings.asrModel,
    asrLanguage: result.language || settings.asrLanguage,
    fetchedAt: Date.now(),
  };
  await store.set(cacheKey, record);
  return record;
}

// ============================================================
// 笔记 (带原子序列化锁与校验)
// ============================================================

async function handleSaveNote({
  videoId,
  timestamp,
  videoTitle,
  author,
  text,
  page = 1,
}) {
  if (!isValidBvid(videoId)) throw new Error("无效的视频 BV 号");
  const trimmed = String(text ?? "").trim();
  if (!trimmed) throw new Error("笔记内容不能为空");

  return await withLock(notesKey(videoId), async () => {
    const notes = await store.get(notesKey(videoId), []);
    const seconds = sanitizeSeconds(timestamp);
    const validPage = sanitizePage(page);
    const pageQuery = validPage > 1 ? `?p=${validPage}&t=${Math.floor(seconds)}` : `?t=${Math.floor(seconds)}`;
    const note = {
      id: crypto.randomUUID(),
      videoId,
      timestamp: seconds,
      page: validPage,
      videoTitle: String(videoTitle ?? "").slice(0, 300),
      author: String(author ?? "").slice(0, 100),
      text: trimmed.slice(0, 10000),
      createdAt: Date.now(),
      url: `https://www.bilibili.com/video/${videoId}${pageQuery}`,
    };
    notes.push(note);
    await store.set(notesKey(videoId), notes);
    return { success: true, note };
  });
}

async function handleUpdateNote({ videoId, noteId, text }) {
  if (!isValidBvid(videoId)) throw new Error("无效的视频 BV 号");
  if (!noteId || typeof noteId !== "string") throw new Error("缺少笔记标识");
  const trimmed = String(text ?? "").trim();
  if (!trimmed) throw new Error("笔记内容不能为空");

  return await withLock(notesKey(videoId), async () => {
    const notes = await store.get(notesKey(videoId), []);
    const noteIndex = notes.findIndex((note) => note.id === noteId);
    if (noteIndex === -1) throw new Error("未找到该笔记");
    notes[noteIndex].text = trimmed.slice(0, 10000);
    notes[noteIndex].updatedAt = Date.now();
    await store.set(notesKey(videoId), notes);
    return { success: true, note: notes[noteIndex] };
  });
}

async function handleDeleteNote({ videoId, noteId }) {
  if (!isValidBvid(videoId)) throw new Error("无效的视频 BV 号");
  if (!noteId || typeof noteId !== "string") throw new Error("缺少笔记标识");

  return await withLock(notesKey(videoId), async () => {
    const notes = await store.get(notesKey(videoId), []);
    const filtered = notes.filter((note) => note.id !== noteId);
    await store.set(notesKey(videoId), filtered);
    return { success: true };
  });
}

async function handleGetNotes(videoId) {
  if (!isValidBvid(videoId)) return { notes: [] };
  const notes = await store.get(notesKey(videoId), []);
  return { notes };
}

async function handleGetAllNotes() {
  const all = await chrome.storage.local.get(null);
  const notes = [];
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith("notes:") && Array.isArray(value)) {
      notes.push(...value);
    }
  }
  notes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { notes: notes.slice(0, 500) };
}

// ============================================================
// 历史视频记录与管理 (Video History)
// ============================================================

const MAX_HISTORY_ITEMS = 50;

async function handleRecordHistory({ video }) {
  if (!video || !isValidBvid(video.bvid)) return { success: false };
  return await withLock("videoHistory", async () => {
    const history = (await store.get("videoHistory", [])) || [];
    const bvid = video.bvid;
    const page = sanitizePage(video.page || 1);

    const record = normalizeHistoryItem({
      bvid,
      cid: Number(video.cid) || 0,
      aid: String(video.aid || ""),
      title: String(video.title || bvid),
      author: String(video.author || ""),
      authorMid: Number(video.authorMid) || 0,
      page,
      duration: Number(video.duration) || 0,
      currentTime: Number(video.currentTime) || 0,
      lastVisitedAt: Date.now(),
    });
    if (!record) return { success: false, history };

    const existingIndex = history.findIndex(
      (item) => item.bvid === bvid && sanitizePage(item.page || 1) === page,
    );

    if (existingIndex >= 0) {
      history.splice(existingIndex, 1);
    }
    history.unshift(record);

    const trimmed = history
      .map(normalizeHistoryItem)
      .filter(Boolean)
      .slice(0, MAX_HISTORY_ITEMS);
    await store.set("videoHistory", trimmed);
    return { success: true, history: trimmed };
  });
}

export function normalizeHistoryItem(item) {
  if (!item || typeof item !== "object") return null;
  const bvid = String(item.bvid || "").trim();
  if (!isValidBvid(bvid)) return null;

  return {
    bvid,
    cid: Number(item.cid) || 0,
    aid: String(item.aid || ""),
    title: String(item.title || bvid).slice(0, 300),
    author: String(item.author || "").slice(0, 100),
    authorMid: Number(item.authorMid) || 0,
    page: sanitizePage(item.page || 1),
    duration: Math.max(0, Number(item.duration) || 0),
    currentTime: Math.max(0, Number(item.currentTime) || 0),
    lastVisitedAt: Number(item.lastVisitedAt) || Date.now(),
  };
}

async function handleGetHistory() {
  const raw = (await store.get("videoHistory", [])) || [];
  const list = Array.isArray(raw) ? raw : [];
  const history = list.map(normalizeHistoryItem).filter(Boolean);
  return { history };
}

async function handleDeleteHistoryItem({ bvid, page }) {
  return await withLock("videoHistory", async () => {
    const raw = (await store.get("videoHistory", [])) || [];
    const list = Array.isArray(raw) ? raw : [];
    const validPage = sanitizePage(page || 1);
    const filtered = list
      .map(normalizeHistoryItem)
      .filter(Boolean)
      .filter((item) => !(item.bvid === bvid && sanitizePage(item.page || 1) === validPage));
    await store.set("videoHistory", filtered);
    return { success: true, history: filtered };
  });
}

async function handleClearHistory() {
  return await withLock("videoHistory", async () => {
    await store.set("videoHistory", []);
    return { success: true };
  });
}

async function handleCaptureNote({ bvid, cid, aid, page, seconds, videoTitle, author }) {
  if (!isValidBvid(bvid)) throw new Error("未检测到有效视频");
  ({ cid, aid } = await resolvePartIdentity(bvid, cid, aid, page));
  const time = sanitizeSeconds(seconds);

  const activeLan = await store.get(activeTrackKey(bvid, cid), "");
  let record = activeLan ? await store.get(transcriptKey(bvid, cid, activeLan), null) : null;
  if (!record?.segments?.length) {
    const asrRecord = await store.get(asrTranscriptKey(bvid, cid), null);
    if (asrRecord?.segments?.length) {
      record = asrRecord;
    }
  }
  if (!record?.segments?.length) {
    record = await fetchTranscriptFromServer(bvid, cid, aid, activeLan, page);
  }
  if (!record?.segments?.length) {
    const asrRecord = await store.get(asrTranscriptKey(bvid, cid), null);
    if (asrRecord?.segments?.length) {
      record = asrRecord;
    }
  }
  const segments = record?.segments || [];
  if (!segments.length) throw new Error("该视频没有字幕，无法标记");

  const { before, target, after } = buildNoteContext(segments, time);
  const text = String(target?.content ?? "").trim() || segmentsToText([...before, target, ...after]);
  if (!text) throw new Error("这个时间点附近没有字幕内容");

  const res = await handleSaveNote({
    videoId: bvid,
    timestamp: time,
    videoTitle,
    author,
    page,
    text: text.slice(0, 3000),
  });
  chrome.runtime.sendMessage({ action: "noteSaved", note: res.note }).catch(() => {});
  return res;
}

// ============================================================
// AI 请求与 Prompt 渲染
// ============================================================

const promptCache = new Map();

export async function renderPrompt(fileName, variables = {}) {
  if (!promptCache.has(fileName)) {
    const url = chrome.runtime.getURL(`prompts/${fileName}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`读取 prompt 模板失败：${fileName}`);
    }
    promptCache.set(fileName, await response.text());
  }
  let text = promptCache.get(fileName);
  for (const [key, value] of Object.entries(variables)) {
    text = text.replaceAll(`{{${key}}}`, String(value ?? ""));
    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    text = text.replaceAll(`{{${snakeKey}}}`, String(value ?? ""));
  }
  return text;
}

export const renderPromptTemplate = renderPrompt;

const TRANSLATE_BATCH_SIZE = 3;

function translationKey(bvid, cid, lan, lang) {
  return `translation:${bvid}:${cid}:${String(lan || "")}:${lang}`;
}

function broadcastTranslationProgress(payload) {
  if (typeof chrome !== "undefined" && chrome?.runtime?.sendMessage) {
    const progress =
      payload.progress !== undefined
        ? payload.progress
        : payload.total > 0
          ? Math.round((payload.done / payload.total) * 100)
          : 0;
    chrome.runtime
      .sendMessage({ action: "translationProgress", progress, ...payload })
      .catch(() => {});
  }
}

async function handleTranslate({ bvid, cid, page = 1, token = 0, viewToken = 0, lan, segments, targetLanguage }) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { texts: [], cached: true };
  }

  const lang = targetLanguage || "English";
  const key = translationKey(bvid, cid, lan, lang);
  const cached = await store.get(key, null);
  if (cached && Array.isArray(cached.texts) && cached.texts.length === segments.length) {
    return { texts: cached.texts, cached: true };
  }

  const settings = await getSettings();
  const config = normalizeProviderConfig(settings);
  if (!config.apiKey || !config.baseUrl || !config.model) {
    throw new Error("请先在设置中配置好 AI 接口");
  }

  const texts = new Array(segments.length).fill("");
  const idSegments = segments.map((segment, index) => ({
    id: String(index),
    content: segment.content,
  }));
  const totalBatches = Math.ceil(idSegments.length / TRANSLATE_BATCH_SIZE);

  broadcastTranslationProgress({
    bvid,
    cid,
    page,
    token,
    viewToken,
    done: 0,
    total: idSegments.length,
    status: "translating",
  });

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const batch = idSegments.slice(
      batchIndex * TRANSLATE_BATCH_SIZE,
      (batchIndex + 1) * TRANSLATE_BATCH_SIZE,
    );
    const prompt = await renderPrompt("translation.md", {
      target_language: lang,
      segments_json: JSON.stringify(batch),
    });
    const content = await requestAiCompletion(
      config,
      [{ role: "user", content: prompt }],
      { json: true },
    );
    const parsed = parseLooseJson(content);
    const items = Array.isArray(parsed?.translations) ? parsed.translations : [];
    const byId = new Map(
      items.map((item) => [String(item.id), String(item.text ?? "").trim()]),
    );
    for (const segment of batch) {
      texts[Number(segment.id)] = byId.get(segment.id) ?? "";
    }

    broadcastTranslationProgress({
      bvid,
      cid,
      page,
      token,
      viewToken,
      done: Math.min(segments.length, (batchIndex + 1) * TRANSLATE_BATCH_SIZE),
      total: segments.length,
      status: "translating",
    });
  }

  await store.set(key, { texts, fetchedAt: Date.now() });
  broadcastTranslationProgress({
    bvid,
    cid,
    page,
    token,
    viewToken,
    done: segments.length,
    total: segments.length,
    status: "done",
  });
  return { texts, cached: false };
}

function digestKey(bvid, cid, lan = "") {
  return `digest:${bvid}:${cid}:${String(lan || "")}`;
}

async function handleGenerateOverview({ bvid, cid, lan, segments, force = false }) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("没有字幕，无法生成概览");
  }

  const key = digestKey(bvid, cid, lan);
  if (!force) {
    const cached = await store.get(key, null);
    if (cached) return { ...cached, cached: true };
  }

  const settings = await getSettings();
  const config = normalizeProviderConfig(settings);
  if (!config.apiKey || !config.baseUrl || !config.model) {
    throw new Error("请先在设置中配置好 AI 接口");
  }

  const transcript = segments
    .map((segment) => `[${secondsToTimestamp(segment.from)}] ${segment.content}`)
    .join("\n");
  const prompt = await renderPrompt("analysis.md", { transcript });
  let content = await requestAiCompletion(
    config,
    [{ role: "user", content: prompt }],
    { json: true },
  );
  let parsed = parseLooseJson(content);

  const validChapterCount = (value) =>
    Array.isArray(value?.chapters)
      ? value.chapters.filter(
          (chapter) =>
            String(chapter?.title ?? "").trim() &&
            parseTimeToSeconds(chapter?.time) !== null,
        ).length
      : 0;

  if (validChapterCount(parsed) < 4) {
    try {
      content = await requestAiCompletion(
        config,
        [
          { role: "user", content: prompt },
          { role: "assistant", content },
          {
            role: "user",
            content:
              "刚才的章节太少。请重新输出完整 JSON：章节至少 6 段、从头到尾覆盖全片，time 用数字秒数或 mm:ss，对应该段第一条字幕的真实起始时间。",
          },
        ],
        { json: true },
      );
      parsed = parseLooseJson(content);
    } catch {
      // 容错：使用第一次生成的结果
    }
  }
  const keyPoints = Array.isArray(parsed?.key_points)
    ? parsed.key_points
    : Array.isArray(parsed?.keyPoints)
      ? parsed.keyPoints
      : [];
  const keyQuotes = Array.isArray(parsed?.key_quotes)
    ? parsed.key_quotes
        .map((quote) => {
          const text = String(quote?.text ?? "").trim();
          if (!text) return null;
          const seconds = parseTimeToSeconds(quote?.time);
          return {
            text,
            time: seconds === null ? 0 : snapToNearestSegment(seconds, segments),
          };
        })
        .filter(Boolean)
    : [];

  const chapters = (Array.isArray(parsed?.chapters) ? parsed.chapters : [])
    .map((chapter) => {
      const seconds = parseTimeToSeconds(chapter?.time);
      if (seconds === null) return null;
      return {
        title: String(chapter?.title ?? "").trim(),
        time: snapToNearestSegment(seconds, segments),
      };
    })
    .filter((chapter) => chapter && chapter.title)
    .sort((a, b) => a.time - b.time)
    .filter(
      (chapter, index, list) => index === 0 || list[index - 1].time !== chapter.time,
    );

  const overview = {
    summary: String(parsed?.summary ?? "").trim(),
    chapters,
    keyPoints: keyPoints.map((point) => String(point).trim()).filter(Boolean),
    keyQuotes,
  };
  await store.set(key, { ...overview, fetchedAt: Date.now() });
  return { ...overview, cached: false };
}

async function handleExplainSelection({ text, context }) {
  const selectedText = String(text ?? "").trim();
  if (!selectedText) throw new Error("选中文本为空");

  const systemPrompt = await renderPrompt("explain.md", {
    text: selectedText,
    context: String(context ?? "").slice(0, 1000),
  });

  const settings = await getSettings();
  const config = normalizeProviderConfig(settings);
  if (!config.apiKey || !config.baseUrl || !config.model) {
    throw new Error("请先在设置中配置好 AI 服务商与 API Key");
  }

  const explanation = await requestAiCompletion(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `请解释词汇/句子：“${selectedText}”` },
  ]);

  return { text: explanation };
}

async function handlePolishText({ draft, text }) {
  const draftText = String(draft ?? text ?? "").trim();
  if (!draftText) throw new Error("草稿内容为空");

  const systemPrompt = await renderPrompt("polish.md", {
    draft: draftText,
  });

  const settings = await getSettings();
  const config = normalizeProviderConfig(settings);
  if (!config.apiKey || !config.baseUrl || !config.model) {
    throw new Error("请先在设置中配置好 AI 服务商与 API Key");
  }

  const rawJson = await requestAiCompletion(
    config,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: "请润色笔记草稿并严格按 JSON 输出。" },
    ],
    { json: true },
  );

  let parsed = null;
  try {
    let c = String(rawJson).trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
    const f = c.indexOf("{");
    const l = c.lastIndexOf("}");
    if (f !== -1 && l !== -1) c = c.slice(f, l + 1);
    parsed = JSON.parse(c);
  } catch {
    parsed = { text: rawJson };
  }

  const polished = String(parsed?.text ?? "").trim();
  if (!polished) {
    throw new Error("AI 没有返回润色结果");
  }
  return { text: polished };
}

async function handleTestApiKey({ apiKey, baseUrl, model }) {
  const settings = await getSettings();
  const config = normalizeProviderConfig({
    aiApiKey: apiKey || settings.aiApiKey,
    aiBaseUrl: baseUrl || settings.aiBaseUrl,
    aiModel: model || settings.aiModel,
    thinkingLevel: "off",
  });
  const res = await requestAiCompletion(config, [{ role: "user", content: "Say hello in one word." }]);
  return { text: res.trim() };
}

async function handleTestGroqAsr({ apiKey }) {
  const settings = await getSettings();
  const key = apiKey || settings.asrGroqApiKey;
  if (!key) throw new Error("请先填写 Groq API Key");
  const result = await testGroqApiKey(key);
  return { success: true, available: Boolean(result?.available) };
}

async function handleListModels({ apiKey, baseUrl }) {
  const settings = await getSettings();
  const config = normalizeProviderConfig({
    aiApiKey: apiKey || settings.aiApiKey,
    aiBaseUrl: baseUrl || settings.aiBaseUrl,
  });
  const models = await requestModelList(config);
  return { models };
}

export async function handleClearCache({ type = "all_cache" } = {}) {
  const all = await store.getAll();
  const keysToRemove = [];
  for (const key of Object.keys(all)) {
    if (type === "all_cache") {
      if (
        key.startsWith("transcript:") ||
        key.startsWith("asr_transcript:") ||
        key.startsWith("active_track:") ||
        key.startsWith("translation:") ||
        key.startsWith("digest:") ||
        key.startsWith("chat:")
      ) {
        keysToRemove.push(key);
      }
    } else if (type === "everything") {
      if (key !== "settings" && key !== "theme" && key !== "contentDisplayConfig") {
        keysToRemove.push(key);
      }
    }
  }
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
  return { success: true, removedCount: keysToRemove.length };
}

// ============================================================
// 消息路由分发
// ============================================================

if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      try {
        const { action, ...payload } = message || {};
        switch (action) {
          case "openSidePanel": {
            let tabId = _sender?.tab?.id;
            if (!tabId && typeof chrome !== "undefined" && chrome?.tabs?.query) {
              const [tab] = await chrome.tabs.query({
                active: true,
                lastFocusedWindow: true,
              });
              tabId = tab?.id;
            }
            try {
              if (tabId && chrome?.sidePanel?.open) {
                await chrome.sidePanel.open({ tabId });
                return { opened: true, success: true };
              }
              return {
                opened: false,
                success: false,
                hint: "请点击浏览器工具栏上的 Bili Digest 图标打开侧边栏",
              };
            } catch {
              return {
                opened: false,
                success: false,
                hint: "请点击浏览器工具栏上的 Bili Digest 图标打开侧边栏",
              };
            }
          }
          case "getContentSettings": {
            const s = await getSettings();
            return {
              success: true,
              showMarkButton: s.showMarkButton !== false,
              videoActionButtonSize: s.videoActionButtonSize || 44,
            };
          }
          case "getVideoInfo":
            return await handleGetVideoInfo(payload.bvid, payload.page);
          case "fetchTranscript":
            return await handleFetchTranscript(payload);
          case "generateAsrTranscript":
            return await handleGenerateAsrTranscript(payload);
          case "testGroqAsr":
            return await handleTestGroqAsr(payload);
          case "setActiveTrack":
            await store.set(activeTrackKey(payload.bvid, payload.cid), payload.lan || "");
            return { success: true };
          case "generateOverview":
            return await handleGenerateOverview(payload);
          case "translate":
            return await handleTranslate(payload);
          case "explainSelection":
            return await handleExplainSelection(payload);
          case "polishText":
            return await handlePolishText(payload);
          case "saveNote":
            return await handleSaveNote(payload);
          case "updateNote":
            return await handleUpdateNote(payload);
          case "deleteNote":
            return await handleDeleteNote(payload);
          case "getNotes":
            return await handleGetNotes(payload.videoId);
          case "getAllNotes":
            return await handleGetAllNotes();
          case "captureNote":
            return await handleCaptureNote(payload);
          case "recordHistory":
            return await handleRecordHistory(payload);
          case "getHistory":
            return await handleGetHistory();
          case "deleteHistoryItem":
            return await handleDeleteHistoryItem(payload);
          case "clearHistory":
            return await handleClearHistory();
          case "clearCache":
            return await handleClearCache(payload);
          case "getSettings":
            return { settings: await getSettings() };
          case "setSettings":
            return await withLock("settings", async () => {
              const current = await getSettings();
              const updated = mergeSettings(current, payload.settings);
              await saveSettings(updated);
              return { success: true, settings: updated };
            });
          case "testApiKey":
            return await handleTestApiKey(payload);
          case "listModels":
            return await handleListModels(payload);
          default:
            throw new Error(`未知的 action: ${action}`);
        }
      } catch (error) {
        return { success: false, error: error.message || "请求执行出错" };
      }
    })().then(sendResponse);
    return true;
  });
}

if (typeof chrome !== "undefined" && chrome?.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}
