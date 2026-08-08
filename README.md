> [!CAUTION]
> 本项目仅供学习交流，禁止用于商业用途；V2 不保证规避平台风控。自动投递开关默认关闭，开启后会按当前筛选真实投递岗位并发送文本招呼语，请先确认配置和风险。
>
> 使用该脚本有一定风险(如黑号,封号,权重降低等)，本项目不承担任何责任

| Chrome | Edge | FireFox | Github |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ogkmgjbagackkdlcibcailacnncgonbn?label=官方Chrome插件商店)](https://chrome.google.com/webstore/detail/ogkmgjbagackkdlcibcailacnncgonbn) | [![Edge Web Store](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fjcllnbjfeamhihjpfjlclhdnjmggbgal&query=version&prefix=v&label=Edge插件商店&color=EF7C3D)](https://microsoftedge.microsoft.com/addons/detail/jcllnbjfeamhihjpfjlclhdnjmggbgal) | [![Firefox](https://img.shields.io/amo/v/boss-helper?label=Mozilla插件商店)](https://addons.mozilla.org/zh-TW/firefox/addon/boss-helper/) | [![GitHub Release](https://img.shields.io/github/v/release/Ocyss/boss-helper)](https://github.com/Ocyss/boss-helper/releases/latest/) |

> **国内**：V2 推荐使用本仓库构建的 ZIP 通过 Chrome“加载已解压的扩展程序”安装；官方基线只从 Ocyss 的官方商店或 GitHub Releases 获取。

## 项目介绍

Boss直聘助手, 皆在减少投递简历的麻烦, 和提高投递简历的效率, 技术栈使用WXT + Vue3 + NuxtUI@4 + TailwindCSS@4, 开源在 Github 欢迎前来Pr

## Boss Helper V2

本仓库是 `ump45nose/boss-helper-v2` 的独立构建，版本 `0.6.0` 基于官方 `v0.5.1` 提交。V2 使用独立扩展身份、DOM 前缀、消息 namespace 和 `chrome.storage.local` key，可和官方扩展同时安装。交付和安装说明见 [INSTALL-WINDOWS.md](INSTALL-WINDOWS.md)，候选人画像示例见 [candidate-profile.example.json](candidate-profile.example.json)。

V2 默认仍处于“筛选、AI 辅助和人工确认”模式：日志/统计可观测，等待采用保守随机抖动，AI 输出不合规时停止；模型配置默认提示 `glm5.2`，模型请求默认超时 120 秒。回复监控只在用户主动开启后通知并形成待确认草稿。配置中的“自动投递（含招呼语）”默认关闭；只有用户明确开启后，筛选通过的岗位才会调用现有 BOSS 投递流程，并通过现有聊天通道发送文本或高级招呼语中的图片消息。可配置的“AI招呼失败时使用兜底语”默认关闭，模型未配置、超时、异常、空输出或返回“需人工判断”时才会使用，且 BOSS 消息已发布/确认超时后不会重发兜底语。可选的“招呼语后发送图片简历”同样默认关闭，需用户上传不超过 2 MiB 的 PNG/JPEG/WebP 图片后单独开启；最终招呼语确认发送成功后才尝试发送，失败会停止后续岗位。图片仅保存于本机 IndexedDB，不进入 AI 请求、日志、配置导出或 ZIP。诊断配置提供“详细诊断日志（仍脱敏）”选项，用于记录阶段、耗时、超时配置和错误分类，但不会关闭密钥、Cookie、Prompt、模型响应或聊天全文的强制脱敏。该开关不实现自动回复监控或自动交换联系方式，也不提供代理轮换、指纹伪装或验证码绕过。

> 本项目处于积极维护状态, 一直很忙所以拖了比较久才开源，抱歉了~

## 相关链接

唯一交流群:
微信麻烦, 飞书人数限制, 所以只开tg一个~

<img alt="交流群" src="./docs/img/tg.png" height="200" />

Github开源地址: <https://github.com/ocyss/boss-helper>

飞书反馈问卷(匿名): <https://gai06vrtbc0.feishu.cn/share/base/form/shrcnmEq2fxH9hM44hqEnoeaj8g>

> 每个提交都会给我发通知，我看见就会评论的形式回复 一般 1-2天

飞书问卷结果: <https://gai06vrtbc0.feishu.cn/share/base/view/shrcnrg8D0cbLQc89d7Jj7AZgMc>

## 项目预览

[![卡片状态](docs/img/shot_2024-04-14_23-08-03.png)](docs/img/shot_2024-04-14_23-08-03.png)
[![账户配置](docs/img/shot_2024-04-14_23-09-05.png)](docs/img/shot_2024-04-14_23-09-05.png)
[![统计界面](docs/img/shot_2024-04-02_22-25-25.png)](docs/img/shot_2024-04-02_22-25-25.png)
[![配置界面](docs/img/shot_2024-04-02_22-26-54.png)](docs/img/shot_2024-04-02_22-26-54.png)
[![日志界面](docs/img/shot_2024-04-02_22-32-25.png)](docs/img/shot_2024-04-02_22-32-25.png)

## TODO

- [x] 优化UI去除广告
- [x] 批量投递简历
- 高级筛选
  - [x] 薪资,公司名,工作名,人数,内容简单筛选
  - 公司地址相关
    > 使用高德api，需要自行申请，或者使用关键字筛选, 暂时只有驾车和步行
    - [x] 驾车/步行距离
    - [x] 驾车/步行时间
  - [ ] 公司风险评控
  - [x] AI筛选
- 自动打招呼
  - [x] 模板语言
  - [x] 支持chatGPT
- AI赋能
  - [ ] 自动回复聊天
  - [x] 多模型管理
- 额外功能(有时间会写)
  - [x] 自适应UI适配手机
  - [ ] 黑名单
  - [x] 多账号管理 (废弃, 改为多配置切换)
  - [ ] 聊天阻止发送已读
  - [ ] boss消息弹窗

## 参与贡献

1. Fork 本仓库并克隆到本地。
2. 在新分支上进行您的更改：`git checkout -b 您的分支名称`
3. 提交更改：`git commit -am '描述您的更改'`
4. 推送更改到您的 Fork：`git push origin 您的分支名称`
5. 提交 Pull 请求。

## 鸣谢

- <https://github.com/yangfeng20/boss_batch_push>
- <https://github.com/lisonge/vite-plugin-monkey>
- <https://github.com/chatanywhere/GPT_API_free>

- <https://uiverse.io/>
- <https://www.runoob.com/manual/mqtt/protocol/MQTT-3.1.1-CN.pdf>

## 类似项目

- <https://github.com/Frrrrrrrrank/auto_job__find__chatgpt__rpa>
- <https://github.com/noBaldAaa/find-job>

## 最后

嗯...

## Star 趋势

<a href="https://star-history.com/#ocyss/boss-helper&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ocyss/boss-helper&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ocyss/boss-helper&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ocyss/boss-helper&type=Date" />
 </picture>
</a>
