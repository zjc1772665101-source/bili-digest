import { secondsToTimestamp } from "./subtitle.js";

export const OVERVIEW_TRANSCRIPT_CHAR_BUDGET = 16_000;

function normalizeOverviewSegments(segments) {
  return (Array.isArray(segments) ? segments : [])
    .map((segment) => ({
      from: Math.max(0, Number(segment?.from) || 0),
      content: String(segment?.content ?? "").trim(),
    }))
    .filter((segment) => segment.content);
}

function formatOverviewLine(segment) {
  return `[${secondsToTimestamp(segment.from)}] ${segment.content}`;
}

function nearestIndexByTime(items, targetTime) {
  let low = 0;
  let high = items.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (items[mid].from < targetTime) low = mid + 1;
    else high = mid;
  }
  if (low === 0) return 0;
  const previous = low - 1;
  return Math.abs(items[low].from - targetTime) < Math.abs(items[previous].from - targetTime)
    ? low
    : previous;
}

function sampleIndicesByTime(items, targetCount) {
  const count = Math.max(2, Math.min(items.length, Math.floor(targetCount)));
  if (count >= items.length) return items.map((_, index) => index);

  const selected = new Set([0, items.length - 1]);
  const startTime = items[0].from;
  const endTime = items[items.length - 1].from;

  if (endTime > startTime) {
    for (let slot = 1; slot < count - 1; slot += 1) {
      const targetTime = startTime + ((endTime - startTime) * slot) / (count - 1);
      selected.add(nearestIndexByTime(items, targetTime));
    }
  }

  // 时间戳异常或长静音会让多个时间槽落在同一句，按索引补足代表性样本。
  for (let slot = 1; selected.size < count && slot < count - 1; slot += 1) {
    selected.add(Math.round(((items.length - 1) * slot) / (count - 1)));
  }
  for (let index = 1; selected.size < count && index < items.length - 1; index += 1) {
    selected.add(index);
  }

  return [...selected].sort((a, b) => a - b);
}

function buildSample(items, lines, count) {
  const indices = sampleIndicesByTime(items, count);
  return {
    indices,
    transcript: indices.map((index) => lines[index]).join("\n"),
  };
}

/**
 * 为概览请求准备有硬字符预算的时间轴字幕。
 * 短视频保持完整；超过预算时按真实时间均匀抽样完整字幕行，
 * 尽量不从单句中间截断，保证 key_quotes 仍可引用真实原句。
 */
export function prepareOverviewTranscript(
  segments,
  maxChars = OVERVIEW_TRANSCRIPT_CHAR_BUDGET,
) {
  const items = normalizeOverviewSegments(segments);
  if (!items.length) {
    return {
      transcript: "",
      originalChars: 0,
      includedChars: 0,
      sourceCount: 0,
      includedCount: 0,
      compacted: false,
    };
  }

  const budget = Math.max(
    512,
    Math.floor(Number(maxChars) || OVERVIEW_TRANSCRIPT_CHAR_BUDGET),
  );
  const lines = items.map(formatOverviewLine);
  const fullTranscript = lines.join("\n");

  if (fullTranscript.length <= budget) {
    return {
      transcript: fullTranscript,
      originalChars: fullTranscript.length,
      includedChars: fullTranscript.length,
      sourceCount: items.length,
      includedCount: items.length,
      compacted: false,
    };
  }

  const averageLineChars = Math.max(1, fullTranscript.length / items.length);
  let targetCount = Math.max(
    2,
    Math.min(items.length - 1, Math.floor((budget * 0.96) / averageLineChars)),
  );
  let sample = buildSample(items, lines, targetCount);

  while (sample.transcript.length > budget && targetCount > 2) {
    const ratio = budget / sample.transcript.length;
    const nextCount = Math.max(2, Math.floor(targetCount * ratio * 0.96));
    targetCount = nextCount < targetCount ? nextCount : targetCount - 1;
    sample = buildSample(items, lines, targetCount);
  }

  // 仅极端异常字幕（单句本身接近整个预算）才需要最后兜底截断。
  if (sample.transcript.length > budget) {
    const firstPrefix = `[${secondsToTimestamp(items[0].from)}] `;
    const lastPrefix = `[${secondsToTimestamp(items.at(-1).from)}] `;
    const separator = "\n";
    const available = Math.max(
      0,
      budget - firstPrefix.length - lastPrefix.length - separator.length,
    );
    const firstBudget = Math.ceil(available / 2);
    const lastBudget = Math.floor(available / 2);
    sample = {
      indices: [0, items.length - 1],
      transcript:
        `${firstPrefix}${items[0].content.slice(0, firstBudget)}` +
        separator +
        `${lastPrefix}${items.at(-1).content.slice(-lastBudget)}`,
    };
  }

  return {
    transcript: sample.transcript,
    originalChars: fullTranscript.length,
    includedChars: sample.transcript.length,
    sourceCount: items.length,
    includedCount: sample.indices.length,
    compacted: true,
  };
}
