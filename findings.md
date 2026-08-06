# Boss Helper V2 发现记录

## 基线

- 官方 fork 已创建：`https://github.com/ump45nose/boss-helper-v2`
- 本地路径：`D:\\Github\\boss-helper-v2`
- 基线提交：`ad47412a44b59a57546200ab26f1f4b78c4bb4e4`
- `origin` 指向用户 fork，`upstream` 指向 `Ocyss/boss-helper`。

## 关键实现

- V2 storage 使用 `local:boss-helper-v2:*`，消息 namespace 和自定义元素使用 `boss-helper-v2-*` 前缀。
- 日志只持久化脱敏 title/state/message/time；统计事件按日期和 `event:jobKey` 幂等归并。
- 回复监控 content script 只匹配 `https://www.zhipin.com/web/geek/chat*`，DOM 结构不匹配时直接返回。
- 草稿生成请求由 background/service worker 发出，API key 不进入消息、日志或 ZIP；模型配置导出会主动移除密钥字段。
- Manifest 使用独立公钥，权限仅保留 `storage` 与 `notifications`；V2 的 Shadow DOM 和页面注入已不再引入全局 boss-helper 样式。

## 构建环境错误

- `npm install --ignore-scripts --no-package-lock` 第一次因 `typescript@7.0.2` 与 `@nuxt/ui@4.10.0` 的 peer 依赖冲突失败；下一次改用 `--legacy-peer-deps`，不更改输出目录。
- 半成品依赖目录导致一次 `Invalid Version`；已删除并重新安装，之后 `npm run check` 通过。
- WXT 构建准备期会尝试读取未初始化的 `counter`，输出诊断但退出码为 0，正式产物和静态冒烟均通过。

## 2026-08-05 UI 反馈复核

- 截图中的岗位区域仍由 `JobCards.vue` 挂载 `JobCard.vue`，旧 `.job-card` 样式包含背景、阴影、倾斜和大块卡片布局；之前的 `.job-list-row` 仅改变网格排列，不能实现真正的列表。
- `JobData` 已提供岗位、公司、城市、薪资、活跃时间、标签和描述字段；`TaskResult` 已提供阶段、状态、AI 分数、原因、草稿和更新时间，可直接映射到表格列。
- 新实现应直接渲染 `<table>`/`<tr>` 文字行，避免头像、卡片背景和旧组件样式继续影响视觉；详情使用展开行，不改变投递逻辑。

## 2026-08-05 入口与筛选提示反馈

- “关于&赞赏”页面的收款码来自 `src/components/Tabs/About.vue` 的远程 `reward.png`，没有其他业务依赖；可安全删除整个 tab 和组件。
- 筛选页的“正在等待”文案原先只在识别成功时更新，识别失败会一直停留在等待状态；应改成明确的未识别/停用提示，保持 fail-closed。
- 当前 BOSS 页面使用 `.page-jobs-main .expect-and-search` 与 `.page-jobs-main .filter-condition`，筛选区域在滚动/下拉后才稳定显示；页面顶部原生筛选仍可直接使用。V2 不搬运原生节点，仅在发现稳定属性时启用保存/恢复。
- 当前截图状态为“已发现原生筛选但缺少稳定属性”，继续启用保存/恢复会造成假成功；新增定位按钮和只读条件摘要，让用户直接操作官方控件并看到当前条件。

## 2026-08-06 AI 筛选与自动发送边界复核

- 截图中的岗位状态为“待人工”、阶段为“AI筛选”，原因含“分数90/积极…”，说明任务在 AI 筛选节点以 `warn` 结束，尚未进入“岗位投递”节点；这不是招呼语发送接口返回失败。
- `parseFiltering()` 目前仅把 `verdict === "accept"` 视为通过；模型返回明确的 `pass`/`通过` 等等价结论时会被误判为 `veto`，需要做有限别名归一化，未知值仍 fail-closed。
- 用户明确要求增加一个自动投递选项；实现应默认关闭，关闭时仍停在人工确认，开启后才允许岗位投递与招呼语发送，并在界面显式标注高风险。构建/冒烟不得替用户开启或真实发送。
- 自动发送沿用仓库已有 `GeekChatClientManager` 的 MQTT over WebSocket 通道和 protobuf 构造器，只在开关开启且招呼语合规时调用；默认路径不触发发送。
- 当前实现不是 Playwright 或透明代理抓包：内容脚本在 BOSS 页面内运行，并通过 `fetch` 调用 BOSS `wapi`；聊天模块另有 MQTT over WebSocket 直连 `wss://ws6.zhipin.com/chatws`，未发现 Playwright、Puppeteer、Selenium、`webRequest` 或代理捕获权限。
