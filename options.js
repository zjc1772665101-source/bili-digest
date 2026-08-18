/**
 * 扩展设置页（chrome://extensions 里的「扩展程序选项」）。
 */

import {
  TYPOGRAPHY_DEFAULTS,
  applyTypographySettings,
  filterFontOptions,
  getFontOptions,
  normalizeShowBrandText,
  normalizeTypographySettings,
  requestLocalFontList,
} from "./lib/typography.js";
import { createSettingsBackup, parseSettingsBackup } from "./lib/settings-transfer.js";

const $ = (id) => document.getElementById(id);

const apiKeyInput = $("apiKeyInput");
const toggleKeyBtn = $("toggleKeyBtn");
const testKeyBtn = $("testKeyBtn");
const keyTestResultEl = $("keyTestResult");
const baseUrlInput = $("baseUrlInput");
const modelSelect = $("modelSelect");
const modelInput = $("modelInput");
const listModelsBtn = $("listModelsBtn");
const modelListHint = $("modelListHint");
const thinkingLevelSelect = $("thinkingLevelSelect");
const targetLanguageSelect = $("targetLanguageSelect");
const customLanguageInput = $("customLanguageInput");
const saveSettingsBtn = $("saveSettingsBtn");
const savedHint = $("savedHint");
const themeToggleBtn = $("themeToggleBtn");
const readingFontPresetSelect = $("readingFontPresetSelect");
const readingFontSizeRange = $("readingFontSizeRange");
const readingFontSizeOutput = $("readingFontSizeOutput");
const readingLineHeightRange = $("readingLineHeightRange");
const readingLineHeightOutput = $("readingLineHeightOutput");
const readingLetterSpacingRange = $("readingLetterSpacingRange");
const readingLetterSpacingOutput = $("readingLetterSpacingOutput");
const resetTypographyBtn = $("resetTypographyBtn");
const typographyStatus = $("typographyStatus");
const interfaceFontPresetSelect = $("interfaceFontPresetSelect");
const codeFontPresetSelect = $("codeFontPresetSelect");
const readLocalFontsBtn = $("readLocalFontsBtn");
const localFontsStatus = $("localFontsStatus");
const brandFontSizeRange = $("brandFontSizeRange");
const brandFontSizeOutput = $("brandFontSizeOutput");
const titleFontSizeRange = $("titleFontSizeRange");
const titleFontSizeOutput = $("titleFontSizeOutput");
const navigationFontSizeRange = $("navigationFontSizeRange");
const navigationFontSizeOutput = $("navigationFontSizeOutput");
const controlFontSizeRange = $("controlFontSizeRange");
const controlFontSizeOutput = $("controlFontSizeOutput");
const overviewButtonFontSizeRange = $("overviewButtonFontSizeRange");
const overviewButtonFontSizeOutput = $("overviewButtonFontSizeOutput");
const videoActionButtonSizeRange = $("videoActionButtonSizeRange");
const videoActionButtonSizeOutput = $("videoActionButtonSizeOutput");
const metaFontSizeRange = $("metaFontSizeRange");
const metaFontSizeOutput = $("metaFontSizeOutput");
const codeFontSizeRange = $("codeFontSizeRange");
const codeFontSizeOutput = $("codeFontSizeOutput");
const fontSearchInput = $("fontSearchInput");
const fontSearchStatus = $("fontSearchStatus");
const showMarkButtonCheckbox = $("showMarkButtonCheckbox");
const showBrandTextCheckbox = $("showBrandTextCheckbox");
const includeApiKeyExportCheckbox = $("includeApiKeyExportCheckbox");
const exportSettingsBtn = $("exportSettingsBtn");
const importSettingsBtn = $("importSettingsBtn");
const settingsImportFile = $("settingsImportFile");
const settingsTransferStatus = $("settingsTransferStatus");
const regionTypographyControls = [
  ["transcript", $("transcriptFontPresetSelect"), $("transcriptFontSizeRange"), $("transcriptFontSizeOutput")],
  ["overview", $("overviewFontPresetSelect"), $("overviewFontSizeRange"), $("overviewFontSizeOutput")],
  ["notes", $("notesFontPresetSelect"), $("notesFontSizeRange"), $("notesFontSizeOutput")],
  ["chat", $("chatFontPresetSelect"), $("chatFontSizeRange"), $("chatFontSizeOutput")],
  ["settings", $("settingsFontPresetSelect"), $("settingsFontSizeRange"), $("settingsFontSizeOutput")],
];
const fontSelects = [
  readingFontPresetSelect,
  interfaceFontPresetSelect,
  codeFontPresetSelect,
  ...regionTypographyControls.map(([, select]) => select),
];
const localFontEntries = [];

async function send(action, payload = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...payload });
  if (!response || response.success === false) {
    throw new Error(response?.error || "请求失败");
  }
  return response;
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeToggleBtn.textContent = isDark ? "☀" : "☾";
}

async function loadTheme() {
  try {
    const { theme } = await chrome.storage.local.get("theme");
    applyTheme(theme === "dark" ? "dark" : "light");
  } catch {
    applyTheme("light");
  }
}

function toggleTheme() {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  chrome.storage.local.set({ theme: next }).catch(() => {});
}

function updateCustomVisibility() {
  customLanguageInput.classList.toggle(
    "hidden",
    targetLanguageSelect.value !== "custom",
  );
}

function updateModelCustomVisibility() {
  modelInput.classList.toggle("hidden", modelSelect.value !== "__custom__");
}

function populateFontOptions() {
  const allOptions = getFontOptions(localFontEntries);
  const filteredOptions = filterFontOptions(allOptions, fontSearchInput?.value || "");
  if (fontSearchStatus) {
    fontSearchStatus.textContent = filteredOptions.length
      ? `显示 ${filteredOptions.length} / 共 ${allOptions.length} 个字体`
      : `没有匹配的字体（显示 0 / 共 ${allOptions.length} 个字体），清空搜索可恢复。`;
    fontSearchStatus.className = filteredOptions.length ? "hint" : "hint error";
  }
  for (const select of fontSelects) {
    if (!select) continue;
    const selected = select.value;
    select.replaceChildren();
    for (const optionData of filteredOptions) {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      select.appendChild(option);
    }
    if (selected && !Array.from(select.options).some((option) => option.value === selected)) {
      const option = document.createElement("option");
      option.value = selected;
      option.textContent = `已保存：${selected.startsWith("local:") ? selected.slice(6) : selected}`;
      select.appendChild(option);
    }
    if (selected) select.value = selected;
  }
}

function ensureFontChoiceOption(select, value) {
  if (Array.from(select.options).some((option) => option.value === value)) return;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value.startsWith("local:")
    ? `已保存：${value.slice(6)}`
    : `已保存：${value}`;
  select.appendChild(option);
}

function typographyFromControls() {
  const input = {
    readingFontPreset: readingFontPresetSelect.value,
    interfaceFontPreset: interfaceFontPresetSelect.value,
    codeFontPreset: codeFontPresetSelect.value,
    brandFontSize: brandFontSizeRange.value,
    titleFontSize: titleFontSizeRange.value,
    navigationFontSize: navigationFontSizeRange.value,
    controlFontSize: controlFontSizeRange.value,
    overviewButtonFontSize: overviewButtonFontSizeRange.value,
    videoActionButtonSize: videoActionButtonSizeRange.value,
    metaFontSize: metaFontSizeRange.value,
    codeFontSize: codeFontSizeRange.value,
    readingFontSize: readingFontSizeRange.value,
    readingLineHeight: readingLineHeightRange.value,
    readingLetterSpacing: readingLetterSpacingRange.value,
  };
  for (const [region, select, range] of regionTypographyControls) {
    input[`${region}FontPreset`] = select.value;
    input[`${region}FontSize`] = range.value;
  }
  return normalizeTypographySettings(input);
}

function formatLetterSpacing(value) {
  return `${Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} em`;
}

function applyBrandTextVisibility(value) {
  const visible = normalizeShowBrandText(value, true);
  document.querySelectorAll(".brand-name, .brand-sub").forEach((element) => {
    element.classList.toggle("hidden", !visible);
  });
  document.querySelectorAll(".typography-preview-brand").forEach((element) => {
    element.classList.toggle("hidden", !visible);
  });
  if (showBrandTextCheckbox) showBrandTextCheckbox.checked = visible;
  return visible;
}

function setTypographyControls(input) {
  const settings = normalizeTypographySettings(input);
  populateFontOptions();
  ensureFontChoiceOption(readingFontPresetSelect, settings.readingFontPreset);
  ensureFontChoiceOption(interfaceFontPresetSelect, settings.interfaceFontPreset);
  ensureFontChoiceOption(codeFontPresetSelect, settings.codeFontPreset);
  for (const [region, select] of regionTypographyControls) {
    ensureFontChoiceOption(select, settings[`${region}FontPreset`]);
  }
  readingFontPresetSelect.value = settings.readingFontPreset;
  interfaceFontPresetSelect.value = settings.interfaceFontPreset;
  codeFontPresetSelect.value = settings.codeFontPreset;
  for (const [region, select, range, output] of regionTypographyControls) {
    select.value = settings[`${region}FontPreset`];
    range.value = String(settings[`${region}FontSize`]);
    output.value = `${settings[`${region}FontSize`]} px`;
    output.textContent = `${settings[`${region}FontSize`]} px`;
  }
  for (const [range, output, key] of [
    [brandFontSizeRange, brandFontSizeOutput, "brandFontSize"],
    [titleFontSizeRange, titleFontSizeOutput, "titleFontSize"],
    [navigationFontSizeRange, navigationFontSizeOutput, "navigationFontSize"],
    [controlFontSizeRange, controlFontSizeOutput, "controlFontSize"],
    [overviewButtonFontSizeRange, overviewButtonFontSizeOutput, "overviewButtonFontSize"],
    [videoActionButtonSizeRange, videoActionButtonSizeOutput, "videoActionButtonSize"],
    [metaFontSizeRange, metaFontSizeOutput, "metaFontSize"],
    [codeFontSizeRange, codeFontSizeOutput, "codeFontSize"],
  ]) {
    range.value = String(settings[key]);
    output.value = `${settings[key]} px`;
    output.textContent = `${settings[key]} px`;
  }
  readingFontSizeRange.value = String(settings.readingFontSize);
  readingLineHeightRange.value = settings.readingLineHeight.toFixed(1);
  readingLetterSpacingRange.value = settings.readingLetterSpacing.toFixed(2);
  readingFontSizeOutput.value = `${settings.readingFontSize} px`;
  readingFontSizeOutput.textContent = `${settings.readingFontSize} px`;
  readingLineHeightOutput.value = settings.readingLineHeight.toFixed(1);
  readingLineHeightOutput.textContent = settings.readingLineHeight.toFixed(1);
  readingLetterSpacingOutput.value = String(settings.readingLetterSpacing);
  readingLetterSpacingOutput.textContent = formatLetterSpacing(settings.readingLetterSpacing);
  applyTypographySettings(document.documentElement, settings);
  applyBrandTextVisibility(showBrandTextCheckbox?.checked);
  return settings;
}

async function readLocalFonts() {
  readLocalFontsBtn.disabled = true;
  localFontsStatus.className = "hint";
  localFontsStatus.textContent = "正在请求 Chrome 的本机字体访问权限并读取字体…";
  try {
    const result = await requestLocalFontList();
    if (result.granted) {
      localFontEntries.splice(0, localFontEntries.length, ...result.fonts);
      const current = typographyFromControls();
      populateFontOptions();
      setTypographyControls(current);
      localFontsStatus.className = "hint ok";
      localFontsStatus.textContent = `已读取 ${result.fonts.length} 个本机字体，仅在本机使用。`;
    } else {
      localFontsStatus.className = "hint error";
      localFontsStatus.textContent = result.error || "未读取本机字体，内置字体仍可使用。";
    }
  } catch (error) {
    localFontsStatus.className = "hint error";
    localFontsStatus.textContent = error.message || "读取本机字体失败，内置字体仍可使用。";
  } finally {
    readLocalFontsBtn.disabled = false;
  }
}

function applyTypographyPreview() {
  const settings = setTypographyControls(typographyFromControls());
  typographyStatus.textContent = "预览已更新；点击“保存设置”后才会写入。";
  typographyStatus.className = "hint";
  return settings;
}

function setModelSelectOptions(names, selected) {
  modelSelect.replaceChildren();
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    modelSelect.appendChild(option);
  }
  const custom = document.createElement("option");
  custom.value = "__custom__";
  custom.textContent = "自定义…";
  modelSelect.appendChild(custom);
  modelSelect.value = selected || "__custom__";
  updateModelCustomVisibility();
}

function getCurrentModelValue() {
  return modelSelect.value === "__custom__"
    ? modelInput.value.trim()
    : modelSelect.value;
}

async function loadSettings() {
  try {
    const { settings } = await send("getSettings");
    apiKeyInput.value = settings.aiApiKey || "";
    baseUrlInput.value = settings.aiBaseUrl || "";
    const savedModel = String(settings.aiModel || "").trim();
    if (savedModel) {
      setModelSelectOptions([savedModel], savedModel);
    } else {
      setModelSelectOptions([], "__custom__");
    }
    modelInput.value = "";
    thinkingLevelSelect.value = settings.thinkingLevel || "off";
    targetLanguageSelect.value = settings.targetLanguage || "English";
    customLanguageInput.value = settings.customLanguage || "";
    showMarkButtonCheckbox.checked = settings.showMarkButton !== false;
    showBrandTextCheckbox.checked = normalizeShowBrandText(settings.showBrandText, true);
    updateCustomVisibility();
    setTypographyControls(settings);
  } catch (error) {
    keyTestResultEl.className = "hint error";
    keyTestResultEl.textContent = error.message;
  }
}

async function saveSettings() {
  try {
    const baseUrl = baseUrlInput.value.trim();
    await send("setSettings", {
      settings: {
        aiApiKey: apiKeyInput.value.trim(),
        aiBaseUrl: baseUrl,
        aiModel: getCurrentModelValue(),
        thinkingLevel: thinkingLevelSelect.value,
        targetLanguage: targetLanguageSelect.value,
        customLanguage: customLanguageInput.value.trim(),
        showMarkButton: showMarkButtonCheckbox.checked,
        showBrandText: showBrandTextCheckbox.checked,
        ...typographyFromControls(),
      },
    });
    savedHint.classList.remove("hidden");
    setTimeout(() => savedHint.classList.add("hidden"), 2000);
  } catch (error) {
    keyTestResultEl.className = "hint error";
    keyTestResultEl.textContent = error.message;
  }
}

function downloadJson(text, filename) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportSettings() {
  settingsTransferStatus.className = "hint";
  settingsTransferStatus.textContent = "正在导出已保存设置…";
  try {
    const [{ settings }, { theme }] = await Promise.all([
      send("getSettings"),
      chrome.storage.local.get("theme"),
    ]);
    const includeApiKey = includeApiKeyExportCheckbox.checked;
    const json = createSettingsBackup(settings, {
      includeApiKey,
      theme: theme === "dark" ? "dark" : "light",
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(json, `bili-digest-settings-${date}.json`);
    settingsTransferStatus.className = "hint ok";
    settingsTransferStatus.textContent = includeApiKey
      ? "设置已导出，文件包含 API Key，请妥善保管。"
      : "设置已导出（不包含 API Key）。";
  } catch (error) {
    settingsTransferStatus.className = "hint error";
    settingsTransferStatus.textContent = error.message;
  }
}

async function importSettingsFile() {
  const file = settingsImportFile.files?.[0];
  if (!file) return;
  settingsTransferStatus.className = "hint";
  settingsTransferStatus.textContent = "正在导入设置…";
  try {
    if (file.size > 1024 * 1024) throw new Error("设置文件过大，最大支持 1 MB");
    const imported = parseSettingsBackup(await file.text());
    await send("setSettings", { settings: imported.settings });
    if (imported.theme) {
      await chrome.storage.local.set({ theme: imported.theme });
      applyTheme(imported.theme);
    }
    await loadSettings();
    settingsTransferStatus.className = "hint ok";
    settingsTransferStatus.textContent = imported.includesApiKey
      ? "设置已导入，包含 API Key。"
      : "设置已导入；当前 API Key 保持不变。";
  } catch (error) {
    settingsTransferStatus.className = "hint error";
    settingsTransferStatus.textContent = error.message;
  } finally {
    settingsImportFile.value = "";
  }
}

async function testApiKey() {
  keyTestResultEl.className = "hint";
  keyTestResultEl.textContent = "正在测试…";
  testKeyBtn.disabled = true;
  try {
    const baseUrl = baseUrlInput.value.trim();
    const result = await send("testApiKey", {
      apiKey: apiKeyInput.value.trim(),
      baseUrl,
      model: getCurrentModelValue(),
    });
    keyTestResultEl.className = "hint ok";
    keyTestResultEl.textContent = `连接成功：${result.text}`;
  } catch (error) {
    keyTestResultEl.className = "hint error";
    keyTestResultEl.textContent = error.message;
  } finally {
    testKeyBtn.disabled = false;
  }
}

async function fetchModelList() {
  const apiKey = apiKeyInput.value.trim();
  const baseUrl = baseUrlInput.value.trim();
  if (!apiKey || !baseUrl) {
    modelListHint.className = "hint error";
    modelListHint.textContent = !apiKey
      ? "请先填写 API Key"
      : "请先填写接口地址";
    modelListHint.classList.remove("hidden");
    return;
  }

  listModelsBtn.disabled = true;
  listModelsBtn.textContent = "拉取中…";
  modelListHint.className = "hint";
  modelListHint.textContent = "正在拉取模型列表…";
  modelListHint.classList.remove("hidden");
  try {
    const result = await send("listModels", { apiKey, baseUrl });
    fillModelList(result.models);
    modelListHint.className = "hint ok";
    modelListHint.textContent = `已填入「${getCurrentModelValue()}」，可在下拉切换或选「自定义…」手动填写，记得保存`;
  } catch (error) {
    modelListHint.className = "hint error";
    modelListHint.textContent = error.message;
  } finally {
    listModelsBtn.disabled = false;
    listModelsBtn.textContent = "拉取模型";
  }
}

function fillModelList(models) {
  if (!Array.isArray(models) || models.length === 0) return;
  const previous = modelSelect.value;
  const manual = modelInput.value.trim();
  let selected;
  if (models.includes(previous)) {
    selected = previous;
  } else if (previous === "__custom__" && manual) {
    selected = "__custom__";
  } else {
    selected = models[0];
  }
  setModelSelectOptions(models, selected);
  if (selected !== "__custom__") modelInput.value = "";
}

toggleKeyBtn.addEventListener("click", () => {
  apiKeyInput.type = apiKeyInput.type === "text" ? "password" : "text";
});
themeToggleBtn.addEventListener("click", toggleTheme);
targetLanguageSelect.addEventListener("change", updateCustomVisibility);
testKeyBtn.addEventListener("click", testApiKey);
listModelsBtn.addEventListener("click", fetchModelList);
modelSelect.addEventListener("change", () => {
  if (modelSelect.value !== "__custom__") modelInput.value = "";
  updateModelCustomVisibility();
});
for (const input of [apiKeyInput, baseUrlInput]) {
  input.addEventListener("input", () => {
    setModelSelectOptions([], "__custom__");
    modelListHint.classList.add("hidden");
  });
}
saveSettingsBtn.addEventListener("click", saveSettings);

for (const input of [
  readingFontPresetSelect,
  interfaceFontPresetSelect,
  codeFontPresetSelect,
  readingFontSizeRange,
  readingLineHeightRange,
  readingLetterSpacingRange,
  brandFontSizeRange,
  titleFontSizeRange,
  navigationFontSizeRange,
  controlFontSizeRange,
  overviewButtonFontSizeRange,
  videoActionButtonSizeRange,
  metaFontSizeRange,
  codeFontSizeRange,
  ...regionTypographyControls.flatMap(([, select, range]) => [select, range]),
]) {
  input.addEventListener("input", applyTypographyPreview);
  input.addEventListener("change", applyTypographyPreview);
}
showBrandTextCheckbox.addEventListener("change", () => {
  applyBrandTextVisibility(showBrandTextCheckbox.checked);
  typographyStatus.textContent = "预览已更新；点击“保存设置”后才会写入。";
  typographyStatus.className = "hint";
});
resetTypographyBtn.addEventListener("click", () => {
  setTypographyControls(TYPOGRAPHY_DEFAULTS);
  typographyStatus.textContent = "已恢复默认预览；点击“保存设置”后才会写入。";
  typographyStatus.className = "hint";
});
readLocalFontsBtn.addEventListener("click", readLocalFonts);
exportSettingsBtn.addEventListener("click", exportSettings);
importSettingsBtn.addEventListener("click", () => settingsImportFile.click());
settingsImportFile.addEventListener("change", importSettingsFile);

fontSearchInput.addEventListener("input", () => {
  populateFontOptions();
});

loadTheme();
populateFontOptions();
loadSettings();
