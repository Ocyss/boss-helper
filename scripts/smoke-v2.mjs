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
const applyingIndexSource = readFileSync(
  resolve(root, 'src', 'composables', 'useApplying', 'index.ts'),
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
const chatModelSource = readFileSync(
  resolve(root, 'src', 'composables', 'useModel', 'chatModel.ts'),
  'utf8',
)
const modelCommonSource = readFileSync(
  resolve(root, 'src', 'composables', 'useModel', 'common.ts'),
  'utf8',
)
const contextSource = readFileSync(
  resolve(root, 'src', 'composables', 'useHelper', 'ctx.ts'),
  'utf8',
)
const configItemSource = readFileSync(
  resolve(root, 'src', 'components', 'Tabs', 'ConfigItem', 'ConfigItem.vue'),
  'utf8',
)
const batchPauseSource = readFileSync(
  resolve(root, 'src', 'components', 'Tabs', 'ConfigItem', 'BatchPause.vue'),
  'utf8',
)
const resumeImageSource = readFileSync(
  resolve(root, 'src', 'components', 'Tabs', 'ConfigItem', 'ResumeImage.vue'),
  'utf8',
)
const confSource = readFileSync(resolve(root, 'src', 'composables', 'conf', 'index.ts'), 'utf8')
const backgroundSource = readFileSync(resolve(root, 'src', 'message', 'background.ts'), 'utf8')
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
assert.ok(infoSource.includes('diagnosticLogging'), '缺少详细诊断日志配置')
assert.ok(infoSource.includes('value: false'), '详细诊断日志默认值必须为 false')
assert.ok(chatModelSource.includes('summarizeModelError'), '模型错误缺少安全分类')
assert.ok(chatModelSource.includes('resolveModelTimeout'), '模型请求缺少统一超时解析')
assert.ok(modelCommonSource.includes('DEFAULT_MODEL_TIMEOUT_MS = 120_000'), '模型默认超时未统一')
assert.ok(contextSource.includes('formatDiagnosticDetails'), '诊断日志缺少白名单脱敏')
assert.ok(applyingIndexSource.includes('pauseTarget'), '缺少投递批次随机长等待阈值')
assert.ok(applyingIndexSource.includes('execution?.published'), '长等待计数缺少实际投递成功门槛')
assert.ok(
  applyingIndexSource.includes('delivered === true'),
  '长等待计数必须只使用实际投递成功结果',
)
assert.ok(batchPauseSource.includes('waitMinSeconds'), '缺少长等待时间范围配置')
assert.ok(configSource.includes("type: 'batchPause'"), '缺少批次长等待配置入口')
assert.ok(configItemSource.includes('BatchPause'), '批次长等待配置组件未挂载')
assert.ok(configItemSource.includes('ResumeImage'), '图片简历配置组件未挂载')
assert.ok(resumeImageSource.includes('counter.setImage'), '图片简历未保存到本机扩展存储')
assert.ok(resumeImageSource.includes('counter.removeImage'), '图片简历缺少本机清除入口')
assert.ok(bossSource.includes('sendResumeImage'), '缺少图片简历发送流程')
assert.ok(bossSource.includes('uploadImage'), '图片简历未复用 BOSS 图片上传链路')
assert.ok(bossSource.includes('iid: uploaded.iid ?? 0'), '图片消息缺少 BOSS 兼容 iid 占位')
assert.ok(
  confSource.includes('data.resumeImage = { ...defaultFormData.resumeImage }'),
  '配置导出不得携带图片引用',
)
assert.ok(backgroundSource.includes('removeImage'), 'background 缺少图片清理能力')

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
