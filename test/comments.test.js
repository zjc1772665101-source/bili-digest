import assert from "node:assert/strict";
import {
  childPageCount,
  collectRootCandidates,
  commentMatches,
  mergeUniqueComments,
  normalizeComment,
} from "../lib/comments-util.js";

const rawRoot = {
  rpid: 123,
  mid: 42,
  ctime: 1700000000,
  like: 38,
  rcount: 25,
  member: { mid: "42", uname: "测试用户", avatar: "https://example.com/a.jpg" },
  content: { message: "看到 JEWC 的赛事讨论" },
};

const root = normalizeComment(rawRoot, { upperMid: 42 });
assert.equal(root.rpid, "123");
assert.equal(root.replyCount, 25);
assert.equal(root.isReply, false);
assert.equal(root.isUp, true);
assert.equal(root.username, "测试用户");

const child = normalizeComment(
  {
    rpid_str: "456",
    root: 123,
    parent: 123,
    like: 14,
    member: { mid: "99", uname: "回复用户" },
    content: { message: "主要是和 MSI 连着" },
  },
  { rootRpid: "123", upperMid: 42 },
);
assert.equal(child.isReply, true);
assert.equal(child.rootRpid, "123");
assert.equal(child.parentRpid, "123");

assert.equal(commentMatches(root, "jewc"), true);
assert.equal(commentMatches(root, "测试用户"), true);
assert.equal(commentMatches(root, "42"), true);
assert.equal(commentMatches(root, "不存在"), false);
assert.equal(commentMatches(root, "jewc", { minLikes: 40 }), false);
assert.equal(commentMatches(root, "jewc", { minLikes: 38 }), true);

const merged = mergeUniqueComments([root], [root, child, { ...child, rpid: "789" }]);
assert.deepEqual(
  merged.map((item) => item.rpid),
  ["123", "456", "789"],
);

const rootCandidatesData = {
  top_replies: [{ rpid: 900 }, { rpid: 800 }],
  top: { admin: { rpid: 900 }, upper: { rpid: 700 }, vote: null },
  hots: [{ rpid: 600 }, { rpid: 500 }],
  replies: [{ rpid: 500 }, { rpid: 400 }],
};
assert.deepEqual(
  collectRootCandidates(rootCandidatesData, { mode: 3, firstPage: true }).map((item) => String(item.rpid)),
  ["900", "800", "700", "600", "500", "400"],
);
assert.deepEqual(
  collectRootCandidates(rootCandidatesData, { mode: 2, firstPage: true }).map((item) => String(item.rpid)),
  ["900", "800", "700", "500", "400"],
);
assert.deepEqual(
  collectRootCandidates(rootCandidatesData, { mode: 3, firstPage: false }).map((item) => String(item.rpid)),
  ["500", "400"],
);

assert.equal(childPageCount(0), 0);
assert.equal(childPageCount(1), 1);
assert.equal(childPageCount(20), 1);
assert.equal(childPageCount(21), 2);
assert.equal(childPageCount(25), 2);
assert.equal(childPageCount(81, 20), 5);

console.log("comments.test.js: all assertions passed");
