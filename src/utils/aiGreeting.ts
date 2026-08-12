export class AiGreetingValidationError extends Error {
  override name = 'AiGreetingValidationError'
}

const AI_GREETING_META_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /(请|需要|请先).{0,12}(提供|补充).{0,20}(候选人|求职者).{0,12}(事实|信息|资料|经历)/i,
    reason: '包含向 HR 索要候选人事实的内部提示',
  },
  {
    pattern:
      /(缺少|未提供|没有|未找到|无法获取).{0,20}(候选人|求职者).{0,12}(事实|信息|资料|经历)/i,
    reason: '暴露了候选人事实缺失状态',
  },
  {
    pattern:
      /(无法|不能|未能|暂时无法).{0,12}(生成|撰写|输出).{0,12}(个性化)?(招呼语|开场白|回复)/i,
    reason: '包含模型拒绝生成的元话术',
  },
  {
    pattern: /(作为|我是).{0,4}(AI|人工智能|语言模型)/i,
    reason: '暴露了 AI 身份',
  },
  {
    // “知识库”“Prompt Engineering”本身是正常职业经历，只拦截明确的内部控制语境。
    pattern:
      /(系统提示词|系统指令|开发者指令|隐藏指令|内部指令|候选人事实|用户配置|evidenceIds?|availableEvidenceIds?)/i,
    reason: '暴露了内部知识或提示词字段',
  },
  {
    pattern:
      /\[(?:knowledge|message|evidence):[^\]]+\]|【(?:knowledge|message|evidence):[^】]+】|\[K\d{1,4}\]|【K\d{1,4}】/i,
    reason: '包含内部证据编号',
  },
  {
    pattern:
      /(please\s+(provide|add).{0,30}(candidate|profile)|cannot\s+(generate|write)|(?:system|developer|hidden)\s+(?:prompt|instruction)|(?:available)?evidenceIds?)/i,
    reason: '包含英文模型拒绝或索要资料话术',
  },
]

export function validateAiGreetingText(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AiGreetingValidationError('AI 招呼语不是纯文本')
  }

  const text = value.trim()
  if (!text) throw new AiGreetingValidationError('AI 招呼语为空')
  if (/\r|\n/.test(text)) throw new AiGreetingValidationError('AI 招呼语必须是单行文本')
  if (Array.from(text).length > 140) {
    throw new AiGreetingValidationError('AI 招呼语超过 140 个字符')
  }
  if (
    /^```|^\{|^\[\s*(?:["'{[]|-?\d|true\b|false\b|null\b)|^(招呼语|回复|输出)\s*[:：]/i.test(text)
  ) {
    throw new AiGreetingValidationError('AI 招呼语包含结构化输出或说明前缀')
  }

  for (const { pattern, reason } of AI_GREETING_META_PATTERNS) {
    if (pattern.test(text)) throw new AiGreetingValidationError(reason)
  }

  return text
}
