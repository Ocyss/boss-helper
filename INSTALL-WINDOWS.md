# Boss Helper V2 Windows 安装

## 适用范围

V2 基于官方 `Ocyss/boss-helper` 的 `v0.5.1` 基线提交构建，扩展身份、DOM 前缀、消息 namespace 和存储 key 均独立，可与官方扩展并行启用。

V2 只在 BOSS 直聘页面工作。它不会自动回复、自动发简历、交换联系方式或点击发送；回复监控默认关闭，开启后也只发 Chrome 通知并保存待人工确认的草稿队列。

## 安装已构建 ZIP

1. 解压 `boss-helper-v2-0.6.0.zip` 到本机目录（不要直接在压缩包内加载）。
2. 打开 Chrome `chrome://extensions`，启用“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择解压目录（目录根部必须有 `manifest.json`）。
4. 保留官方 Boss Helper，不要把两个扩展的目录混用。

## 从源码构建

```powershell
Set-Location D:\Github\boss-helper-v2
npm install --legacy-peer-deps
npm run check
npm run lint
npm run build:chrome
npm run zip:chrome
```

`typescript@6` 是 Nuxt UI 当前 peer 约束允许的版本；`--legacy-peer-deps` 只用于安装官方基线的 peer 依赖，不会写入任何密钥。

## 首次配置

1. 打开扩展选项页，在“模型配置”中填写现有 OpenAI-compatible 服务地址、模型名和密钥；模型名默认提示为 `glm5.2`，地址可使用你的现有服务（例如 `http://fn-i3h510-1.tail0292a9.ts.net:3001/v1`）。
2. 模型密钥只写入 V2 的 `chrome.storage.local` namespace，不进入源码、日志、ZIP、导出文件或回复。
3. 在 AI 页粘贴 `candidate-profile.v1` JSON（可参考 `candidate-profile.example.json`）并保存。画像为空或字段不足时，AI 招呼语会 fail-closed。
4. 先保持“回复监控”关闭；需要浏览器提醒时由用户主动开启。

## 筛选使用

V2 不复制或重挂载 BOSS 原生筛选节点。请在 BOSS 页面顶部/下拉出现原生筛选后直接选择城市、关键词和其他条件，再点击 BOSS 的“搜索”；V2 的“筛选”页只在识别到稳定控件属性时启用保存/恢复。当前 BOSS 自定义下拉没有稳定属性时，V2 会保持保存/恢复按钮停用，并提供“定位 BOSS 原生筛选”和只读条件摘要，避免误写错字段。

V2 的岗位过滤、HR 活跃过滤和 AI 匹配仍在岗位处理流程中执行，与 BOSS 原生搜索条件是两层独立过滤；官方 boss-helper 的筛选状态也不会自动迁移到 V2。

## 安全边界

- BOSS 登录、扫码由用户本人完成；V2 不使用 `chrome.cookies` API，不导出或展示 Cookie，也不持久化页面会话令牌。
- 页面契约不匹配、登录失效、验证码、模型超时或 AI 输出不合规时停止当前任务。
- “填入”类操作（如后续人工工作流）只触发 BOSS 官方输入框的 `input` 事件，用户必须自己点击发送；本版本不实现自动发送。
- 建议先用模拟岗位或单个已登录页面受控验证，不进行批量真实发送。
