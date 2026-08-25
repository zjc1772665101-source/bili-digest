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
