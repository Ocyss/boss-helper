import type { BossReplyKnowledgeItem } from '@/types/aiReply'

export const BOSS_REPLY_MARKDOWN_MAX_BYTES = 256 * 1024
export const BOSS_REPLY_MARKDOWN_MAX_KNOWLEDGE_ITEMS = 50
export const BOSS_REPLY_MARKDOWN_MAX_TITLE_LENGTH = 100
export const BOSS_REPLY_MARKDOWN_MAX_CONTENT_LENGTH = 2000

export interface BossReplyMarkdownImport {
  systemPrompt: string
  userPrompt: string
  knowledge: BossReplyKnowledgeItem[]
}

type ImportSection = 'systemPrompt' | 'userPrompt' | 'knowledge'

interface MarkdownFence {
  marker: '`' | '~'
  length: number
}

const SECTION_NAMES: Record<string, ImportSection> = {
  系统提示词: 'systemPrompt',
  调用载荷建议: 'userPrompt',
  小型已确认知识库: 'knowledge',
}

function getTextLength(value: string): number {
  return Array.from(value).length
}

function parseFence(line: string): MarkdownFence | undefined {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/)
  if (!match?.[1]) return
  return {
    marker: match[1][0] as '`' | '~',
    length: match[1].length,
  }
}

function isFenceEnd(line: string, fence: MarkdownFence): boolean {
  const escapedMarker = fence.marker === '`' ? '`' : '~'
  return new RegExp(`^ {0,3}${escapedMarker}{${fence.length},}\\s*$`).test(line)
}

/** 只在代码围栏外识别二级章节，避免提示词正文中的 Markdown 被误拆分。 */
function splitImportSections(markdown: string): Record<ImportSection, string> {
  const sections: Record<ImportSection, string[]> = {
    systemPrompt: [],
    userPrompt: [],
    knowledge: [],
  }
  let currentSection: ImportSection | undefined
  let fence: MarkdownFence | undefined

  for (const line of markdown.split('\n')) {
    if (fence) {
      if (currentSection) sections[currentSection].push(line)
      if (isFenceEnd(line, fence)) fence = undefined
      continue
    }

    const openingFence = parseFence(line)
    if (openingFence) {
      fence = openingFence
      if (currentSection) sections[currentSection].push(line)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      const level = heading[1]?.length ?? 0
      const title = heading[2]?.trim().replace(/\s+/g, '') ?? ''
      if (level <= 2) {
        currentSection = level === 2 ? SECTION_NAMES[title] : undefined
        continue
      }
    }

    if (currentSection) sections[currentSection].push(line)
  }

  if (fence) throw new Error('Markdown 中存在未闭合的代码围栏')

  return {
    systemPrompt: sections.systemPrompt.join('\n').trim(),
    userPrompt: sections.userPrompt.join('\n').trim(),
    knowledge: sections.knowledge.join('\n').trim(),
  }
}

function unwrapFirstFence(section: string): string {
  const lines = section.split('\n')
  let fence: MarkdownFence | undefined
  const content: string[] = []

  for (const line of lines) {
    if (!fence) {
      const openingFence = parseFence(line)
      if (!openingFence) continue
      fence = openingFence
      continue
    }
    if (isFenceEnd(line, fence)) return content.join('\n').trim()
    content.push(line)
  }

  return section.trim()
}

function parseKnowledge(section: string): BossReplyKnowledgeItem[] {
  if (!section) return []

  const content = unwrapFirstFence(section)
  const items: BossReplyKnowledgeItem[] = []
  const ids = new Set<string>()
  let current: { id: string; title: string; content: string[] } | undefined

  const pushCurrent = () => {
    if (!current) return
    const itemContent = current.content.join('\n').trim()
    if (!itemContent) throw new Error(`[${current.id}] “${current.title}”缺少知识正文`)
    if (getTextLength(itemContent) > BOSS_REPLY_MARKDOWN_MAX_CONTENT_LENGTH) {
      throw new Error(
        `[${current.id}] 正文超过 ${BOSS_REPLY_MARKDOWN_MAX_CONTENT_LENGTH} 个字符`,
      )
    }
    items.push({
      id: current.id,
      title: current.title,
      content: itemContent,
      keywords: [],
      enabled: true,
      confirmed: false,
    })
  }

  for (const line of content.split('\n')) {
    const marker = line.match(/^\s*\[(K\d{2,})\]\s+(.+?)\s*$/i)
    if (!marker) {
      if (current) current.content.push(line)
      continue
    }

    pushCurrent()
    const id = marker[1]!.toUpperCase()
    const title = marker[2]!.trim()
    if (ids.has(id)) throw new Error(`知识库存在重复 ID：[${id}]`)
    if (getTextLength(title) > BOSS_REPLY_MARKDOWN_MAX_TITLE_LENGTH) {
      throw new Error(`[${id}] 标题超过 ${BOSS_REPLY_MARKDOWN_MAX_TITLE_LENGTH} 个字符`)
    }
    ids.add(id)
    current = { id, title, content: [] }
  }
  pushCurrent()

  if (items.length === 0) {
    throw new Error('“小型已确认知识库”章节中未找到“[K01] 标题”格式的知识卡片')
  }
  if (items.length > BOSS_REPLY_MARKDOWN_MAX_KNOWLEDGE_ITEMS) {
    throw new Error(`知识卡片超过 ${BOSS_REPLY_MARKDOWN_MAX_KNOWLEDGE_ITEMS} 条`)
  }
  return items
}

export function parseBossReplyMarkdown(markdown: string): BossReplyMarkdownImport {
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const byteLength = new TextEncoder().encode(normalized).byteLength
  if (byteLength > BOSS_REPLY_MARKDOWN_MAX_BYTES) {
    throw new Error(`Markdown 文件不能超过 ${BOSS_REPLY_MARKDOWN_MAX_BYTES / 1024} KiB`)
  }

  const sections = splitImportSections(normalized)
  const systemPrompt = sections.systemPrompt ? unwrapFirstFence(sections.systemPrompt) : ''
  const userPrompt = sections.userPrompt ? unwrapFirstFence(sections.userPrompt) : ''
  const knowledge = parseKnowledge(sections.knowledge)

  if (!systemPrompt && !userPrompt && knowledge.length === 0) {
    throw new Error('未找到系统提示词、调用载荷建议或小型已确认知识库章节')
  }

  return { systemPrompt, userPrompt, knowledge }
}
