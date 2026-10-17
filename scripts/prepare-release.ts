import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
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

if (os === "linux") {
  // Keep the local extracted installer in sync with the archive. An old
  // extracted folder can otherwise reinstall a previous app identifier.
  const extractedDir = join(releaseDir, releaseName.slice(0, -".tar.gz".length));
  const stagingDir = mkdtempSync(join(releaseDir, ".installer-staging-"));
  try {
    execFileSync("tar", ["-xzf", releasePath, "-C", stagingDir]);
    const installerPath = join(stagingDir, "installer");
    if (!existsSync(installerPath)) throw new Error("Linux installer is missing from the release archive.");

    const installer = readFileSync(installerPath);
    const metadataMarker = Buffer.from("ELECTROBUN_METADATA_V1");
    const archiveMarker = Buffer.from("ELECTROBUN_ARCHIVE_V1");
    const metadataStart = installer.lastIndexOf(metadataMarker);
    const archiveStart = installer.indexOf(archiveMarker, metadataStart + metadataMarker.length);
    if (metadataStart < 0 || archiveStart < 0) throw new Error("Linux installer metadata is missing.");
    const metadata = JSON.parse(installer.subarray(metadataStart + metadataMarker.length, archiveStart).toString()) as {
      identifier: string;
      name: string;
      channel: string;
      hash: string;
    };
    const update = JSON.parse(readFileSync(join(artifactDir, `${channel}-${os}-${arch}-update.json`), "utf8")) as { hash: string };
    if (metadata.identifier !== config.app.identifier || metadata.name !== config.app.name || metadata.channel !== channel || metadata.hash !== update.hash) {
      throw new Error(`Installer identity or hash does not match this release: ${metadata.identifier}/${metadata.channel}/${metadata.hash}`);
    }

    rmSync(extractedDir, { recursive: true, force: true });
    renameSync(stagingDir, extractedDir);
    console.log(`Extracted installer ready: ${join(extractedDir, "installer")}`);
  } finally {
    if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
  }
}
console.log(`\nInstaller ready: ${releasePath}`);
