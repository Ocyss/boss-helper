<script lang="ts" setup>
import type {
  TableV2Instance,
} from 'element-plus'
import {
  ElAutoResizer,
  ElButton,
  ElCollapse,
  ElCollapseItem,
  ElDialog,
  ElTableV2,
  ElTabPane,
  ElTabs,
} from 'element-plus'

import { ref } from 'vue'
import JobCard from '@/components/JobCard.vue'
import { useLog } from '@/stores/log'

const tableRef = ref<TableV2Instance>()
const { filterData, columns, dialogData } = useLog()

const aiFilterActiveNames = ref('response')
const aiGreetActiveNames = ref('response')

// watchEffect(() => {
//   tableRef.value?.scrollToRow(data.value.length - 1);
// });
</script>

<template>
  <ElAutoResizer :disable-height="true">
    <template #default="{ width }">
      <ElTableV2
        ref="tableRef"
        :columns="columns"
        :data="filterData"
        :height="360"
        :width
      />
    </template>
  </ElAutoResizer>
  <ElDialog v-model="dialogData.show" title="日志详情" width="80%">
    <div class="log-detail">
      <div class="log-detail-left">
        <JobCard v-if="dialogData.data?.job" :job="dialogData.data.job" />
      </div>
      <div class="log-detail-right">
        <ElTabs class="demo-tabs">
          <ElTabPane v-if="dialogData.data?.data?.aiFilteringQ" label="AI过滤" name="first">
            <ElCollapse v-model="aiFilterActiveNames" accordion>
              <ElCollapseItem title="Prompt" name="prompt">
                <div class="ai-text">
                  {{ dialogData.data.data.aiFilteringQ }}
                </div>
              </ElCollapseItem>
              <ElCollapseItem v-if="dialogData.data.data.aiFilteringR" title="思考过程" name="thinking">
                <div class="ai-text">
                  {{ dialogData.data.data.aiFilteringR }}
                </div>
              </ElCollapseItem>
              <ElCollapseItem title="响应" name="response" class="active">
                <div class="ai-text">
                  {{ dialogData.data.data.aiFilteringAtext }}
                </div>
              </ElCollapseItem>
            </ElCollapse>
          </ElTabPane>
          <ElTabPane v-if="dialogData.data?.data?.aiGreetingQ" label="AI打招呼" name="second">
            <ElCollapse v-model="aiGreetActiveNames" accordion>
              <ElCollapseItem title="Prompt" name="prompt">
                <div class="ai-text">
                  {{ dialogData.data.data.aiGreetingQ }}
                </div>
              </ElCollapseItem>
              <ElCollapseItem v-if="dialogData.data.data.aiGreetingR" title="思考过程" name="thinking">
                <div class="ai-text">
                  {{ dialogData.data.data.aiGreetingR }}
                </div>
              </ElCollapseItem>
              <ElCollapseItem title="响应" name="response" class="active">
                <div class="ai-text">
                  {{ dialogData.data.data.aiGreetingA }}
                </div>
              </ElCollapseItem>
            </ElCollapse>
          </ElTabPane>
          <ElTabPane v-if="dialogData.data?.data?.err" label="错误信息" name="fourth">
            <div>
              {{ dialogData.data.data.err }}
            </div>
            <div v-if="dialogData.data?.data?.message">
              {{ dialogData.data.data.message }}
            </div>
          </ElTabPane>
        </ElTabs>
      </div>
    </div>
    <template #footer>
      <ElButton @click="dialogData.show = false">
        关闭
      </ElButton>
    </template>
  </ElDialog>
</template>

<style lang="scss">
.ehp-table-v2__row-depth-0 {
  height: 50px;
}

.ehp-table-v2__cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-detail {
    display: flex;
    gap: 20px;
    min-height: 500px;

    &-left {
    flex: 0 0 350px;
    }

    &-right {
    flex: 1;
    overflow-y: auto;
    }
    }

    .log-section {
    padding: 16px;
    background: #f5f7fa;
    border-radius: 8px;
    margin-bottom: 16px;

    h4 {
    margin: 0 0 12px;
    color: #606266;
    }
    }

    .ai-qa {
    .ai-q {
    color: #606266;
    margin-bottom: 8px;
    }
    .ai-a {
    color: #303133;
    white-space: pre-wrap;
    }
    }

    .ai-text {
    white-space: pre-wrap;
    user-select: text;
    padding: 8px;
    line-height: 1.5;
    }

    .ehp-collapse-item.active {
    .ehp-collapse-item__header {
    border-bottom-color: transparent;
    }
    }
</style>
