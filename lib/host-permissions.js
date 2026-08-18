/**
 * AI 端点地址校验。
 *
 * Manifest 已静态声明 HTTPS 与本机回环地址的主机访问权限，设置页不再
 * 调用 chrome.permissions 动态申请。这里仅负责拒绝不安全的远程 HTTP。
 */

/**
 * 解析 Base URL 的 origin（协议 + 主机）。服务端地址必须使用 HTTPS，
 * 仅允许 localhost、127.0.0.1 这些本机回环地址使用 HTTP。
 * 纯函数，可单测。
 *
 * @param {string} baseUrl
 * @returns {string|null} 例如 "https://api.deepseek.com"
 */
export function parseOrigin(baseUrl) {
  try {
    const url = new URL(String(baseUrl || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.protocol === "http:") {
      const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
      if (!["localhost", "127.0.0.1"].includes(hostname)) return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
