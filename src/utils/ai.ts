import { ALL, parse } from 'partial-json'

function extractJsonObject(value: string): string | null {
  const start = value.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < value.length; index++) {
    const char = value[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return value.slice(start, index + 1)
  }
  return value.slice(start)
}

export function parseGptJson<T = any>(json: string): Partial<T> | null {
  const source = json.trim().replace(/^\uFEFF/, '')
  const candidates = new Set<string>([source])
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    candidates.add(match[1].trim())
  }
  for (const candidate of Array.from(candidates)) {
    const object = extractJsonObject(candidate)
    if (object) candidates.add(object)
  }

  for (const candidate of candidates) {
    try {
      const result = JSON.parse(candidate)
      if (result && typeof result === 'object' && !Array.isArray(result)) return result
    } catch {
      try {
        const result = parse(candidate, ALL)
        if (result && typeof result === 'object' && !Array.isArray(result)) return result
      } catch {
        // Try the next JSON candidate.
      }
    }
  }
  return null
}

export function renderTemplate(template: string, data: any): string {
  if (!template) return ''

  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
    const value = path.split('.').reduce((acc: any, key: string) => {
      if (acc && typeof acc === 'object') {
        const target = '__v_isRef' in acc ? acc.value : acc
        return target?.[key]
      }
      return undefined
    }, data)

    return value !== undefined && value !== null ? String(value) : ''
  })
}
