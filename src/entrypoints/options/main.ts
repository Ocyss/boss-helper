import type { FeishuReceiveIdType } from '@/types/aiReply'
import { BackgroundCounter } from '@/message/background'

import './style.css'

const api = new BackgroundCounter()

function element<T extends HTMLElement>(id: string): T {
  const target = document.getElementById(id)
  if (!target) throw new Error(`未找到页面元素：${id}`)
  return target as T
}

const enabledInput = element<HTMLInputElement>('enabled')
const appIdInput = element<HTMLInputElement>('app-id')
const appSecretInput = element<HTMLInputElement>('app-secret')
const receiveIdTypeInput = element<HTMLSelectElement>('receive-id-type')
const receiveIdInput = element<HTMLInputElement>('receive-id')
const saveButton = element<HTMLButtonElement>('save')
const testButton = element<HTMLButtonElement>('test')
const statusElement = element<HTMLDivElement>('status')

function setBusy(busy: boolean): void {
  saveButton.disabled = busy
  testButton.disabled = busy
}

function setStatus(message: string, kind: 'default' | 'success' | 'error' = 'default'): void {
  statusElement.textContent = message
  statusElement.dataset.kind = kind
}

function syncReceiveIdPlaceholder(): void {
  receiveIdInput.placeholder =
    receiveIdTypeInput.value === 'open_id' ? 'ou_xxx' : 'oc_xxx'
}

async function saveConfig(forceEnabled?: boolean): Promise<void> {
  const config = await api.configureFeishuNotification({
    enabled: forceEnabled ?? enabledInput.checked,
    appId: appIdInput.value,
    appSecret: appSecretInput.value,
    receiveIdType: receiveIdTypeInput.value as FeishuReceiveIdType,
    receiveId: receiveIdInput.value,
  })
  enabledInput.checked = config.enabled
  appSecretInput.value = ''
  appSecretInput.placeholder = config.appSecretConfigured
    ? '已保存；留空则保留原密钥'
    : '请输入智能体应用 App Secret'
}

async function loadConfig(): Promise<void> {
  setBusy(true)
  try {
    const config = await api.getFeishuNotificationConfig()
    enabledInput.checked = config.enabled
    appIdInput.value = config.appId
    receiveIdTypeInput.value = config.receiveIdType
    receiveIdInput.value = config.receiveId
    appSecretInput.placeholder = config.appSecretConfigured
      ? '已保存；留空则保留原密钥'
      : '请输入智能体应用 App Secret'
    syncReceiveIdPlaceholder()
    setStatus(config.appSecretConfigured ? '已读取配置，App Secret 已保存。' : '尚未保存 App Secret。')
  } catch (error) {
    setStatus(`读取失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    setBusy(false)
  }
}

receiveIdTypeInput.addEventListener('change', syncReceiveIdPlaceholder)

saveButton.addEventListener('click', () => {
  void (async () => {
    setBusy(true)
    try {
      await saveConfig()
      setStatus('飞书通知配置已保存。', 'success')
    } catch (error) {
      setStatus(`保存失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      setBusy(false)
    }
  })()
})

testButton.addEventListener('click', () => {
  void (async () => {
    setBusy(true)
    try {
      await saveConfig(true)
      await api.testFeishuNotification()
      setStatus('测试消息已发送，请检查飞书。', 'success')
    } catch (error) {
      setStatus(
        `测试失败：${error instanceof Error ? error.message : String(error)}`,
        'error',
      )
    } finally {
      setBusy(false)
    }
  })()
})

void loadConfig()
