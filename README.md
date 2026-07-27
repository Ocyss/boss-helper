# BossHelper

> [!CAUTION]
> 本项目用于辅助处理 BOSS 直聘网页端的求职流程。自动化操作应以本人真实求职意愿和已确认的信息为准；面试时间、薪资、入职、证件、联系方式和合同等内容必须由本人确认。

BossHelper 将岗位筛选、批量投递、简历分析、多搜索词、投递去重、公司风险提示、黑白名单、聊天提醒和操作记录放在同一处，帮助你按自己的求职条件处理岗位。

当前版本：`0.5.3`

当前仓库：[HardworkingChen/boss-helper](https://github.com/HardworkingChen/boss-helper)
问题反馈：[GitHub Issues](https://github.com/HardworkingChen/boss-helper/issues)

## 下载与安装

三个浏览器版本都发布在 [0.5.3 Release](https://github.com/HardworkingChen/boss-helper/releases/tag/0.5.3)。下载 ZIP 后先解压，再按对应浏览器的方式加载。

| 浏览器  | 开发者加载方式                                                                                     | 解压后的目录                        | 下载                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Chrome  | 打开 `chrome://extensions`，开启“开发者模式”，点击“加载已解压的扩展程序”                           | `.output/chrome-mv3`                | [下载 Chrome ZIP](https://github.com/HardworkingChen/boss-helper/releases/download/0.5.3/boss-helper-0.5.3-chrome.zip)   |
| Edge    | 打开 `edge://extensions`，开启“开发人员模式”，点击“加载解压缩的扩展”                               | `.output/edge-mv3`                  | [下载 Edge ZIP](https://github.com/HardworkingChen/boss-helper/releases/download/0.5.3/boss-helper-0.5.3-edge.zip)       |
| Firefox | 打开 `about:debugging#/runtime/this-firefox`，点击“临时载入附加组件”，选择目录中的 `manifest.json` | `.output/firefox-mv2/manifest.json` | [下载 Firefox ZIP](https://github.com/HardworkingChen/boss-helper/releases/download/0.5.3/boss-helper-0.5.3-firefox.zip) |

加载或更新扩展后，请刷新 BOSS 直聘页面。扩展入口会显示在页面右侧。

## TODO

- [x] 优化 UI 去除广告
- [x] 批量投递简历
- 高级筛选
  - [x] 薪资、公司名、岗位名、人数、职位内容筛选
  - 公司地址相关
    > 使用高德 API，需要自行申请；支持地址关键词、驾车/步行距离和时间筛选。
    - [x] 驾车/步行距离
    - [x] 驾车/步行时间
  - [x] 公司风险评控
  - [x] AI 筛选
- 自动打招呼
  - [x] 模板语言
  - [x] 支持 ChatGPT 及其他兼容模型
  - [x] AI 招呼语
- AI 赋能
  - [x] 简历上传、AI 分析、多搜索词和岗位匹配评分
  - [x] 自动回复聊天
  - [x] 多模型管理
- 额外功能
  - [x] 自适应 UI 适配手机
  - [x] 黑名单与白名单
  - [x] 多账号管理改为多配置切换
  - [x] BOSS 消息弹窗与浏览器通知
  - [x] 统一操作记录和实时任务日志

### 当前限制

- 已读拦截保持禁用。BOSS 的完整已读协议尚未验证，扩展不会拦截任何请求，避免影响正常聊天功能。
- 聊天“发送成功”只表示请求已提交，不代表平台确认送达或对方已阅读。

## 推荐使用顺序

### 1. 登录并配置基础筛选

先在浏览器中登录 BOSS 直聘，再进入“配置”页设置自己明确不能接受的条件：

- 岗位名称、城市或工作地址。
- 薪资范围、公司规模、HR 职位、职位描述排除词。
- 相同公司、相同 HR 的去重开关。
- 实习或全职、行业、远程等求职偏好。

这些是全局硬条件。条件同时开启时必须全部满足，因此建议先只启用能够明确判断的项目。设置后点击“保存”，并在“日志”确认保存成功。

### 2. 配置 AI（仅在需要时）

“AI”页用于配置简历分析、AI 招呼语和聊天草稿所需的模型服务。

- 简历 AI 分析会生成岗位方向、搜索词和匹配依据。
- AI 招呼语会生成岗位开场消息。
- AI 聊天草稿会根据岗位、公司、HR 和近期会话生成建议回复。

不要将 API Key、Token 或其他凭证写入公开配置、日志截图或仓库。

### 3. 上传简历并生成搜索词

进入“简历推荐”页：

1. 上传 `TXT`、`MD`、`DOCX` 或包含可提取文字的 `PDF`，也可以直接粘贴简历文本。
2. 点击“保存简历文本”。
3. 选择已配置的模型后点击“AI 分析简历”。
4. 勾选多个目标搜索词，例如“Java 实习生”和“后端开发实习生”。
5. 设置匹配分阈值并保存。低于阈值的岗位不会进入自动投递。

简历文本默认存储在扩展本地。点击 AI 分析时，简历内容会发送给你选择的模型服务。

### 4. 搜索和投递岗位

从“简历推荐”发起搜索时，扩展会依次处理所选搜索词，并按岗位、公司和 HR 去重。自动投递前会检查：

1. 登录状态和岗位数据。
2. 全局硬条件。
3. 黑白名单。
4. 公司风险筛查。
5. 简历匹配分和简历偏好。
6. 已投递岗位、公司和 HR 去重。

普通职位页直接投递也会使用全局配置、黑白名单和风险筛查；简历匹配分和搜索队列只在“简历推荐”流程中参与。

## 筛选、简历、风险和名单

| 项目             | 作用                               | 与其他条件的关系                           |
| ---------------- | ---------------------------------- | ------------------------------------------ |
| 配置页筛选       | 明确的全局硬条件                   | 始终参与筛选                               |
| 简历偏好与匹配分 | 根据简历补充岗位方向和评分         | 从简历推荐发起自动投递时参与               |
| 黑名单           | 跳过不考虑的公司、HR、岗位或关键词 | 命中后直接跳过                             |
| 白名单           | 优先于黑名单                       | 不会绕过薪资、地址、风险、匹配分等其他条件 |
| 公司风险         | 根据本地规则或企业信息给出风险分   | 达到设置分数后跳过                         |

关键词规则可以限定岗位名、职位描述、福利、公司介绍或技能字段，避免短词误伤。若搜索没有结果，优先在“日志”查看具体跳过原因；常见原因是筛选范围没有交集，或岗位页面没有提供可解析字段。

### 公司风险与黑白名单

- 未配置企查查、天眼查或自定义企业信息 API 时，风险筛查使用本地规则评分。
- 外部查询失败、凭证错误或接口字段变化时，会回退到本地规则，并在页面和日志中显示状态。
- 黑白名单可匹配公司、HR、岗位或关键词，支持包含/精确匹配、原因、过期日期、导入和导出。
- 风险分只用于辅助判断，应结合岗位详情和公开企业信息自行确认。

## 聊天自动化

打开“自动化 - 聊天自动化”后，先开启总开关，再选择回复模式。

| 回复模式           | 收到新消息后的行为                                 | 调用 AI | 自动发送 |
| ------------------ | -------------------------------------------------- | ------- | -------- |
| 提醒我回复（推荐） | 浏览器通知和页面浮窗提示你进入会话手动回复         | 否      | 否       |
| AI 草稿建议        | 生成可编辑草稿，由你确认后发送                     | 是      | 否       |
| 半自动确认         | 仅处理允许名单内的会话，生成草稿后由你确认发送     | 是      | 否       |
| 全自动回复         | 仅处理允许名单和触发词都命中的会话，按限制提交回复 | 是      | 是       |

聊天自动化只处理对方新发出的在线文本消息，并按会话 ID 与消息 ID 去重。你手动发送消息后，该会话会切换为“人工接管”，插件不再继续自动回复。

### 提醒我回复

这是日常最适合的模式。它不调用 AI、不生成草稿、不发送消息，只通过你勾选的方式提醒：

- 浏览器通知：离开 BOSS 页面也可收到提醒，点击后进入对应会话。
- 页面浮窗：在 BOSS 页面右下角显示消息摘要，可进入会话、暂停或拉黑。

至少开启一种提示方式，否则插件无法直接提醒你。

### 半自动确认和全自动回复

两种模式都必须设置“自动回复允许名单”，可按公司、HR、岗位或 HR ID 精确/包含匹配来限定范围。

- 自动处理静默时段：此时段不生成草稿或提交回复。
- 每会话上限：单个会话最多由插件提交的回复次数。
- 回复冷却：两次插件回复之间的最短间隔。
- 每日上限：当天由插件提交回复的总数。
- 自动回复触发词：仅全自动模式需要；消息命中后才会自动发送。
- 人工处理关键词：命中“面试”“薪资”“入职”等词时，只提醒你处理。

## 日志与排错

“日志”页包含两部分：

- 操作记录：配置、简历、搜索、风险、黑白名单、投递和聊天自动化的结果、跳过原因和需要人工处理的事项。
- 实时日志：展示投递任务的步骤、状态、耗时和流程信息。

出现问题时按以下顺序排查：

1. 在日志中按“失败”或“需要处理”筛选。
2. 确认 BOSS 账号仍处于登录状态，再刷新页面。
3. 使用 AI 功能时，确认模型配置和服务可用。
4. 检查薪资、地址、规模、排除词、风险阈值、黑白名单和匹配分是否共同过滤了岗位。
5. 聊天提醒无反应时，确认聊天通道为“已连接”，并至少开启浏览器通知或页面浮窗；失败时点击“重试连接”。

操作记录会主动避免保存 API Key、Token、简历正文和聊天正文等敏感详情；分享日志截图前仍应检查是否包含岗位、公司或 HR 信息。

## 数据与隐私

- 配置、名单、简历文本、投递去重记录、会话状态和日志保存在浏览器扩展本地存储中。
- 简历 AI 分析和 AI 聊天草稿会把必要文本发送到你配置的模型服务商。
- 外部企业信息查询仅在你选择并配置服务后执行；未配置或调用失败时使用本地风险规则。
- 分享配置、日志、源码或打包文件前，不要包含个人简历、导出配置或 API 凭证。

详见 [PRIVACY.md](./PRIVACY.md)。

## 相关链接

- 当前仓库与 Release：[HardworkingChen/boss-helper](https://github.com/HardworkingChen/boss-helper)
- 当前问题反馈：[GitHub Issues](https://github.com/HardworkingChen/boss-helper/issues)
- 上游开源项目：[Ocyss/boss-helper](https://github.com/Ocyss/boss-helper)
- 旧版 Greasyfork 脚本：[0.2 版本](https://greasyfork.org/zh-CN/scripts/491340)
- 历史反馈问卷：[飞书表单](https://gai06vrtbc0.feishu.cn/share/base/form/shrcnmEq2fxH9hM44hqEnoeaj8g)
- 历史反馈结果：[飞书视图](https://gai06vrtbc0.feishu.cn/share/base/view/shrcnrg8D0cbLQc89d7Jj7AZgMc)

## 从源码运行

需要 Node.js LTS，推荐 Node.js 20 或更高版本。

```bash
git clone https://github.com/HardworkingChen/boss-helper.git
cd boss-helper
npm install
npm run dev
```

提交前可执行：

```bash
npm run check
npm run lint
npm run fmt:check
npm run build
npm run zip
```

`npm run zip` 会生成以下发行文件：

- `.output/boss-helper-0.5.3-chrome.zip`
- `.output/boss-helper-0.5.3-edge.zip`
- `.output/boss-helper-0.5.3-firefox.zip`

## 更新说明

### 0.5.3

- 支持简历上传、AI 分析、多岗位搜索词、岗位匹配分和自动投递阈值。
- 新增公司风险筛查、黑白名单、外部企业信息回退状态和岗位风险提示。
- 新增聊天消息提醒、AI 草稿、半自动确认、全自动回复、人工接管和会话历史。
- 新增统一操作记录，覆盖配置、简历、搜索、风险、名单、投递和聊天自动化。
- 聊天自动化默认使用“提醒我回复”，不会调用 AI 或自动发送消息。
- 筛选和名单匹配支持不区分大小写。

## 参与贡献

1. Fork 本仓库并克隆到本地。
2. 创建分支：`git checkout -b feature/your-change`。
3. 完成改动并运行检查。
4. 提交并推送：`git commit -am "describe your change"`、`git push origin feature/your-change`。
5. 向本仓库提交 Pull Request，说明改动、验证方式和影响范围。

## 致谢与参考

- [Ocyss/boss-helper](https://github.com/Ocyss/boss-helper)
- [yangfeng20/boss_batch_push](https://github.com/yangfeng20/boss_batch_push)
- [lisonge/vite-plugin-monkey](https://github.com/lisonge/vite-plugin-monkey)
- [chatanywhere/GPT_API_free](https://github.com/chatanywhere/GPT_API_free)
- [Frrrrrrrrank/auto_job__find__chatgpt__rpa](https://github.com/Frrrrrrrrank/auto_job__find__chatgpt__rpa)
- [noBaldAaa/find-job](https://github.com/noBaldAaa/find-job)
- [MQTT 3.1.1 中文资料](https://www.runoob.com/manual/mqtt/protocol/MQTT-3.1.1-CN.pdf)

## Star 趋势

<a href="https://star-history.com/#HardworkingChen/boss-helper&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=HardworkingChen/boss-helper&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=HardworkingChen/boss-helper&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=HardworkingChen/boss-helper&type=Date" />
 </picture>
</a>
