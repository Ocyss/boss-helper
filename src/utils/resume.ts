import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'

// oxlint-disable-next-line import/default -- Vite converts this worker query to a URL during build.
import pdfWorkerPath from 'pdfjs-dist/legacy/build/pdf.worker.mjs?worker&url'

const maxResumeBytes = 5 * 1024 * 1024
const maxResumeChars = 120_000

function resolvePdfWorkerUrl() {
  if (typeof document === 'undefined') return pdfWorkerPath
  const scriptUrl =
    (document.currentScript instanceof HTMLScriptElement
      ? document.currentScript.src
      : undefined) ??
    Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).find((script) =>
      script.src.endsWith('/boss.js'),
    )?.src
  return scriptUrl ? new URL(pdfWorkerPath, scriptUrl).href : pdfWorkerPath
}

function normalizeText(text: string): string {
  return text
    .replaceAll(String.fromCharCode(0), '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxResumeChars)
}

function fileExtension(file: File): string {
  const match = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] ?? ''
}

function readZipEntry(bytes: Uint8Array, name: string): { compression: number; data: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const centralDirectorySignature = 0x02014b50

  for (let offset = 0; offset <= bytes.length - 46; offset++) {
    if (view.getUint32(offset, true) !== centralDirectorySignature) continue

    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const entryName = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength))
    if (entryName !== name) {
      offset += 46 + nameLength + extraLength + commentLength - 1
      continue
    }

    const compression = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const localHeaderOffset = view.getUint32(offset + 42, true)
    const localNameLength = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true)
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength

    return {
      compression,
      data: bytes.slice(dataOffset, dataOffset + compressedSize),
    }
  }

  throw new Error('文档中未找到简历正文')
}

async function decompress(
  data: Uint8Array,
  format: 'deflate' | 'deflate-raw',
): Promise<Uint8Array> {
  if (!('DecompressionStream' in globalThis)) {
    throw new Error('当前浏览器不支持该文件格式，请将简历另存为 TXT 后上传')
  }
  const copiedData = new Uint8Array(data.byteLength)
  copiedData.set(data)
  const stream = new Blob([copiedData]).stream().pipeThrough(new DecompressionStream(format))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function extractDocxText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const entry = readZipEntry(bytes, 'word/document.xml')
  const xmlBytes =
    entry.compression === 0 ? entry.data : await decompress(entry.data, 'deflate-raw')
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('无法读取 DOCX 正文')
  }

  return Array.from(doc.getElementsByTagName('w:p'))
    .map((paragraph) =>
      Array.from(paragraph.getElementsByTagName('w:t'))
        .map((node) => node.textContent ?? '')
        .join(''),
    )
    .filter(Boolean)
    .join('\n')
}

async function extractPdfText(file: File): Promise<string> {
  GlobalWorkerOptions.workerSrc = resolvePdfWorkerUrl()
  const loadingTask = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useWorkerFetch: false,
  })
  try {
    const pdf = await loadingTask.promise
    const pages = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, index) => {
        const page = await pdf.getPage(index + 1)
        const content = await page.getTextContent()
        return content.items
          .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ''}` : ''))
          .join('')
      }),
    )
    const text = normalizeText(pages.join('\n'))
    if (text.length < 30) {
      throw new Error('PDF 未包含可提取文本，请上传可复制文字的 PDF、DOCX 或 TXT 简历')
    }
    return text
  } catch (error) {
    if (error instanceof Error && error.message.includes('PDF 未包含可提取文本')) {
      throw error
    }
    throw new Error('无法读取 PDF 文本，请上传可复制文字的 PDF、DOCX 或 TXT 简历')
  } finally {
    await loadingTask.destroy()
  }
}

export async function extractResumeText(file: File): Promise<string> {
  if (file.size === 0) throw new Error('简历文件为空')
  if (file.size > maxResumeBytes) throw new Error('简历文件不能超过 5 MB')

  const extension = fileExtension(file)
  let text: string
  if (['txt', 'md', 'json', 'csv'].includes(extension)) {
    text = await file.text()
  } else if (extension === 'docx') {
    text = await extractDocxText(file)
  } else if (extension === 'pdf') {
    text = await extractPdfText(file)
  } else {
    throw new Error('仅支持 TXT、MD、DOCX 和含可选文本的 PDF 简历')
  }

  text = normalizeText(text)
  if (text.length < 30) throw new Error('未从简历中提取到足够文本，请检查文件内容')
  return text
}
