# 发布版本

## 首次配置

复制 `.env.submit.example` 为 `.env.submit`，填入凭据。`.env.submit` 已被 Git 忽略。

- Chrome：OAuth Client ID、Client Secret、Refresh Token。当前使用 WXT 的 Chrome API v1.1 路径；如果使用服务账号，应同步调整本地与 CI 为 API v2，并配置 Publisher ID、Service Account Client Email 和 Private Key。
- Edge：Partner Center 中的 Product ID、Client ID、API Key（API v1.1）。Product ID 不是商店网址中的扩展 ID；旧 API 的 Client Secret 不能当作 API Key。
- Firefox：开发者后台的 API Key 对应 `FIREFOX_JWT_ISSUER`，API Secret 对应 `FIREFOX_JWT_SECRET`。

Firefox 提交使用 AMO 数字 ID `2898062`；当前 WXT 的提交依赖会去掉 GUID 的花括号，导致查询 404。扩展 manifest 中仍保留原 GUID。

GitHub Actions 不读取本地文件。在仓库 Settings → Secrets and variables → Actions 中分别配置上述 8 个空值字段的同名 Repository secrets。不要上传 `.env.submit`。

## 本地验证

```sh
bun run version:check
bun run zip
bun run submit:check
# 也可以只验证某个商店
bun run submit firefox --dry-run
```

`--dry-run` 检查配置和商店认证，不上传版本、不提交审核。实际提交使用 `bun run submit`。命令精确选择当前 `package.json` 版本的 ZIP，不会选中旧版本。

## 自动发版

1. 同时把 `package.json` 和 `net-conf.json` 的 `version` 改成相同的新版本，并更新 `version_description`。
2. 推送或合并到 `main`。CI 比较本次 push 前后的版本（PR 中相对目标分支校验）。
3. 两个版本不一致、只变一个或版本回退时 CI 失败。两个版本未变则通过校验、不发版。两个版本同时递增才构建三个浏览器包。
4. 构建成功后 CI 在本次提交创建 `v版本号` tag 和 GitHub Release，再分别验证并提交 Chrome、Edge、Firefox 商店审核。实际商店上架时间由各商店审核决定。

无需手动 push tag。商店独立提交，某个商店失败不会取消其他商店；修复凭据后在 Actions 中选择 **Re-run failed jobs**，避免重新提交已成功的商店。GitHub Release 会在商店审核完成前可用。

手动运行工作流仍遵守版本检查，默认比较当前提交和父提交；同一版本重新执行时 tag 必须仍指向原提交。普通提交之后不能用手动运行工作流重发旧版本，应重跑原发版工作流失败的任务。

## Firefox 源码审核

CI 保留 Firefox 的 `sources.zip` 并和扩展包一起提交。审核人员可从源码包运行：

```sh
bun install --frozen-lockfile
bun run zip:firefox
```

源码包应包含 `packages/devlog-ui` 的源码，不依赖单独拉取子模块；发布凭据不应包含在源码包内。
