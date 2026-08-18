import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOrigin } from "../lib/host-permissions.js";

const manifest = JSON.parse(
  readFileSync(new URL("../manifest.json", import.meta.url), "utf8"),
);

test("parseOrigin 只接受 HTTPS 与受支持的本机回环 HTTP", () => {
  assert.equal(parseOrigin("https://api.deepseek.com"), "https://api.deepseek.com");
  assert.equal(parseOrigin("https://api.openai.com/v1/"), "https://api.openai.com");
  assert.equal(parseOrigin("https://api.groq.com/openai/v1"), "https://api.groq.com");
  assert.equal(parseOrigin("https://example.com/custom/v1"), "https://example.com");
  assert.equal(parseOrigin("http://localhost:11434/v1"), "http://localhost:11434");
  assert.equal(parseOrigin("http://127.0.0.1:11434/v1"), "http://127.0.0.1:11434");
  assert.equal(parseOrigin("http://example.com/v1"), null);
  assert.equal(parseOrigin("http://[::1]:11434/v1"), null);
  assert.equal(parseOrigin("ftp://example.com"), null);
  assert.equal(parseOrigin(""), null);
  assert.equal(parseOrigin("随便写的地址"), null);
});

test("v0.4.2 manifest 固定声明广域 HTTPS 与本机回环访问", () => {
  assert.ok(manifest.host_permissions.includes("https://*/*"));
  assert.ok(manifest.host_permissions.includes("http://localhost/*"));
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1/*"));
  assert.ok(manifest.permissions.includes("declarativeNetRequestWithHostAccess"));
});
