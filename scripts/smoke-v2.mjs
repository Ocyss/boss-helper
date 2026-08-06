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
const appSource = readFileSync(resolve(root, 'src', 'App.vue'), 'utf8')
const filterSource = readFileSync(resolve(root, 'src', 'components', 'Tabs', 'Filter.vue'), 'utf8')
const configSource = readFileSync(resolve(root, 'src', 'entrypoints', 'boss', 'index.ts'), 'utf8')
const deliverySource = readFileSync(
  resolve(root, 'src', 'entrypoints', 'boss', 'delivery.ts'),
  'utf8',
)
const infoSource = readFileSync(resolve(root, 'src', 'composables', 'conf', 'info.ts'), 'utf8')
const filteringUtilsSource = readFileSync(
  resolve(root, 'src', 'composables', 'useApplying', 'utils.ts'),
  'utf8',
)
assert.ok(applyingSource.includes('autoDelivery.value'), '招呼任务缺少自动投递开关保护')
assert.ok(bossSource.includes("publish('chat'"), '自动投递缺少 BOSS 聊天发送通道')
assert.ok(
  bossSource.includes('if (!this.conf.formData.autoDelivery.value)'),
  'BOSS 聊天发送未默认关闭',
)
// UI 约束：筛选页只能定位官方控件，关于/赞赏入口必须从交付包中移除。
assert.ok(filterSource.includes('focusNativeFilter'), '筛选页缺少官方控件定位入口')
assert.ok(!appSource.includes('About.vue'), 'V2 不应挂载关于/赞赏页面')
assert.ok(
  !existsSync(resolve(root, 'src', 'components', 'Tabs', 'About.vue')),
  '关于页面组件未删除',
)
assert.ok(configSource.includes('autoDelivery'), '缺少默认关闭的自动投递配置入口')
assert.ok(
  /autoDelivery:\s*\{[\s\S]*?value:\s*false/u.test(infoSource),
  '自动投递默认值必须为 false',
)
assert.ok(deliverySource.includes('autoDelivery.value'), '岗位投递未受自动投递开关保护')
assert.ok(filteringUtilsSource.includes('normalizeFilteringVerdict'), 'AI 结论归一化缺失')

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
