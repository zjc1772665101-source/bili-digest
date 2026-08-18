import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOrigin } from "../lib/host-permissions.js";

test("parseOrigin 解析常见 Base URL", () => {
  assert.equal(parseOrigin("https://api.deepseek.com"), "https://api.deepseek.com");
  assert.equal(parseOrigin("https://api.openai.com/v1/"), "https://api.openai.com");
  assert.equal(parseOrigin("http://localhost:11434/v1"), "http://localhost:11434");
  assert.equal(parseOrigin("http://127.0.0.1:11434/v1"), "http://127.0.0.1:11434");
  assert.equal(parseOrigin("http://[::1]:11434/v1"), null);
  assert.equal(parseOrigin(" https://api.anthropic.com/v1 "), "https://api.anthropic.com");
  assert.equal(parseOrigin("http://api.deepseek.com/v1"), null);
  assert.equal(parseOrigin(""), null);
  assert.equal(parseOrigin("随便写的地址"), null);
  assert.equal(parseOrigin("ftp://example.com"), null);
  assert.equal(parseOrigin("https://"), null);
});

test("manifest 静态允许 HTTPS 与本机 AI 端点且不再动态申请", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../manifest.json", import.meta.url), "utf8"),
  );
  assert.ok(manifest.host_permissions.includes("https://*/*"));
  assert.ok(manifest.host_permissions.includes("http://localhost/*"));
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1/*"));
  assert.equal("optional_host_permissions" in manifest, false);
});
