export function exportJson(data: object, name: string) {
  const blob = new Blob([JSON.stringify(data)], {
    type: 'application/json',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${name}.json`
  link.click()
}

export async function importJson<T = any>(): Promise<T> {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  return new Promise((resolve) => {
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !file.name.endsWith('.json')) {
        return alert('不是 JSON 文件')
      }

      const reader = new FileReader()
      reader.onload = async function (e) {
        try {
          const jsonData: T = JSON.parse(e.target!.result as string)

          const type = Object.prototype.toString.call(jsonData).slice(8, -1)
          if (!['Array', 'Object'].includes(type)) {
            return alert('内容非合法 JSON')
          }
          resolve(jsonData)
        } catch (error: any) {
          return alert(`内容非合法 JSON, ${error.message}`)
        }
      }
      reader.readAsText(file)
    })

    fileInput.click()
  })
}
