import assert from "node:assert/strict";
import {
  OVERVIEW_TRANSCRIPT_CHAR_BUDGET,
  prepareOverviewTranscript,
} from "../lib/overview-input.js";

function makeSegments(count, contentLength = 24) {
  return Array.from({ length: count }, (_, index) => ({
    from: index * 2,
    to: index * 2 + 1.8,
    content: `第${index}句-${"内容".repeat(contentLength)}`,
  }));
}

const short = makeSegments(8, 2);
const shortResult = prepareOverviewTranscript(short);
assert.equal(shortResult.compacted, false);
assert.equal(shortResult.sourceCount, 8);
assert.equal(shortResult.includedCount, 8);
assert.ok(shortResult.transcript.includes(short[0].content));
assert.ok(shortResult.transcript.includes(short.at(-1).content));

const long = makeSegments(1800, 12);
const budget = 4_000;
const compacted = prepareOverviewTranscript(long, budget);
assert.equal(compacted.compacted, true);
assert.ok(compacted.originalChars > compacted.includedChars);
assert.ok(compacted.includedChars <= budget);
assert.ok(compacted.includedCount < compacted.sourceCount);
assert.ok(compacted.transcript.includes(long[0].content), "must keep opening subtitle");
assert.ok(compacted.transcript.includes(long.at(-1).content), "must keep ending subtitle");

const sourceTexts = new Set(long.map((segment) => segment.content));
for (const line of compacted.transcript.split("\n")) {
  const content = line.replace(/^\[[^\]]+\]\s*/, "");
  assert.ok(sourceTexts.has(content), `sampled line must remain an original subtitle: ${content}`);
}

const sampledTimes = compacted.transcript
  .split("\n")
  .map((line) => line.match(/^\[(\d+):(\d{2})\]/))
  .filter(Boolean)
  .map((match) => Number(match[1]) * 60 + Number(match[2]));
assert.equal(sampledTimes[0], 0);
assert.ok(sampledTimes.at(-1) >= (long.length - 2) * 2);
assert.ok(sampledTimes.some((time) => time > 800 && time < 1_000));
assert.ok(sampledTimes.some((time) => time > 1_700 && time < 1_900));
assert.ok(sampledTimes.some((time) => time > 2_600 && time < 2_800));

const defaultBudgetResult = prepareOverviewTranscript(makeSegments(3000, 10));
assert.ok(defaultBudgetResult.includedChars <= OVERVIEW_TRANSCRIPT_CHAR_BUDGET);

console.log("overview-input tests passed");
