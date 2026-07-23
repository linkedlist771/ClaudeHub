# ChatGPT Hub

<p align="center">
  <img src="public/logo.png" alt="ChatGPT Hub" width="112" height="112">
</p>

<p align="center">
  <strong>多账号 ChatGPT 桌面工作台</strong>
</p>

ChatGPT Hub 是 ClaudeHub 仓库 `GPT-Hub` 分支上的 ChatGPT 专版。它把多个 ChatGPT 网页会话放在一个 Electron 窗口中，每个账号使用独立的持久化浏览器分区。

> 本项目是非官方社区客户端，与 OpenAI 无隶属或背书关系。ChatGPT 和 OpenAI 是其各自权利人的商标。

## 功能

- **多账号隔离** - 每个账号使用独立的 cookie、缓存和登录状态
- **账号标签** - 像浏览器一样打开、切换和保留多个账号标签
- **并行工作区** - 以预设或自定义布局同时显示多个账号
- **统一输入** - 将文字或粘贴的图片发送到所有可见账号
- **会话保存** - 保存并恢复当前布局和各窗口地址
- **会话迁移** - 显式导出或导入账号会话 cookie

ChatGPT 的网页用量限制会随套餐、模型和产品策略变化。本分支不调用未公开的网页配额接口，也不显示推测的用量百分比。

## 开发

需要 Node.js 22.12 或更高版本。

```bash
npm ci
npm run dev
```

开发命令会同时启动 Vite 和 Electron。首次添加账号后，在对应窗口中完成 ChatGPT 登录；登录状态会保存在该账号自己的 Electron 分区中。

## 构建

```bash
npm run build
```

安装包输出到 `release/<version>/`：

- macOS: DMG
- Windows: NSIS 安装程序
- Linux: AppImage

macOS 构建使用 ad-hoc 签名但未公证。首次打开时可在「应用程序」中右键 `ChatGPTHub`，选择「打开」，或执行：

```bash
xattr -cr /Applications/ChatGPTHub.app
```

## 会话导出安全

导出的 JSON 包含可用于恢复登录状态的敏感 cookie，应按密码同等级别保管。由于 OpenAI 安全校验、SSO、MFA 或设备绑定，导入后仍可能需要重新登录。

## 分支

当前版本位于 [`GPT-Hub`](https://github.com/linkedlist771/ClaudeHub/tree/GPT-Hub) 分支。Claude 版本继续保留在 `main` 分支。

## License

[MIT](LICENSE)
