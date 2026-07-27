import SparkMD5 from 'spark-md5'

export function calculateFileMD5(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      if (!e.target?.result) {
        reject(new Error('Failed to read file'))
        return
      }
      const fileMd5 = SparkMD5.ArrayBuffer.hash(e.target.result as ArrayBuffer)
      resolve(fileMd5)
    }

    reader.onerror = (e) => reject(e)
    reader.readAsArrayBuffer(file)
  })
}
