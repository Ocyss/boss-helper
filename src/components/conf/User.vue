<script lang="ts" setup>
import type { CookieInfo } from '@/message'
import {
  ElAlert,
  ElAvatar,
  ElButton,
  ElDialog,
  ElMessage,
  ElMessageBox,
  ElPopconfirm,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'

import { ref } from 'vue'

import { useUser } from '@/stores/user'
import { logger } from '@/utils/logger'

const user = useUser()

const show = defineModel<boolean>({ required: true })

const currentRow = ref<CookieInfo | undefined>()
const loading = ref(false)

async function handleCreate() {
  loading.value = true
  try {
    const uid = user.getUserId()
    if (uid == null) {
      try {
        await ElMessageBox.confirm(
          '要是不登录进行新账号创建，则当前的所有配置将丢失！',
          '请先登录',
          {
            confirmButtonText: '强制创建',
            cancelButtonText: '取消',
            type: 'warning',
          },
        )
      }
      catch {
        return
      }
    }
    const val = await user.saveUser({ uid })
    if (uid && val) {
      user.cookieDatas.value[uid] = val
    }
    ElMessage.success('账号已保存，正在清空Cookie并刷新页面')
    await user.clearUser()
    setTimeout(() => window.location.reload(), 1500)
  }
  catch (err) {
    logger.error('创建账号失败', err)
    ElMessage.error(`创建账号失败: ${err as string}`)
  }
  finally {
    loading.value = false
  }
}

async function handleChange() {
  loading.value = true
  try {
    if (!currentRow.value) {
      ElMessage.error('请先选择要切换的账号')
      return
    }
    const uid = user.getUserId()
    if (uid == null) {
      try {
        await ElMessageBox.confirm(
          '要是不登录进行切换，则当前的所有配置将丢失！',
          '请先登录',
          {
            confirmButtonText: '强制切换',
            cancelButtonText: '取消',
            type: 'warning',
          },
        )
      }
      catch {
        return
      }
    }
    await user.changeUser(currentRow.value)
    ElMessage.success('账号切换成功，即将刷新页面')
    setTimeout(() => window.location.reload(), 1500)
  }
  catch (err) {
    logger.error('账号切换失败', err)
    ElMessage.error('账号切换失败，请重试')
  }
  finally {
    loading.value = false
  }
}

function handleCurrentChange(val: CookieInfo | undefined) {
  currentRow.value = val
}
</script>

<template>
  <ElDialog
    v-model="show"
    title="账户配置"
    width="70%"
    align-center
    destroy-on-close
    :z-index="20"
  >
    <ElAlert
      title="使用该功能将会明文存储cookie信息,可能包含隐私信息"
      type="warning"
      style="margin: 6px 0"
    />
    <ElAlert
      title="每个用户都有自己的相关配置但历史投递等信息将全局共享. 如果切换后是未登陆状态大概率是过期了, 再次登陆即可"
      type="info"
      style="margin: 6px 0"
    />
    <ElAlert
      title="不要在未登录的情况下进行切换和创建, 否则当前的配置无法进行保存"
      type="info"
      style="margin: 6px 0"
    />
    <ElTable
      :data="user.cookieTableData.value"
      style="width: 100%"
      highlight-current-row
      table-layout="auto"
      @current-change="handleCurrentChange"
    >
      <ElTableColumn type="index" width="40" />
      <ElTableColumn label="账户">
        <template #default="scope">
          <div style="align-items: center; display: flex">
            <ElAvatar :src="scope.row.avatar" :size="30" />
            <span style="margin-left: 8px">{{ scope.row.user }}</span>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="性别" align="center">
        <template #default="scope">
          <ElTag
            round
            effect="dark"
            style="border-style: none"
            :color="scope.row.gender === 'man' ? '#9BC1FE' : '#FFBDEB'"
          >
            {{ scope.row.gender === "man" ? "男" : "女" }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="身份" align="center">
        <template #default="scope">
          <ElTag
            effect="dark"
            round
            style="border-style: none"
            :type="scope.row.flag === 'student' ? 'success' : 'warning'"
          >
            {{ scope.row.flag === "student" ? "学生" : "社畜" }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="date" label="上次登录" />
      <ElTableColumn fixed="right" label="操作">
        <template #default="scope">
          <ElButton link type="primary" size="small" disabled>
            导出
          </ElButton>
          <ElButton
            link
            type="primary"
            size="small"
            @click="() => user.deleteUser(scope.row)"
          >
            删除
          </ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
    <template #footer>
      <div>
        <ElButton @click="show = false">
          取消
        </ElButton>
        <ElPopconfirm
          title="确认后将保存数据退出账户并自动刷新"
          @confirm="handleCreate"
        >
          <template #reference>
            <ElButton type="primary" :loading="loading">
              新建&登出
            </ElButton>
          </template>
        </ElPopconfirm>
        <ElButton
          type="primary"
          :disabled="!currentRow"
          :loading="loading"
          @click="handleChange()"
        >
          切换
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style lang="scss" scoped></style>
