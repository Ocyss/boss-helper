<script lang="ts" setup>
const value = defineModel<string[]>('value', { required: true })
// const options = defineModel<string[]>('options', { required: true })
</script>

<template>
  <UInputTags v-model="value" placeholder="" />
</template>
