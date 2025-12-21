<script lang="ts" setup>
import { useMouse, useMouseInElement } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { useModel } from '@/composables/useModel'
import { useConf } from '@/stores/conf'
import { jobList } from '@/stores/jobs'
import { useSignedKey } from '@/stores/signedKey'
import { useUser } from '@/stores/user'
import elmGetter from '@/utils/elmGetter'
import { useDeliver } from '../hooks/useDeliver'
import { usePager } from '../hooks/usePager'
import aboutVue from './about.vue'
import cardVue from './card.vue'
import configVue from './config.vue'
import logsVue from './logs.vue'
import serviceVue from './service.vue'
import statisticsVue from './statistics.vue'

const user = useUser()
const model = useModel()
const signedKey = useSignedKey()
const { initPager } = usePager()
const { x, y } = useMouse({ type: 'client' })
const deliver = useDeliver()
const { todayData } = useStatistics()
const conf = useConf()

const helpVisible = ref(false)
const searchRef = ref()
const tabsRef = ref()
const helpContent = ref('鼠标移到对应元素查看提示')
const { isOutside } = useMouseInElement(tabsRef)

const triggerRef = computed(() => {
  return {
    getBoundingClientRect() {
      return DOMRect.fromRect({
        width: 0,
        height: 0,
        x: x.value,
        y: y.value,
      })
    },
  }
})

const boxStyles = computed(() => {
  if (helpVisible.value && !isOutside.value) {
    const element = document.elementFromPoint(x.value, y.value)
    const el = findHelp(element as HTMLElement)
    if (el) {
      const bounding = el.getBoundingClientRect()
      return {
        width: `${bounding.width}px`,
        height: `${bounding.height}px`,
        left: `${bounding.left}px`,
        top: `${bounding.top}px`,
        display: 'block',
        backgroundColor: '#3eaf7c33',
        transition: 'all 0.08s linear',
      } as Record<string, string | number>
    }
  }
  return {
    display: 'none',
  }
})

function findHelp(dom: HTMLElement | null) {
  if (!dom)
    return
  const help = dom.dataset.help
  if (help) {
    helpContent.value = help
    return dom
  }
  return findHelp(dom.parentElement)
}

onMounted(async () => {
  void conf.confInit()
  void user.initUser()
  void user.initCookie()
  void model.initModel()
  void signedKey.initSignedKey()
  try {
    await jobList.initJobList(conf.formData)
  }
  catch (e) {
    logger.error('初始化职位列表失败', { error: e })
    ElMessage.error(`列表初始失败: ${e instanceof Error ? e.message : '未知错误'}`)
  }

  if (location.href.includes('/web/geek/job-recommend')) {
    elmGetter
      .get<HTMLDivElement>(
        '.job-recommend-search',
      )
      .then((searchEl) => {
        searchEl.style.position = 'unset'
        searchRef.value.$el.appendChild(searchEl)
      })
  }
  else if (location.href.includes('/web/geek/jobs')) {
    const div = document.createElement('div')
    div.style.cssText = 'display: flex;flex-direction: column;gap: 15px;'
    searchRef.value.$el.appendChild(div)
    elmGetter
      .get<HTMLDivElement>(
        ['.page-jobs-main .expect-and-search', '.page-jobs-main .filter-condition'],
      )
      .then(([searchEl, conditionEl]) => {
        searchEl.style.position = 'static'
        conditionEl.style.position = 'static'
        div.appendChild(conditionEl)
        elmGetter.get(['.c-search-input', '.c-expect-select'], searchEl).then(([searchInputEl, expectSelectEl]) => {
          div.insertBefore(searchInputEl, conditionEl)
          div.insertBefore(expectSelectEl, conditionEl)
          searchEl.style.display = 'none'
        })
      })
  }
  else {
    elmGetter
      .get([
        '.job-search-wrapper .job-search-box.clearfix',
        '.job-search-wrapper .search-condition-wrapper.clearfix',
      ])
      .then(([searchEl, conditionEl]) => {
        searchRef.value.$el.appendChild(searchEl)
        searchRef.value.$el.appendChild(conditionEl)
        // 搜索栏去APP
        elmGetter.rm('.job-search-scan', searchEl)
      })
  }

  initPager().catch((e) => {
    logger.error('初始化分页器失败', { error: e })
    ElMessage.error(`分页器初始失败: ${e instanceof Error ? e.message : '未知错误'}`)
  })

  const t = setInterval(() => {
    void signedKey.refreshSignedKeyInfo()
  }, 1000 * 60 * 20)
  onUnmounted(() => {
    clearInterval(t)
  })
})

function tagOpen(url: string) {
  window.open(url)
}
const VITE_VERSION = __APP_VERSION__

const isDot = computed(() => {
  return (signedKey.netConf?.version ?? '0') > VITE_VERSION
})

function openStore() {
  window.__q_openStore?.()
}
</script>

<template>
  <el-config-provider namespace="ehp">
    <h2 style="display: flex; align-items: center">
      Boos-Helper
      <el-badge
        :is-dot="isDot"
        :offset="[-2, 7]"
        style="cursor: pointer; display: inline-flex; margin: 0 4px"
        @click="openStore"
      >
        <el-tag type="primary">
          v{{ VITE_VERSION }} {{ isDot ? ' 有更新' : '' }}
        </el-tag>
      </el-badge>
      <el-text v-if="todayData.total > 0" style="margin-right: 15px;">
        今日: {{ todayData.success }}/{{ conf.formData.deliveryLimit.value }}
      </el-text>
      <el-text v-if="deliver.total > 0">
        当前页面: {{ deliver.current + 1 }}/{{ deliver.total }}
      </el-text>
    </h2>
    <div
      style="
      z-index: 999;
      position: fixed;
      pointer-events: none;
      border-width: 1px;
    "
      :style="boxStyles"
    />
    <div v-if="signedKey.netConf && signedKey.netConf.notification" class="netAlerts">
      <template
        v-for="item in signedKey.netConf.notification.filter(
          (item) => item.type === 'alert',
        )"
        :key="item.key ?? item.data.title"
      >
      <!-- <el-alert
        v-if="now > GM_getValue(`netConf-${item.key}`, 0)"
        v-bind="item.data"
        @close="GM_setValue(`netConf-${item.key}`, now + 259200000)"
      /> -->
      </template>
    </div>
    <ElTooltip :visible="helpVisible && !isOutside" :virtual-ref="triggerRef">
      <template #content>
        <div :style="`width: auto;max-width:${boxStyles.width};font-size:17px;`">
          {{ helpContent }}
        </div>
      </template>
    </ElTooltip>
    <ElTabs ref="tabsRef" data-help="鼠标移到对应元素查看提示">
      <ElTabPane label="统计" data-help="失败是成功她妈">
        <statisticsVue />
      </ElTabPane>
      <ElTabPane
        ref="searchRef"
        label="筛选"
      />
      <ElTabPane label="配置" data-help="好好看，好好学">
        <configVue />
      </ElTabPane>
      <ElTabPane v-if="signedKey.signedKey" label="AI" data-help="AI时代，脚本怎么能落伍!">
        <serviceVue />
      </ElTabPane>
      <ElTabPane label="日志" data-help="反正你也不看">
        <logsVue />
      </ElTabPane>
      <ElTabPane
        label="关于&赞赏"
        class="hp-about-box"
        data-help="项目是写不完美的,但总要去追求完美"
      >
        <aboutVue />
      </ElTabPane>
      <ElTabPane v-if="signedKey.netConf && signedKey.netConf.feedback">
        <template #label>
          <el-link
            size="large"
            style="height: 100%"
            @click.stop="tagOpen(signedKey.netConf.feedback)"
          >
            反馈
          </el-link>
        </template>
      </ElTabPane>
      <ElTabPane>
        <template #label>
          <ElCheckbox
            v-model="helpVisible"
            label="帮助"
            size="large"
            @click.stop=""
          />
        </template>
      </ElTabPane>
    </ElTabs>
    <Teleport to="#boss-helper-job-warp,.page-job-inner .page-job-content">
      <cardVue />
    </Teleport>
  <!-- <Teleport to=".page-job-wrapper">
    <chatVue
      style="
        position: fixed;
        top: 70px;
        left: 20px;
        height: calc(100vh - 80px);
        display: flex;
        flex-direction: column;
        width: 28%;
        max-width: 540px;
      "
    />
  </Teleport> -->
  </el-config-provider>
</template>

<style lang="scss">
#boss-helper-job {
  margin-bottom: 8px;
  * {
    user-select: none;
  }
}

.hp-about-box {
  display: flex;
  .hp-about {
    display: flex;
    flex-direction: column;
  }
  html.dark & {
    color: #cfd3dc;
  }
}

.ehp-checkbox {
  color: #5e5e5e;
  &.is-checked .ehp-checkbox__label {
    color: #000000 !important;
  }
  .dark &.is-checked .ehp-checkbox__label {
    color: #cfd3dc !important;
  }
}

.ehp-form {
  .ehp-link {
    font-size: 12px;
  }
  .ehp-form-item__label {
    display: flex;
    align-items: center;
  }
  .ehp-checkbox__label {
    padding-left: 4px;
  }
}
.ehp-tabs__content {
  overflow: unset !important;
}
</style>
