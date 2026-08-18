<div align="center">

<img src="icons/icon128.png" width="96" alt="Bili Digest 哔哩精读图标">

# Bili Digest 哔哩精读

> 把每一个 B站视频，变成一份可以深度学习的资料。
> Turn every Bilibili video into study material worth keeping.

Bili Digest 是一个 Chrome 侧边栏扩展：在你看 B站视频的同时，把**字幕、双语对照、AI 概览、逐句解释和带时间戳的笔记**全部收进侧边栏，不用离开视频页面，也不丢失学习进度。

**English:** Bili Digest is a Chrome side panel extension that keeps transcripts, bilingual subtitles, AI overviews, sentence explanations, timestamped notes, and subtitle-based Q&A in one sidebar while you watch a Bilibili video. Bring your own key — any OpenAI-compatible endpoint works (OpenAI, Anthropic, DeepSeek, Ollama, and more).

![Manifest V3](https://img.shields.io/badge/Manifest-V3-00aeec?style=flat-square)
![License MIT](https://img.shields.io/badge/License-MIT-fb7299?style=flat-square)
![BYOK](https://img.shields.io/badge/API-自带密钥-8a9aa8?style=flat-square)
![Chrome](https://img.shields.io/badge/Chrome-%E2%89%A5116-4285f4?style=flat-square)

</div>

---

## 功能

- 把字幕变成可阅读、可点击跳转的学习文本
- 无 B站字幕时，可调用 Groq Whisper Large V3 / Turbo 生成带时间轴的 AI 字幕；可以在「字幕」页手动生成，也可以直接点「生成 AI 概览」，插件会先生成字幕再继续概览。浏览器先取得 B站最低码率音轨再上传，避免 Groq 直读 B站 CDN 的 403
- 日间 / 夜间主题一键切换，整套界面用 B站品牌配色
- 原文 / 双语两种视图（双语可一键隐藏原文只看译文），默认中文译英文，目标语言可配置
- 字幕一键复制全文，导出为 Markdown（含视频简介、概览、双语字幕、笔记）
- AI 生成内容概要、章节划分、复习要点和原文金句
- 点任意一条字幕，让 AI 解释它的含义和背景
- 看视频时点右上角「标记」或按 N：把当前句原文存为带时间戳的标记，不调用 AI，不用暂停视频
- 笔记支持手写 + AI 润色，可复制文本 / 复制时间戳链接 / 一键回到视频位置，还能切换查看当前视频或全部视频的笔记
- 「对话」页：基于当前视频的字幕和 AI 流式问答，回答只依据字幕、不编造，对话记录可导出 Markdown
- 自带密钥（BYOK）：一个「OpenAI 兼容」入口，OpenAI、Anthropic、DeepSeek、Kimi、GLM、通义千问、本地模型都能接

## 截图

安装并登录后，把各页截图放进 `screenshots/` 目录再在这里引用。建议至少覆盖：双语字幕、AI 概览、视频对话、笔记列表、设置页。

## 为什么做这个项目

看视频学习有两个痛点：字幕一闪而过、知识不成体系。Bili Digest 把「看」变成「读」：字幕可以像文章一样翻阅，AI 帮你搭出知识骨架，笔记帮你沉淀复习。

这个项目的灵感来自 [zarazhangrui/youtube-digest](https://github.com/zarazhangrui/youtube-digest)（MIT 许可），但它是为 B站从零重写的：优先读取 B站网页端字幕；当视频没有字幕时，可由用户在字幕页生成 Groq Whisper 字幕，或在点击「生成 AI 概览」时由插件先完成字幕转写再继续概览。

## 安装

1. 下载本仓库（Code → Download ZIP 或 `git clone`），解压到一个**长期保留**的目录；
2. 打开 Chrome，访问 `chrome://extensions`；
3. 打开右上角「开发者模式」；
4. 点「加载已解压的扩展程序」，选择包含 `manifest.json` 的目录；
5. 把扩展固定到工具栏。

注意：这是「加载已解压」方式安装的扩展，Chrome 不会自动更新。目录移动或删除后需要重新加载。

## 配置 AI 服务

AI 功能（翻译、概览、逐句解释、笔记润色、视频问答）需要你自己的 API Key。设置页只提供一个「OpenAI 兼容」入口：填接口地址、模型名和 Key，任何兼容 Chat Completions 的服务都能用：

1. 到对应平台注册并创建 API Key；
2. 在扩展侧边栏的「设置」页填入接口地址、模型和 Key（或右键扩展图标 → 选项）；
3. 点「测试连接」确认可用。

说明：Anthropic 用的是官方 OpenAI SDK 兼容端点（官方标注为测试用途，按正常价格计费）；扩展会按接口地址自动带上各家需要的参数，例如 DeepSeek 的非思考模式。**不要把 Key 贴进聊天、截图或任何公开的地方。**

## 使用前提

- Chrome 116 或更新版本；
- 在 `bilibili.com` 处于**登录状态**。B站的网页端字幕接口只对登录用户返回字幕列表。扩展不会读取或保存你的登录信息，只是由浏览器在请求时自动携带；
- 有 B站 CC/AI 字幕时会直接读取；没有字幕时可以在「字幕」页手动点击「AI 生成字幕」；也可以直接点击「生成 AI 概览」，插件会先检查本机字幕缓存，必要时调用 Groq 生成字幕后再继续概览。两种方式都需要先配置 Groq API Key；
- Groq 免费层直传单文件上限为 25 MB。扩展优先选择 B站 64K 音轨，但特别长的视频仍可能超过限制；当前版本会明确提示，不会再回退到会触发 403 的 Groq 远程 URL 抓取。Shorts、直播、番剧页不在支持范围内。

## 使用

1. 打开一个 B站视频（`bilibili.com/video/...`）；有原生字幕会直接加载，没有字幕会显示「AI 生成字幕」；
2. 点击工具栏的「精读」按钮或扩展图标打开侧边栏；
3. 「字幕」页：点时间戳跳转，切换原文 / 双语（双语可隐藏原文只看译文），悬停某句点「解释」；切到双语不会自动翻译，点右上角「翻译」按钮才触发（结果会缓存复用），右上角还能复制全文或导出 Markdown；
4. 「概览」页：点「生成 AI 概览」才会调用 AI；如果当前视频没有可用字幕，这一次点击会先读取本机 AI 字幕缓存，缓存也没有时自动调用 Groq 转写，字幕就绪后再生成内容概要、章节、要点和金句。切换到概览页本身不会自动调用 AI；
5. 记笔记：看视频时点右上角「标记」或按 N，把当前句原文存为带时间戳的标记；也可以在「笔记」页手写后点「AI 润色」；
6. 「笔记」页：切换「本视频 / 全部视频」，每条笔记都能复制文本、复制时间戳链接或一键回到对应位置；
7. 「对话」页：就视频字幕提问，AI 流式回答；对话按视频保存在本机，可随时导出 Markdown。

## 工作原理

```text
B站视频页 (content.js)
   │  BV 号、cid、标题、播放进度
   ▼
后台服务 (background.js)
   │  WBI 签名 → x/player/wbi/v2 → 字幕轨道列表
   │  有字幕：下载字幕 JSON（aisubtitle.hdslb.com）
   │  无字幕：x/player/wbi/playurl → 浏览器下载最低码率音轨 → Groq Whisper
   │  所选 AI 服务 → 翻译 / 概览 / 解释
   ▼
侧边栏 (sidepanel.*)
   字幕两视图 · 概览 · 笔记 · 对话 · 设置
```

说明：

- B站字幕接口返回 `subtitle_url`，指向一个字幕 JSON 文件，结构为 `{ body: [{ from, to, content }] }`，`from/to` 单位是秒；
- 字幕轨道的主来源是 `x/player/wbi/v2`（带 `aid+cid`，与播放页一致），失败时回退 `x/player/v2`；两者都失败才用 WBI 签名（`w_rid` + `wts`）兜底，签名实现有单元测试覆盖；
- 请求 B站接口时显式携带浏览器头、`zh-CN` 语言头和 `https://www.bilibili.com/` 的 Referer，避免被风控拦截；
- B站字幕、Groq 生成的 AI 字幕、概览、翻译都会缓存在本机 `chrome.storage.local`，重复观看优先复用缓存。

## 数据与隐私

- 字幕与音轨请求发给 B站（`api.bilibili.com`、`aisubtitle.hdslb.com`、B站媒体 CDN）；
- 只有在你主动点击「AI 生成字幕」，或主动点击「生成 AI 概览」且当前视频没有可用字幕时，浏览器才会下载音轨并直接上传到 `api.groq.com` 做 Whisper 转写；
- AI 请求发给你在设置中填写的接口地址，只发送字幕、你选中的文本、笔记草稿或对话所需的整段字幕；若使用「自定义」端点，数据直接发往你填写的地址，扩展不中转；
- 为了兼容自定义 OpenAI 兼容 HTTPS 接口、Groq 与 B站媒体 CDN，本增强版在 Manifest 中静态声明 `https://*/*`，并允许 `localhost` / `127.0.0.1` 的本机 HTTP；扩展代码只会访问 B站接口、Groq 和你主动填写的 AI 接口地址。
- 没有账号系统、广告、埋点或遥测。详见 [PRIVACY.md](PRIVACY.md)。

## 费用

B站字幕提取免费。Groq AI 字幕使用你自己的 Groq 账号额度；其他 AI 功能按你选择的服务商定价计费，翻译只在你切换到译文视图时发生，且结果会缓存。各家的价格和优惠不同，请以对应的官方定价页为准（例如 [DeepSeek 定价页](https://api-docs.deepseek.com/quick_start/pricing)）。

## Groq 免费层与当前限制

截至 v0.4.2 发布时，Groq 官方 Free Plan 对 `whisper-large-v3` 和 `whisper-large-v3-turbo` 的公开限额均为：

- **28,800 音频秒/天（ASD）≈ 8 小时音频/天**；
- **7,200 音频秒/小时（ASH）≈ 2 小时音频/小时**；
- **20 RPM、2,000 RPD**；
- 免费层**单文件直接上传上限 25 MB**。本插件使用 24 MB 作为安全阈值。

额度是“累计可转写音频时长”，并不代表可以一次上传 8 小时视频。当前 v0.4.2 还没有自动音频分片；插件会优先选择 B站低码率音轨来降低文件大小，但较长视频仍可能先碰到 25 MB 单文件限制。具体限额可能由 Groq 调整，请以 Groq Console 的 Rate Limits / Speech to Text 官方页面为准。

## 相比源版 v0.3.7 的主要变化

- **无字幕视频 AI 转写**：新增 Groq Whisper Large V3 / V3 Turbo，可把无 CC/AI 字幕的视频转换为带时间轴字幕。
- **绕过 Groq 远程抓取 403**：不再把 B站受防盗链保护的媒体 URL 直接交给 Groq；改为浏览器取得低码率 DASH 音轨后 multipart 上传。
- **AI 字幕缓存**：生成后的字幕保存在 `chrome.storage.local`，再次打开优先复用，避免重复消耗 Groq 配额。
- **概览自动补字幕**：无字幕时直接点「生成 AI 概览」，会先恢复缓存或生成 Groq 字幕，然后继续概览。
- **标签顺序调整**：概览 → 字幕 → 对话 → 笔记 → 设置。
- **字体与排版增强**：支持读取 Chrome/系统本机字体、字体搜索、分区域字体与字号设置；v0.4.2 修复本机字体枚举兼容性，并避免空字体列表误报成功。
- **设置迁移**：增加设置导入/导出；默认不导出 API Key，只有显式勾选才包含密钥。
- **媒体请求兼容**：加入仅针对 B站媒体 CDN 的 DNR Referer 规则，提高浏览器端音轨获取成功率。
- **权限模型**：增强版明确使用 `https://*/*` 静态 HTTPS 主机权限，以兼容任意用户自定义 AI 端点，同时保留本机回环 HTTP。

## 字幕提取不出来？

1. 确认 Chrome 里 `bilibili.com` 处于**登录状态**，然后刷新视频页；
2. 如果视频没有 CC/AI 字幕，先在设置里填写 Groq Key，再在字幕页点「AI 生成字幕」；若提示音频超过 24 MB，则是 Groq 免费层 25 MB 直传限制；
3. 在项目目录运行自检脚本，能区分「接口不通」和「视频无字幕」：

   ```bash
   npm run verify-bili -- BV1xxxxxxxx
   # 带上登录态完整验证（SESSDATA 从浏览器开发者工具 Cookie 里复制，只在本机进程内使用）
   $env:BILI_SESSDATA="你的SESSDATA"; npm run verify-bili -- BV1xxxxxxxx
   ```

   PowerShell 用 `$env:BILI_SESSDATA=...`，macOS/Linux 用 `BILI_SESSDATA=... npm run verify-bili -- BV1xxxxxxxx`。不要把 SESSDATA 贴进聊天或公开仓库。

## 免责声明

- 本项目**仅供个人学习交流**，使用 B站网页端**公开可见**的接口，未修改、未绕过任何访问控制；
- B站接口与页面结构可能随时变化，导致扩展失效；如遇失效请更新到最新代码；
- 请遵守 B站用户协议与相关法律法规，不要将本项目用于商业用途或大规模抓取；
- 本项目与哔哩哔哩及各 AI 服务商均无隶属关系。

## 开发

纯 HTML / CSS / JavaScript，无构建步骤。Node.js 仅用于测试和检查。

```bash
npm test      # 单元测试（WBI 签名、字幕解析、AI 配置）
npm run check # 静态检查：manifest、文件完整性、JS 语法
npm run package # 打包成 dist/bili-digest-vX.Y.Z.zip
```

## 路线图

- 多 P 视频的分 P 切换
- 字幕跟随播放自动滚动
- 字幕内搜索与筛选
- 笔记导出为 Anki / CSV
- 词汇本（生词 + 例句 + 时间戳）
- 更多目标语言

## 许可证

[MIT](LICENSE)

## 致谢

- [zarazhangrui/youtube-digest](https://github.com/zarazhangrui/youtube-digest)：产品形态的灵感来源；
- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)：B站接口的社区文档（该仓库已于 2026 年 1 月停止维护）。

## 友链

- [LINUX DO](https://linux.do/)：开放的开发者社区，本项目在此发布与交流。
