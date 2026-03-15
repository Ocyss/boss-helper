<script lang="ts" setup>
import { reactiveComputed } from '@vueuse/core'
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElCollapse,
  ElCollapseItem,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElLink,
  ElMessage,
  ElPopover,
  ElSpace,
  ElTooltip,
  ElSelect,
  ElOption,
} from 'element-plus'

import { ref } from '#imports'
import Alert from '@/components/Alert'
import formItem from '@/components/form/FormItem.vue'
import formSelect from '@/components/form/FormSelect.vue'
import SalaryRangeComponent from '@/components/form/SalaryRange.vue'
import { getCacheManager } from '@/composables/useApplying'
import { useCommon } from '@/composables/useCommon'
import { formInfoData, useConf } from '@/stores/conf'
import { ConfigLevel } from '@/types/formData'
import { amapGeocode } from '@/utils/amap'
import { logger } from '@/utils/logger'

import Ai from './Ai.vue'
import Appearance from './Appearance.vue'

const conf = useConf()

const { deliverLock } = useCommon()
const amapGeocodeLoading = ref(false)
async function amapGeocodeHandler() {
  amapGeocodeLoading.value = true
  try {
    const res = await amapGeocode(conf.formData.amap.origins)
    if (res) {
      conf.formData.amap.origins = res.location
    } else {
      ElMessage.error('获取地址失败')
    }
  } catch (error) {
    ElMessage.error('获取地址失败')
    logger.error(error)
  } finally {
    amapGeocodeLoading.value = false
  }
}

function syncSalaryRange() {
  conf.formData.salaryRange.advancedValue.M[0] = Math.round(
    conf.formData.salaryRange.value[0] * 1000,
  )
  conf.formData.salaryRange.advancedValue.M[1] = Math.round(
    conf.formData.salaryRange.value[1] * 1000,
  )

  conf.formData.salaryRange.advancedValue.D[0] = Math.round(
    conf.formData.salaryRange.advancedValue.M[0] / 21.75,
  )
  conf.formData.salaryRange.advancedValue.D[1] = Math.round(
    conf.formData.salaryRange.advancedValue.M[1] / 21.75,
  )

  conf.formData.salaryRange.advancedValue.H[0] = Math.round(
    conf.formData.salaryRange.advancedValue.D[0] / 8,
  )
  conf.formData.salaryRange.advancedValue.H[1] = Math.round(
    conf.formData.salaryRange.advancedValue.D[1] / 8,
  )
}
</script>

<template>
  <Alert
    id="config-alert-1"
    style="margin-bottom: 10px"
    show-icon
    title="进行配置前都请先阅读完整的帮助文档，再进行配置，如有bug请反馈"
    type="success"
    description="滚动到底部，差不多150个岗位左右，也会自动停止, 刷新或者变更期望重新获取新的岗位即可。"
  />
  <Alert id="config-alert-2" style="margin-bottom: 10px" type="success" show-icon>
    <template #title>
      使用自定义招呼语前 推荐禁用boss直聘自带招呼语
      <ElLink
        href="https://www.zhipin.com/web/geek/notify-set?type=greetSet"
        target="_blank"
        type="warning"
      >
        点我前往设置
      </ElLink>
    </template>
  </Alert>
  <Alert
    id="config-alert-3"
    style="margin-bottom: 10px"
    type="success"
    description="所有配置选项皆有帮助提示，不懂用法请进入帮助模式进行查看，若是对帮助说明有疑问请反馈最好能给出改进意见。"
  />
  <ElForm
    inline
    label-position="left"
    label-width="auto"
    :model="conf.formData"
    :disabled="deliverLock"
  >
    <ElCollapse accordion>
      <ElCollapseItem title="筛选配置" name="1">
        <Alert
          id="filter-config-alert-enable"
          title="复选框打钩才会启用，别忘记打钩启用哦。保存也别忘了"
          type="success"
          show-icon
          style="margin: 10px 0"
        />
        <Alert
          id="filter-config-alert-mode"
          title="排除和包含可点击切换，混合模式适用性过低不会考虑开发"
          type="success"
          show-icon
          style="margin: 10px 0"
        />

        <ElSpace class="config-input" wrap style="width: 100%">
          <form-item
            v-bind="formInfoData.company"
            v-model:enable="conf.formData.company.enable"
            v-model:include="conf.formData.company.include"
            :disabled="deliverLock"
          >
            <formSelect
              v-model:value="conf.formData.company.value"
              v-model:options="conf.formData.company.options"
            />
          </form-item>
          <form-item
            v-bind="formInfoData.jobTitle"
            v-model:enable="conf.formData.jobTitle.enable"
            v-model:include="conf.formData.jobTitle.include"
            :disabled="deliverLock"
          >
            <form-select
              v-model:value="conf.formData.jobTitle.value"
              v-model:options="conf.formData.jobTitle.options"
            />
          </form-item>
          <form-item
            v-bind="formInfoData.jobContent"
            v-model:enable="conf.formData.jobContent.enable"
            v-model:include="conf.formData.jobContent.include"
            :disabled="deliverLock"
          >
            <form-select
              v-model:value="conf.formData.jobContent.value"
              v-model:options="conf.formData.jobContent.options"
            />
          </form-item>
          <form-item
            v-if="conf.config_level.intermediate"
            v-bind="formInfoData.hrPosition"
            v-model:enable="conf.formData.hrPosition.enable"
            v-model:include="conf.formData.hrPosition.include"
            :disabled="deliverLock"
          >
            <form-select
              v-model:value="conf.formData.hrPosition.value"
              v-model:options="conf.formData.hrPosition.options"
            />
          </form-item>
          <form-item
            v-if="conf.config_level.intermediate"
            v-bind="formInfoData.jobAddress"
            v-model:enable="conf.formData.jobAddress.enable"
            :disabled="deliverLock"
          >
            <template #include>
              <ElLink type="primary" size="small"> 包含 </ElLink>
            </template>
            <form-select
              v-model:value="conf.formData.jobAddress.value"
              v-model:options="conf.formData.jobAddress.options"
            />
          </form-item>
          <form-item
            v-if="conf.config_level.intermediate"
            v-bind="formInfoData.salaryRange"
            v-model:enable="conf.formData.salaryRange.enable"
          >
            <SalaryRangeComponent
              :value="conf.formData.salaryRange.value"
              width="80px"
              unit="K"
              :show="false"
            />
            <ElPopover
              v-if="conf.config_level.advanced"
              placement="top"
              :width="400"
              trigger="click"
            >
              <template #reference>
                <ElButton style="margin-left: 5px"> 高级 </ElButton>
              </template>
              <div style="display: flex; flex-direction: column; gap: 10px">
                <ElAlert
                  title="宽松匹配: 薪资范围有任何重叠即匹配, 如10-20K: 15-20K, 15-21k, 20-26k 都满足, 21-22k 不满足"
                  type="info"
                  show-icon
                  :closable="false"
                />
                <ElAlert
                  title="严格匹配: 目标薪资需完全在职位范围内, 如10-20K: 10-15K 和15-20K 满足, 15-21k 不满足"
                  type="info"
                  show-icon
                  :closable="false"
                />
                <SalaryRangeComponent
                  :value="conf.formData.salaryRange.value"
                  unit="K"
                  :show="true"
                />
                <ElAlert
                  title="计算值进行同步，算法固定. 日薪: /21.75, 时薪: /21.75/8"
                  type="info"
                  show-icon
                  :closable="false"
                />
                <ElButton @click="syncSalaryRange"> 同步 </ElButton>
                <SalaryRangeComponent
                  :value="conf.formData.salaryRange.advancedValue.H"
                  unit="元/时"
                  :show="true"
                  :step="5"
                />
                <SalaryRangeComponent
                  :value="conf.formData.salaryRange.advancedValue.D"
                  unit="元/天"
                  :show="true"
                  :step="10"
                />
                <SalaryRangeComponent
                  :value="conf.formData.salaryRange.advancedValue.M"
                  unit="元/月"
                  :show="true"
                  :step="200"
                />
              </div>
            </ElPopover>
          </form-item>
          <form-item
            v-if="conf.config_level.intermediate"
            v-bind="formInfoData.companySizeRange"
            v-model:enable="conf.formData.companySizeRange.enable"
          >
            <SalaryRangeComponent
              :controls="false"
              :value="conf.formData.companySizeRange.value"
              width="90px"
              unit="人"
              :show="true"
            />
          </form-item>

          <form-item
            v-if="conf.config_level.intermediate"
            v-bind="formInfoData.customGreeting"
            v-model:enable="conf.formData.customGreeting.enable"
          >
            <ElInput v-model.lazy="conf.formData.customGreeting.value" type="textarea" />
            <ElButton style="margin-left: 5px"> 高级 </ElButton>
          </form-item>
        </ElSpace>
        <ElSpace wrap>
          <ElCheckbox
            v-if="conf.config_level.expert"
            v-bind="formInfoData.greetingVariable"
            v-model="conf.formData.greetingVariable.value"
            border
          />
          <ElCheckbox
            v-if="conf.config_level.intermediate"
            v-bind="formInfoData.activityFilter"
            v-model="conf.formData.activityFilter.value"
            border
          />
          <ElCheckbox
            v-bind="formInfoData.goldHunterFilter"
            v-model="conf.formData.goldHunterFilter.value"
            border
          />
          <ElCheckbox
            v-bind="formInfoData.friendStatus"
            v-model="conf.formData.friendStatus.value"
            border
          />
          <ElCheckbox
            v-if="conf.config_level.intermediate"
            v-bind="formInfoData.sameCompanyFilter"
            v-model="conf.formData.sameCompanyFilter.value"
            border
          />
          <ElCheckbox
            v-if="conf.config_level.intermediate"
            v-bind="formInfoData.sameHrFilter"
            v-model="conf.formData.sameHrFilter.value"
            border
          />
        </ElSpace>
      </ElCollapseItem>
      <ElCollapseItem title="外观配置" name="5"> <Appearance /></ElCollapseItem>
      <ElCollapseItem v-if="conf.config_level.advanced" title="地址配置" name="4">
        <Alert id="config-amap-2" style="margin-bottom: 10px" show-icon type="info">
          <template #title>
            使用高德地图前 推荐结合工作地址包含使用, 需自行申请key,
            <br />
            <ElLink href="https://lbs.amap.com/dev/" target="_blank" type="warning">
              https://lbs.amap.com/dev/
            </ElLink>
            创建应用 -> 添加key -> Web服务
            <br />
            每日免费配额足够使用
          </template>
        </Alert>
        <Alert
          id="config-amap-ai"
          style="margin-bottom: 10px"
          :closable="false"
          type="info"
          description="AI Prompt 参考如下语法(仅筛选可用):
            直线距离: {{ amap.straightDistance }}km
            驾车距离: {{ amap.drivingDistance }}km
            驾车时间: {{ amap.drivingDuration }}分钟
            步行距离: {{ amap.walkingDistance }}km
            步行时间: {{ amap.walkingDuration }}分钟
            "
        />
        <ElCheckbox
          v-bind="formInfoData.amap.enable"
          v-model="conf.formData.amap.enable"
          border
          style="margin-right: 10px"
        />
        <ElFormItem v-bind="formInfoData.amap.key">
          <ElInput v-model.lazy="conf.formData.amap.key" />
        </ElFormItem>
        <br />
        <ElFormItem v-bind="formInfoData.amap.origins">
          <ElInput v-model.lazy="conf.formData.amap.origins" :disabled="amapGeocodeLoading">
            <template #append>
              <ElTooltip content="根据完整地址获取经纬度" placement="top">
                <ElButton
                  type="primary"
                  :loading="amapGeocodeLoading"
                  @click="amapGeocodeHandler()"
                >
                  🤖
                </ElButton>
              </ElTooltip>
            </template>
          </ElInput>
        </ElFormItem>
        <ElFormItem v-bind="formInfoData.amap.straightDistance">
          <ElInputNumber
            v-model.lazy="conf.formData.amap.straightDistance"
            :precision="1"
            :max="1000"
            :min="0"
            :step="1"
          >
            <template #suffix>
              <span>km</span>
            </template>
          </ElInputNumber>
        </ElFormItem>
        <br />
        <ElFormItem v-bind="formInfoData.amap.drivingDistance">
          <ElInputNumber
            v-model.lazy="conf.formData.amap.drivingDistance"
            :precision="1"
            :max="1000"
            :min="0"
            :step="1"
          >
            <template #suffix>
              <span>km</span>
            </template>
          </ElInputNumber>
        </ElFormItem>
        <ElFormItem v-bind="formInfoData.amap.drivingDuration">
          <ElInputNumber
            v-model.lazy="conf.formData.amap.drivingDuration"
            :precision="2"
            :max="1440"
            :min="0"
            :step="30"
          >
            <template #suffix>
              <span>分钟</span>
            </template>
          </ElInputNumber>
        </ElFormItem>
        <br />
        <ElFormItem v-bind="formInfoData.amap.walkingDistance">
          <ElInputNumber
            v-model.lazy="conf.formData.amap.walkingDistance"
            :precision="1"
            :max="1000"
            :min="0"
            :step="1"
          >
            <template #suffix>
              <span>km</span>
            </template>
          </ElInputNumber>
        </ElFormItem>
        <ElFormItem v-bind="formInfoData.amap.walkingDuration">
          <ElInputNumber
            v-model.lazy="conf.formData.amap.walkingDuration"
            :precision="2"
            :max="1440"
            :min="0"
            :step="30"
          >
            <template #suffix>
              <span>分钟</span>
            </template>
          </ElInputNumber>
        </ElFormItem>
      </ElCollapseItem>
      <ElCollapseItem v-if="conf.config_level.advanced" title="AI配置" name="2">
        <Ai />
      </ElCollapseItem>
      <ElCollapseItem v-if="conf.config_level.intermediate" title="延迟配置" name="3">
        <ElFormItem
          v-for="(item, key) in formInfoData.delay"
          :key
          :label="item.label"
          :data-help="item['data-help']"
        >
          <ElInputNumber
            v-model="conf.formData.delay[key]"
            :min="1"
            :max="99999"
            :disabled="item.disable"
          />
        </ElFormItem>
      </ElCollapseItem>
    </ElCollapse>

    <div style="margin-top: 20px; display: flex; gap: 20px; flex-wrap: wrap">
      <ElFormItem label="配置级别" :data-help="formInfoData.config_level['data-help']">
        <ElSelect v-model="conf.formData.config_level" style="width: 120px">
          <ElOption
            v-for="item in formInfoData.config_level.options"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          /> </ElSelect
      ></ElFormItem>
      <ElCheckbox
        v-bind="formInfoData.notification"
        v-model="conf.formData.notification.value"
        border
      />
      <ElCheckbox
        v-if="conf.config_level.expert || conf.formData.useCache.value"
        v-bind="formInfoData.useCache"
        v-model="conf.formData.useCache.value"
        border
      />
      <ElButton
        v-if="conf.formData.useCache.value"
        type="warning"
        @click="() => getCacheManager().clearCache()"
      >
        清空缓存
      </ElButton>
      <ElFormItem v-if="conf.config_level.intermediate" :label="formInfoData.deliveryLimit.label">
        <ElInputNumber
          v-bind="formInfoData.deliveryLimit"
          v-model="conf.formData.deliveryLimit.value"
          :min="1"
          :max="155"
          :step="10"
        />
      </ElFormItem>
    </div>
  </ElForm>
  <div style="margin-top: 15px">
    <ElButton type="success" data-help="保存配置，会自动刷新页面。" @click="conf.confSaving">
      保存配置
    </ElButton>
    <ElButton type="warning" data-help="重新加载本地配置" @click="conf.confReload">
      重载配置
    </ElButton>
    <ElButton
      type="primary"
      data-help="不同版本的参数可能会调整, 更新之后一键应用, 不会覆盖主要筛选条件"
      @click="conf.confRecommend"
    >
      使用推荐配置
    </ElButton>
    <ElButton
      v-if="conf.config_level.intermediate"
      type="primary"
      data-help="互联网就是要分享"
      @click="conf.confExport"
    >
      导出配置
    </ElButton>
    <ElButton
      v-if="conf.config_level.intermediate"
      type="primary"
      data-help="互联网就是要分享"
      @click="conf.confImport"
    >
      导入配置
    </ElButton>
    <ElButton
      v-if="conf.config_level.advanced"
      type="danger"
      data-help="清空配置,不会帮你保存,可以重载恢复"
      @click="conf.confDelete"
    >
      清空配置
    </ElButton>
  </div>
</template>

<style lang="scss" scoped>
.ehp-space.config-input :deep(.ehp-space__item) {
  width: 48%;
}
</style>
