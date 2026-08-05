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
