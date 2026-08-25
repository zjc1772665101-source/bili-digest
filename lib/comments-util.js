export function normalizeComment(raw, { rootRpid = "", upperMid = 0 } = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const member = source.member && typeof source.member === "object" ? source.member : {};
  const content = source.content && typeof source.content === "object" ? source.content : {};
  const rpid = String(source.rpid_str || source.rpid || "");
  const normalizedRoot = String(source.root_str || source.root || rootRpid || "");
  const mid = String(member.mid || source.mid || "");
  const message = String(content.message || "").trim();

  return {
    rpid,
    rootRpid: normalizedRoot,
    parentRpid: String(source.parent_str || source.parent || ""),
    mid,
    username: String(member.uname || "").trim(),
    avatar: String(member.avatar || ""),
    message,
    ctime: Number(source.ctime) || 0,
    like: Math.max(0, Number(source.like) || 0),
    replyCount: Math.max(0, Number(source.rcount ?? source.count) || 0),
    isReply: Boolean(normalizedRoot && normalizedRoot !== "0"),
    isUp: Boolean(upperMid && mid && String(upperMid) === mid),
  };
}

export function commentMatches(comment, query, { minLikes = 0 } = {}) {
  if (!comment || typeof comment !== "object") return false;
  if ((Number(comment.like) || 0) < Math.max(0, Number(minLikes) || 0)) return false;
  const rawNeedle = String(query || "").trim().toLocaleLowerCase();
  const needle = rawNeedle.startsWith("@") ? rawNeedle.slice(1) : rawNeedle;
  if (!needle) return true;
  const haystack = `${comment.message || ""}\n${comment.username || ""}\n${comment.mid || ""}`.toLocaleLowerCase();
  return haystack.includes(needle);
}

export function mergeUniqueComments(target, incoming) {
  const list = Array.isArray(target) ? target.slice() : [];
  const seen = new Set(list.map((item) => String(item?.rpid || "")).filter(Boolean));
  for (const item of Array.isArray(incoming) ? incoming : []) {
    const key = String(item?.rpid || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push(item);
  }
  return list;
}

export function collectRootCandidates(data, { mode = 3, firstPage = true } = {}) {
  const source = data && typeof data === "object" ? data : {};
  const result = [];
  const seen = new Set();

  const append = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) append(item);
      return;
    }
    if (typeof value !== "object") return;

    const rpid = String(value.rpid_str || value.rpid || "");
    if (!rpid) {
      for (const nested of Object.values(value)) {
        if (nested && typeof nested === "object") append(nested);
      }
      return;
    }
    if (seen.has(rpid)) return;
    seen.add(rpid);
    result.push(value);
  };

  if (firstPage) {
    // Prefer the server-provided pinned collection order, then fill any missing
    // explicit pin slots. This mirrors the current WBI response structure.
    append(source.top_replies);
    append(source?.top?.admin);
    append(source?.top?.upper);
    append(source?.top?.vote);

    // hots is documented as Bilibili's hot-comment ranking. Only inject it on
    // the first hot page so later cursor pages keep their replies order intact.
    if (Number(mode) === 3) append(source.hots);
  }

  append(source.replies);
  return result;
}

export const COMMENT_RANKING_WEIGHTS = Object.freeze({
  like: 0.72,
  reply: 0.28,
});

function safeMetric(value) {
  return Math.max(0, Number(value) || 0);
}

function logNormalized(value, maximum) {
  const max = safeMetric(maximum);
  if (max <= 0) return 0;
  return Math.log1p(safeMetric(value)) / Math.log1p(max);
}

export function weightedCommentScore(
  comment,
  {
    maxLikes = 0,
    maxReplies = 0,
    likeWeight = COMMENT_RANKING_WEIGHTS.like,
    replyWeight = COMMENT_RANKING_WEIGHTS.reply,
  } = {},
) {
  let likesWeight = Math.max(0, Number(likeWeight) || 0);
  let repliesWeight = Math.max(0, Number(replyWeight) || 0);
  const weightTotal = likesWeight + repliesWeight;
  if (weightTotal <= 0) {
    likesWeight = COMMENT_RANKING_WEIGHTS.like;
    repliesWeight = COMMENT_RANKING_WEIGHTS.reply;
  } else {
    likesWeight /= weightTotal;
    repliesWeight /= weightTotal;
  }

  return (
    likesWeight * logNormalized(comment?.like, maxLikes) +
    repliesWeight * logNormalized(comment?.replyCount, maxReplies)
  );
}

export function sortRootComments(comments, mode = "weighted") {
  const list = Array.isArray(comments) ? comments.slice() : [];
  if (list.length < 2) return list;

  const maxLikes = Math.max(0, ...list.map((item) => safeMetric(item?.like)));
  const maxReplies = Math.max(0, ...list.map((item) => safeMetric(item?.replyCount)));
  const decorated = list.map((comment, index) => ({
    comment,
    index,
    score: weightedCommentScore(comment, { maxLikes, maxReplies }),
  }));

  const tieBreak = (a, b) =>
    safeMetric(b.comment?.like) - safeMetric(a.comment?.like) ||
    safeMetric(b.comment?.replyCount) - safeMetric(a.comment?.replyCount) ||
    safeMetric(b.comment?.ctime) - safeMetric(a.comment?.ctime) ||
    a.index - b.index;

  decorated.sort((a, b) => {
    if (mode === "likes") {
      return (
        safeMetric(b.comment?.like) - safeMetric(a.comment?.like) ||
        safeMetric(b.comment?.replyCount) - safeMetric(a.comment?.replyCount) ||
        safeMetric(b.comment?.ctime) - safeMetric(a.comment?.ctime) ||
        a.index - b.index
      );
    }
    if (mode === "replies") {
      return (
        safeMetric(b.comment?.replyCount) - safeMetric(a.comment?.replyCount) ||
        safeMetric(b.comment?.like) - safeMetric(a.comment?.like) ||
        safeMetric(b.comment?.ctime) - safeMetric(a.comment?.ctime) ||
        a.index - b.index
      );
    }
    if (mode === "latest") {
      return safeMetric(b.comment?.ctime) - safeMetric(a.comment?.ctime) || a.index - b.index;
    }
    return b.score - a.score || tieBreak(a, b);
  });

  return decorated.map(({ comment }) => comment);
}

export function childPageCount(count, pageSize = 20) {
  const size = Math.max(1, Math.floor(Number(pageSize) || 20));
  return Math.max(0, Math.ceil(Math.max(0, Number(count) || 0) / size));
}

export function formatCompactNumber(value) {
  const number = Math.max(0, Number(value) || 0);
  if (number < 1000) return String(Math.floor(number));
  if (number < 10000) return `${(number / 1000).toFixed(number < 10000 ? 1 : 0)}千`;
  return `${(number / 10000).toFixed(number < 100000 ? 1 : 0)}万`;
}

export function formatCommentTime(unixSeconds, nowMs = Date.now()) {
  const seconds = Number(unixSeconds) || 0;
  if (!seconds) return "";
  const delta = Math.max(0, Math.floor(nowMs / 1000) - seconds);
  if (delta < 60) return "刚刚";
  if (delta < 3600) return `${Math.floor(delta / 60)}分钟前`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}小时前`;
  if (delta < 86400 * 7) return `${Math.floor(delta / 86400)}天前`;
  const date = new Date(seconds * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
