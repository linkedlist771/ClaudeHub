// electron-builder afterPack 钩子：在 macOS 上对打包后的 .app 做一次正确的 ad-hoc 签名。
// 原因：无 Apple 开发者证书时，CI 上 electron-builder 留下的是 Electron 自带的
// linker 签名（Identifier=Electron、资源未封装），Apple Silicon 会判定 "damaged"。
// 这里用 codesign --force --deep --sign - 重新封装签名，使 arm64 能正常启动。
// 配合 workflow 里 CSC_IDENTITY_AUTO_DISCOVERY=false（跳过 builder 自带签名）使用。
const { execSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  console.log(`[afterPack] ad-hoc signing ${appPath}`)
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
}
