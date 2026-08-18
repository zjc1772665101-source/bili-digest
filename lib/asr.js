const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const GROQ_TRANSCRIPTION_URL = `${GROQ_BASE_URL}/audio/transcriptions`;
export const GROQ_MODELS_URL = `${GROQ_BASE_URL}/models`;

export const ASR_MODELS = Object.freeze([
  "whisper-large-v3",
  "whisper-large-v3-turbo",
]);

export const DEFAULT_ASR_MODEL = "whisper-large-v3";
export const FREE_TIER_SAFE_UPLOAD_BYTES = 24 * 1024 * 1024;

export function normalizeGroqSegments(payload) {
  return (Array.isArray(payload?.segments) ? payload.segments : [])
    .map((segment) => ({
      from: Number(segment?.start),
      to: Number(segment?.end),
      content: String(segment?.text || "").trim(),
    }))
    .filter(
      (segment) =>
        Number.isFinite(segment.from) &&
        Number.isFinite(segment.to) &&
        segment.to > segment.from &&
        segment.content,
    );
}

export function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function parseErrorResponse(response) {
  const text = await response.text().catch(() => "");
  let message = text;
  try {
    const json = JSON.parse(text);
    message = json?.error?.message || json?.message || text;
  } catch {
    // 非 JSON 错误正文直接使用原文。
  }
  return String(message || `HTTP ${response.status}`).trim();
}

export async function testGroqApiKey(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("请先填写 Groq API Key");
  const response = await fetch(GROQ_MODELS_URL, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(`Groq 连接失败（HTTP ${response.status}）：${message}`);
  }
  const payload = await response.json();
  const ids = (payload?.data || []).map((item) => String(item?.id || ""));
  const available = ASR_MODELS.some((id) => ids.includes(id));
  return { available };
}

export async function transcribeGroqAudio({
  apiKey,
  blob,
  model = DEFAULT_ASR_MODEL,
  language = "auto",
  prompt = "",
}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("请先在设置中填写 Groq API Key");
  if (!(blob instanceof Blob) || blob.size <= 0) {
    throw new Error("没有取得可上传的音频数据");
  }
  if (blob.size > FREE_TIER_SAFE_UPLOAD_BYTES) {
    throw new Error(
      `音频文件 ${formatBytes(blob.size)}，超过 Groq 免费层安全直传上限 24 MB。` +
        "当前版本不会把 B站受防盗链保护的 URL 交给 Groq；建议换较短视频，或后续启用本地/分片转写。",
    );
  }

  const selectedModel = ASR_MODELS.includes(model) ? model : DEFAULT_ASR_MODEL;
  const form = new FormData();
  const file = new File([blob], "bilibili-audio.mp4", {
    type: blob.type || "audio/mp4",
  });
  form.append("file", file);
  form.append("model", selectedModel);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("temperature", "0");
  if (language && language !== "auto") form.append("language", language);
  if (prompt) form.append("prompt", String(prompt).slice(0, 800));

  const response = await fetch(GROQ_TRANSCRIPTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok) {
    const message = await parseErrorResponse(response);
    if (response.status === 413 || /too large|25\s*mb|size/i.test(message)) {
      throw new Error(
        `Groq 拒绝了音频文件：${message}。免费层单文件上限为 25 MB。`,
      );
    }
    if (response.status === 429) {
      throw new Error(`Groq 免费额度或速率暂时达到上限：${message}`);
    }
    throw new Error(`Groq 转写失败（HTTP ${response.status}）：${message}`);
  }

  const payload = await response.json();
  const segments = normalizeGroqSegments(payload);
  if (!segments.length && payload?.text) {
    const duration = Number(payload?.duration) || 1;
    segments.push({ from: 0, to: duration, content: String(payload.text).trim() });
  }
  if (!segments.length) throw new Error("Groq 已返回结果，但没有可用的时间轴字幕");
  return {
    segments,
    language: String(payload?.language || language || "auto"),
    duration: Number(payload?.duration) || 0,
  };
}
