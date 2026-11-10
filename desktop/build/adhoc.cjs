// After packing on a Mac: give the app an ad-hoc signature, so Apple Silicon Macs will run it.
// (A real Developer ID signature and notarization need Loop's Apple Developer account.)
const { execFileSync } = require("child_process");
const path = require("path");
exports.default = async function (ctx) {
  if (process.platform !== "darwin" || ctx.electronPlatformName !== "darwin") return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
