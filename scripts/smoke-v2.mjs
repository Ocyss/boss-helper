import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, '.output', 'chrome-mv3')
const zip = resolve(root, 'boss-helper-v2-0.6.0.zip')

assert.ok(existsSync(resolve(output, 'manifest.json')), '构建目录缺少 manifest.json')
const manifest = JSON.parse(readFileSync(resolve(output, 'manifest.json'), 'utf8'))
assert.equal(manifest.manifest_version, 3)
assert.equal(manifest.version, '0.6.0')
assert.ok(
  typeof manifest.key === 'string' && manifest.key.length > 100,
  'V2 必须使用独立 Manifest 公钥',
)
assert.ok(!manifest.permissions?.includes('cookies'), 'V2 不应申请 chrome.cookies 权限')
assert.ok(
  manifest.content_scripts.some((item) => item.js?.some((file) => file.includes('chat-monitor'))),
)
assert.ok(existsSync(zip), '根目录缺少交付 ZIP')

const entries = execFileSync('tar', ['-tf', zip], { encoding: 'utf8' }).split(/\r?\n/u)
assert.ok(entries.includes('manifest.json'), 'ZIP 根目录缺少 manifest.json')
assert.ok(!entries.some((entry) => entry.includes('node_modules')), 'ZIP 不应包含 node_modules')

const applyingSource = readFileSync(
  resolve(root, 'src', 'composables', 'useApplying', 'handles.ts'),
  'utf8',
)
const bossSource = readFileSync(resolve(root, 'src', 'entrypoints', 'boss', 'index.ts'), 'utf8')
assert.ok(!applyingSource.includes('sendMessage?.('), '招呼任务不应调用发送方法')
assert.ok(!bossSource.includes("publish('chat'"), 'V2 不应发布 BOSS 聊天消息')

const profile = JSON.parse(readFileSync(resolve(root, 'candidate-profile.example.json'), 'utf8'))
for (const key of [
  'schema_version',
  'target_roles',
  'location',
  'resume_summary',
  'skills_with_evidence',
  'availability_policy',
  'salary_policy',
  'contact_policy',
  'reply_style',
]) {
  assert.ok(key in profile, `画像示例缺少 ${key}`)
}

console.log('Boss Helper V2 smoke checks passed: manifest, ZIP root and profile schema.')
