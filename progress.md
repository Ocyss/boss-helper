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
