<script lang="ts" setup>
import { ElImage, ElLink, ElSpace } from 'element-plus'
</script>

<template>
  <div>
    <div style="display: flex; align-items: center">
      <div class="hp-about" data-help="谢谢你的关心">
        <div data-help="愿为理想执着行，前路漫漫自铸金。">
          作者:&#12288;
          <ElLink href="https://github.com/Ocyss" target="_blank">
            Ocyss_04
          </ElLink>
        </div>
        <div data-help="感谢每一个人的付出">
          <div>
            鸣谢:&#12288;
            <ElLink href="https://github.com/yangfeng20" target="_blank">
              yangfeng20
            </ElLink>
          </div>
          <div>
            感谢贡献:&#12288;
            <ElLink href="https://github.com/engvuchen" target="_blank">
              engvuchen
            </ElLink>
          </div>
        </div>
      </div>
    </div>
    <div data-help="记得来个Star或者好评吧" style="margin-top: 10px">
      该脚本分为浏览器扩展和油猴脚本，两版本皆已开源
      <br>
      Github地址:
      <ElLink href="https://github.com/ocyss/boos-helper" target="_blank">
        https://github.com/ocyss/boos-helper
      </ElLink>
      <br>
      greasyfork地址:
      <ElLink
        href="https://greasyfork.org/zh-CN/scripts/491340"
        target="_blank"
      >
        https://greasyfork.org/zh-CN/scripts/491340
      </ElLink>
      <br>
      <br>
      <ElSpace wrap>
        <ElLink
          href="https://gai06vrtbc0.feishu.cn/share/base/form/shrcnmEq2fxH9hM44hqEnoeaj8g"
          target="_blank"
        >
          飞书反馈问卷(匿名)
        </ElLink>

        <ElLink
          href="https://gai06vrtbc0.feishu.cn/share/base/view/shrcnrg8D0cbLQc89d7Jj7AZgMc"
          target="_blank"
        >
          飞书问卷结果
        </ElLink>

        <!-- <ElLink
          href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=410v5499-7193-411f-8258-94ae0cac4fc0"
          target="_blank"
        >
          飞书交流群(已满)
        </ElLink> -->
      </ElSpace>
    </div>
    <div
      data-help=" "
      style="width: 60%; margin-top: 20px; user-select: text; color: #fff"
    >
      除非不可抗因素，一般情况下不会停更，这个项目不止是帮助你们，也能帮到我
      <br>
    </div>
  </div>
  <ElImage
    data-help="可能并没什么用,只是不让页面空荡荡"
    style="width: 200px; height: 200px"
    src="https://qiu-config.oss-cn-beijing.aliyuncs.com/reward.png"
    fit="cover"
    :preview-src-list="[
      'https://qiu-config.oss-cn-beijing.aliyuncs.com/reward.png',
    ]"
    loading="lazy"
  />
</template>

<style lang="scss" scoped></style>
