<script lang="ts" setup generic="T extends object">
import UInput from '@nuxt/ui/components/Input.vue'
import UInputMenu from '@nuxt/ui/components/InputMenu.vue'
import UInputNumber from '@nuxt/ui/components/InputNumber.vue'
import USelectMenu from '@nuxt/ui/components/SelectMenu.vue'
import USlider from '@nuxt/ui/components/Slider.vue'
import USwitch from '@nuxt/ui/components/Switch.vue'

import type { LLMInfoValM, LLMInfoValF } from '@/composables/useModel/type'

const props = defineProps<{
  info: LLMInfoValM<T, object> | LLMInfoValF<T, any>
  label: string
  depth?: number
}>()

const fromVal = defineModel<any>({
  required: true,
})

const LLMFormRef = inject<Ref<HTMLDivElement>>('LLMFormRef')
const isSetVal = ref(fromVal.value !== undefined)
</script>

<template>
  <template v-if="'alert' in info">
    <UAlert
      :title="info.label"
      :description="info.desc"
      :color="info.alert"
      variant="subtle"
      class="mb-4 relative left-1/2 -translate-x-1/2 w-[102%]"
    />
    <div class="space-y-3">
      <LLMFormItem
        v-for="(x, k) in info.value"
        :key="k"
        :label="k"
        v-model="fromVal[k]"
        :info="x"
        :depth="(depth || 0) + 1"
      />
    </div>
  </template>

  <UFormField
    v-else
    :required="info.required"
    class="w-full"
    :ui="{ container: 'flex flex-row gap-2 flex-1 *:w-full max-w-3/5' }"
  >
    <template #label>
      <span :title="info.desc" class="inline-flex items-center text-center gap-2">
        <UIcon v-if="info.desc" name="i-lucide-info" />
        {{ info.label ?? label }}</span
      >
    </template>
    <UCheckbox
      v-if="info.config?.disabled || !info.required"
      v-model="isSetVal"
      @update:model-value="
        (x) => {
          if (!x) fromVal = undefined
        }
      "
      :disable="info.config?.disabled"
    />
    <template v-if="info.required || isSetVal">
      <UInputNumber
        v-if="info.type === 'input' && info.format === 'number'"
        v-model="fromVal"
        v-bind="info.config"
      ></UInputNumber>
      <UInputMenu
        v-else-if="info.type === 'input' && info.format === 'menu'"
        v-model="fromVal"
        v-bind="info.config"
        :portal="LLMFormRef"
        :clear="false"
        @create="
          (x) => {
            fromVal = x
          }
        "
      >
      </UInputMenu>
      <UInput v-else-if="info.type === 'input'" v-model="fromVal" v-bind="info.config"></UInput>
      <USelectMenu
        v-else-if="info.type === 'select'"
        v-model="fromVal"
        v-bind="info.config"
        :clear="false"
        :portal="LLMFormRef"
      ></USelectMenu>
      <USlider
        v-else-if="info.type === 'slider'"
        v-model="fromVal"
        v-bind="info.config"
        :ui="{ root: 'w-1/2 min-w-50' }"
      ></USlider>
      <USwitch v-else-if="info.type === 'switch'" v-model="fromVal" v-bind="info.config"></USwitch>
      <div v-else>Unsupported form element {{ info }}</div>
    </template>
  </UFormField>
</template>
