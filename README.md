# boss-helper-ai-greeting

基于 [Ocyss/boss-helper](https://github.com/Ocyss/boss-helper) `0.4.4` 的个人维护 fork，用于在 BOSS 直聘网页端辅助筛选岗位、批量投递、生成招呼语，并补充更稳定的聊天页话术发送兜底。

> [!CAUTION]
> 本项目仅供学习交流，禁止用于商业用途。
>
> 自动化投递和自动化打招呼可能触发平台风控，存在账号异常、权重降低、黑号或封号风险。请控制频率，先小范围测试，再谨慎使用。

## 反馈与问题

使用中遇到问题、配置疑问或改进建议，可以通过 GitHub Issues 反馈，也可以发邮件到：

**25435825@life.hkbu.edu.hk**

反馈时请尽量说明浏览器版本、扩展版本、出问题的页面和具体现象。不要公开 API Key、Cookie、手机号、简历等隐私信息。

## 第一次使用先看这里

如果你不熟悉 Chrome 扩展、DeepSeek API、LLM、API Key、Prompt，或者不清楚「筛选」和「配置」两个 Tab 的区别，请先阅读：

**[小白使用说明](docs/BEGINNER_GUIDE.md)**

这份文档会从安装 Chrome、加载扩展、注册 DeepSeek、获取 API Key、配置 AI 模型、设置筛选规则，到使用聊天页话术发送面板一步一步讲。

## 仓库说明

本仓库不是原作者官方版本，而是个人 fork 改版。原始项目采用 MIT License，原始版权与许可证声明保留在 [LICENSE](LICENSE) 中。

- 上游项目：[Ocyss/boss-helper](https://github.com/Ocyss/boss-helper)
- 基线版本：`0.4.4`
- 当前稳定标签：`custom-0.4.4-stable.3`
- 当前主要验证环境：Chrome MV3 未打包扩展，加载目录为 `.output/chrome-mv3`

## 主要功能

### 继承自上游的功能

- 在 BOSS 直聘岗位列表页展示辅助面板。
- 批量投递岗位，并按配置自动暂停。
- 按公司名、岗位名、岗位内容、HR 职位、工作地址、薪资、公司规模等规则筛选岗位。
- 支持活跃度过滤、猎头过滤、已聊过滤、相同公司过滤、相同 HR 过滤。
- 支持高德地图距离/通勤时间筛选。
- 支持自定义招呼语和招呼语模板变量。
- 支持 AI 筛选和 AI 招呼语。
- 支持多模型配置、模型导入导出、配置导入导出、多账号配置、投递日志和统计。

### 本 fork 新增和修复的功能

- 增加聊天页「话术发送」面板。
- 将主 Helper 中配置的自定义招呼语同步到聊天页发送器。
- 当岗位页直接发送通道不可用时，把待发送话术写入兜底队列，之后可在聊天页手动补发。
- 增加 AI 招呼语诊断信息，显示开关、模型、Prompt、密钥、自定义话术和运行状态。
- 增加待发送队列查看、清空、已发记录清空和手动开始发送。
- 发送通道按 `GeekChatCore -> ChatWebsocket -> EventBus -> __q_chatSend` 依次探测。
- 队列发送会匹配目标 Boss，不会静默降级发送给不相关的人。
- 聊天页不会自动发送，需要用户手动点击开始。
- 将原先打包扩展中的改动迁回 WXT/Vue 源码，方便后续长期维护。
- 修复源码迁移后的 TypeScript 检查问题，`pnpm check` 已通过。

## 安装和加载

### 推荐：下载已构建版本

不熟悉命令行的用户，建议直接下载 GitHub Release 里的 Chrome MV3 压缩包：

[下载最新发布版](https://github.com/ZhuYiwen020118/boss-helper-ai-greeting/releases/latest)

下载名为 `boss-helper-ai-greeting-chrome-mv3-*.zip` 的文件后：

1. 解压 zip。
2. 打开 Chrome 的 `chrome://extensions/`。
3. 打开右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」。
5. 选择解压出来的那个文件夹，也就是里面直接能看到 `manifest.json` 的文件夹。

### 开发者：从源码构建

```bash
pnpm install
pnpm build:chrome
```

源码构建完成后，Chrome 扩展加载目录是：

```text
.output/chrome-mv3
```

### 开发者加载本地构建

1. 打开 `chrome://extensions/`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择整个 `.output/chrome-mv3` 文件夹。

不要选择仓库根目录，也不要选择单个文件。Chrome 加载的是构建产物文件夹，不是整个 Git 仓库。

## 基本使用流程

1. 登录 BOSS 直聘网页端。
2. 进入岗位推荐页或岗位搜索页，例如：
   - `https://www.zhipin.com/web/geek/job-recommend`
   - `https://www.zhipin.com/web/geek/jobs`
3. 打开页面中的 BossHelper 面板。
4. 在「配置」里设置筛选规则和投递数量。
5. 如需自定义招呼语，启用「自定义招呼语」并填写话术。
6. 如需 AI 招呼语，进入「AI」页：
   - 先点「模型配置」新建模型。
   - 再进入「AI招呼语」选择模型并填写 Prompt。
   - 启用「AI招呼语」开关。
7. 回到岗位列表页开始投递。
8. 投递完成后，可进入聊天页处理待发送队列：
   - `https://www.zhipin.com/web/geek/chat`

## 自定义招呼语

如果只想发送固定话术：

1. 在「配置」里启用「自定义招呼语」。
2. 填写招呼语内容。
3. 建议先关闭 BOSS 直聘自带默认招呼语，避免重复发送。
4. 开始投递。

如果启用「招呼语变量」，自定义话术会通过模板变量渲染岗位和 Boss 信息。可用于按岗位名、公司名、技能要求等内容生成更贴合的开场白。

## AI 招呼语

AI 招呼语用于根据岗位信息和你的 Prompt 生成个性化开场白。

推荐配置顺序：

1. 在「AI」页点击「模型配置」。
2. 新建一个模型，填写模型名称、API 地址、API Key 和模型名。
3. 保存模型。
4. 打开「AI招呼语」配置。
5. 选择模型，填写 Prompt。
6. 启用「AI招呼语」。

行为说明：

- 启用 AI 招呼语后，优先使用 AI 生成内容。
- 如果 AI 没有生成内容，并且主配置里启用了自定义招呼语，会把自定义招呼语写入兜底队列。
- 如果 AI 没有生成内容，且没有启用自定义招呼语，则不会发送硬编码话术。
- 如果只配置了一个自配模型但没有选中模型，本 fork 会尝试自动使用唯一模型。

## 聊天页话术发送面板

本 fork 会在聊天页显示「话术发送」面板。它主要解决岗位页发送通道不稳定时，招呼语已经生成但没有成功发出去的问题。

面板能力：

- 查看当前待发队列数量。
- 查看主 Helper 的自定义话术是否已启用。
- 展示 AI 配置诊断。
- 手动点击「开始发送」处理待发队列。
- 手动点击「停止」暂停发送。
- 手动点击「发当前配置」向当前聊天输入框发送主配置里的自定义话术。
- 显示或隐藏队列 JSON，便于排查。
- 清空待发队列或已发记录。

安全行为：

- 聊天页不会加载后自动发送。
- 队列发送会尽量匹配目标 Boss。
- 找不到目标 Boss 时会暂停，不会把队列内容发给其他聊天对象。
- 已有聊天内容的会跳过并标记完成，降低重复打扰风险。

## 常用命令

```bash
pnpm check
pnpm build:chrome
pnpm build:firefox
pnpm build:edge
pnpm zip:chrome
```

当前已验证：

```bash
pnpm check
pnpm build:chrome
```

`pnpm build:chrome` 可能出现来自 WXT options 模板和 `@vueuse/core` 的非致命 warning。当前 Chrome MV3 构建会成功生成 `.output/chrome-mv3`。

## 项目截图

以下截图来自上游项目，用于展示基础界面形态：

[![卡片状态](docs/img/shot_2024-04-14_23-08-03.png)](docs/img/shot_2024-04-14_23-08-03.png)
[![账户配置](docs/img/shot_2024-04-14_23-09-05.png)](docs/img/shot_2024-04-14_23-09-05.png)
[![统计界面](docs/img/shot_2024-04-02_22-25-25.png)](docs/img/shot_2024-04-02_22-25-25.png)
[![配置界面](docs/img/shot_2024-04-02_22-26-54.png)](docs/img/shot_2024-04-02_22-26-54.png)
[![日志界面](docs/img/shot_2024-04-02_22-32-25.png)](docs/img/shot_2024-04-02_22-32-25.png)

## 维护计划

短期优先级：

- 保持 Chrome MV3 构建可用。
- 稳定 AI/自定义招呼语发送链路。
- 保持聊天页补发队列可诊断、可手动控制。
- 后续再逐步整理代码结构和 UI 文案。

暂不计划：

- 自动回复面试邀请时间。
- 未经确认自动回复聊天。
- 把兜底队列静默发送给无法确认身份的聊天对象。

## 和上游同步

本仓库保留 `upstream` 指向原作者仓库，后续可以按需拉取上游更新并手动合并。

```bash
git fetch upstream
```

由于本 fork 修改了发送链路和构建配置，合并上游更新时应重点检查：

- `src/composables/useWebSocket/protobuf.ts`
- `src/composables/useApplying/handles.ts`
- `src/entrypoints/main-world.ts`
- `src/entrypoints/chat-sender.content.ts`
- `wxt.config.ts`

## 鸣谢

- 原始项目：[Ocyss/boss-helper](https://github.com/Ocyss/boss-helper)
- <https://github.com/yangfeng20/boss_batch_push>
- <https://github.com/lisonge/vite-plugin-monkey>
- <https://github.com/chatanywhere/GPT_API_free>
- <https://uiverse.io/>

## License

本仓库基于上游 MIT License 项目进行修改。请保留 [LICENSE](LICENSE) 中的原始版权和许可声明。
