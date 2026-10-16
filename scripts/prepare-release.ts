import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import config from "../electrobun.config";

const channel = process.argv[2];
if (channel !== "stable" && channel !== "canary") {
  throw new Error("Usage: bun scripts/prepare-release.ts <stable|canary>");
}

const os = process.platform === "linux" ? "linux" : process.platform === "darwin" ? "macos" : process.platform === "win32" ? "win" : undefined;
const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : undefined;
if (!os || !arch) {
  throw new Error(`Unsupported release platform: ${process.platform}-${process.arch}`);
}

const prefix = `${channel}-${os}-${arch}-`;
const extension = os === "linux" ? "-Setup.tar.gz" : os === "macos" ? ".dmg" : ".zip";
const artifactDir = join(import.meta.dir, "..", "artifacts");
const installers = readdirSync(artifactDir).filter(
  (file) => file.startsWith(prefix) && file.endsWith(extension),
);
if (installers.length !== 1) {
  throw new Error(
    `Expected one ${channel} installer in ${artifactDir}; found ${installers.length}.`,
  );
}

const releaseDir = join(import.meta.dir, "..", "release", channel);
mkdirSync(releaseDir, { recursive: true });
const releaseName = `D-Stream-Desktop-v${config.app.version}-${channel}-${os}-${arch}${extension}`;
const releasePath = join(releaseDir, releaseName);
copyFileSync(join(artifactDir, installers[0]), releasePath);

console.log(`\nInstaller ready: ${releasePath}`);
if (os === "linux") {
  console.log("Extract the .tar.gz file, then run the installer inside it.");
}
