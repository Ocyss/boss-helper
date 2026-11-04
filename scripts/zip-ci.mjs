import { zip } from 'wxt'

const browser = process.argv[2]
if (!['chrome', 'firefox', 'edge'].includes(browser)) {
  console.error('Usage: node scripts/zip-ci.mjs <chrome|firefox|edge>')
  process.exit(1)
}

try {
  await zip({ browser, manifestVersion: 3 })
  // Build workers can keep MessagePorts alive after WXT has finished writing the ZIP.
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
