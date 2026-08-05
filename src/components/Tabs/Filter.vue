<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

import Alert from '@/components/Alert.vue'
import { counter } from '@/message'
import { v2StorageKey } from '@/utils/namespace'

/** 当前官方页面中已经验证过的筛选容器契约；不再搬运或猜测节点。 */
const ROOT_SELECTORS = ['.job-recommend-main', '.page-jobs-main', '.job-search-wrapper'] as const

interface FilterControlSnapshot {
  key: string
  value: string
  checked?: boolean
}

interface FilterSnapshot {
  version: 1
  path: string
  city: string
  controls: FilterControlSnapshot[]
  savedAt: string
}

const snapshotKey = computed(() => v2StorageKey(`filter-snapshot-${location.pathname}`))
const status = ref('正在等待 BOSS 原生筛选控件…')
const contractReady = ref(false)
const savedAt = ref('')
const city = ref('')
let observer: MutationObserver | undefined

function getRoots(): HTMLElement[] {
  const roots = ROOT_SELECTORS.flatMap((selector) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector)),
  )
  return Array.from(new Set(roots)).filter((element) => element.offsetParent !== null)
}

function controlKey(element: HTMLElement): string | null {
  const key =
    element.getAttribute('name') ||
    element.getAttribute('data-testid') ||
    element.getAttribute('data-key') ||
    element.getAttribute('id')
  return key?.trim() || null
}

function findContract(): HTMLElement | null {
  const roots = getRoots()
  if (roots.length !== 1) return null
  const controls = Array.from(
    roots[0].querySelectorAll<HTMLElement>(
      'input[name],select[name],textarea[name],[data-testid],[data-key]',
    ),
  )
  // 没有带稳定 key 的控件时不保存/恢复，避免误写 BOSS 页面。
  return controls.length > 0 && controls.every((control) => controlKey(control) !== null)
    ? roots[0]
    : null
}

function readCity(root: HTMLElement): string {
  const urlCity = new URL(location.href).searchParams.get('city')
  if (urlCity) return urlCity
  const cityNode = document.querySelector<HTMLElement>(
    '.filter-city-area .active, .filter-city-area [aria-selected="true"]',
  )
  if (cityNode && root.contains(cityNode)) return cityNode.textContent?.trim() ?? ''
  return ''
}

function captureSnapshot(root: HTMLElement): FilterSnapshot {
  const controls = Array.from(
    root.querySelectorAll<HTMLElement>(
      'input[name],select[name],textarea[name],[data-testid],[data-key]',
    ),
  ).flatMap((element) => {
    const key = controlKey(element)
    if (!key) return []
    const input = element as HTMLInputElement
    return [
      { key, value: input.value ?? element.textContent?.trim() ?? '', checked: input.checked },
    ]
  })
  return {
    version: 1,
    path: location.pathname,
    city: readCity(root),
    controls,
    savedAt: new Date().toISOString(),
  }
}

async function saveSnapshot() {
  const root = findContract()
  if (!root) {
    status.value = '无法识别 BOSS 筛选结构，已停止保存'
    contractReady.value = false
    return
  }
  try {
    const snapshot = captureSnapshot(root)
    await counter.storageSet(snapshotKey.value, snapshot)
    city.value = snapshot.city
    savedAt.value = snapshot.savedAt
    status.value = '筛选状态已保存（不会搬运原生节点）'
  } catch {
    status.value = '筛选状态保存失败，已停止操作'
  }
}

async function restoreSnapshot() {
  const root = findContract()
  let snapshot: FilterSnapshot | null = null
  try {
    snapshot = await counter.storageGet<FilterSnapshot | null>(snapshotKey.value, null)
  } catch {
    status.value = '筛选状态读取失败，已停止恢复'
    return
  }
  if (!root || !snapshot || snapshot.version !== 1 || snapshot.path !== location.pathname) {
    status.value = '无法识别页面结构或没有可恢复的筛选状态，已停止恢复'
    contractReady.value = false
    return
  }
  const controls = new Map(
    Array.from(
      root.querySelectorAll<HTMLElement>(
        'input[name],select[name],textarea[name],[data-testid],[data-key]',
      ),
    ).flatMap((element) => {
      const key = controlKey(element)
      return key ? [[key, element] as const] : []
    }),
  )
  for (const item of snapshot.controls) {
    const element = controls.get(item.key)
    if (!element) continue
    const input = element as HTMLInputElement
    if ('value' in input && item.value !== undefined) input.value = item.value
    if (typeof item.checked === 'boolean' && 'checked' in input) input.checked = item.checked
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }
  city.value = snapshot.city
  savedAt.value = snapshot.savedAt
  status.value = '筛选状态已恢复；请确认城市和条件后再搜索'
}

async function clearSnapshot() {
  try {
    await counter.storageRm(snapshotKey.value)
    city.value = ''
    savedAt.value = ''
    status.value = '已清除 V2 保存的筛选状态'
  } catch {
    status.value = '筛选状态清除失败'
  }
}

function checkContract() {
  contractReady.value = findContract() !== null
  if (contractReady.value) {
    status.value = '已识别 BOSS 原生筛选控件，可保存/恢复'
  }
}

onMounted(() => {
  checkContract()
  observer = new MutationObserver(checkContract)
  observer.observe(document.body, { childList: true, subtree: true })
})

onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div class="flex flex-col gap-2">
    <Alert
      id="tabs-filter-v2"
      :description="status"
      :color="contractReady ? 'success' : 'warning'"
      show-icon
    />
    <div class="flex flex-wrap items-center gap-2">
      <UButton size="sm" :disabled="!contractReady" @click="saveSnapshot">保存当前筛选</UButton>
      <UButton size="sm" variant="outline" :disabled="!contractReady" @click="restoreSnapshot">
        恢复筛选
      </UButton>
      <UButton size="sm" color="warning" variant="ghost" @click="clearSnapshot"
        >清除保存状态</UButton
      >
      <span v-if="city" class="text-xs text-gray-500">城市：{{ city }}</span>
      <span v-if="savedAt" class="text-xs text-gray-400"
        >保存于：{{ new Date(savedAt).toLocaleString() }}</span
      >
    </div>
    <p class="text-xs text-gray-500">
      V2 只读取带稳定属性的原生控件并触发 input/change；结构不匹配时 fail-closed，不猜选择器。
    </p>
  </div>
</template>
