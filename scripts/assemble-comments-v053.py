from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8", newline="\n")


def must_replace(text, old, new, label):
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f"missing patch marker: {label}")
    return text.replace(old, new, 1)


html = read("sidepanel.html")
html = must_replace(
    html,
    '    <link rel="stylesheet" href="sidepanel.css" />',
    '    <link rel="stylesheet" href="sidepanel.css" />\n    <link rel="stylesheet" href="comments.css" />',
    "comments stylesheet",
)
html = must_replace(
    html,
    '      <button id="tab-btn-settings" class="tab" data-tab="settings" role="tab" aria-selected="false" aria-controls="tab-settings" tabindex="-1">设置</button>',
    '      <button id="tab-btn-comments" class="tab" data-tab="comments" role="tab" aria-selected="false" aria-controls="tab-comments" tabindex="-1">评论</button>\n'
    '      <button id="tab-btn-settings" class="tab" data-tab="settings" role="tab" aria-selected="false" aria-controls="tab-settings" tabindex="-1">设置</button>',
    "comments tab",
)

comments_panel = """      <!-- 5. 评论面板 -->
      <section id="tab-comments" class="panel comments-panel" role="tabpanel" aria-labelledby="tab-btn-comments">
        <div class="comments-toolbar">
          <div class="comments-search-row">
            <input
              id="commentsSearchInput"
              type="search"
              placeholder="搜索评论内容、用户名或 UID"
              autocomplete="off"
              spellcheck="false"
              aria-label="搜索评论"
            />
            <button id="commentsSearchAllBtn" class="primary-btn comments-search-all-btn" type="button">搜索所有评论</button>
            <button id="commentsStopSearchBtn" class="ghost-btn comments-stop-btn hidden" type="button">停止搜索</button>
          </div>
          <div class="comments-filter-row">
            <select id="commentsSortSelect" aria-label="一级评论排序">
              <option value="3">热门</option>
              <option value="2">最新</option>
            </select>
            <label class="comments-like-filter" for="commentsMinLikesInput">
              最低点赞
              <input id="commentsMinLikesInput" type="number" min="0" step="1" value="0" inputmode="numeric" />
            </label>
            <button id="commentsClearSearchBtn" class="ghost-btn" type="button">清除搜索</button>
            <span class="comments-scope-note">“搜索所有评论”会扫描全部一级评论，并逐页读取每条一级评论下的完整回复。</span>
          </div>
        </div>
        <div id="commentsStatus" class="comments-status" role="status" aria-live="polite"></div>
        <div id="commentsList" class="comments-list" tabindex="0" aria-label="评论列表"></div>
        <button id="commentsResultMoreBtn" class="ghost-btn comments-result-more hidden" type="button">显示更多结果</button>
      </section>

"""
settings_marker = '      <!-- 5. 设置面板（五大可折叠区域） -->\n'
if 'id="tab-comments"' not in html:
    if settings_marker not in html:
        raise SystemExit("missing patch marker: settings panel")
    html = html.replace(
        settings_marker,
        comments_panel + '      <!-- 6. 设置面板（五大可折叠区域） -->\n',
        1,
    )
else:
    html = html.replace(
        settings_marker,
        '      <!-- 6. 设置面板（五大可折叠区域） -->\n',
        1,
    )

html = must_replace(
    html,
    '    <script type="module" src="sidepanel.js"></script>',
    '    <script type="module" src="sidepanel.js"></script>\n    <script type="module" src="comments.js"></script>',
    "comments script",
)
write("sidepanel.html", html)

# Use the actual comment list as the infinite-scroll container.
js = read("comments.js")
replacement = """function initInfiniteScroll() {
  listEl.addEventListener("scroll", () => {
    if (!tabBtn.classList.contains("active")) return;
    if (currentQuery() || state.searchMode === "all") return;
    const remaining = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    if (remaining < 360) loadNextRootPage();
  }, { passive: true });
}

function bindEvents()"""
patched, count = re.subn(
    r'function initInfiniteScroll\(\) \{.*?\n\}\n\nfunction bindEvents\(\)',
    replacement,
    js,
    flags=re.S,
    count=1,
)
if count != 1 and replacement not in js:
    raise SystemExit("missing patch marker: infinite scroll")
js = patched if count == 1 else js
write("comments.js", js)

# @用户名 is treated as the same search as 用户名.
util = read("lib/comments-util.js")
old_query = '  const needle = String(query || "").trim().toLocaleLowerCase();\n  if (!needle) return true;'
new_query = '  const rawNeedle = String(query || "").trim().toLocaleLowerCase();\n  const needle = rawNeedle.startsWith("@") ? rawNeedle.slice(1) : rawNeedle;\n  if (!needle) return true;'
if old_query in util:
    util = util.replace(old_query, new_query, 1)
elif new_query not in util:
    raise SystemExit("missing patch marker: @ username search")
write("lib/comments-util.js", util)

package_json = read("package.json")
if 'node test/comments.test.js' not in package_json:
    package_json = package_json.replace(
        '"test": "node test/run-all.js"',
        '"test": "node test/run-all.js && node test/comments.test.js"',
        1,
    )
write("package.json", package_json)

# This v0.5.3 is intentionally rebuilt from the accepted v0.5.2 source.
for path in [
    "background.js",
    "manifest.json",
    "options.html",
    "package.json",
    "sidepanel.html",
    "sidepanel.js",
    "test/run-all.js",
]:
    write(path, read(path).replace("0.5.2", "0.5.3"))

tests = read("test/run-all.js")
anchor = 'assert(sidepanelHtml.includes(\'id="clearCacheBtn"\'), "sidepanel.html 包含 clearCacheBtn 缓存清理按钮");\n'
extra = """assert(sidepanelHtml.includes('id="tab-btn-comments"'), "sidepanel.html 包含评论页签");
assert(sidepanelHtml.includes('id="commentsSearchAllBtn"'), "评论面板提供搜索所有评论入口");
assert(sidepanelHtml.includes('src="comments.js"'), "sidepanel.html 加载评论功能脚本");
const commentsJs = readFileSync(join(rootDir, "comments.js"), "utf8");
assert(commentsJs.includes('/x/v2/reply/wbi/main'), "评论浏览使用 WBI 游标接口扫描一级评论");
assert(commentsJs.includes('/x/v2/reply/reply'), "完整评论搜索逐页读取楼中楼回复");
assert(commentsJs.includes('fetchAllChildren(root, controller.signal'), "搜索所有评论会为有回复的一级评论读取完整回复");
assert(commentsJs.includes('mode: 2, signal: controller.signal'), "全量搜索按时间游标扫描，避免只遍历热评展示集");
"""
if extra.strip() not in tests:
    if anchor not in tests:
        raise SystemExit("missing patch marker: run-all comment assertions")
    tests = tests.replace(anchor, anchor + extra, 1)
write("test/run-all.js", tests)

print("v0.5.3 comment-search source assembled from v0.5.2 baseline")
