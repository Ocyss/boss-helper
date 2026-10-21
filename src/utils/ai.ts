import { ALL, parse } from 'partial-json'

export function parseGptJson<T = any>(json: string): Partial<T> | null {
  const match = json.match(/```json(.+?)```/s)
  if (match && match[1]) {
    json = match[1]
  }
  try {
    return parse(json, ALL)
  } catch {
    return null
  }
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
