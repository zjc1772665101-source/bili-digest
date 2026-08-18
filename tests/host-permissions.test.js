import test from "node:test";
import assert from "node:assert/strict";
import {
  parseOrigin,
  ensureHostPermission,
} from "../lib/host-permissions.js";

test("parseOrigin 解析 v0.4.2 支持的 Base URL", () => {
  assert.equal(parseOrigin("https://api.deepseek.com"), "https://api.deepseek.com");
  assert.equal(parseOrigin("https://api.openai.com/v1/"), "https://api.openai.com");
  assert.equal(parseOrigin("https://api.groq.com/openai/v1"), "https://api.groq.com");
  assert.equal(parseOrigin("http://localhost:11434/v1"), "http://localhost:11434");
  assert.equal(parseOrigin("http://127.0.0.1:11434/v1"), "http://127.0.0.1:11434");
  assert.equal(parseOrigin("http://[::1]:11434/v1"), "http://[::1]:11434");
  assert.equal(parseOrigin(" https://api.anthropic.com/v1 "), "https://api.anthropic.com");
  assert.equal(parseOrigin("http://api.deepseek.com/v1"), null);
  assert.equal(parseOrigin(""), null);
  assert.equal(parseOrigin("随便写的地址"), null);
  assert.equal(parseOrigin("ftp://example.com"), null);
  assert.equal(parseOrigin("https://"), null);
});

test("ensureHostPermission 在 Node 环境按 v0.4.2 广域 HTTPS 策略放行", async () => {
  // v0.4.2 manifest 固定声明 https://*/*，无需再维护供应商白名单。
  assert.equal(await ensureHostPermission("https://api.deepseek.com"), true);
  assert.equal(await ensureHostPermission("https://api.groq.com/openai/v1"), true);
  assert.equal(await ensureHostPermission("https://example.com/custom/v1"), true);
  assert.equal(await ensureHostPermission("http://localhost:11434/v1"), true);
  assert.equal(await ensureHostPermission("http://127.0.0.1:11434/v1"), true);
  assert.equal(await ensureHostPermission("http://[::1]:11434/v1"), true);
  assert.equal(await ensureHostPermission("http://example.com/v1"), false);
  assert.equal(await ensureHostPermission(""), true);
});
