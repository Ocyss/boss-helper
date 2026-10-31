<script setup lang="ts">
import { useConf } from '@/composables/conf'
import { useAccounts } from '@/composables/useAccounts'
import { counter } from '@/message'
import { jsonClone } from '@/utils/deepmerge'

const props = defineProps<{
  busy: boolean
  manage: (action: () => Promise<unknown> | unknown, reload?: boolean) => Promise<void>
}>()
const formDataPresets = defineModel<{ label: string; value: string }[]>({
  required: true,
})
const conf = useConf()
const {
  accounts,
  activeAccount,
  init,
  createAccount: addAccount,
  deleteAccount: removeAccount,
  setDefaultPreset: updateDefaultPreset,
} = useAccounts()
const toast = useToast()
const presetsKey = 'local:FormDataPreses'

async function createPreset() {
  const label = window.prompt('新预设名称')?.trim()
  if (!label) return
  await props.manage(async () => {
    const presets = [...formDataPresets.value, { label, value: Date.now().toString() }]
    await counter.storageSet(presetsKey, jsonClone(presets))
    formDataPresets.value = presets
    toast.add({ title: '预设创建成功', color: 'success' })
  }, false)
}

async function deletePreset(value: string, label: string) {
  if (value === 'default' || !window.confirm(`确定删除预设“${label}”？`)) return
  await props.manage(async () => {
    await init()
    for (const account of accounts.value) {
      if (account.preset === value) await updateDefaultPreset(account.value, 'default')
    }
    const presets = formDataPresets.value.filter((item) => item.value !== value)
    await counter.storageSet(presetsKey, jsonClone(presets))
    formDataPresets.value = presets
    // An empty slot prevents deleted configuration from being reused.
    await counter.storageSet(`local:web-geek-job-FormData-${value}`, {})
    if (conf.formDataPreset.value === value) await conf.switchPreset('default')
  })
}

async function createAccount() {
  const label = window.prompt('新账号名称')?.trim()
  if (!label) return
  await props.manage(() => addAccount(label, conf.formDataPreset.value))
}

async function deleteAccount(value: string, label: string) {
  if (value === 'default' || !window.confirm(`确定删除账号“${label}”？`)) return
  await props.manage(() => removeAccount(value))
}

async function setDefaultPreset(value: string, preset: string) {
  if (accounts.value.find((account) => account.value === value)?.preset === preset) return
  await props.manage(() => updateDefaultPreset(value, preset))
}
</script>

<template>
  <div class="space-y-5">
    <p class="text-sm text-muted">
      管理操作即时保存；默认预设和默认账号不可删除。
      <br /><br />不可多账号同时运行!!<br />不可多账号同时运行!!
    </p>
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-semibold text-xl">预设管理</h2>
          <UButton label="创建预设" icon="i-lucide-plus" :disabled="busy" @click="createPreset()" />
        </div>
      </template>
      <div class="divide-y divide-default">
        <div
          v-for="preset in formDataPresets"
          :key="preset.value"
          class="flex items-center justify-between gap-3 py-3"
        >
          <span class="min-w-0 wrap-break-words">{{ preset.label }}</span>
          <UButton
            label="删除"
            color="error"
            variant="ghost"
            :disabled="busy || preset.value === 'default'"
            @click="deletePreset(preset.value, preset.label)"
          />
        </div>
      </div>
    </UCard>
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-semibold text-xl">账号管理</h2>
          <UButton
            label="创建账号"
            icon="i-lucide-plus"
            :disabled="busy"
            @click="createAccount()"
          />
        </div>
      </template>
      <div class="divide-y divide-default">
        <div
          v-for="account in accounts"
          :key="account.value"
          class="flex flex-wrap items-center gap-3 py-3"
        >
          <span class="min-w-0 flex-1 wrap-break-wor">{{ account.label }}</span>
          <UBadge v-if="account.value === activeAccount" color="neutral" variant="soft"
            >当前账号</UBadge
          >
          <USelect
            :model-value="account.preset"
            :items="formDataPresets"
            :aria-label="`${account.label}的默认预设`"
            :disabled="busy"
            class="w-48"
            @update:model-value="setDefaultPreset(account.value, $event)"
          />
          <UButton
            label="删除"
            color="error"
            variant="ghost"
            :disabled="busy || account.value === 'default'"
            @click="deleteAccount(account.value, account.label)"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
