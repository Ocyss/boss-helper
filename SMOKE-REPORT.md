# Boss Helper V2 受控冒烟报告

日期：2026-08-06

## 已执行

- 基线确认：HEAD 为 `ad47412a44b59a57546200ab26f1f4b78c4bb4e4`，版本更新为 `0.6.0`。
- `npm run check`：通过。
- `npm run lint`：通过；仅有官方基线既存的非阻断 warning。
- `npm run build:chrome`：通过，生成 `.output/chrome-mv3/manifest.json`。
- `npm run zip:chrome`：通过，ZIP 根目录包含 `manifest.json`，并包含独立 chat-monitor content script。
- `npm run smoke:v2`：通过，校验 Manifest MV3/0.6.0、ZIP 根目录和画像字段。
- 岗位列表 UI：静态确认 `JobCards.vue` 使用语义化 `<table>` 文字行，不再挂载旧 `JobCard.vue`，并保留详情展开、状态筛选和键盘操作。
- 关于页：静态确认已移除“关于&赞赏”入口、页面组件和远程收款码引用。
- 筛选状态：静态确认会在 DOM 变化、滚动和窗口尺寸变化时重新识别官方筛选容器；无法安全取得稳定属性时保持保存/恢复停用。
- 交付 ZIP SHA256：`D98E8C80FA70BE9ABB00122A2BE310B00BA112D79DD226CA2D08BE4139E4D9C0`。
- 静态边界检查：确认日志脱敏、模型密钥只走 V2 local namespace、模型导出移除密钥、回复监控和“自动投递（含招呼语）”默认关闭，Manifest 不申请 Cookie 权限，交付物不含 API 密钥或完整聊天样本。

## 未执行

- 未使用真实 BOSS 会话，未导出或展示 Cookie，未进行真实投递、批量发送或自动回复。
- 未模拟 Chrome 通知点击和 BOSS DOM 交互；这些需要用户本人在已登录页面按受控步骤确认。
- 未声称“防封号”；随机等待和退避只用于保守限流。

## 已知限制

- WXT 构建阶段仍会输出 Nuxt UI 的 `SalaryRange` 命名冲突提示和 `EMPTY_IMPORT_META` 非阻断警告；产物构建成功，警告不包含凭据或页面内容。
- 回复监控首版默认只保存待人工确认队列；只有用户点击“生成 AI 草稿”时才由 background/service worker 调用模型，仍不会自动填入或点击发送。
- 本轮未开启“自动投递（含招呼语）”，未用真实账号调用投递或聊天发送；该开关仅完成默认关闭、配置入口和 fail-closed 守卫的静态验证。
