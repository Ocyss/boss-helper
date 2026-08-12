import { BackgroundCounter } from '@/message/background'

import './style.css'

const api = new BackgroundCounter()

function element<T extends HTMLElement>(id: string): T {
  const target = document.getElementById(id)
  if (!target) throw new Error(`未找到页面元素：${id}`)
  return target as T
}

const appIdInput = element<HTMLInputElement>('app-id')
const appSecretInput = element<HTMLInputElement>('app-secret')
const redirectUrlInput = element<HTMLInputElement>('redirect-url')
const boundTargetElement = element<HTMLDivElement>('bound-target')
const copyRedirectButton = element<HTMLButtonElement>('copy-redirect')
const saveButton = element<HTMLButtonElement>('save')
const bindButton = element<HTMLButtonElement>('bind')
const testButton = element<HTMLButtonElement>('test')
const statusElement = element<HTMLDivElement>('status')

function setBusy(busy: boolean): void {
  copyRedirectButton.disabled = busy
  saveButton.disabled = busy
  bindButton.disabled = busy
  testButton.disabled = busy
}

function setStatus(message: string, kind: 'default' | 'success' | 'error' = 'default'): void {
  statusElement.textContent = message
  statusElement.dataset.kind = kind
}

function updateBoundTarget(bound: boolean, targetName: string): void {
  boundTargetElement.textContent = bound
    ? `已绑定当前飞书账号${targetName ? `：${targetName}` : ''}`
    : '尚未绑定飞书账号'
  boundTargetElement.dataset.kind = bound ? 'success' : 'default'
}

async function saveConfig(): Promise<void> {
  const config = await api.configureFeishuNotification({
    appId: appIdInput.value,
    appSecret: appSecretInput.value,
  })
  appSecretInput.value = ''
  appSecretInput.placeholder = config.appSecretConfigured
    ? '已保存；留空则保留原密钥'
    : '请输入智能体应用 App Secret'
  updateBoundTarget(config.bound, config.targetName)
}

async function loadConfig(): Promise<void> {
  setBusy(true)
  try {
    const [config, bindingInfo] = await Promise.all([
      api.getFeishuNotificationConfig(),
      api.getFeishuBindingInfo(),
    ])
    appIdInput.value = config.appId
    redirectUrlInput.value = bindingInfo.redirectUrl
    appSecretInput.placeholder = config.appSecretConfigured
      ? '已保存；留空则保留原密钥'
      : '请输入智能体应用 App Secret'
    updateBoundTarget(config.bound, config.targetName)
    setStatus(
      config.bound
        ? '飞书应用与当前账号已绑定，可以发送测试消息。'
        : '请先在飞书开放平台配置回调地址，再保存密钥并绑定当前账号。',
      config.bound ? 'success' : 'default',
    )
  } catch (error) {
    setStatus(`读取失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    setBusy(false)
  }
}

copyRedirectButton.addEventListener('click', () => {
  void (async () => {
    try {
      await navigator.clipboard.writeText(redirectUrlInput.value)
      setStatus('回调地址已复制。', 'success')
    } catch (error) {
      setStatus(`复制失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  })()
})

saveButton.addEventListener('click', () => {
  void (async () => {
    setBusy(true)
    try {
      await saveConfig()
      setStatus('飞书应用密钥已保存。', 'success')
    } catch (error) {
      setStatus(`保存失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      setBusy(false)
    }
  })()
})

bindButton.addEventListener('click', () => {
  void (async () => {
    setBusy(true)
    try {
      await saveConfig()
      const config = await api.bindFeishuNotification()
      updateBoundTarget(config.bound, config.targetName)
      setStatus('当前飞书账号绑定成功。', 'success')
    } catch (error) {
      setStatus(`绑定失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      setBusy(false)
    }
  })()
})

testButton.addEventListener('click', () => {
  void (async () => {
    setBusy(true)
    try {
      await saveConfig()
      await api.testFeishuNotification()
      setStatus('测试消息已发送，请检查飞书。', 'success')
    } catch (error) {
      setStatus(`测试失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      setBusy(false)
    }
  })()
})

void loadConfig()
