# ClaudeHub

<p align="center">
  <strong>多账号 Claude 工作台 — 在一个窗口里管理、切换、并行使用多个 Claude 账号</strong>
</p>

<p align="center">
  <a href="https://github.com/linkedlist771/ClaudeHub/releases">
    <img src="https://img.shields.io/github/v/release/linkedlist771/ClaudeHub" alt="GitHub Release">
  </a>
  <a href="https://github.com/linkedlist771/ClaudeHub/actions/workflows/release.yml">
    <img src="https://github.com/linkedlist771/ClaudeHub/actions/workflows/release.yml/badge.svg" alt="Build Status">
  </a>
  <a href="https://github.com/linkedlist771/ClaudeHub/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/linkedlist771/ClaudeHub" alt="License">
  </a>
</p>

---

## ✨ 功能特点

- 👥 **多账号管理** - 在一个面板里集中管理多个 Claude 账号，每个账号登录状态独立缓存、互不干扰
- 📊 **额度一览** - 每个账号显示当前会话 (5h) 与每周 (7d) 用量百分比、重置时间，自动每 5 秒刷新；达到上限会标「受限」
- 🔀 **快速切换** - 一个账号额度用完时，一键切到没满的账号；最大化视图里点账号名即可下拉切换
- 🪟 **并行工作区** - 把多个账号窗口并排，统一输入框一键把消息发给所有可见账号
- 📐 **灵活布局** - 5 种预设布局 + 可拖拽调整的自定义布局
- 💾 **凭证导出 / 导入** - 把所有账号登录凭证导出为 JSON，换台电脑导入即可免登录使用
- 🖼️ **图片输入** - 粘贴图片同步到各账号输入框
- 🔐 **登录持久化** - 各账号登录态独立持久化，无需重复登录

## 📥 下载安装

前往 [Releases 页面](https://github.com/linkedlist771/ClaudeHub/releases) 下载最新版本。

### macOS 用户注意

首次打开时可能提示 **「ClaudeHub 已损坏，无法打开」** 或 **「无法验证开发者」**，这是因为应用没有 Apple 签名。

打开终端运行以下命令移除隔离属性：

```bash
xattr -cr /Applications/ClaudeHub.app
# 或在 Downloads 文件夹：
xattr -cr ~/Downloads/ClaudeHub.app
```

## 🚀 使用方法

### 1. 添加并登录账号

- 在主页输入备注名（如「主号」「同事 A」）点「添加账号」
- 点卡片「进入使用」进入该账号，正常登录对应的 Claude 账号
- 登录状态自动缓存，下次免登录

### 2. 查看额度

主页每张卡片自动显示该账号的当前会话 (5h) / 每周 (7d) 用量与重置时间，每 5 秒刷新；也可点 ⟳ 手动刷新。额度用完的账号会标红「受限」。

### 3. 切换 / 并行使用

- **快速切换**：进入某账号后，点标题栏左上的账号名下拉，直接切到别的账号
- **并行工作区**：主页点「并行工作区」，把不同账号摆进各槽位，底部统一输入框可一键发给所有可见账号

### 4. 跨电脑迁移

主页「导出」把所有账号凭证存成 JSON，在另一台电脑「导入」该文件即可直接使用，无需重新登录。

> ⚠️ 导出的 JSON 含登录凭证，等同账号密码，请妥善保管、勿外传。

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Shift + Enter` | 输入换行 |
| `双击标题栏` | 最大化 / 还原面板 |

## 🛠️ 技术栈

- **框架**: Electron + Vue 3 + Vite
- **语言**: TypeScript
- **构建**: electron-builder

## 📝 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本更新内容。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE)

---

<p align="center">
  如果这个项目对你有帮助，欢迎给个 ⭐️ Star！
</p>
