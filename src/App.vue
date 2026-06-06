<script lang="ts" setup>
import {
  ElAvatar,
  ElButton,
  ElConfigProvider,
  ElDialog,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElMessage,
  ElMessageBox,
  ElSpace,
  ElText,
} from 'element-plus'
import { onMounted, ref } from 'vue'

import logVue from '@/components/conf/Log.vue'
import storeVue from '@/components/conf/Store.vue'
import userVue from '@/components/conf/User.vue'
import { store } from '@/components/icon/store'
import { counter } from '@/message'
import type { NetConf } from '@/stores/signedKey'
import { logger } from '@/utils/logger'

const confBox = ref(false)

const confs = {
  store: { name: '存储配置', component: storeVue, disabled: true },
  user: { name: '账号配置', component: userVue, disabled: false },
  log: { name: '日志配置', component: logVue, disabled: true },
}

const confKey = ref<keyof typeof confs>('store')
const dark = ref(false)

counter.storageGet('theme-dark', false).then((res) => {
  dark.value = res
})

async function themeChange() {
  dark.value = !dark.value
  if (dark.value) {
    ElMessage({
      message: '已切换到暗黑模式，如有样式没适配且严重影响使用，请反馈',
      duration: 5000,
      showClose: true,
    })
  }
  document.documentElement.classList.toggle('dark', dark.value)
  await counter.storageSet('theme-dark', dark.value)
}

// logger.log(monkeyWindow, window, unsafeWindow);

const VITE_VERSION = __APP_VERSION__
const storeShow = ref(false)

window.__q_openStore = () => {
  storeShow.value = true
}
const netConf = ref<NetConf>()

function updateNetConf() {
  netConf.value = window.__q_netConf?.()
}

const usageNoticeHtml = `
<p><strong>欢迎使用 boss-helper-ai-greeting。</strong></p>
<p>这是基于 <a href="https://github.com/Ocyss/boss-helper" target="_blank">Ocyss/boss-helper</a> 的个人 fork 版本，重点增强了 AI 招呼语、聊天页话术发送面板和兜底队列能力。</p>
<ol>
  <li>本项目仅供学习交流，禁止用于商业用途；自动化投递存在账号风控、权重降低或封号风险，请先小范围测试。</li>
  <li>如果使用自定义/AI 招呼语，必须先关闭 BOSS 直聘自带默认招呼语，避免重复发送或影响发送结果。</li>
  <li>岗位页的「筛选」用于筛岗位列表；工具里的「配置」用于判断单个职位是否符合你的要求，这是两层漏斗。</li>
  <li>聊天页话术发送面板不会自动发送，需要你确认后手动点击「开始发送」。队列匹配不到目标 Boss 时会暂停，不会降级乱发。</li>
  <li>API Key、Cookie、手机号、简历等隐私信息不要公开提交；遇到问题可以通过 GitHub Issues 或邮件反馈。</li>
</ol>
<p>小白说明文档：<a href="https://github.com/ZhuYiwen020118/boss-helper-ai-greeting/blob/user-migration-from-0.4.4/docs/BEGINNER_GUIDE.md" target="_blank">BEGINNER_GUIDE.md</a></p>
<p>项目仓库：<a href="https://github.com/ZhuYiwen020118/boss-helper-ai-greeting" target="_blank">ZhuYiwen020118/boss-helper-ai-greeting</a></p>
<p>反馈邮箱：<a href="mailto:25435825@life.hkbu.edu.hk">25435825@life.hkbu.edu.hk</a></p>
`

onMounted(async () => {
  logger.info('BossHelper挂载成功')
  ElMessage('BossHelper挂载成功!')

  const protocol = 'boss-helper-ai-greeting-protocol'
  const protocol_val = '2026/06/06'
  const protocol_date = await counter.storageGet<string>(protocol)
  if (protocol_date !== protocol_val) {
    await counter.storageSet(protocol, protocol_val)
    ElMessageBox.alert(usageNoticeHtml, 'boss-helper-ai-greeting 使用须知', {
      autofocus: true,
      confirmButtonText: '我已了解',
      dangerouslyUseHTMLString: true,
      customStyle:
        '--el-messagebox-width: 760px; white-space: normal; max-width: calc(100vw - 32px);' as never,
      callback: () => counter.storageSet(protocol, protocol_val),
    })
  }
})
</script>

<template>
  <ElConfigProvider namespace="ehp">
    <ElDropdown trigger="click">
      <ElAvatar :size="30" src="https://avatars.githubusercontent.com/u/68412205?v=4"> H </ElAvatar>
      <template #dropdown>
        <ElDropdownMenu>
          <ElDropdownItem disabled> BossHelp配置项 </ElDropdownItem>
          <ElDropdownItem divided disabled />
          <ElDropdownItem
            v-for="(v, k) in confs"
            :key="k"
            :disabled="v.disabled"
            @click="
              () => {
                confKey = k
                confBox = true
              }
            "
          >
            {{ v.name }}
          </ElDropdownItem>
          <ElDropdownItem disabled @click="themeChange">
            暗黑模式（{{ dark ? '开' : '关' }}）
          </ElDropdownItem>
          <ElDropdownItem @click="storeShow = true"> 版本信息 </ElDropdownItem>
        </ElDropdownMenu>
      </template>
    </ElDropdown>
    <Teleport to="body">
      <component :is="confs[confKey].component" id="help-conf-box" v-model="confBox" />
    </Teleport>
    <ElDialog v-model="storeShow" title="BossHelper扩展商店" width="500" @open="updateNetConf">
      <div>
        <div style="text-align: center; font-size: 14px; color: #606266">
          你的版本: {{ VITE_VERSION }}
        </div>
        <div style="text-align: center; font-size: 14px; color: #606266">
          最新版本: {{ netConf?.version ?? '暂未获取到版本信息' }}
        </div>
        <div style="text-align: center; font-size: 16px; color: #606266">更新内容：</div>
        <div style="text-align: center; font-size: 14px; color: #606266; white-space: pre-line">
          {{ netConf?.version_description ?? '暂未获取到更新日志' }}
        </div>
      </div>
      <ElSpace wrap>
        <a
          v-for="(item, key) in store"
          :key="key"
          class="store-item-a"
          :href="netConf?.store?.[key]?.[1] ?? item[2]"
          target="_blank"
        >
          <div class="store-item">
            <component :is="item[0]" />
            <img :src="netConf?.store?.[key]?.[2] ?? item[3]" alt="store" style="height: 20px" />
            <ElText>{{ netConf?.store?.[key]?.[0] ?? item[1] }}</ElText>
          </div>
        </a>
      </ElSpace>
      <template #footer>
        <div class="dialog-footer">
          <ElButton type="primary" @click="storeShow = false"> 关闭 </ElButton>
        </div>
      </template>
    </ElDialog>
  </ElConfigProvider>
</template>

<style lang="scss">
.store-item-a {
  .store-item {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-direction: column;
    width: 140px;
    height: 180px;
    background: aliceblue;
    padding: 10px;
    border: 1px solid #f6f6f7;
    border-radius: 12px;
    background-color: #f6f6f7;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.04),
      0 1px 2px rgba(0, 0, 0, 0.06);
    transition:
      border-color 0.25s,
      background-color 0.25s;
  }
  &:hover {
    .store-item {
      background-color: #bbf8fa;
      border-color: #2fffd9;
    }
  }
}
</style>
