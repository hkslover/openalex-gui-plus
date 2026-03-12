export const LITERATURE_BRIEF_SETTINGS_KEY = 'openalex-literature-brief-settings';

export const defaultLiteratureBriefPrompt = [
  '### 提示词模板：利用AI大模型分析期刊论文摘要',
  '',
  '**指令：**',
  '你是一位专业的学术研究助手。下面是一篇期刊论文的摘要。请根据用户的具体要求，仔细阅读摘要并完成指定任务。',
  '',
  '---',
  '',
  '**摘要内容：**',
  '[请在此处粘贴论文摘要文本]',
  '',
  '---',
  '',
  '**用户要求：**',
  '[请具体说明你希望AI对摘要执行什么操作，例如：]',
  '- 用简洁的语言总结摘要的核心内容（研究目的、方法、主要发现和结论）。',
  '- 提取关键信息：研究背景、研究问题、实验设计、样本量、主要结果、局限性。',
  '- 评估该研究的创新性和可靠性，并给出理由。',
  '- 根据摘要，提出三个可以进一步研究的问题。',
  '- 将该研究与以下研究进行比较：[提供另一篇摘要或描述]。',
  '- 解释摘要中某个专业术语或复杂句子的含义。',
  '- 判断该研究属于哪个学科领域，并说明其潜在应用价值。',
  '- 其他自定义任务……',
  '',
  '**输出格式：**',
  '请按照用户要求的格式输出结果，确保条理清晰、逻辑严谨，语言简洁准确。',
  '',
  '---',
  '',
  '**使用说明：**',
  '1. 将上述模板复制到与AI大模型（如ChatGPT、Claude等）的对话中。',
  '2. 在“摘要内容”部分粘贴实际的论文摘要。',
  '3. 在“用户要求”部分明确你的具体需求，可参考示例或自行描述。',
  '4. 发送给AI，它将根据摘要内容执行你的指令。',
].join('\n');

export const defaultLiteratureBriefSettings = {
  enabled: false,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4.1-mini',
  proxyUrl: '',
  prompt: defaultLiteratureBriefPrompt,
};

export function normalizeLiteratureBriefSettings(settings = {}) {
  return {
    ...defaultLiteratureBriefSettings,
    ...settings,
    enabled: settings.enabled === true,
    baseUrl:
      String(settings.baseUrl || defaultLiteratureBriefSettings.baseUrl).trim()
      || defaultLiteratureBriefSettings.baseUrl,
    apiKey: String(settings.apiKey || '').trim(),
    model:
      String(settings.model || defaultLiteratureBriefSettings.model).trim()
      || defaultLiteratureBriefSettings.model,
    proxyUrl: String(settings.proxyUrl || '').trim(),
    prompt:
      String(settings.prompt || defaultLiteratureBriefSettings.prompt).trim()
      || defaultLiteratureBriefSettings.prompt,
  };
}

export function loadLiteratureBriefSettings() {
  try {
    const raw = localStorage.getItem(LITERATURE_BRIEF_SETTINGS_KEY);
    if (!raw) return normalizeLiteratureBriefSettings();
    return normalizeLiteratureBriefSettings(JSON.parse(raw));
  } catch (error) {
    return normalizeLiteratureBriefSettings();
  }
}

export function saveLiteratureBriefSettings(settings = {}) {
  const normalized = normalizeLiteratureBriefSettings(settings);
  localStorage.setItem(LITERATURE_BRIEF_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}
