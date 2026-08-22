# 隐私说明

Bili Digest Plus 本地增强版以「本地优先、最小数据外发」为原则。

## 数据保存在哪里

- **AI 配置与设置**：所选 AI 服务的 API Key、Groq API Key、接口地址、模型名、目标语言、排版配置等设置保存在 Chrome 的 `chrome.storage.local`（本机存储）；
- **安全隔离**：内容脚本（`content.js`）仅接收非敏感的展示设置（`showMarkButton` 与 `videoActionButtonSize`），API Key 仅存在于后台服务脚本（`background.js`）与扩展自身页面（`sidepanel.html` / `options.html`）中，绝不向 B 站网页内容脚本注入或暴露 API 密钥；
- **字幕、翻译与概览缓存**：保存在 `chrome.storage.local`，按视频 BV 号与 CID 独立缓存，重复观看时优先复用；
- **笔记与问答记录**：保存在 `chrome.storage.local`，仅存放于你的本地浏览器中；
- **本地观看历史**：扩展会在你浏览 B站视频时自动记录视频基础信息（BV 号、CID、AID、视频标题、UP 主、分 P、时长与最后访问时间），用于在侧栏「🕒 历史」抽屉中快速切换与重看。历史记录最多保留 50 条，存储于本机的 `chrome.storage.local`，绝不上传到任何服务器。你可以在历史抽屉中随时单条删除或一键清空；
- **本机字体列表**：只有你在设置页点击「读取本机字体」并同意 Chrome 的本机字体访问询问后，才由 Local Font Access（`queryLocalFonts()`）在本机枚举；字体名称只用于当前扩展的排版字体选择，不上传、不写入第三方服务，也不会读取字体文件内容。之后可在该扩展页面的“字体”权限处随时撤销；
- **B站登录 Cookie 与凭据**：扩展**从不读取、复制或保存**。浏览器在请求 B站域名时由底层网络栈按标准规则自动携带。

## 数据发到哪里

| 数据 | 接收方 | 用途 |
| --- | --- | --- |
| 视频 BV 号、cid、分 P | `api.bilibili.com` | 获取视频信息与原生字幕轨道列表 |
| 原生字幕文件请求 | `aisubtitle.hdslb.com` / B站 CDN | 下载官方字幕 JSON 文件 |
| 无字幕视频的最低码率音轨 | B站媒体 CDN (`bilivideo.com`) | 仅在你点击「AI 生成字幕」时由浏览器下载音频流 |
| 音频文件 | `api.groq.com` | 仅在你配置 Groq Key 并点击「AI 生成字幕」时进行 Whisper 转写 |
| 字幕文本 / 选中文本 / 笔记草稿 / 对话消息 | 你在设置中填写的 AI 接口地址（如 `api.openai.com` / `api.deepseek.com` / `api.anthropic.com` 或本地 Ollama） | 字幕翻译、内容概览、逐句解释、笔记润色、视频问答 |

扩展直接通过浏览器调用上述服务，不经过任何第三方或 Bili Digest 自有中转服务器。Groq 转写由浏览器直接获取音频并直传 Groq API。

## 权限与网络说明

1. **主机权限 (`https://*/*`, `http://localhost/*`, `http://127.0.0.1/*`)**：
   为支持用户连接任意自定义的 OpenAI 兼容端点（例如 OpenAI、DeepSeek、Anthropic 兼容层、OneAPI、或本地部署的 Ollama），Manifest 中声明了泛域名与本机回环主机权限。扩展严格仅向 B站官方接口与你在设置中主动配置的 AI 接口地址发送请求，绝不扫描或访问任何其他网站。
2. **DNR 规则 (`bilivideo.com`)**：
   声明了 `declarativeNetRequestWithHostAccess` 规则，仅用于在浏览器下载 B 站媒体音轨时附加 `Referer: https://www.bilibili.com/` 请求头，以满足 B 站媒体 CDN 的防盗链校验要求，防止出现 403 Forbidden 错误。

设置导出文件默认不包含 API Key；只有你主动勾选“导出时包含 API Key”时才会把密钥写入导出的本地 JSON 文件。

## 不会发生什么

- 没有账号系统，不收集邮箱、手机号或任何个人身份信息；
- 没有广告 SDK、统计 SDK、崩溃上报或遥测代码；
- 不读取、不跟踪你在其他网站的任何页面内容或浏览历史。

各 AI 服务商与 B站会依据各自的隐私政策处理收到的请求数据。请分别查阅对应的官方隐私政策。
