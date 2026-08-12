const NEGATED_RESUME_REQUEST =
  /(?:不用|无需|不必|不要|不需要|暂时不用|暂不需要).{0,8}(?:发|发送|提供|上传|提交|投递|补充|传).{0,8}(?:附件)?(?:个人|候选人)?简历/u

const ACTION_BEFORE_RESUME =
  /(?:请|麻烦|方便|可以|能否|能不能|能|需要|希望|先|再|也|请问)?(?:发|发送|提供|上传|提交|投递|补充|传)(?:我|给我|一下|下|一份|份|个|过来|来|附件版|电子版|pdf版){0,4}(?:附件)?(?:个人|候选人|你的|您的)?简历/u

const ACTION_AFTER_RESUME =
  /(?:把|将)?(?:附件)?(?:个人|候选人|你的|您的)?简历.{0,10}(?:发|发送|提供|上传|提交|投递|补充|传)(?:我|给我|一下|下|过来|来)?/u

const ASK_FOR_RESUME =
  /(?:请问)?(?:有|是否有|有没有|能看|可以看|方便看)(?:一|下|一下|份|一份|个|电子版|附件版){0,3}(?:附件)?(?:个人|候选人)?简历(?:吗|么|嘛|\?|？)?/u

function normalizeResumeRequestText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '')
    .replace(/\s+/gu, '')
    .toLocaleLowerCase('zh-CN')
}

/** 仅识别 HR 明确要求发送或提供简历的表达，避免把“已查看简历”等陈述误判为请求。 */
export function isExplicitBossResumeRequest(text: string): boolean {
  const normalized = normalizeResumeRequestText(text)
  if (!normalized.includes('简历') || NEGATED_RESUME_REQUEST.test(normalized)) return false
  return (
    ACTION_BEFORE_RESUME.test(normalized) ||
    ACTION_AFTER_RESUME.test(normalized) ||
    ASK_FOR_RESUME.test(normalized)
  )
}
