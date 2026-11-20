<script lang="ts" setup>
const value = defineModel<string[]>('value', { required: true })
// const options = defineModel<string[]>('options', { required: true })

const delimiter = /,|\s|\||，/
</script>

<template>
  <UInputTags
    v-model="value"
    placeholder=""
    :delimiter="delimiter"
    addOnTab
    addOnBlur
    :duplicate="false"
  />
</template>
