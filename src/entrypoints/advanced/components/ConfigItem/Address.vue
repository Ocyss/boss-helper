<script lang="ts" setup>
import { useConf } from '@/composables/conf'

const conf = useConf()
const toast = useToast()

const amapGeocodeLoading = ref(false)

async function amapGeocodeHandler() {
  amapGeocodeLoading.value = true
  try {
    const res = await amapGeocode(conf.formData.amap.origins)
    if (res) {
      conf.formData.amap.origins = res.location
    } else {
      toast.add({
        title: '获取地址失败',
        color: 'error',
      })
      logger.error('AmapGeocodeError', res)
    }
  } catch (error) {
    toast.add({
      title: '获取地址失败',
      color: 'error',
    })
    logger.error('AmapGeocodeError', error)
  } finally {
    amapGeocodeLoading.value = false
  }
}

function gotoAmapDevSetting() {
  window.open('https://lbs.amap.com/dev/', '_blank')
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <Alert
      id="config-amap-2"
      show-icon
      type="info"
      title="使用高德地图前, 需自行创建key (每日免费配额足够使用)"
      description="推荐结合工作地址包含使用, 创建路径: 创建应用 -> 添加key -> Web服务"
      :actions="[
        {
          label: '前往创建',
          color: 'primary',
          variant: 'subtle',
          onClick: gotoAmapDevSetting,
        },
      ]"
    >
    </Alert>
    <Alert
      id="config-amap-ai"
      :closable="false"
      type="info"
      title="AI Prompt 参考如下语法(仅筛选可用):"
    >
      <template #description>
        <div class="grid grid-cols-2 gap-2">
          <span v-pre>直线距离: {{ amap.straightDistance }}km</span>
          <span v-pre>驾车距离: {{ amap.drivingDistance }}km</span>
          <span v-pre>驾车时间: {{ amap.drivingDuration }}分钟</span>
          <span v-pre>步行距离: {{ amap.walkingDistance }}km</span>
          <span v-pre>步行时间: {{ amap.walkingDuration }}分钟</span>
        </div>
      </template>
    </Alert>
    <div class="flex gap-3 items-center">
      <span
        label="启用"
        data-help="启用高德地图, 用于获取工作地址的距离和时间进行筛选，需要配置自己的key"
      >
        <UCheckbox v-model="conf.formData.amap.enable" />
      </span>
      <UFormField label="高德地图key" data-help="高德地图key, 需要自己申请">
        <UInput v-model="conf.formData.amap.key" />
      </UFormField>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <UFormField
        label="起点经纬度"
        data-help="起点经纬度, 经度和纬度用逗号分隔, 可以输入完整地址点击按钮自动获取"
      >
        <UFieldGroup>
          <UInput v-model="conf.formData.amap.origins" :disabled="amapGeocodeLoading" />
          <UButton
            color="primary"
            :loading="amapGeocodeLoading"
            @click="amapGeocodeHandler()"
            icon="solar:magnifer-bug-outline"
            title="根据完整地址获取经纬度"
          >
          </UButton>
        </UFieldGroup>
      </UFormField>
      <UFormField label="直线距离" data-help="直线距离, 为0禁用，单位: km">
        <UFieldGroup>
          <UInputNumber
            v-model="conf.formData.amap.straightDistance"
            :precision="1"
            :max="1000"
            :min="0"
            :step="1"
          />
          <UBadge label="km" />
        </UFieldGroup>
      </UFormField>

      <UFormField
        label="驾车距离"
        data-help="驾车距离, 为0禁用，会考虑当前时间的路况，不同时间结果不一样，策略为'速度优先', 单位: km"
      >
        <UFieldGroup>
          <UInputNumber
            v-model="conf.formData.amap.drivingDistance"
            :precision="1"
            :max="1000"
            :min="0"
            :step="1"
          />
          <UBadge label="km" />
        </UFieldGroup>
      </UFormField>
      <UFormField
        label="驾车时间"
        data-help="驾车时间, 为0禁用，会考虑当前时间的路况，不同时间结果不一样，策略为'速度优先', 单位: 分钟"
      >
        <UFieldGroup>
          <UInputNumber
            v-model="conf.formData.amap.drivingDuration"
            :precision="2"
            :max="1440"
            :min="0"
            :step="30"
          />

          <UBadge label="分钟" />
        </UFieldGroup>
      </UFormField>

      <UFormField label="步行距离" data-help="步行距离, 为0禁用，单位: km">
        <UFieldGroup>
          <UInputNumber
            v-model="conf.formData.amap.walkingDistance"
            :precision="1"
            :max="1000"
            :min="0"
            :step="1"
          />
          <UBadge label="km" />
        </UFieldGroup>
      </UFormField>
      <UFormField label="步行时间" data-help="步行时间, 为0禁用，单位: 分钟">
        <UFieldGroup>
          <UInputNumber
            v-model="conf.formData.amap.walkingDuration"
            :precision="2"
            :max="1440"
            :min="0"
            :step="30"
          />
          <UBadge label="分钟" />
        </UFieldGroup>
      </UFormField>
    </div>
  </div>
</template>
