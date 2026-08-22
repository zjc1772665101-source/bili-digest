/**
 * 字幕、时间戳、搜索与章节纯函数工具模块。
 *
 * 供侧边栏与测试共用，不依赖 DOM / Chrome API。
 */

function escapeRegex(string) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 根据当前播放秒数计算正在播放的字幕索引。
 *
 * @param {Array<{from: number, to?: number, content: string}>} segments
 * @param {number} currentTime
 * @returns {number} 活动字幕索引，没有时返回 -1
 */
export function findActiveSegmentIndex(segments, currentTime) {
  if (!Array.isArray(segments) || segments.length === 0) return -1;
  const time = Number(currentTime);
  if (!Number.isFinite(time) || time < 0) return -1;

  const firstFrom = Number(segments[0].from) || 0;
  if (time < firstFrom - 0.2) return -1;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const from = Number(seg.from) || 0;
    const nextFrom =
      i + 1 < segments.length ? Number(segments[i + 1].from) : Infinity;
    const rawTo = Number(seg.to);
    const to =
      rawTo > from
        ? rawTo
        : Number.isFinite(nextFrom)
          ? nextFrom
          : from + 5;

    if (time >= from && time < to) {
      return i;
    }

    if (time >= from && time < nextFrom) {
      // 句间空隙：如果距离本句结束在 2.5 秒内，仍保持激活态，避免字幕行在微小断句时频闪
      if (time <= to + 2.5) {
        return i;
      }
      return -1;
    }
  }

  const last = segments[segments.length - 1];
  const lastFrom = Number(last.from) || 0;
  const lastTo = Number(last.to) > lastFrom ? Number(last.to) : lastFrom + 8;
  if (time >= lastFrom && time <= lastTo + 3) {
    return segments.length - 1;
  }

  return -1;
}

/**
 * 在字幕原文与译文中搜索关键词。
 *
 * @param {Array<{from: number, content: string}>} segments
 * @param {string[]} [translations=[]]
 * @param {string} query
 * @returns {{ matches: number[], count: number, query: string }}
 */
export function searchSegments(segments, translations = [], query = "") {
  const trimmed = String(query ?? "").trim();
  if (!trimmed || !Array.isArray(segments) || segments.length === 0) {
    return { matches: [], count: 0, query: "" };
  }

  const needle = trimmed.toLowerCase();
  const matches = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const orig = String(seg?.content ?? "").toLowerCase();
    const trans = String(translations?.[i] ?? "").toLowerCase();

    if (orig.includes(needle) || trans.includes(needle)) {
      matches.push(i);
    }
  }

  return {
    matches,
    count: matches.length,
    query: trimmed,
  };
}

/**
 * 将文本转义并高亮匹配的搜索关键词。
 *
 * @param {string} text
 * @param {string} query
 * @param {boolean} [isCurrentMatch=false]
 * @returns {string} 包含 <mark> 的安全 HTML 字符串
 */
export function highlightTextHtml(text, query = "", isCurrentMatch = false) {
  const escaped = escapeHtml(text);
  const trimmed = String(query ?? "").trim();
  if (!trimmed) return escaped;

  const escapedQuery = escapeRegex(trimmed);
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const markClass = isCurrentMatch
    ? "search-highlight current"
    : "search-highlight";

  return escaped.replace(regex, `<mark class="${markClass}">$1</mark>`);
}

/**
 * 解析 [MM:SS] / [HH:MM:SS] 或 MM:SS / HH:MM:SS 为秒数。
 *
 * @param {string} str
 * @returns {number|null} 秒数整数，不合法返回 null
 */
export function parseTimestampSeconds(str) {
  if (typeof str !== "string") return null;
  const clean = str.replace(/[\[\]]/g, "").trim();
  const parts = clean.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;

  if (parts.length === 2) {
    const [mm, ss] = parts;
    if (ss >= 60) return null;
    return mm * 60 + ss;
  }
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    if (mm >= 60 || ss >= 60) return null;
    return hh * 3600 + mm * 60 + ss;
  }
  return null;
}

/**
 * 根据当前播放秒数计算所在章节索引。
 *
 * @param {Array<{time: number, title: string}>} chapters
 * @param {number} currentTime
 * @returns {number} 激活章节索引，未开始时返回 -1
 */
export function findActiveChapterIndex(chapters, currentTime) {
  if (!Array.isArray(chapters) || chapters.length === 0) return -1;
  const time = Number(currentTime);
  if (!Number.isFinite(time) || time < 0) return -1;

  let activeIndex = -1;
  for (let i = 0; i < chapters.length; i++) {
    const chapterTime = Number(chapters[i].time) || 0;
    if (time >= chapterTime) {
      activeIndex = i;
    } else {
      break;
    }
  }
  return activeIndex;
}

/**
 * 统一构造 B站视频跳转 URL。
 *
 * @param {string} bvid - 视频 BV 号
 * @param {number} [page=1] - 分 P 号码（>= 1）
 * @param {number} [seconds=0] - 跳播秒数
 * @returns {string} 规范的 B站视频跳转链接
 */
export function buildBiliVideoUrl(bvid, page = 1, seconds = 0) {
  const safeBvid = String(bvid || "").trim();
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));

  const url = new URL(`https://www.bilibili.com/video/${safeBvid}`);
  if (safePage > 1) {
    url.searchParams.set("p", String(safePage));
  }
  if (safeSeconds > 0) {
    url.searchParams.set("t", String(safeSeconds));
  }
  return url.toString();
}
