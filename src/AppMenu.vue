<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'

import Log from '@/components/Menu/Log.vue'
import Store from '@/components/Menu/Store.vue'
import Version from '@/components/Menu/Version.vue'
import { counter } from '@/message'
import { logger } from '@/utils/logger'

const toast = useToast()

const confs = {
  store: { name: '存储配置', component: Store, disabled: true },
  log: { name: '日志配置', component: Log, disabled: true },
  version: { name: '版本信息', component: Version, disabled: false },
}

const overlay = useOverlay()

const dropdownItems = computed(() => [
  [{ label: 'BossHelp配置项' }],
  Object.entries(confs).map(([_, v]) => ({
    label: v.name,
    disabled: v.disabled,
    onSelect: () => {
      overlay
        .create(v.component, {
          destroyOnClose: true,
        })
        .open()
    },
  })),
])

const protocolShow = ref(false)
const protocol = 'boss-protocol'
const protocolVal = '2026/05/24'

function onProtocol() {
  counter.storageSet(protocol, protocolVal)
  protocolShow.value = false
}

onMounted(async () => {
  logger.info('BossHelper挂载成功')
  toast.add({
    description: 'BossHelper挂载成功!',
    duration: 2000,
  })

  const protocolDate = await counter.storageGet<string>(protocol)
  protocolShow.value = protocolDate !== protocolVal
})

const container = ref<HTMLDivElement>()
</script>

<template>
  <div ref="container" class="fixed top-18 right-10 z-999">
    <UApp :portal="container" :toaster="{ position: 'top-right', ui: { viewport: 'z-100000' } }">
      <UDropdownMenu :items="dropdownItems">
        <UAvatar
          size="xs"
          src="https://avatars.githubusercontent.com/u/68412205?v=4"
          alt="H"
          class="border-2 border-amber-50 hover:border-amber-200 cursor-pointer"
        />
      </UDropdownMenu>
      <UModal v-model:open="protocolShow">
        <template #body>
          1. 使用前先好好了解项目，阅读每一个标签和帮助
          <br />
          2. 暂时不维护文档，如果帮助还无法理解可以提交反馈, 会优化文案
          <br />
          3. 遇到bug即时反馈，不再维护交流群，遇到问题GitHub反馈(优先)或者飞书表格
          <br />
          4. 帮助复选框 能随时进入和退出帮助模式, 配置内容较多, 好好观看
          <br />
          5. 配置最前面需要打钩启用，启用后需要保存配置
          <br />
          6. 配置项 包含/排除 能点击切换模式
          <br />
          7.
          投递在达到上限，或者页面无法滚动时会结束投递，反馈相关问题检查是否滚动到底了，无法刷出新岗位!
          <br />
          8. 不再维护暗黑模式, 可改用
          <ULink to="https://darkreader.org" target="_blank"> darkreader 扩展 </ULink>
          实现(会帮忙兼容)
          <br />
          9. 不再维护多账号模式, 改为多配置切换, 多个账号的切换自行管理
          <br />
          本项目仅供学习交流，禁止用于商业用途
          <br />
          使用该脚本有一定风险(如黑号,封号,权重降低等)，本项目不承担任何责任
          <br />
          Github开源地址:

          <ULink to="https://github.com/ocyss/boss-helper" target="_blank"
            >https://github.com/ocyss/boss-helper
          </ULink>
        </template>
        <template #footer>
          <UButton color="error" @click="onProtocol"> 了解并同意! </UButton>
        </template>
      </UModal>
    </UApp>
  </div>
</template>
