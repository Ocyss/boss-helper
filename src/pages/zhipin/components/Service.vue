<script lang="ts" setup>
import { useCountdown } from '@vueuse/core'
import { useQRCode } from '@vueuse/integrations/useQRCode'
import {
  ElAlert,
  ElButton,
  ElButtonGroup,
  ElDialog,
  ElForm,
  ElFormItem,
  ElImage,
  ElImageViewer,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElPopover,
  ElRadio,
  ElRadioGroup,
  ElSpace,
  ElTable,
  ElTableColumn,
} from 'element-plus'
import { events } from 'fetch-event-stream'
import type { FetchResponse } from 'openapi-fetch'
import { watch } from 'vue'

import { computed, onMounted, ref } from '#imports'
import { useSignedKey } from '@/stores/signedKey'
import { useUser } from '@/stores/user'
import type { components } from '@/types/openapi'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

import Ai from './Ai.vue'

const signedKey = useSignedKey()
const user = useUser()
const keyValue = ref(signedKey.signedKey ?? signedKey.signedKeyBak)
const loading = ref(false)
const buyDialogVisible = ref(false)
const buyDialogLoading = ref(false)
const buyQrcodeUrl = ref('')
const { remaining: buyExpireTime, start: startBuyExpireTime } = useCountdown(0)
const buyQrcode = useQRCode(buyQrcodeUrl, {
  width: 300,
  scale: 8,
  margin: 2,
  errorCorrectionLevel: 'H',
})
const buyResult = ref<typeof signedKey.signedKeyInfo>()
const buyDialogStatus = ref<'key' | 'account' | 'balance' | 'balanceSelect'>('key')
const balanceAmount = ref(10)
const balanceAmountCustom = ref(0)
const buyOrderName = ref('')
let buySignal: AbortController | null = null

async function bindKey() {
  loading.value = true
  try {
    if (keyValue.value == null) {
      ElMessage.error('请输入密钥')
      return
    }
    const data = await signedKey.getSignedKeyInfo(keyValue.value)
    if (data != null && data.key != null && data.users.length > 0) {
      const userID = user.getUserId()?.toString()
      if (userID == null) {
        ElMessage.error('请先登录')
        return
      }
      if (data.users.some((item) => item.user_id === userID)) {
        signedKey.signedKey = keyValue.value
        signedKey.signedKeyInfo = data
        ElMessage.success('绑定成功')
      } else {
        const resp = await signedKey.client.POST('/v1/key/bind_account', {
          body: {
            data: {
              user_id: userID,
              backup_user_id: user.info?.value?.encryptUserId,
            },
            signed_key: keyValue.value,
          },
        })
        const errMsg = signedKey.signedKeyReqHandler(resp)
        if (errMsg == null && resp.data != null) {
          signedKey.signedKey = resp.data.signed_key
          data.users.push(resp.data)
          signedKey.signedKeyInfo = data
          ElMessage.success('绑定成功')
        } else if (resp.response.status === 488) {
          const resp = await signedKey.client.POST('/v1/key/bind_account', {
            body: {
              data: {
                user_id: userID,
                backup_user_id: user.info?.value?.encryptUserId,
              },
              callback: 'force_unbind',
              signed_key: keyValue.value,
            },
          })
          const errMsg = signedKey.signedKeyReqHandler(resp)
          if (errMsg == null && resp.data != null) {
            signedKey.signedKey = resp.data.signed_key
            data.users.push(resp.data)
            signedKey.signedKeyInfo = data
            ElMessage.success('绑定成功')
          }
        }
      }
    }
  } finally {
    loading.value = false
  }
}

const orderID = ref<string>()
const orderQuerySuccess = ref(false)
async function buy(
  responseFn: (userId: string, backupUserId?: string) => Promise<FetchResponse<any, any, any>>,
  shouldAssignKey: boolean = true,
) {
  loading.value = true
  buyResult.value = undefined
  buyQrcodeUrl.value = ''
  buyDialogVisible.value = true
  orderQuerySuccess.value = false
  try {
    buyDialogLoading.value = true
    const userId = user.getUserId()?.toString()
    const backupUserId = user.info?.value?.encryptUserId
    if (userId == null) {
      ElMessage.error('请先登录')
      return
    }
    const response = await responseFn(userId, backupUserId)
    const errMsg = signedKey.signedKeyReqHandler(response)
    if (errMsg != null) {
      return response
    }
    const stream = events(response.response)
    for await (const event of stream) {
      if (orderQuerySuccess.value) {
        continue
      }
      const { data } = event
      if (data != null) {
        if (data === '[DONE]') {
          return
        }
        const resp = JSON.parse(data) as components['schemas']['OrderResp']
        if (resp.errmsg != null) {
          ElMessage.error(resp.errmsg)
        } else if (resp.order != null) {
          buyQrcodeUrl.value = resp.order.qr_code_url
          orderID.value = resp.order.order_id
          startBuyExpireTime((Date.parse(resp.order.expire_time) - Date.now()) / 1000)
        } else if (resp.key != null && resp.user != null) {
          const info = {
            key: resp.key,
            users: [resp.user],
          }
          if (shouldAssignKey) {
            // signedKey.value = resp.key.signed_key
            signedKey.signedKeyInfo = jsonClone(info)
          }

          buyResult.value = jsonClone(info)
          keyValue.value = resp.key.signed_key
          ElMessage.success(resp.msg ?? '购买成功')
        }
      }
    }
  } finally {
    buyDialogLoading.value = false
    loading.value = false
  }
}

async function queryOrder() {
  if (orderID.value == null) {
    ElMessage.error('无订单号')
    return
  }
  const res = await signedKey.client.POST('/v1/key/query_order', {
    body: {
      order_id: orderID.value,
    },
  })
  const errMsg = signedKey.signedKeyReqHandler(res)
  const resp = res.data
  if (errMsg != null || resp == null) {
    return
  }

  if (resp.key != null && resp.user != null) {
    const info = {
      key: resp.key,
      users: [resp.user],
    }

    buyResult.value = jsonClone(info)
    keyValue.value = resp.key.signed_key
    ElMessage.success(resp.msg ?? '购买成功')
    orderQuerySuccess.value = true
  } else if (resp.errmsg != null) {
    ElMessage.error(resp.errmsg)
  }
}

async function buyKey() {
  try {
    await ElMessageBox.confirm(
      `<h2 id="-">须知</h2>
<p>密钥购买需要充值使用，首次购买赠送5元余额</p>
<p>密钥模型价格携带服务器/开发等成本，价格会高一些</p>
<p>密钥购买后将自动绑定当前账号，未登录不可购买</p>
<p>密钥购买后需要自行保管，绑定后会保存到sync存储中跟随浏览器账号同步，但丢失概不负责</p>
<p>不要将密钥公布和发到其他平台，造成余额盗刷概不负责</p>
<h2 id="-">服务</h2>
<ol>
<li>可直接使用各大模型，无需二次配置</li>
<li>可使用特别优化Prompt</li>
<li>优先技术支持</li>
<li>专属微信群</li>
</ol>
<h2 id="-">隐私收集</h2>
<ul>
<li>购买后将和账号id进行匹配，除此之外不再收集其他信息</li>
<li>仅使用模型，仅会记录 Prompt 和 Output</li>
<li>使用优化Prompt，才需要上传当前简历信息和岗位信息，进行Prompt优化</li>
</ul>`,
      '购前须知',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        dangerouslyUseHTMLString: true,
      },
    )
  } catch {
    return
  }
  try {
    buyDialogStatus.value = 'key'
    buyOrderName.value = `购买密钥 ${signedKey.netConf?.price_info?.signedKey ?? 15}元`
    const response = await buy(async (userId: string, backupUserId?: string) => {
      buySignal = new AbortController()
      const res = await signedKey.client.POST('/v1/key/purchase_key', {
        body: {
          data: {
            user_id: userId,
            backup_user_id: backupUserId,
          },
        },
        parseAs: 'stream',
        signal: buySignal.signal,
      })
      return res
    })
    if (response != null && response.response.status === 488) {
      try {
        const errMsg = signedKey.signedKeyReqHandler(response, false)
        await ElMessageBox.confirm(errMsg ?? '当前用户已绑定密钥，是否强制解绑?', '购买失败', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
        })
      } catch {
        return
      }
      await buy(async (userId: string, backupUserId?: string) => {
        buySignal = new AbortController()
        const res = await signedKey.client.POST('/v1/key/purchase_key', {
          body: {
            data: {
              user_id: userId,
              backup_user_id: backupUserId,
            },
            callback: 'force_unbind',
          },
          parseAs: 'stream',
          signal: buySignal.signal,
        })
        return res
      })
    }
  } catch (e: any) {
    logger.error(e)
    ElMessage.error(`购买失败 ${e.message}`)
  }
}

async function buyAccount() {
  buyDialogStatus.value = 'account'
  buyOrderName.value = `购买账号位 ${signedKey.netConf?.price_info?.account ?? 5}元`
  await buy(async () => {
    buySignal = new AbortController()
    const res = await signedKey.client.POST('/v1/key/purchase_account', {
      parseAs: 'stream',
      signal: buySignal.signal,
    })
    return res
  }, false)
}

async function buyBalance() {
  buyDialogStatus.value = 'balance'
  const amount = balanceAmount.value === -1 ? balanceAmountCustom.value : balanceAmount.value
  buyOrderName.value = `余额充值 ${amount}元`
  await buy(async () => {
    buySignal = new AbortController()
    const res = await signedKey.client.POST('/v1/key/recharge_key', {
      body: {
        amount,
      },
      parseAs: 'stream',
      signal: buySignal.signal,
    })
    return res
  }, false)
}

function openBalance() {
  loading.value = true
  buyResult.value = undefined
  buyDialogVisible.value = true
  buyDialogStatus.value = 'balanceSelect'
}

function unbindKey() {
  keyValue.value = signedKey.signedKey
  signedKey.signedKey = ''
}

function handleClose(done?: () => void) {
  const c = () => {
    if (done != null) {
      done()
    } else {
      buyDialogVisible.value = false
    }
    loading.value = false
    buySignal?.abort()
  }

  if (buyResult.value != null) {
    c()
  } else {
    ElMessageBox.confirm('确定要关闭支付吗？', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
      .then(() => {
        c()
      })
      .catch(() => {
        // catch error
      })
  }
}

function setRemark(row: any) {
  ElMessageBox.prompt('请输入备注', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  })
    .then(async ({ value }) => {
      const resp = await signedKey.client.PUT('/v1/key/remark', {
        body: {
          remark: value,
          id: row.id,
        },
      })
      signedKey.signedKeyReqHandler(resp)
      if (resp.error == null) {
        row.remark = value
        ElMessage.success('备注修改成功')
      }
    })
    .catch(() => {})
}

function copyKey() {
  navigator.clipboard.writeText(buyResult.value?.key.signed_key ?? '')
  ElMessage.success('密钥已复制到剪贴板')
}
async function updateResume() {
  try {
    loading.value = true
    await signedKey.updateResume()
  } finally {
    loading.value = false
  }
}
const showPreview = ref(false)
const srcList = ref<string[]>([])

async function contact() {
  const resp = await signedKey.client.GET('/v1/key/contact', {
    parseAs: 'blob',
  })
  const errMsg = signedKey.signedKeyReqHandler(resp)
  if (errMsg != null || resp.data == null) {
    return
  }
  const url = URL.createObjectURL(resp.data)
  srcList.value = [url]
  showPreview.value = true
}

const balance = computed(() => {
  return Number(signedKey.signedKeyInfo?.key?.balance ?? 0).toFixed(2)
})

const userAccount = computed(() => {
  return `${signedKey.signedKeyInfo?.users?.length ?? 0}/${signedKey.signedKeyInfo?.key?.user_capacity ?? 0}`
})

watch(
  () => signedKey.signedKeyBak,
  (v) => {
    keyValue.value = v
  },
)

onMounted(() => {
  if (signedKey.signedKey != null) {
    keyValue.value = signedKey.signedKey
    signedKey.signedKeyInfo = jsonClone(signedKey.signedKeyInfo)
  } else if (signedKey.signedKeyBak != null) {
    keyValue.value = signedKey.signedKeyBak
  }
  logger.info('signedKey', {
    keyValue,
    signedKey: signedKey.signedKey,
    signedKeyBak: signedKey.signedKeyBak,
  })
})
</script>

<template>
  <ElForm>
    <ElAlert
      style="margin-bottom: 10px"
      show-icon
      title="所有功能全免费使用，无任何限制包括AI功能。"
      description="但因脚本使用人数多维护难度大，也为了能照顾小白用户和脚本更好的维护推出密钥系统。并且代码整理完后也会继续开源供大家学习, 如购买出现问题可发邮件联系作者：boss-helper@ocyss.icu"
      type="success"
    />
    <ElFormItem class="bh-input-group">
      <ElInput
        v-show="!signedKey"
        v-model="keyValue"
        style="max-width: 300px"
        placeholder="boss-helper/01JPCJ..."
        size="small"
      />
      <div v-if="!!signedKey" style="font-size: 17px">
        <span>余额: {{ balance }}</span>
        <ElPopover placement="right" :width="400" trigger="click">
          <template #reference>
            <ElButton style="margin: 0 16px"> 账号位: {{ userAccount }} </ElButton>
          </template>
          <h3>账号列表</h3>
          <ElTable :data="signedKey.signedKeyInfo?.users">
            <ElTableColumn width="150" property="user_id" label="用户ID" />
            <ElTableColumn width="100" property="remark" label="备注" />
            <ElTableColumn label="操作">
              <template #default="scope">
                <ElButton link type="primary" size="small" @click.prevent="setRemark(scope.row)">
                  修改备注
                </ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElPopover>
      </div>
      <ElButtonGroup style="margin-left: 10px">
        <template v-if="!signedKey.signedKey">
          <ElButton type="primary" :loading="loading" @click="bindKey"> 绑定密钥 </ElButton>
          <ElButton type="success" :loading="loading" @click="buyKey">
            购买密钥 {{ signedKey.netConf?.price_info?.signedKey ?? 15 }}元
          </ElButton>
        </template>
        <template v-else>
          <ElButton type="success" :loading="loading" @click="updateResume"> 更新简历 </ElButton>
          <ElButton type="success" :loading="loading" @click="openBalance"> 余额充值 </ElButton>
          <ElButton type="success" :loading="loading" @click="buyAccount">
            账号位 {{ signedKey.netConf?.price_info?.account ?? 5 }}元
          </ElButton>
          <ElButton type="success" :loading="loading" @click="contact"> 联系作者 </ElButton>
          <ElButton type="warning" :loading="loading" @click="unbindKey"> 解绑 </ElButton>
        </template>
      </ElButtonGroup>
    </ElFormItem>
    <ElImageViewer v-if="showPreview" :url-list="srcList" teleported @close="showPreview = false" />
    <Ai />
  </ElForm>

  <ElDialog
    v-model="buyDialogVisible"
    :title="buyDialogStatus === 'balanceSelect' ? '余额充值' : '支付'"
    width="500"
    :before-close="handleClose"
  >
    <div v-if="buyDialogStatus === 'balanceSelect'" class="bh-buy-dialog">
      <ElRadioGroup v-model="balanceAmount" size="large">
        <ElSpace wrap>
          <ElRadio
            v-for="item in [1, 3, 5, 10, 20, 30, 50, 100]"
            :key="item"
            border
            :label="item"
            :value="item"
          >
            {{ item }}元
          </ElRadio>
          <ElRadio border label="自定义" :value="-1">
            <ElInputNumber
              v-model="balanceAmountCustom"
              style="width: 80px"
              :precision="2"
              :step="1"
              :min="1"
              :max="9999"
              size="small"
              :controls="false"
            />
          </ElRadio>
        </ElSpace>
      </ElRadioGroup>
    </div>
    <div v-else-if="buyResult == null" class="bh-buy-dialog">
      <div>
        <svg
          class="icon"
          viewBox="0 0 3903 1024"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          p-id="2748"
          width="200"
          height="80"
        >
          <path
            d="M3486.212302 961.260464a27.322015 27.322015 0 0 1-25.306457 19.867648 40.663092 40.663092 0 0 1-14.65279-3.1993l-8.030241-3.199299v38.007674l3.999124 1.27972a68.720946 68.720946 0 0 0 21.115375 2.623425 73.583881 73.583881 0 0 0 65.553639-55.859763l76.78318-188.566692v-7.326395h-40.055225l-46.037915 122.437178-43.638441-121.861304h-45.845957l68.369023 168.155163z m-30.5853-509.360418l45.078125-27.034078-2.847376-4.766956c-28.793692-47.989487-50.836864-82.317967-69.392799-107.848374l-3.199299-4.415033-42.390714 25.786351 3.551222 4.894928a940.37 940.37 0 0 1 66.321471 107.944353z m-167.003416 478.071272a62.066404 62.066404 0 0 0 43.062567 14.300867 63.122172 63.122172 0 0 0 46.42183-18.39597v14.33286h41.206973v-110.791729a60.338782 60.338782 0 0 0-67.185282-67.793149 119.46183 119.46183 0 0 0-61.362558 15.996495l-17.916075 10.493702h15.708559V822.410881l9.597897-7.614332a80.270416 80.270416 0 0 1 51.572703-18.459956 26.042295 26.042295 0 0 1 28.249811 29.529531l-44.790188 6.398598c-50.356969 7.070451-60.786684 35.992115-60.786684 59.027069a50.26099 50.26099 0 0 0 16.220447 38.679527z m-180.984353 10.237757h41.782847v-84.781427h25.24247a94.667262 94.667262 0 0 0 65.969549-21.179361 74.319719 74.319719 0 0 0 26.618169-58.835111 67.825142 67.825142 0 0 0-23.066947-55.347875 94.059395 94.059395 0 0 0-63.346124-19.419746h-73.199964v239.56352z m-232.589049-139.361471h28.793693v88.396636a47.093684 47.093684 0 0 0 50.964835 54.388086 61.298572 61.298572 0 0 0 29.241594-5.918704l3.1993-1.631642v-39.095436l-9.40594 6.814507a23.386877 23.386877 0 0 1-13.884958 4.095103 17.404187 17.404187 0 0 1-13.948945-4.70297 32.632851 32.632851 0 0 1-4.223074-19.835655v-83.181778h42.070783v-35.19229h-42.070783v-50.292983l-41.81484 12.797197v37.943688h-28.793693v35.19229z m-148.415487 129.123714a62.13039 62.13039 0 0 0 43.062566 14.300867 63.186158 63.186158 0 0 0 46.453824-18.39597v14.33286h41.17498v-110.791729a60.338782 60.338782 0 0 0-67.185282-67.793149 119.237879 119.237879 0 0 0-61.330565 15.996495l-17.948068 10.493702h15.708559V822.410881l9.597897-7.614332a80.334402 80.334402 0 0 1 51.572702-18.459956 26.010302 26.010302 0 0 1 28.249812 29.529531l-44.790188 6.398598c-50.356969 7.070451-60.786684 35.992115-60.786684 59.027069a50.26099 50.26099 0 0 0 16.220447 38.679527z m-333.622916-601.468241v42.710644h295.423284v-42.710644H2393.075767z m295.423284-32.184949V253.607484H2393.075767v42.710644h295.423284z m-4.223075 107.688409h-285.793394v181.496241H2447.463852v-27.865895h187.798861v27.865895h48.949277v-181.496241z m-155.38996 536.298517h41.81484v-97.994533a44.374279 44.374279 0 0 1 11.133561-32.248935 36.280052 36.280052 0 0 1 28.057853-12.605239c13.724993 0 31.992992 4.511012 31.992992 43.670434v99.178273h41.81484v-106.120752c0-59.89088-34.264494-72.464126-62.9942-72.464126a66.609408 66.609408 0 0 0-50.005046 20.187577V687.400456h-41.81484v252.744633z m-187.702881-29.657503a114.470924 114.470924 0 0 0 85.389294 33.14474 151.774752 151.774752 0 0 0 68.209058-14.012931l3.199299-1.567656v-41.238966l-8.830066 5.022899a116.806412 116.806412 0 0 1-58.323223 14.300867 74.031782 74.031782 0 0 1-56.403644-22.395094 83.757652 83.757652 0 0 1-21.883206-61.202592 89.580376 89.580376 0 0 1 23.066946-64.657836 79.982479 79.982479 0 0 1 60.018853-23.7388 106.920578 106.920578 0 0 1 52.980394 12.605239l8.798072 4.862934V707.236111l-3.42325-1.503671a144.16042 144.16042 0 0 0-58.355216-9.821848 124.036828 124.036828 0 0 0-90.764117 35.384249 125.540499 125.540499 0 0 0-35.92813 92.779675 118.757985 118.757985 0 0 0 32.248936 86.477056z m-187.063022 8.574122a78.542794 78.542794 0 0 0 61.49053 24.570618 110.247849 110.247849 0 0 0 62.194375-15.996496l2.55944-1.695629v-39.799281l-9.341954 6.718528a82.733876 82.733876 0 0 1-48.789312 16.284433 47.669557 47.669557 0 0 1-34.936347-12.797197 46.645782 46.645782 0 0 1-12.797196-30.361349h118.022145v-20.795444a86.381077 86.381077 0 0 0-20.155584-61.298572 72.880035 72.880035 0 0 0-56.019728-22.171143 79.054682 79.054682 0 0 0-60.274796 26.266246 91.7559 91.7559 0 0 0-23.7388 65.329688 93.067612 93.067612 0 0 0 21.787227 65.649619z m-272.900218 20.507508h44.310294l47.765536-163.804117 47.317634 163.804117h44.37428l69.392798-239.563521H2089.142347l-46.357844 173.306035-48.597355-173.306035h-38.967463L1903.582996 873.759632l-48.405396-173.689951H1809.203671z m-33.720613-407.014839l-5.278843 3.391257 3.839159 4.766956a286.177309 286.177309 0 0 1 21.211353 29.017643l3.391257 5.438809 5.214858-3.839159a143.680525 143.680525 0 0 0 50.996828-123.556933V432.096384h51.956618v41.366938a40.023232 40.023232 0 0 1-11.485484 29.657503l-3.74318 3.615208 31.992992 38.39159 4.606991-4.447026 6.046675-5.982689c4.06311-4.06311 8.286185-8.286185 13.021148-12.445274a1109.356981 1109.356981 0 0 1 59.794901-49.685116l3.039334-2.335488-1.055769-3.615208c-2.14353-7.518353-4.031117-15.996496-6.046675-25.306457l-2.271502-10.397722-2.207517-9.757862-7.550346 6.8465a1344.985364 1344.985364 0 0 1-40.599106 35.384249v-74.095769h-139.77738v55.027946a96.426876 96.426876 0 0 1-35.096312 88.300656zM1341.530121 261.029858L649.713672 646.449427l-4.191082 2.303496a37.271835 37.271835 0 0 1-18.044047 4.095102 40.119211 40.119211 0 0 1-34.840368-19.771668l-2.431467-5.790732-109.384038-231.693244a18.363977 18.363977 0 0 1-1.791608-8.12622 19.67569 19.67569 0 0 1 19.835655-19.195795 18.651914 18.651914 0 0 1 11.997372 4.06311l128.643819 88.23667a62.354341 62.354341 0 0 0 33.04876 9.309961 57.587385 57.587385 0 0 0 20.443522-3.487236l607.067014-261.318755A653.64881 653.64881 0 0 0 809.006777 0.190998C477.207462 0.190998 207.954445 216.783551 207.954445 483.893037c0 145.760069 81.134227 276.995321 207.954445 365.871851a38.007674 38.007674 0 0 1 16.828314 31.353132 43.350504 43.350504 0 0 1-2.399475 12.18933c-10.205764 36.567989-26.458204 94.667262-27.034078 97.546631a57.587385 57.587385 0 0 0-3.007341 13.948944 19.643697 19.643697 0 0 0 19.835655 19.195795 26.458204 26.458204 0 0 0 11.421498-3.487236l132.227034-72.016224a60.978642 60.978642 0 0 1 31.992991-8.702093 82.477932 82.477932 0 0 1 17.436181 2.335488 741.693523 741.693523 0 0 0 195.957073 26.682155c331.767322 0 601.052332-216.592553 601.052332-483.702039a406.310992 406.310992 0 0 0-68.688953-224.174892z m489.076862-144.992237l-2.655419 5.534787a436.448391 436.448391 0 0 1-89.580376 119.78176l-2.527446 2.495454 1.119754 3.199299c4.127096 11.8694 8.350171 24.154709 11.293526 35.576206l2.495454 9.597898 7.326395-6.878493a563.748504 563.748504 0 0 0 110.4718-142.560771l2.655418-4.862934zM2226.232316 203.666424h-102.377573c5.950696-24.090723 11.453491-49.333193 16.348419-75.18353l1.055768-5.56678-44.2783-7.934262-0.831818 5.918703a682.570474 682.570474 0 0 1-44.214314 168.123171v-131.171266h-42.390714V240.138435h-27.929881V122.276254h-43.574455v118.374069H1909.981595V158.17239h-42.390714v101.865685l-37.975681-17.276215-2.399474 5.34283a568.771404 568.771404 0 0 1-91.659921 143.168637l-2.271503 2.559439 1.247727 3.199299c4.255068 10.813631 8.44615 23.162926 12.477267 36.695961l2.847376 9.597898 7.102444-7.422374a486.677387 486.677387 0 0 0 31.992992-36.79194V582.463444H1833.198415v-247.945684c11.005589-17.532159 21.787227-37.11187 34.552431-62.738257v11.645449h141.824931v15.100692h38.39159c-2.207516 4.990907-4.447026 9.94982-6.782514 14.780762h-163.772124v43.862392h165.019851v-32.696838a206.546753 206.546753 0 0 1 20.763451 22.395094l5.98269 7.358388 3.999123-8.542128c1.759615-3.839159 3.551222-7.582339 5.34283-11.357512l1.59965-3.391257a445.694365 445.694365 0 0 0 29.913447 121.797318 390.954357 390.954357 0 0 1-78.734752 95.978975l-3.967131 3.647201 3.519229 4.095103c7.80629 9.054017 15.388629 18.459956 23.226912 28.793692l4.063109 5.374823 4.830942-4.766956a472.472499 472.472499 0 0 0 70.192624-85.997161 373.614155 373.614155 0 0 0 66.385457 82.605904l5.630767 5.34283 3.679194-6.782515c6.398598-11.8694 12.797197-23.258905 20.315549-35.800157l2.399475-4.06311-3.647201-3.199299a287.936924 287.936924 0 0 1-70.064652-84.717442 624.279244 624.279244 0 0 0 45.23809-204.947103h23.258905V203.282508z m109.096101-90.220236l-1.599649 5.502795a766.648056 766.648056 0 0 1-105.576873 222.543249l-1.727621 2.495453 21.243346 50.197004 6.238634-7.742304a555.526305 555.526305 0 0 0 36.376031-51.412737v250.47313h46.581796V247.592802a1120.426557 1120.426557 0 0 0 45.430048-115.014805l1.8236-5.56678z m381.964326 63.985983H2569.03722l5.0229-2.495453-3.199299-5.182865a1366.676612 1366.676612 0 0 0-34.392466-53.04438l-2.911362-4.287061-42.806623 21.467298 3.391257 5.214857c7.838283 12.029365 15.996496 25.082505 24.69859 38.903478h-152.414612v43.286518H2717.164771V177.432171z m414.789135 146.207972l0.511888-1.087762V283.137015H2996.783517V225.357673h208.530319V180.343533H2996.783517V113.57416h-51.412737v66.769373h-218.800069v45.590013h218.800069V284.288763h-171.32247v45.014139h49.365186a389.290721 389.290721 0 0 0 101.993657 147.167761 845.414801 845.414801 0 0 1-195.477178 63.538081l-8.894052 1.951573 5.534788 7.006465a169.178939 169.178939 0 0 1 20.347542 35.416242l1.983566 4.415032 4.830941-1.18374a817.708871 817.708871 0 0 0 213.617205-79.982479 616.21701 616.21701 0 0 0 209.93801 73.167972l4.031117 0.767831 2.143531-3.42325c7.550346-12.157337 16.508384-25.338449 27.417993-40.279176l5.502795-7.550346-9.597897-1.343706a639.859831 639.859831 0 0 1-192.245887-54.100148A424.770949 424.770949 0 0 0 3132.113871 323.640143z m194.10148-210.67385l-1.887587 5.694753a783.828293 783.828293 0 0 1-109.19208 220.271747l-1.983565 2.687411 1.471677 3.007341a387.627085 387.627085 0 0 1 15.324643 43.382497l3.359265 10.621673 6.942479-8.862059a696.807356 696.807356 0 0 0 44.118335-63.666053V582.463444h50.228997V232.524103c15.260657-32.792816 28.537748-63.985983 40.503127-95.659045l2.015558-5.278844zM3695.190522 220.398759h-69.712728V118.789018h-50.804871v101.609741h-220.591676v46.773754h221.16755v218.480139a51.476723 51.476723 0 0 1-6.398598 32.792816v0.191958a30.617293 30.617293 0 0 1-25.274464 7.230416h-0.255943c-16.764328 0-40.695085-1.183741-71.056435-3.487236l-7.902269-0.575874 1.727622 7.48636c3.199299 13.37307 5.502795 26.52219 7.710311 41.366938l0.703846 4.766956 18.587928 0.351923c17.43618 0.31993 31.705055 0.575874 43.126552 0.575874 6.014682 0 11.197547 0 15.676566-0.255944a74.383705 74.383705 0 0 0 55.091932-21.115375 83.181778 83.181778 0 0 0 18.555935-58.29123V267.172513h69.648742V220.398759z m-818.66866 108.328269h193.621585a325.880612 325.880612 0 0 1-100.905896 119.013929 295.039368 295.039368 0 0 1-92.715689-119.013929zM2111.537441 248.008711h46.549803a821.963939 821.963939 0 0 1-24.986526 147.391712A500.594339 500.594339 0 0 1 2111.537441 248.008711z m104.105195 548.167917a32.568865 32.568865 0 0 1 25.594393 10.237757 41.302952 41.302952 0 0 1 9.213982 24.890547h-74.671643a52.72445 52.72445 0 0 1 13.501043-24.154708 35.000333 35.000333 0 0 1 26.266246-10.973596zM2447.463852 446.621202h187.798861v67.633184H2447.463852v-67.633184z m335.030608 416.324799l33.112746-3.903145v9.277967a39.89526 39.89526 0 0 1-11.069575 29.241595 37.559772 37.559772 0 0 1-28.153833 11.54947 26.106281 26.106281 0 0 1-18.683907-5.886711 20.187578 20.187578 0 0 1-6.686535-15.132685 20.667473 20.667473 0 0 1 5.822725-16.668348 48.789312 48.789312 0 0 1 25.594393-8.478143z m440.607479-86.924958a37.463793 37.463793 0 0 1-12.41328 30.553307 59.315006 59.315006 0 0 1-38.807499 10.781638h-22.395094v-79.982479h25.402435c32.824809 0.159965 48.149452 12.381288 48.149452 38.647534z m121.38141 86.924958l33.112746-3.903145v9.277967a39.89526 39.89526 0 0 1-11.069575 29.241595 37.559772 37.559772 0 0 1-28.153832 11.54947 26.106281 26.106281 0 0 1-18.683907-5.886711 20.187578 20.187578 0 0 1-6.686536-15.132685 20.667473 20.667473 0 0 1 5.822725-16.668348 48.789312 48.789312 0 0 1 25.594393-8.478143z"
            fill="#22AE1C"
            p-id="2749"
          />
        </svg>
      </div>
      <div style="margin-top: 6px; font-size: 18px"><b>商品名：</b>{{ buyOrderName }}</div>
      <div style="margin-top: 6px; font-size: 18px">
        <b>剩余时间：</b
        >{{
          Math.floor(buyExpireTime / 60)
            .toString()
            .padStart(2, '0')
        }}:{{
          Math.floor(buyExpireTime % 60)
            .toString()
            .padStart(2, '0')
        }}
      </div>
      <ElImage
        style="width: 300px; height: 300px"
        :src="buyQrcode"
        :zoom-rate="1.2"
        :max-scale="7"
        :min-scale="0.2"
        :preview-src-list="[buyQrcode]"
        show-progress
        :initial-index="4"
        fit="cover"
      />
    </div>
    <div v-else class="bh-buy-dialog">
      <div class="success-title">
        <span style="font-size: 22px">支付成功</span>
      </div>
      <div class="order-info"><b>商品名：</b>{{ buyOrderName }}</div>
      <ElAlert
        title="请妥善保管密钥，丢失无法找回"
        type="warning"
        :closable="false"
        show-icon
        style="margin: 15px 0"
      />
      <ElInput
        v-model="buyResult.key.signed_key"
        type="textarea"
        :rows="3"
        placeholder="密钥"
        readonly
        style="width: 100%; margin-top: 10px"
      >
        <template #prepend> 密钥 </template>
      </ElInput>
    </div>

    <template #footer>
      <div v-if="buyDialogStatus === 'balanceSelect'" class="dialog-footer">
        <ElButton
          type="primary"
          @click="
            () => {
              buyDialogVisible = false
              buyDialogLoading = false
            }
          "
        >
          取消
        </ElButton>
        <ElButton type="primary" @click="buyBalance()"> 生成订单 </ElButton>
      </div>
      <div v-else-if="buyResult == null" class="dialog-footer">
        <ElButton @click="handleClose()"> 取消 </ElButton>
        <ElButton type="primary" @click="queryOrder"> 我已经支付 </ElButton>
      </div>
      <div v-else class="dialog-footer">
        <ElButton type="primary" @click="copyKey()"> 复制密钥 </ElButton>
        <ElButton type="primary" @click="buyDialogVisible = false"> 我已经保存好密钥 </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style lang="scss" scoped>
.bh-input-group {
  display: flex;
  justify-content: center;
  align-items: center;
}
.bh-buy-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>

<style>
.ehp-radio .ehp-input-number.is-without-controls .ehp-input__wrapper {
  padding: 0px;
}
</style>
