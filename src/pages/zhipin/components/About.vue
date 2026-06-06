<script lang="ts" setup>
import { ElAlert, ElLink, ElSpace, ElTag } from 'element-plus'
</script>

<template>
  <div class="about-page">
    <section class="about-section" data-help="当前 fork 的维护信息和反馈入口">
      <div class="section-title">
        <span>本 fork</span>
        <ElTag type="success" effect="plain">AI Greeting</ElTag>
      </div>
      <div class="about-grid">
        <div class="about-item">
          <span class="label">项目名称</span>
          <span class="value">boss-helper-ai-greeting</span>
        </div>
        <div class="about-item">
          <span class="label">源代码仓库</span>
          <ElLink
            href="https://github.com/ZhuYiwen020118/boss-helper-ai-greeting"
            target="_blank"
            type="primary"
          >
            ZhuYiwen020118/boss-helper-ai-greeting
          </ElLink>
        </div>
        <div class="about-item">
          <span class="label">小白说明文档</span>
          <ElLink
            href="https://github.com/ZhuYiwen020118/boss-helper-ai-greeting/blob/user-migration-from-0.4.4/docs/BEGINNER_GUIDE.md"
            target="_blank"
            type="primary"
          >
            BEGINNER_GUIDE.md
          </ElLink>
        </div>
        <div class="about-item">
          <span class="label">问题反馈</span>
          <ElLink href="mailto:25435825@life.hkbu.edu.hk" type="primary">
            25435825@life.hkbu.edu.hk
          </ElLink>
        </div>
        <div class="about-item">
          <span class="label">版本基线</span>
          <span class="value">基于 Ocyss/boss-helper 0.4.4 fork 维护</span>
        </div>
        <div class="about-item">
          <span class="label">当前状态</span>
          <span class="value">Chrome MV3 未打包扩展，重点增强 AI 招呼语和聊天页补发</span>
        </div>
      </div>
    </section>

    <section class="about-section" data-help="后续可以补充你的公开主页、交流群或赞赏方式">
      <div class="section-title">
        <span>后续补充</span>
        <ElTag type="info" effect="plain">预留</ElTag>
      </div>
      <div class="placeholder-list">
        <div>个人主页：待补充</div>
        <div>交流群：待补充</div>
        <div>赞赏/支持：待补充</div>
        <div>更多使用文档：待补充</div>
      </div>
    </section>

    <section class="about-section" data-help="原作者和上游项目的署名信息">
      <div class="section-title">
        <span>原作者与上游项目</span>
        <ElTag type="warning" effect="plain">MIT License</ElTag>
      </div>
      <ElAlert
        class="upstream-alert"
        type="info"
        :closable="false"
        show-icon
        title="本项目是基于上游开源项目 fork 的个人维护版本，原始版权与许可证声明保留在 LICENSE 中。"
      />
      <div class="about-grid upstream-grid">
        <div class="about-item">
          <span class="label">原作者</span>
          <ElLink href="https://github.com/Ocyss" target="_blank" type="primary">Ocyss</ElLink>
        </div>
        <div class="about-item">
          <span class="label">上游仓库</span>
          <ElLink href="https://github.com/Ocyss/boss-helper" target="_blank" type="primary">
            Ocyss/boss-helper
          </ElLink>
        </div>
        <div class="about-item">
          <span class="label">上游油猴脚本</span>
          <ElLink href="https://greasyfork.org/zh-CN/scripts/491340" target="_blank" type="primary">
            Greasy Fork
          </ElLink>
        </div>
        <div class="about-item">
          <span class="label">贡献者</span>
          <ElSpace wrap>
            <ElLink href="https://github.com/yangfeng20" target="_blank" type="primary">
              yangfeng20
            </ElLink>
            <ElLink href="https://github.com/engvuchen" target="_blank" type="primary">
              engvuchen
            </ElLink>
          </ElSpace>
        </div>
        <div class="about-item wide">
          <span class="label">相关项目致谢</span>
          <ElSpace wrap>
            <ElLink
              href="https://github.com/lisonge/vite-plugin-monkey"
              target="_blank"
              type="primary"
            >
              vite-plugin-monkey
            </ElLink>
            <ElLink
              href="https://github.com/chatanywhere/GPT_API_free"
              target="_blank"
              type="primary"
            >
              GPT_API_free
            </ElLink>
          </ElSpace>
        </div>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.about-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #303133;
  line-height: 1.6;
}

.about-section {
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 15px;
  font-weight: 700;
}

.about-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
}

.about-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.about-item.wide {
  grid-column: 1 / -1;
}

.label {
  color: #909399;
  font-size: 12px;
}

.value {
  color: #303133;
  word-break: break-word;
}

.placeholder-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
  color: #606266;
}

.upstream-alert {
  margin-bottom: 10px;
}

@media (max-width: 720px) {
  .about-grid,
  .placeholder-list {
    grid-template-columns: 1fr;
  }
}
</style>
