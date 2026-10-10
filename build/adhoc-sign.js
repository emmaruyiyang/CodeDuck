// 没有 Apple Developer ID 时，用 ad-hoc 签名重新封装 .app。
// 不签的话改过 Info.plist 的 Electron 签名会失效，下载后 macOS 报「已损坏」。
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
