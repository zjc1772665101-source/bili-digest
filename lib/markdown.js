/**
 * 给聊天消息与概览用的安全 Markdown 渲染器。
 *
 * 支持：
 * - 标题（# 至 ####）
 * - 引用块（>）
 * - 无序列表（- / *）与有序列表（1. / 2.）
 * - 围栏代码块（```lang ... ```）与一键复制按钮
 * - 行内加粗（**text**）、行内代码（`code`）、安全外链（http/https）
 * - 视频时间戳识别（[MM:SS] / [HH:MM:SS] 或合法 MM:SS），自动转为跳播按钮
 * - 代码块、行内代码、链接 URL 内的时间戳严格保护，不被误转换
 * - 全量 HTML 实体转义，杜绝 XSS 注入
 */

import { parseTimestampSeconds } from "./transcript-util.js";

export function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTimestamps(text) {
  // 匹配 [01:23] / [01:23:45] 以及独立的 01:23 / 01:23:45
  return text.replace(
    /(\[(\d{1,2}:\d{2}(?::\d{2})?)\])|(?:\b(\d{1,2}:\d{2}(?::\d{2})?)\b)/g,
    (match, bracketFull, bracketTime, standaloneTime) => {
      const timeStr = bracketTime || standaloneTime || match;
      const seconds = parseTimestampSeconds(timeStr);
      if (seconds === null) return match;

      const displayLabel = bracketFull ? `[${timeStr}]` : timeStr;
      return `<button class="timestamp-pill" data-seconds="${seconds}" type="button" title="点击跳转至 ${timeStr}">${displayLabel}</button>`;
    },
  );
}

export function renderInline(text) {
  const codeTokens = [];
  const linkTokens = [];

  // 1. 保护行内代码
  let processed = text.replace(/`([^`]+)`/g, (_match, codeContent) => {
    const token = `\u0000INLINE_CODE_${codeTokens.length}\u0000`;
    codeTokens.push(codeContent);
    return token;
  });

  // 2. 保护 Markdown 链接，防止 URL 里的数字/时间戳被替换
  processed = processed.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_match, linkText, linkUrl) => {
      const token = `\u0000INLINE_LINK_${linkTokens.length}\u0000`;
      linkTokens.push({ text: linkText, url: linkUrl });
      return token;
    },
  );

  // 3. 处理加粗（加粗内容内部允许时间戳）
  processed = processed.replace(/\*\*([^*]+)\*\*/g, (_match, boldContent) => {
    return `<strong>${renderTimestamps(boldContent)}</strong>`;
  });

  // 4. 处理纯文本中的时间戳
  processed = renderTimestamps(processed);

  // 5. 还原链接（链接文字中可含转义内容，URL 严格转义且不受时间戳影响）
  processed = processed.replace(
    /\u0000INLINE_LINK_(\d+)\u0000/g,
    (_match, index) => {
      const item = linkTokens[Number(index)];
      if (!item) return "";
      const safeUrl = escapeHtml(item.url);
      const safeText = escapeHtml(item.text);
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeText}</a>`;
    },
  );

  // 6. 还原行内代码（严格转义）
  processed = processed.replace(
    /\u0000INLINE_CODE_(\d+)\u0000/g,
    (_match, index) => {
      const rawCode = codeTokens[Number(index)] ?? "";
      return `<code>${escapeHtml(rawCode)}</code>`;
    },
  );

  return processed;
}

/**
 * 规范化模型输出的 Markdown：
 * 折叠连续空行、去掉行尾空格，并把「每行都写 1.」的懒编号
 * 重排成 1、2、3…（空行不打断编号，遇到正文才重置）。
 */
export function normalizeModelMarkdown(text) {
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));

  let counter = 0;
  let inCodeBlock = false;

  const renumbered = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      counter = 0;
      return line;
    }
    if (inCodeBlock) {
      return line;
    }

    const match = /^(\s*)(\d+)([.)、．])\s*(.+)$/.exec(line);
    if (match) {
      counter += 1;
      return `${match[1]}${counter}${match[3]} ${match[4]}`;
    }
    if (
      trimmed !== "" &&
      (/^#{1,6}\s/.test(trimmed) || /^(-{3,}|\*{3,})$/.test(trimmed))
    ) {
      counter = 0;
    }
    return line;
  });

  return renumbered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * @param {string} text
 * @returns {string} 已转义、只含安全白名单标签的 HTML
 */
export function renderMarkdown(text) {
  if (!text) return "";
  const lines = normalizeModelMarkdown(text).split("\n");
  const html = [];
  let listType = null;
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const closeCodeBlock = () => {
    if (inCodeBlock) {
      const langName = escapeHtml(codeLang || "text");
      const safeCode = codeLines.map((l) => escapeHtml(l)).join("\n");
      html.push(
        `<div class="code-block"><div class="code-header"><span class="code-lang">${langName}</span><button class="code-copy-btn" type="button" aria-label="复制代码" title="复制代码">复制</button></div><pre><code class="language-${langName}">${safeCode}</code></pre></div>`,
      );
      inCodeBlock = false;
      codeLang = "";
      codeLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 围栏代码块起止
    if (trimmed.startsWith("```")) {
      closeList();
      if (inCodeBlock) {
        closeCodeBlock();
      } else {
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim();
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    // 空行
    if (!trimmed) {
      closeList();
      continue;
    }

    // 标题
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      closeList();
      const level = Math.min(4, heading[1].length);
      const escapedTitle = escapeHtml(heading[2]);
      html.push(`<h${level}>${renderInline(escapedTitle)}</h${level}>`);
      continue;
    }

    // 引用块
    if (trimmed.startsWith(">")) {
      closeList();
      const quoteContent = escapeHtml(trimmed.replace(/^>\s?/, ""));
      html.push(`<blockquote><p>${renderInline(quoteContent)}</p></blockquote>`);
      continue;
    }

    // 无序列表
    const unordered = /^[-*]\s+(.*)$/.exec(trimmed);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      const escapedItem = escapeHtml(unordered[1]);
      html.push(`<li>${renderInline(escapedItem)}</li>`);
      continue;
    }

    // 有序列表
    const ordered = /^(\d+)([.)、．])\s*(.*)$/.exec(trimmed);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      const escapedItem = escapeHtml(ordered[3]);
      html.push(`<li value="${ordered[1]}">${renderInline(escapedItem)}</li>`);
      continue;
    }

    // 普通段落
    closeList();
    const escapedLine = escapeHtml(trimmed);
    html.push(`<p>${renderInline(escapedLine)}</p>`);
  }

  closeList();
  closeCodeBlock();
  return html.join("");
}
