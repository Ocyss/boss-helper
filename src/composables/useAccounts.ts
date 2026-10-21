import { computed, ref } from 'vue'

import { counter } from '@/message'
import { jsonClone } from '@/utils/deepmerge'

export interface Account {
  value: string
  label: string
  preset: string
}
const accounts = ref<Account[]>([{ value: 'default', label: '默认账号', preset: 'default' }])
const activeAccount = ref('default')
const accountsKey = 'local:HelperAccounts'
const activeKey = 'local:HelperAccount'
async function persist() {
  await counter.storageSet(accountsKey, jsonClone(accounts.value))
  await counter.storageSet(activeKey, activeAccount.value)
}
export function useAccounts() {
  async function init() {
    accounts.value = await counter.storageGet(accountsKey, [
      { value: 'default', label: '默认账号', preset: 'default' },
    ])
    const active = await counter.storageGet(activeKey, 'default')
    activeAccount.value = accounts.value.some((a) => a.value === active) ? active : 'default'
  }
  async function createAccount(label: string, preset: string) {
    accounts.value.push({ value: crypto.randomUUID(), label, preset })
    await persist()
  }
  async function deleteAccount(value: string) {
    if (value === 'default') return
    accounts.value = accounts.value.filter((a) => a.value !== value)
    if (activeAccount.value === value) activeAccount.value = 'default'
    await persist()
  }
  async function setDefaultPreset(value: string, preset: string) {
    const account = accounts.value.find((a) => a.value === value)
    if (!account) return
    account.preset = preset
    await persist()
  }
  async function selectAccount(value: string) {
    if (!accounts.value.some((a) => a.value === value)) throw new Error('账号不存在')
    await counter.storageSet(activeKey, value)
    activeAccount.value = value
  }
  return {
    accounts,
    activeAccount,
    currentAccount: computed(() => accounts.value.find((a) => a.value === activeAccount.value)),
    init,
    createAccount,
    deleteAccount,
    setDefaultPreset,
    selectAccount,
  }
}
