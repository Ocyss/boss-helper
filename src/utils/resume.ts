import { generateText } from 'ai'

import { createModel } from '@/composables/useModel/providers'
import type { ModelConf } from '@/composables/useModel/type'
import type { ResumeStructured } from '@/types/formData'
import { parseGptJson } from '@/utils/ai'

/** 从 PDF 中提取纯文本（本地解析，不上传文件） */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')
  pdfjs.GlobalWorkerOptions.workerPort ??= new PdfWorker()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise
  const pages: string[] = []
  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ')
    pages.push(text)
  }
  return pages.join('\n').replace(/[ \t]+/g, ' ').trim()
}

/** 从 DOCX 中提取纯文本 */
export async function extractDocxText(file: File): Promise<string> {
  const mod: any = await import('mammoth')
  const mammoth = mod.default ?? mod
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value.replace(/\n{3,}/g, '\n\n').trim()
}

/** 根据扩展名解析简历文件；txt/md 直接读取 */
export async function extractResumeText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return extractPdfText(file)
  if (ext === 'docx') return extractDocxText(file)
  if (ext === 'doc') {
    throw new Error('暂不支持 .doc，请另存为 .docx 或 PDF 后再上传')
  }
  return (await file.text()).trim()
}

/**
 * 用 LLM 把简历原文提炼成结构化信息。
 * 只使用原文事实，禁止编造；失败时抛错由 UI 提示。
 */
export async function structureResume(
  raw: string,
  modelConf: ModelConf,
): Promise<ResumeStructured> {
  if (!modelConf.data) throw new Error('模型配置不完整，请先在提供商管理中配置')
  const source = raw.slice(0, 12000)
  const { text } = await generateText({
    model: createModel(modelConf.data),
    temperature: 0.2,
    prompt: `从下面的简历原文中提取信息，只输出一个 JSON 对象，不要 Markdown 或其他文字：
{
  "summary": "200 字以内的第一人称求职摘要，突出技能、年限、行业和代表成果",
  "skills": ["技能1", "技能2"],
  "years": "工作年限，例如 5 年；无法判断则空字符串",
  "projects": ["项目名｜我的职责｜量化成果", "项目名｜我的职责｜量化成果"]
}

要求：
- 只使用简历原文中的事实，禁止编造公司、项目、数字或技能。
- 简历没有的信息留空字符串或空数组。
- summary 要具体，避免“学习能力强”“认真负责”这类空话。

简历原文：
${source}`,
  })

  const parsed = parseGptJson<{
    summary?: unknown
    skills?: unknown
    years?: unknown
    projects?: unknown
  }>(text)
  if (!parsed) throw new Error('模型未返回有效 JSON，请重试或换一个模型')

  const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
  const asList = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  const summary = asText(parsed.summary)
  if (!summary) throw new Error('模型没有提炼出简历摘要，请重试或手动填写')

  return {
    summary,
    skills: asList(parsed.skills).join('、'),
    years: asText(parsed.years),
    projects: asList(parsed.projects).join('\n'),
  }
}
