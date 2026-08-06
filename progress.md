# Boss Helper V2 进度

## 2026-08-05

- 已通过 GitHub 页面创建 `ump45nose/boss-helper-v2` fork。
- 已克隆到 `D:\\Github\\boss-helper-v2`。
- 已创建 `codex/boss-helper-v2` 工作分支。
- 已设置 `origin`/`upstream` 远端。
- 已完成首轮代码改造；使用 `npm install --legacy-peer-deps` 完成依赖安装。
- `vue-tsc`、Lint、Chrome MV3 构建、ZIP 打包和 `smoke:v2` 静态冒烟均已通过。
- 已生成 `boss-helper-v2-0.6.0.zip`、`SHA256SUMS.txt`、安装文档、画像示例、CHANGELOG 和冒烟报告。
- 已增加 background 草稿生成：仅在用户点击“生成 AI 草稿”时调用模型，生成后仍需人工复制/发送。
- 最终静态安全边界：招呼发送路径硬关闭、Manifest 使用独立公钥且不申请 cookies 权限、模型/画像导出脱敏。
- 最终验证：`npm run check`、`npm run lint`（仅非阻断既有 warning）、`npm run zip:chrome`、`npm run smoke:v2` 和 SHA256 校验均通过。
- 收到 UI 反馈：当前岗位区域仍是旧卡片竖排，不符合“列表文字展示”；已定位为 `JobCards.vue` 继续使用 `JobCard.vue` 与旧 `.job-card` 样式，开始阶段 8 的语义化表格改造。
- `JobCards.vue` 已改为语义化 `<table>` 文字行，包含状态、岗位、公司、城市、薪资、活跃时间、AI 分数、阶段、原因、更新时间和详情操作；详情改为表格展开行。
- `main.css` 已新增 `.job-table` 列表样式和暗色模式样式，不再使用岗位列表的卡片背景、头像或倾斜布局。
- `npm run check` 通过；`npm run lint` 通过，仅保留原有非阻断 warning。
- `npm run build:chrome` 与 `npm run zip:chrome` 通过；ZIP 根目录包含 `manifest.json`。
- `npm run smoke:v2` 通过；`SHA256SUMS.txt` 已更新为 `CCF6590CB529670BD79B3391E5960369D7BE0CB12A0EFF13ED34E4AF618C8568`，未执行真实 BOSS 投递。
- 收到反馈：数据已恢复，本轮只删除“关于&赞赏”界面和收款码，并将筛选页的等待文案改为明确的未识别状态。
- 已从 `App.vue` 移除关于 tab 及组件引用，并删除 `src/components/Tabs/About.vue`；`Filter.vue` 在契约不匹配时显示“未识别 BOSS 原生筛选控件，保存/恢复已停用”。
- 实际页面只在滚动/下拉后稳定显示 `.expect-and-search` / `.filter-condition`；已让 `Filter.vue` 监听 DOM 变化、滚动和 resize，并区分“发现原生控件但缺少稳定属性”和“未显示控件”。
- `npm run build:chrome`、`npm run zip:chrome` 和构建包字符串检查通过；新 ZIP SHA256 为 `D8B7B88A614EEDCD0ED3D8655BA6E8C5D216FE4ED0D416345FD62FBC867EDED7`。
- 用户反馈原生下拉仍不可保存；已增加“定位 BOSS 原生筛选”“刷新状态”和当前条件只读摘要，明确不点击选项、不触发搜索。
- `smoke-v2.mjs` 增加筛选定位入口和关于页面删除断言，防止后续构建回归。

## 2026-08-06

- 复核用户截图：`JobCards.vue` 将 `warn` 显示为“待人工”，该行阶段为“AI筛选”，因此未进入岗位投递；V2 自动招呼发送被设计为草稿，不是异常丢消息。
- 发现 `parseFiltering()` 只接受英文 `accept`，准备增加有限的明确通过别名归一化；未知结论和证据不足继续停在人工判断。
- 复核自动化形态：无 Playwright/代理抓包实现；岗位请求为页面内 `fetch`，聊天监控模块含 MQTT/WebSocket 直连。
- 用户明确要求增加自动投递选项；本阶段改为默认关闭的“自动投递（含招呼语）”开关，开启后才执行真实投递与招呼语发送，未在当前账号启用或冒烟。
- 已增加 `autoDelivery` 配置，岗位投递和招呼语发送均由该开关保护；关闭时显示明确的“自动投递未开启”，开启时使用已有 MQTT/protobuf 文本发送通道，并在发送前采用消息等待范围。
- AI 筛选结论增加有限别名归一化（如 `pass`/`通过`），未知结论仍按人工复核处理；静态冒烟增加配置闸门和解析器断言。
- 已更新 README、Windows 安装说明、CHANGELOG、冒烟报告和旧 `JobCard.vue` 文案，明确默认关闭与开启后的边界；未开启真实账号自动投递。
- `npm run check`、`npm run lint`、`npm run build:chrome`、`npm run zip:chrome`、`npm run smoke:v2` 均通过；Lint 仅保留基线既有非阻断 warning。
- 根目录交付包 `boss-helper-v2-0.6.0.zip` 已从最新 Chrome 构建复制，SHA256 为 `20C97867ACF2AB52E12DD4F673113F01B3D00D887FAA5AE1F93552E9F1CE3FDF`。

## 2026-08-06 模型超时与诊断日志

- 定位到岗位 AI 筛选/招呼使用 AI SDK 流式请求，未配置模型超时时默认 60000ms；日志中的 `signal timed out` 属于模型流超时，不是 BOSS 投递接口超时。
- 新增 `diagnosticLogging` 本地配置，默认关闭；开启后只记录 AI 阶段、耗时、超时配置和错误分类，诊断字段在白名单内再次截断/脱敏。
- 将模型默认超时调整为 120000ms，允许范围 5000–600000ms；ChatModel 与 background 草稿请求共用解析函数，超时统一显示“模型请求超时（N秒）”。
- `npm run check`、`npm run lint` 通过；Lint 仍只有基线既有非阻断 warning。当前 ZIP 需在本轮构建完成后重新生成，未进行真实账号或真实模型超时回归。
