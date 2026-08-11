# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

Boss直聘助手（BossHelper）—— 面向 BOSS 直聘网站的浏览器扩展，用于批量投递、筛选岗位、AI 打招呼等。基于 **WXT + Vue3 + NuxtUI@4 + TailwindCSS@4**，支持 Chrome / Edge / Firefox 三端。仅供学习交流，禁止商用。

## 常用命令

包管理器为 **bun**（仓库含 `bun.lock`）。没有测试脚本。

```bash
bun install                 # 安装依赖，postinstall 自动执行 wxt prepare（生成 .wxt/ 与 #imports）
bun run dev                 # 开发（默认 chrome）；dev:edge / dev:firefox 指定浏览器
bun run check               # vue-tsc --noEmit 类型检查
bun run lint / lint:fix     # oxlint --type-aware
bun run fmt / fmt:check     # oxfmt 格式化
bun run build               # 并行构建 chrome/firefox/edge
bun run zip                 # 并行打包，产物在 .output/*.zip（CI 发布流程同此命令）
```

⚠️ **`packages/devlog-ui` 是 git submodule**（https://github.com/Ocyss/devlog-ui），未初始化会导致构建/类型检查失败。首次克隆后需：

```bash
git submodule update --init
```

## 架构

### 入口与三层通信

- `src/entrypoints/content.ts`（ISOLATED world）：匹配 `*://*.zhipin.com/*`，通过 `injectScript('/boss.js')` 注入 MAIN world 脚本，并注册 comctx 代理 `__boss-helper-content__`（`ContentCounter`）。
- `src/entrypoints/boss/index.ts`（MAIN world unlisted script）：核心业务入口，定义 `BossHelperCtx` 并在页面挂载 `boss-helper-job` 自定义元素。
- `src/entrypoints/background.ts`：后台脚本，注册 comctx 代理 `__boss-helper-background__`（`BackgroundCounter`，负责 storage / 网络请求 / 通知等浏览器能力）。

跨 world 通信由 [comctx](https://www.npmjs.com/package/comctx) `defineProxy` 实现：boss 脚本 → ContentCounter → BackgroundCounter 逐层代理。`src/message/index.ts` 导出的 `counter` 是惰性代理，**使用前必须调用 `initCounter()`**。

### 页面数据获取（不解析 DOM，而是 Hook 站点的 Vue 实例）

`src/composables/useVue.ts` 是整个项目最核心的机制：

- `getRootVue()`：轮询 `#wrap.__vue__` 拿到 BOSS 站点根 Vue 实例。
- `useHookVueData(selector, key, ref)`：读取站点组件 `__vue__` 上的数据字段，并 `defineProperty` 劫持其 setter，站点更新数据时同步到本地 ref。
- `useHookVueFn(selector, key)`：直接取站点内部函数（如 `pageChangeAction`、`searchJobAction`）。

站点侧依赖的关键数据/函数：`jobList`、`pageVo`、`hasMore`、`jobDetail`、`clickJobCardAction`。**BOSS 站点前端改版导致这些 hook 失效是此类扩展最常见的故障模式**，报错信息「未找到vue根组件」「pageChange is undefined」即源于此。

### HelperContext 抽象

`src/composables/useHelper/ctx.ts` 定义泛型抽象类 `HelperContext<C, T, S>`，抽象所有站点能力：`jobList`/`jobMaps`、`uid`/`userInfo`、`onMount`、`sendMessage`、`getConfigItems`（配置项声明）、`workflow`、`statistics`、`logs`、`models`（AI 模型）、`netConf`。UI 通过 Vue provide/inject（`HelperKey`，见 `src/index.ts`）获取 ctx。目前唯一实现是 `BossHelperCtx`（`src/entrypoints/boss/index.ts`）。

### 投递工作流（DAG 任务管线）

`src/composables/useApplying/`：

- `src/entrypoints/boss/delivery.ts`：声明 BOSS 的完整任务列表——过滤（已沟通/同公司/同HR/标题/公司/薪资/规模/猎头）→ 岗位详情获取 → 依赖详情的过滤（活跃度/HR职位/地址/好友状态/内容/金牌HR/高德地图/AI 筛选）→ 岗位投递 → Boss信息获取。任务带 `deps` 声明依赖。
- `useDeliveryWorkflow(items, helper)`：构建期执行 `task.task(_ctx)` 得到处理器（handler + before/after），做拓扑排序并检测环；运行期按 `before → handler → after` 顺序执行，抛 `DependencyMissingError` 时自动重跑依赖任务，`meginResults` 合并多任务结果。
- 结果缓存：`PipelineCacheManager`（IndexedDB），`usePipelineCache.ts`。
- `handles.ts` 的 `TaskRegistry` 存放各筛选项实现（AI 筛选在 `useModel` 之上）。

### 配置系统

`src/composables/conf/`：reactive `FormData` + `useStorageAsync`（经 counter 代理写入扩展 storage），支持多配置预设切换（key 形如 `local:web-geek-job-FormData-${preset}`），配置结构迁移通过 `FROM_VERSION` 版本迁移表（时间戳版本号，见 `info.ts`）。UI 配置页由 `getConfigItems()` 声明式描述（`src/components/Tabs/Config.vue` 渲染）。

### UI 渲染

`src/index.ts` 的 `run(ctx)` 定义自定义元素 `boss-helper-job`（主界面 `App.vue`）与 `boss-helper-menu`（`AppMenu.vue`），Shadow DOM + 内联 CSS（`?inline`，由 vite-plugin-tailwind-shadowdom 处理）隔离站点样式，`HelperKey` 注入 ctx。界面组件在 `src/components/`（Tabs 下为配置/日志/统计等页面）。

### 其他

- **聊天**：`src/entrypoints/boss/chat/` 的 `GeekChatClientManager` 基于打包的 geek-chat-core（BOSS 的 MQTT 聊天协议），消息经 `publish('chat', ...)` 发送，文本/图片消息由 `sendMessage` 处理。
- **AI**：`src/composables/useModel/` 基于 AI SDK（`ai` / `@ai-sdk/openai`），多模型管理，支撑 AI 筛选与 AI 打招呼。
- **多浏览器**：`wxt.config.ts` 按浏览器配置 manifest（chrome/edge 的 key、firefox 的 gecko id），输出目录 `{{browser}}-mv{{manifestVersion}}`。manifest 通过 `web_accessible_resources` 暴露 `boss.js` 给 zhipin.com。
- `devlog-ui` 日志 UI 库以 submodule 引入，wxt.config 与 tsconfig 均 alias 到 `packages/devlog-ui/src`，修改 submodule 内的代码会即时生效（源码直引，非构建产物）。

## 注意事项

- 类型检查依赖 `.wxt/` 生成物（`wxt prepare` / `postinstall`），删除 `.wxt` 后需重新执行 `bun install` 或 `wxt prepare`。
- 项目 README 明确声明仅供学习交流、禁止商用，且使用有封号风险。
