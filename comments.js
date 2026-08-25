import { encWbi, getMixinKey, extractWbiKey } from "./lib/wbi.js";
import {
  childPageCount,
  commentMatches,
  formatCommentTime,
  formatCompactNumber,
  mergeUniqueComments,
  normalizeComment,
} from "./lib/comments-util.js";

const ROOT_PAGE_DELAY_MS = 260;
const CHILD_PAGE_DELAY_MS = 160;
const RESULT_PAGE_SIZE = 200;
const WBI_TTL_MS = 12 * 60 * 60 * 1000;

const state = {
  bvid: "",
  aid: 0,
  upperMid: 0,
  title: "",
  mode: 3,
  rootOffset: "",
  rootEnded: false,
  rootTotal: 0,
  roots: [],
  loadedIndex: [],
  loadingRoots: false,
  localQuery: "",
  searchMode: "",
  exhaustiveIndex: [],
  exhaustiveRootCount: 0,
  exhaustiveReplyCount: 0,
  searchRunning: false,
  scanController: null,
  resultLimit: RESULT_PAGE_SIZE,
  threadViews: new Map(),
  wbiCache: null,
};

const $ = (id) => document.getElementById(id);
const tabBtn = $("tab-btn-comments");
const searchInput = $("commentsSearchInput");
const sortSelect = $("commentsSortSelect");
const minLikesInput = $("commentsMinLikesInput");
const searchAllBtn = $("commentsSearchAllBtn");
const stopSearchBtn = $("commentsStopSearchBtn");
const clearSearchBtn = $("commentsClearSearchBtn");
const statusEl = $("commentsStatus");
const listEl = $("commentsList");
const sentinelEl = $("commentsSentinel");
const moreResultsBtn = $("commentsResultMoreBtn");

if (!tabBtn || !searchInput || !listEl) {
  console.warn("[BiliDigest Comments] 评论面板未找到，评论功能未初始化");
} else {
  init();
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    }
  });
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

async function fetchJson(url, { signal, checkCode = true } = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    signal,
    referrer: "https://www.bilibili.com/",
    referrerPolicy: "strict-origin-when-cross-origin",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  });
  if (!response.ok) {
    const error = new Error(`B站评论接口请求失败：HTTP ${response.status}`);
    error.httpStatus = response.status;
    throw error;
  }
  const data = await response.json();
  if (checkCode && data && typeof data.code === "number" && data.code !== 0) {
    const error = new Error(data.message || `B站评论接口返回 ${data.code}`);
    error.biliCode = data.code;
    throw error;
  }
  return data;
}

function isRetryable(error) {
  return (
    error?.httpStatus === 403 ||
    error?.httpStatus === 412 ||
    error?.httpStatus === 429 ||
    [-352, -403, -412, -509].includes(Number(error?.biliCode))
  );
}

async function withRetry(task, { signal, attempts = 4 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await task(i);
    } catch (error) {
      lastError = error;
      if (isAbortError(error) || !isRetryable(error) || i === attempts - 1) throw error;
      const wait = [1200, 2600, 5200][i] || 7000;
      setStatus(`请求受到限制，${Math.round(wait / 100) / 10} 秒后继续…`);
      await sleep(wait, signal);
    }
  }
  throw lastError;
}

async function getMixinKeyCached(force = false, signal) {
  if (!force && state.wbiCache?.mixinKey && Date.now() - state.wbiCache.fetchedAt < WBI_TTL_MS) {
    return state.wbiCache.mixinKey;
  }
  const nav = await fetchJson("https://api.bilibili.com/x/web-interface/nav", { signal });
  const imgUrl = nav?.data?.wbi_img?.img_url;
  const subUrl = nav?.data?.wbi_img?.sub_url;
  if (!imgUrl || !subUrl) throw new Error("无法获取 B站 WBI 签名密钥");
  const mixinKey = getMixinKey(extractWbiKey(imgUrl), extractWbiKey(subUrl));
  state.wbiCache = { mixinKey, fetchedAt: Date.now() };
  return mixinKey;
}

async function signedGet(path, params, signal) {
  return withRetry(
    async (attempt) => {
      const forceRefresh = attempt > 0;
      const mixinKey = await getMixinKeyCached(forceRefresh, signal);
      const { w_rid, wts } = await encWbi(params, mixinKey);
      const qs = new URLSearchParams({ ...params, w_rid, wts: String(wts) });
      return fetchJson(`https://api.bilibili.com${path}?${qs.toString()}`, { signal });
    },
    { signal },
  );
}

async function plainGet(path, params, signal) {
  return withRetry(
    () => {
      const qs = new URLSearchParams(params);
      return fetchJson(`https://api.bilibili.com${path}?${qs.toString()}`, { signal });
    },
    { signal },
  );
}

async function detectActiveVideo() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const match = String(tab?.url || "").match(/\/video\/(BV[0-9A-Za-z]{10})/i);
  return match ? match[1] : "";
}

async function loadVideoIdentity(bvid, signal) {
  const data = await plainGet("/x/web-interface/view", { bvid }, signal);
  return {
    bvid,
    aid: Number(data?.data?.aid) || 0,
    upperMid: Number(data?.data?.owner?.mid) || 0,
    title: String(data?.data?.title || ""),
  };
}

async function ensureVideo({ force = false, signal } = {}) {
  const bvid = await detectActiveVideo();
  if (!bvid) {
    if (state.bvid) resetVideoState();
    setStatus("请先打开一个 B站视频");
    render();
    return false;
  }
  if (!force && state.bvid === bvid && state.aid) return true;

  const identity = await loadVideoIdentity(bvid, signal);
  if (!identity.aid) throw new Error("未能解析视频评论区 ID");
  resetVideoState();
  state.bvid = identity.bvid;
  state.aid = identity.aid;
  state.upperMid = identity.upperMid;
  state.title = identity.title;
  setStatus("评论区已就绪，向下滚动可继续加载一级评论");
  return true;
}

function resetVideoState() {
  stopExhaustiveSearch({ quiet: true });
  state.bvid = "";
  state.aid = 0;
  state.upperMid = 0;
  state.title = "";
  state.rootOffset = "";
  state.rootEnded = false;
  state.rootTotal = 0;
  state.roots = [];
  state.loadedIndex = [];
  state.loadingRoots = false;
  state.searchMode = "";
  state.exhaustiveIndex = [];
  state.exhaustiveRootCount = 0;
  state.exhaustiveReplyCount = 0;
  state.resultLimit = RESULT_PAGE_SIZE;
  state.threadViews.clear();
  render();
}

function normalizeRoot(raw) {
  const root = normalizeComment(raw, { upperMid: state.upperMid });
  const previewReplies = (Array.isArray(raw?.replies) ? raw.replies : []).map((reply) =>
    normalizeComment(reply, { rootRpid: root.rpid, upperMid: state.upperMid }),
  );
  return { root, previewReplies };
}

async function fetchRootPage({ offset = "", mode = state.mode, signal } = {}) {
  const params = {
    type: 1,
    oid: state.aid,
    mode,
    plat: 1,
    web_location: 1315875,
  };
  if (offset) params.pagination_str = JSON.stringify({ offset });
  else params.seek_rpid = "";

  const response = await signedGet("/x/v2/reply/wbi/main", params, signal);
  const data = response?.data || {};
  const rawRoots = [];
  if (data?.upper?.top) rawRoots.push(data.upper.top);
  if (Array.isArray(data?.top_replies)) rawRoots.push(...data.top_replies);
  if (Array.isArray(data?.replies)) rawRoots.push(...data.replies);

  const seen = new Set();
  const roots = [];
  const previews = [];
  for (const raw of rawRoots) {
    const { root, previewReplies } = normalizeRoot(raw);
    if (!root.rpid || seen.has(root.rpid)) continue;
    seen.add(root.rpid);
    roots.push(root);
    previews.push(...previewReplies);
  }

  return {
    roots,
    previews,
    isEnd: Boolean(data?.cursor?.is_end),
    nextOffset: String(data?.cursor?.pagination_reply?.next_offset || ""),
    total: Math.max(0, Number(data?.cursor?.all_count) || 0),
  };
}

async function fetchChildPage(rootRpid, page, signal) {
  const response = await plainGet(
    "/x/v2/reply/reply",
    {
      type: 1,
      oid: state.aid,
      root: rootRpid,
      pn: Math.max(1, Number(page) || 1),
      ps: 20,
    },
    signal,
  );
  const data = response?.data || {};
  const replies = (Array.isArray(data?.replies) ? data.replies : []).map((raw) =>
    normalizeComment(raw, { rootRpid, upperMid: state.upperMid }),
  );
  return {
    replies,
    count: Math.max(0, Number(data?.page?.count) || 0),
    page: Math.max(1, Number(data?.page?.num) || Number(page) || 1),
    pageSize: Math.max(1, Number(data?.page?.size) || 20),
  };
}

async function fetchAllChildren(root, signal, onProgress) {
  if (!root?.rpid || root.replyCount <= 0) return [];
  const first = await fetchChildPage(root.rpid, 1, signal);
  let all = first.replies;
  const totalPages = childPageCount(first.count || root.replyCount, first.pageSize || 20);
  onProgress?.(first.replies.length);

  for (let page = 2; page <= totalPages; page += 1) {
    await sleep(CHILD_PAGE_DELAY_MS, signal);
    const next = await fetchChildPage(root.rpid, page, signal);
    all = mergeUniqueComments(all, next.replies);
    onProgress?.(next.replies.length);
  }
  return all;
}

async function loadNextRootPage() {
  if (state.loadingRoots || state.rootEnded || state.searchRunning) return;
  try {
    const ok = await ensureVideo();
    if (!ok || state.loadingRoots) return;
    state.loadingRoots = true;
    setStatus(state.roots.length ? "正在继续加载一级评论…" : "正在加载评论…");
    const page = await fetchRootPage({ offset: state.rootOffset });
    state.roots = mergeUniqueComments(state.roots, page.roots);
    state.loadedIndex = mergeUniqueComments(
      state.loadedIndex,
      page.roots.concat(page.previews),
    );
    state.rootOffset = page.nextOffset;
    state.rootEnded = page.isEnd || (!page.nextOffset && page.roots.length === 0);
    state.rootTotal = page.total || state.rootTotal;
    render();
    updateBrowseStatus();
  } catch (error) {
    if (!isAbortError(error)) setStatus(`加载评论失败：${error.message}`, true);
  } finally {
    state.loadingRoots = false;
  }
}

function currentMinLikes() {
  return Math.max(0, Number(minLikesInput?.value) || 0);
}

function currentQuery() {
  return String(searchInput?.value || "").trim();
}

function filteredIndex(index) {
  const query = currentQuery();
  const minLikes = currentMinLikes();
  return (Array.isArray(index) ? index : []).filter((comment) =>
    commentMatches(comment, query, { minLikes }),
  );
}

function updateBrowseStatus() {
  const totalPart = state.rootTotal ? ` / 约 ${state.rootTotal}` : "";
  const previewCount = state.loadedIndex.filter((item) => item.isReply).length;
  if (currentQuery()) {
    const matches = filteredIndex(state.loadedIndex).length;
    setStatus(
      `已加载 ${state.roots.length}${totalPart} 条一级评论，并索引 ${previewCount} 条回复预览；当前命中 ${matches} 条。要覆盖全部回复，请使用“搜索所有评论”。`,
    );
  } else if (state.rootEnded) {
    setStatus(`已加载全部 ${state.roots.length} 条可见一级评论`);
  } else {
    setStatus(`已加载 ${state.roots.length}${totalPart} 条一级评论，继续向下滚动会自动加载`);
  }
}

function updateSearchStatus() {
  const matches = filteredIndex(state.exhaustiveIndex).length;
  const scanned = state.exhaustiveRootCount + state.exhaustiveReplyCount;
  setStatus(
    `${state.searchRunning ? "正在搜索" : "搜索完成"}：一级评论 ${state.exhaustiveRootCount} 条，完整回复 ${state.exhaustiveReplyCount} 条，共扫描 ${scanned} 条，命中 ${matches} 条。`,
  );
}

async function runExhaustiveSearch() {
  const query = currentQuery();
  if (!query) {
    setStatus("请输入关键词后再搜索所有评论", true);
    searchInput.focus();
    return;
  }
  stopExhaustiveSearch({ quiet: true });

  try {
    const ok = await ensureVideo();
    if (!ok) return;
    const controller = new AbortController();
    state.scanController = controller;
    state.searchRunning = true;
    state.searchMode = "all";
    state.exhaustiveIndex = [];
    state.exhaustiveRootCount = 0;
    state.exhaustiveReplyCount = 0;
    state.resultLimit = RESULT_PAGE_SIZE;
    searchAllBtn.disabled = true;
    stopSearchBtn.classList.remove("hidden");
    moreResultsBtn.classList.add("hidden");
    render();

    let offset = "";
    let ended = false;
    const seenRoots = new Set();

    while (!ended) {
      const batch = await fetchRootPage({ offset, mode: 2, signal: controller.signal });
      const freshRoots = batch.roots.filter((root) => {
        if (!root.rpid || seenRoots.has(root.rpid)) return false;
        seenRoots.add(root.rpid);
        return true;
      });

      for (const root of freshRoots) {
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        state.exhaustiveRootCount += 1;
        state.exhaustiveIndex = mergeUniqueComments(state.exhaustiveIndex, [root]);
        updateSearchStatus();

        if (root.replyCount > 0) {
          const children = await fetchAllChildren(root, controller.signal, (count) => {
            state.exhaustiveReplyCount += count;
            updateSearchStatus();
          });
          state.exhaustiveIndex = mergeUniqueComments(state.exhaustiveIndex, children);
        }
      }

      render();
      updateSearchStatus();
      ended = batch.isEnd || (!batch.nextOffset && freshRoots.length === 0);
      offset = batch.nextOffset;
      if (!ended) await sleep(ROOT_PAGE_DELAY_MS, controller.signal);
    }

    state.searchRunning = false;
    updateSearchStatus();
    render();
  } catch (error) {
    if (isAbortError(error)) {
      setStatus(
        `已停止：一级评论 ${state.exhaustiveRootCount} 条，完整回复 ${state.exhaustiveReplyCount} 条已被扫描。`,
      );
    } else {
      setStatus(`搜索所有评论失败：${error.message}`, true);
    }
  } finally {
    state.searchRunning = false;
    state.scanController = null;
    searchAllBtn.disabled = false;
    stopSearchBtn.classList.add("hidden");
    render();
  }
}

function stopExhaustiveSearch({ quiet = false } = {}) {
  if (state.scanController) state.scanController.abort();
  state.scanController = null;
  state.searchRunning = false;
  if (searchAllBtn) searchAllBtn.disabled = false;
  if (stopSearchBtn) stopSearchBtn.classList.add("hidden");
  if (!quiet && state.searchMode === "all") updateSearchStatus();
}

function clearSearch() {
  stopExhaustiveSearch({ quiet: true });
  searchInput.value = "";
  state.localQuery = "";
  state.searchMode = "";
  state.exhaustiveIndex = [];
  state.resultLimit = RESULT_PAGE_SIZE;
  render();
  updateBrowseStatus();
}

function createAvatar(comment) {
  const wrap = document.createElement("div");
  wrap.className = "comment-avatar";
  if (comment.avatar && /^https?:\/\//i.test(comment.avatar)) {
    const img = document.createElement("img");
    img.src = comment.avatar;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    wrap.appendChild(img);
  } else {
    wrap.textContent = String(comment.username || "?").slice(0, 1);
  }
  return wrap;
}

function createCommentCard(comment, { root = false, showThread = false } = {}) {
  const card = document.createElement("article");
  card.className = `comment-card${comment.isReply ? " is-reply" : ""}`;
  card.dataset.rpid = comment.rpid;
  card.appendChild(createAvatar(comment));

  const body = document.createElement("div");
  body.className = "comment-body";

  const head = document.createElement("div");
  head.className = "comment-head";
  const author = document.createElement("span");
  author.className = "comment-author";
  author.textContent = comment.username || `UID ${comment.mid || "未知"}`;
  head.appendChild(author);
  if (comment.isUp) {
    const badge = document.createElement("span");
    badge.className = "comment-up-badge";
    badge.textContent = "UP主";
    head.appendChild(badge);
  }
  if (comment.isReply) {
    const badge = document.createElement("span");
    badge.className = "comment-reply-badge";
    badge.textContent = "回复";
    head.appendChild(badge);
  }

  const text = document.createElement("div");
  text.className = "comment-message";
  text.textContent = comment.message || "[无文本内容]";

  const meta = document.createElement("div");
  meta.className = "comment-meta";
  const time = document.createElement("span");
  time.textContent = formatCommentTime(comment.ctime);
  meta.appendChild(time);
  const like = document.createElement("span");
  like.textContent = `赞 ${formatCompactNumber(comment.like)}`;
  meta.appendChild(like);

  if (root && comment.replyCount > 0) {
    const repliesBtn = document.createElement("button");
    repliesBtn.type = "button";
    repliesBtn.className = "comment-replies-btn";
    repliesBtn.dataset.action = "toggle-thread";
    repliesBtn.dataset.root = comment.rpid;
    repliesBtn.textContent = `${formatCompactNumber(comment.replyCount)} 条回复`;
    meta.appendChild(repliesBtn);
  }

  body.append(head, text, meta);
  if (showThread) body.appendChild(createThreadView(comment.rpid));
  card.appendChild(body);
  return card;
}

function createThreadView(rootRpid) {
  const view = state.threadViews.get(rootRpid);
  const wrap = document.createElement("div");
  wrap.className = "comment-thread";
  if (!view) return wrap;

  if (view.loading) {
    wrap.textContent = "正在加载回复…";
    return wrap;
  }
  if (view.error) {
    wrap.textContent = `回复加载失败：${view.error}`;
    return wrap;
  }

  for (const reply of view.replies || []) {
    wrap.appendChild(createCommentCard(reply));
  }

  const totalPages = childPageCount(view.count, view.pageSize || 20);
  if (totalPages > 1) {
    const pager = document.createElement("div");
    pager.className = "comment-thread-pager";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.dataset.action = "thread-page";
    prev.dataset.root = rootRpid;
    prev.dataset.page = String(Math.max(1, view.page - 1));
    prev.disabled = view.page <= 1;
    prev.textContent = "上一页";

    const page = document.createElement("span");
    page.textContent = `第 ${view.page} / ${totalPages} 页`;

    const next = document.createElement("button");
    next.type = "button";
    next.dataset.action = "thread-page";
    next.dataset.root = rootRpid;
    next.dataset.page = String(Math.min(totalPages, view.page + 1));
    next.disabled = view.page >= totalPages;
    next.textContent = "下一页";

    pager.append(prev, page, next);
    wrap.appendChild(pager);
  }
  return wrap;
}

async function toggleThread(rootRpid) {
  if (state.threadViews.has(rootRpid)) {
    state.threadViews.delete(rootRpid);
    render();
    return;
  }
  await loadThreadPage(rootRpid, 1);
}

async function loadThreadPage(rootRpid, page) {
  const previous = state.threadViews.get(rootRpid) || {};
  state.threadViews.set(rootRpid, { ...previous, loading: true, error: "", page });
  render();
  try {
    const data = await fetchChildPage(rootRpid, page);
    state.loadedIndex = mergeUniqueComments(state.loadedIndex, data.replies);
    state.threadViews.set(rootRpid, {
      loading: false,
      error: "",
      replies: data.replies,
      count: data.count,
      page: data.page,
      pageSize: data.pageSize,
    });
    render();
    updateBrowseStatus();
  } catch (error) {
    state.threadViews.set(rootRpid, {
      ...previous,
      loading: false,
      error: error.message,
      page,
      replies: previous.replies || [],
    });
    render();
  }
}

function renderEmpty(text) {
  const empty = document.createElement("div");
  empty.className = "comments-empty";
  empty.textContent = text;
  listEl.appendChild(empty);
}

function renderBrowse() {
  if (!state.bvid) {
    renderEmpty("打开 B站视频后即可浏览和搜索评论");
    return;
  }
  if (!state.roots.length && state.loadingRoots) {
    renderEmpty("正在加载评论…");
    return;
  }
  if (!state.roots.length) {
    renderEmpty("暂无可显示的一级评论");
    return;
  }
  for (const root of state.roots) {
    listEl.appendChild(
      createCommentCard(root, {
        root: true,
        showThread: state.threadViews.has(root.rpid),
      }),
    );
  }
}

function renderSearchResults(index) {
  const results = filteredIndex(index);
  if (!results.length) {
    renderEmpty(state.searchRunning ? "正在继续扫描，当前还没有匹配结果" : "没有找到匹配评论");
    moreResultsBtn.classList.add("hidden");
    return;
  }
  const visible = results.slice(0, state.resultLimit);
  for (const comment of visible) listEl.appendChild(createCommentCard(comment));
  if (results.length > visible.length) {
    moreResultsBtn.textContent = `显示更多结果（剩余 ${results.length - visible.length} 条）`;
    moreResultsBtn.classList.remove("hidden");
  } else {
    moreResultsBtn.classList.add("hidden");
  }
}

function render() {
  if (!listEl) return;
  listEl.replaceChildren();
  const query = currentQuery();
  if (state.searchMode === "all") {
    renderSearchResults(state.exhaustiveIndex);
  } else if (query) {
    renderSearchResults(state.loadedIndex);
  } else {
    moreResultsBtn.classList.add("hidden");
    renderBrowse();
  }
}

function setStatus(text, error = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.toggle("error", Boolean(error));
}

function handleSearchInput() {
  if (state.searchRunning) stopExhaustiveSearch({ quiet: true });
  state.localQuery = currentQuery();
  state.searchMode = state.localQuery ? "local" : "";
  state.resultLimit = RESULT_PAGE_SIZE;
  render();
  updateBrowseStatus();
}

async function handleSortChange() {
  stopExhaustiveSearch({ quiet: true });
  state.mode = Number(sortSelect.value) === 2 ? 2 : 3;
  state.rootOffset = "";
  state.rootEnded = false;
  state.rootTotal = 0;
  state.roots = [];
  state.loadedIndex = [];
  state.threadViews.clear();
  render();
  await loadNextRootPage();
}

function initInfiniteScroll() {
  listEl.addEventListener("scroll", () => {
    if (!tabBtn.classList.contains("active")) return;
    if (currentQuery() || state.searchMode === "all") return;
    const remaining = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    if (remaining < 360) loadNextRootPage();
  }, { passive: true });
}

function bindEvents() {
  tabBtn.addEventListener("click", async () => {
    try {
      const ok = await ensureVideo();
      if (ok && !state.roots.length) await loadNextRootPage();
    } catch (error) {
      setStatus(`评论区初始化失败：${error.message}`, true);
    }
  });

  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      runExhaustiveSearch();
    }
  });
  minLikesInput.addEventListener("input", () => {
    state.resultLimit = RESULT_PAGE_SIZE;
    render();
    if (state.searchMode === "all") updateSearchStatus();
    else updateBrowseStatus();
  });
  sortSelect.addEventListener("change", handleSortChange);
  searchAllBtn.addEventListener("click", runExhaustiveSearch);
  stopSearchBtn.addEventListener("click", () => stopExhaustiveSearch());
  clearSearchBtn.addEventListener("click", clearSearch);
  moreResultsBtn.addEventListener("click", () => {
    state.resultLimit += RESULT_PAGE_SIZE;
    render();
  });

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const rootRpid = String(button.dataset.root || "");
    if (!rootRpid) return;
    if (button.dataset.action === "toggle-thread") {
      toggleThread(rootRpid);
    } else if (button.dataset.action === "thread-page") {
      loadThreadPage(rootRpid, Number(button.dataset.page) || 1);
    }
  });
}

async function syncVideoWhileOpen() {
  if (!tabBtn.classList.contains("active")) return;
  try {
    const bvid = await detectActiveVideo();
    if (bvid && bvid !== state.bvid) {
      await ensureVideo({ force: true });
      await loadNextRootPage();
    } else if (!bvid && state.bvid) {
      resetVideoState();
      setStatus("请先打开一个 B站视频");
    }
  } catch (error) {
    setStatus(`同步视频评论区失败：${error.message}`, true);
  }
}

function init() {
  bindEvents();
  initInfiniteScroll();
  render();
  setStatus("进入“评论”后会加载当前视频的评论区");
  setInterval(syncVideoWhileOpen, 2200);
}
