# BossHelper

用于 BOSS 直聘网页端的求职辅助扩展。它将岗位筛选、简历分析、多搜索词、投递去重、公司风险提示、黑白名单、聊天提醒和操作记录放在同一处，帮助你按自己的求职条件处理岗位。

当前版本：`0.5.3`

仓库地址：[jisjudjhj/boss-helper](https://github.com/jisjudjhj/boss-helper)

## 开始前

- 在浏览器中登录 BOSS 直聘账号。
- 先用少量岗位验证筛选、招呼语和聊天配置，再使用自动投递或自动回复。
- 自动化处理必须以你的真实求职意愿和已确认的信息为准。面试时间、薪资、入职、证件、联系方式和合同等内容应由本人确认。

## 安装扩展

发行包会同时提供 Chrome、Edge 和 Firefox 版本。下载后请先解压，再按对应浏览器的方式加载。

| 浏览器  | 开发者加载方式                                                                                     | 构建目录                            | 下载                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Chrome  | 打开 `chrome://extensions`，开启“开发者模式”，点击“加载已解压的扩展程序”                           | `.output/chrome-mv3`                | [下载 Chrome ZIP](https://github.com/jisjudjhj/boss-helper/releases/download/0.5.3/boss-helper-0.5.3-chrome.zip)   |
| Edge    | 打开 `edge://extensions`，开启“开发人员模式”，点击“加载解压缩的扩展”                               | `.output/edge-mv3`                  | [下载 Edge ZIP](https://github.com/jisjudjhj/boss-helper/releases/download/0.5.3/boss-helper-0.5.3-edge.zip)       |
| Firefox | 打开 `about:debugging#/runtime/this-firefox`，点击“临时载入附加组件”，选择目录中的 `manifest.json` | `.output/firefox-mv2/manifest.json` | [下载 Firefox ZIP](https://github.com/jisjudjhj/boss-helper/releases/download/0.5.3/boss-helper-0.5.3-firefox.zip) |

从 GitHub Release 下载 ZIP 时，解压后选择对应目录；从源码构建时，运行 `npm run build` 即可生成以上目录。

加载扩展后刷新 BOSS 直聘页面，右侧会出现助手入口。更新扩展后也需要在扩展管理页点击“重新加载”，再刷新 BOSS 页面。

## 推荐使用顺序

### 1. 配置基础筛选

进入“配置”页，先设置你明确不能接受的条件，例如：

- 岗位名称、城市或工作地址。
- 薪资范围、公司规模、HR 职位、职位描述排除词。
- 实习或全职、行业、远程偏好等求职限制。
- 相同公司、相同 HR 的去重开关。

这些是全局硬条件。自动投递和简历推荐发起的投递都会使用它们。设置后点击“保存”，再到“日志”确认保存成功。

建议先只启用自己能够明确判断的条件。条件同时开启时必须全部满足，过多或互相矛盾的条件会使搜索结果全部被跳过。

### 2. 选择是否使用 AI

“AI”页用于配置简历分析、AI 招呼语和聊天草稿所需的模型服务。只有使用这些功能时才需要配置模型。

- 简历 AI 分析会根据简历生成岗位方向、搜索词和匹配依据。
- AI 招呼语会生成岗位开场消息。
- AI 聊天草稿会根据岗位、公司、HR 和近期会话生成建议回复。

不要把 API Key、Token 或其他凭证写入公开配置、日志截图或仓库。模型服务商、模型名称和接口地址由你自行选择和维护。

### 3. 上传简历并生成搜索词

进入“简历推荐”页：

1. 上传 `TXT`、`MD`、`DOCX` 或包含可提取文字的 `PDF`，也可以直接粘贴简历文本。
2. 点击“保存简历文本”。
3. 需要 AI 分析时，选择已配置的模型并点击“AI 分析简历”。
4. 在推荐的搜索词中勾选多个目标岗位，例如“Java 实习生”和“后端开发实习生”。
5. 设置匹配分阈值后保存。低于阈值的岗位不会进入自动投递。

简历文本默认保存在扩展本地。点击“AI 分析简历”时，简历内容会发送给你选择的模型服务，用于生成分析结果。

### 4. 搜索并处理岗位

从“简历推荐”发起搜索时，扩展会依次处理所选搜索词，并按岗位、公司和 HR 去重。自动投递前会依次检查：

1. 登录状态和岗位数据是否完整。
2. 全局硬条件。
3. 黑白名单。
4. 公司风险筛查。
5. 简历匹配分和简历偏好。
6. 已投递岗位、公司和 HR 去重。

普通职位页直接使用投递功能时，也会使用全局配置、黑白名单和风险筛查；简历匹配分和简历搜索队列只在从“简历推荐”发起的流程中生效。

## 筛选、简历和名单如何配合

| 项目             | 作用                               | 与其他条件的关系                           |
| ---------------- | ---------------------------------- | ------------------------------------------ |
| 配置页筛选       | 明确的全局硬条件                   | 始终参与筛选                               |
| 简历偏好与匹配分 | 根据简历补充岗位方向和评分         | 从简历推荐发起自动投递时参与               |
| 黑名单           | 跳过不考虑的公司、HR、岗位或关键词 | 命中后直接跳过                             |
| 白名单           | 优先于黑名单                       | 不会绕过薪资、地址、风险、匹配分等其他条件 |
| 公司风险         | 根据本地规则或企业信息给出风险分   | 达到设置的分数后跳过                       |

白名单和黑名单的包含匹配不区分大小写。关键词规则可以限定在岗位名、职位描述、福利、公司介绍或技能字段，避免用过短的关键词误伤正常岗位。

如果配置薪资、地址、公司规模或简历偏好后没有任何结果，优先在“日志”查看具体跳过原因。常见原因是两个范围没有交集，或岗位页面没有提供可解析的字段。

## 公司风险与黑白名单

“自动化”页包含“风险筛查”和“黑白名单”。

### 公司风险

- 未配置外部企业信息服务时，使用本地规则评分，例如职位描述中的异常收费、培训贷、兼职刷单等风险词，以及岗位信息完整度等。
- 可选配置企查查、天眼查或自定义企业信息 API。查询失败、接口字段变化或没有可用凭证时，系统会回退到本地规则，并在页面和日志中显示回退状态。
- 风险分只用于辅助判断，不等同于对公司作出事实结论。应结合岗位详情和企业公开信息自行确认。

### 黑白名单

每条规则可选择名单类型、对象和匹配方式：

- 公司：按公司 ID 或公司名匹配。
- HR：按 HR ID、姓名或职位匹配。
- 岗位：按岗位 ID 或岗位名匹配。
- 关键词：在指定岗位字段中匹配。

规则可以添加原因、过期日期，并支持导入、导出和清理过期规则。岗位卡和聊天提示中也可以直接加入黑名单。

## 聊天自动化

打开“自动化 - 聊天自动化”后，先开启总开关，再选择回复模式。默认推荐“提醒我回复”。

| 回复模式    | 收到新消息后的行为                                     | 是否会调用 AI | 是否会自动发送 |
| ----------- | ------------------------------------------------------ | ------------- | -------------- |
| 提醒我回复  | 浏览器通知和页面浮窗提示你进入会话手动回复             | 否            | 否             |
| AI 草稿建议 | 生成可编辑的回复草稿，由你确认后发送                   | 是            | 否             |
| 半自动确认  | 仅处理允许名单内的会话，生成草稿后由你确认发送         | 是            | 否             |
| 全自动回复  | 仅处理允许名单和触发词都命中的会话，按限制直接提交回复 | 是            | 是             |

聊天自动化只处理对方新发出的在线文本消息，并按会话 ID 与消息 ID 去重。你在聊天框手动发送消息后，该会话会切换为“人工接管”，插件不会继续自动回复。

### 提醒我回复

这是最适合日常使用的模式。它只将新消息写入消息历史，并通过你勾选的提示方式提醒你：

- 浏览器通知：离开 BOSS 页面也可以收到提醒，点击通知可进入对应会话。
- 页面浮窗：在 BOSS 页面右下角显示消息摘要，可直接进入会话、暂停或拉黑。

至少开启一种提示方式，否则插件无法直接提醒你。该模式不需要白名单、触发词、冷却时间或发送上限。

### 半自动确认和全自动回复

这两种模式必须先设置“自动回复允许名单”，用公司、HR、岗位或 HR ID 精确或包含匹配来限定范围。

- 自动处理静默时段：在该时段不生成草稿或提交回复。
- 每会话上限：单个会话最多由插件提交的回复次数。
- 回复冷却：两次插件回复之间的最短间隔。
- 每日上限：当天由插件提交回复的总数。
- 自动回复触发词：仅全自动模式需要；只有消息命中触发词才会自动发送。
- 人工处理关键词：命中“面试”“薪资”“入职”等词时，只提示你处理，不生成或发送回复。

“发送成功”只代表回复请求已经提交，不能表示平台已确认送达或对方已阅读。会话跳转、草稿发送、暂停、人工接管、连接失败和重试都会记录在“日志”中。

### 已读拦截

当前“已读拦截”保持禁用状态。尚未确认 BOSS 的完整已读协议前，扩展不会拦截任何请求，以避免误拦其他功能。不要将它视为已实现的已读保护功能。

## 日志与排错

“日志”页分为两部分：

- 操作记录：配置、简历、搜索、风险、黑白名单、投递和聊天自动化的结果、跳过原因和需要人工处理的事项。
- 实时日志：展示投递任务的步骤、状态、耗时和原始流程信息。

遇到问题时按以下顺序检查：

1. 在日志中按“失败”或“需要处理”筛选，查看具体步骤。
2. 确认 BOSS 账号仍处于登录状态，并刷新页面。
3. 确认 AI 功能已选择可用模型，且模型服务配置正确。
4. 检查薪资、地址、规模、排除词、风险阈值、黑白名单和简历匹配分是否同时把岗位过滤掉。
5. 聊天通知无反应时，确认聊天通道为“已连接”，并至少开启浏览器通知或页面浮窗；失败时点击“重试连接”。

操作记录会避免保存 API Key、Token、简历正文和聊天正文等敏感详情。请仍然谨慎分享日志截图，因为岗位、公司和 HR 名称可能出现在流程记录中。

## 数据与隐私

- 配置、名单、简历文本、投递去重记录、会话状态和日志保存在浏览器扩展本地存储中。
- 简历 AI 分析和 AI 聊天草稿会把必要的文本发送到你所配置的模型服务商。
- 外部企业信息查询仅在你选择并配置对应服务后执行；未配置或调用失败时使用本地风险规则。
- 分享源码或打包文件前，不要包含浏览器配置导出、个人简历、日志导出或 API 凭证。

隐私说明见 [PRIVACY.md](./PRIVACY.md)。

## 从源码运行

需要 Node.js LTS 环境，推荐 Node.js 20 或更高版本。

```bash
git clone https://github.com/jisjudjhj/boss-helper.git
cd boss-helper
npm install
npm run dev
```

开发模式生成的扩展目录由 WXT 输出。提交前可执行：

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

## 贡献

1. Fork 本仓库并克隆到本地。
2. 创建分支：`git checkout -b feature/your-change`。
3. 完成改动并运行检查。
4. 提交并推送：`git commit -am "describe your change"`、`git push origin feature/your-change`。
5. 向本仓库提交 Pull Request，说明改动、验证方式和影响范围。

## 致谢

- [Ocyss/boss-helper](https://github.com/Ocyss/boss-helper)
- [yangfeng20/boss_batch_push](https://github.com/yangfeng20/boss_batch_push)
- [lisonge/vite-plugin-monkey](https://github.com/lisonge/vite-plugin-monkey)

---

## 原始文档（历史保留）

以下内容保留自原 README，未作为当前 `0.5.3` 的安装或功能说明。

> [!CAUTION]
> 本项目仅供学习交流，禁止用于商业用途
>
> 使用该脚本有一定风险(如黑号,封号,权重降低等)，本项目不承担任何责任

| Chrome                                                                                                                                                                                             | Crx搜搜                                                                                                                                           | Edge                                                                                                                                                                                                                                                                                                                           | FireFox                                                                                                                                   | Github                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ogkmgjbagackkdlcibcailacnncgonbn?label=Chrome插件商店)](https://chrome.google.com/webstore/detail/ogkmgjbagackkdlcibcailacnncgonbn) | [![Crx 搜搜](https://img.shields.io/badge/Crx搜索-v%3F.%3F.%3F-EF7C3D)](https://www.crxsoso.com/webstore/detail/ogkmgjbagackkdlcibcailacnncgonbn) | [![Edge Web Store](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fjcllnbjfeamhihjpfjlclhdnjmggbgal&query=version&prefix=v&label=Edge插件商店&color=EF7C3D)](https://microsoftedge.microsoft.com/addons/detail/jcllnbjfeamhihjpfjlclhdnjmggbgal) | [![Firefox](https://img.shields.io/amo/v/boss-helper?label=Mozilla插件商店)](https://addons.mozilla.org/zh-TW/firefox/addon/boss-helper/) | [![GitHub Release](https://img.shields.io/github/v/release/Ocyss/boss-helper)](https://github.com/Ocyss/boss-helper/releases/latest/) |

> **国内**: 如果无法访问 `Chrome插件商店` , 请使用 `Crx搜搜` 或 `Edge插件商店` 安装

## 项目介绍

Boss直聘助手, 皆在减少投递简历的麻烦, 和提高投递简历的效率, 技术栈使用WXT + Vue3 + NuxtUI@4 + TailwindCSS@4, 开源在 Github 欢迎前来Pr

> 本项目处于积极维护状态, 一直很忙所以拖了比较久才开源，抱歉了~

### 0.5.2 本仓库增强

- 简历上传与 AI 分析：支持 TXT、MD、DOCX 和可提取文本的 PDF，生成岗位方向与搜索词。
- 岗位匹配与自动投递：按匹配分、硬性偏好和投递阈值筛选，支持多搜索词队列及岗位、公司、HR 去重。
- 求职偏好：支持城市、最低薪资、实习/全职、远程、行业、公司规模和排除词。
- 运行诊断：增加配置保存校验、运行前自检、模拟筛选、持久化步骤日志和沟通/招呼成功统计。
- 兼容性修复：筛选不区分大小写，修复 AI 招呼语流式响应异常与 PDF 解析乱码。

## 相关链接

唯一交流群:
微信麻烦, 飞书人数限制, 所以只开tg一个~

<img alt="交流群" src="./docs/img/tg.png" height="200" />

Github开源地址: <https://github.com/ocyss/boss-helper>

飞书反馈问卷(匿名): <https://gai06vrtbc0.feishu.cn/share/base/form/shrcnmEq2fxH9hM44hqEnoeaj8g>

> 每个提交都会给我发通知，我看见就会评论的形式回复 一般 1-2天

飞书问卷结果: <https://gai06vrtbc0.feishu.cn/share/base/view/shrcnrg8D0cbLQc89d7Jj7AZgMc>

greasyfork地址(0.2旧版本): <https://greasyfork.org/zh-CN/scripts/491340>

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
