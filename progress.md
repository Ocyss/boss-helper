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
