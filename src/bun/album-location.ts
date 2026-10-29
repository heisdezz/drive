import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";

interface AlbumLocations { drives: Record<string, string> }
let cachedFile = "";
let cachedLocations: AlbumLocations | null = null;
const portableLocations = new Map<string, string | null>();
const PORTABLE_FILE = ".dstream-album-location.json";

function portableLocationFile(drivePath: string): string {
  return path.join(drivePath, PORTABLE_FILE);
}

function readPortableLocation(drivePath: string): string | null {
  const drive = path.resolve(drivePath);
  if (portableLocations.has(drive)) return portableLocations.get(drive)!;
  let relative: string | null = null;
  try {
    const data = JSON.parse(fs.readFileSync(portableLocationFile(drive), "utf8"));
    if (typeof data.albumRelativePath !== "string") throw new Error("Invalid portable album location settings.");
    const savedRelative: string = data.albumRelativePath;
    relative = savedRelative;
    const resolved = path.resolve(drive, savedRelative);
    const withinDrive = path.relative(drive, resolved);
    if (!savedRelative || path.isAbsolute(savedRelative) || !withinDrive || withinDrive === ".." || withinDrive.startsWith(`..${path.sep}`) || path.isAbsolute(withinDrive)) {
      throw new Error("Portable album location points outside the drive.");
    }
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
  portableLocations.set(drive, relative);
  return relative;
}

function writePortableLocation(drivePath: string, relative: string): void {
  const file = portableLocationFile(drivePath);
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify({ drivePath, albumRelativePath: relative }, null, 2) + "\n", { flag: "wx" });
    fs.renameSync(temp, file);
    portableLocations.set(drivePath, relative);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}


export function albumLocationsFile(): string {
  const base = process.env.DSTREAM_CONFIG_DIR || (process.platform === "win32"
    ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"));
  return path.join(base, "io.github.heisdezz.dstream", "album-locations.json");
}

function readLocations(): AlbumLocations {
  const file = albumLocationsFile();
  if (file === cachedFile && cachedLocations) return cachedLocations;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || typeof data.drives !== "object" || Array.isArray(data.drives)) throw new Error("Invalid album location settings.");
    cachedFile = file;
    cachedLocations = data;
    return data;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      cachedFile = file;
      cachedLocations = { drives: {} };
      return cachedLocations;
    }
    throw error;
  }
}

export function albumRelativeRoot(drivePath: string): string {
  const drive = path.resolve(drivePath);
  const portable = readPortableLocation(drive);
  const saved = portable || readLocations().drives[drive];
  return typeof saved === "string" && saved ? saved : "albums";
}

export function albumRoot(drivePath: string): string {
  return path.join(drivePath, albumRelativeRoot(drivePath));
}

export function albumDbPath(drivePath: string): string {
  return path.join(albumRoot(drivePath), ".media_library.db");
}

export function albumRelativePath(drivePath: string, name: string): string {
  return path.posix.join(albumRelativeRoot(drivePath).replace(/\\/g, "/"), name);
}

function catalogMediaCount(file: string): number | null {
  if (!fs.existsSync(file)) return null;
  let db: Database | null = null;
  try {
    db = new Database(file, { readonly: true });
    const integrity = db.prepare("PRAGMA integrity_check(1)").get() as Record<string, string>;
    if (Object.values(integrity)[0] !== "ok") return null;
    return (db.prepare("SELECT count(*) AS count FROM media_items").get() as { count: number }).count;
  } catch { return null; }
  finally { db?.close(); }
}

function driveRootCatalog(drive: string): string | null {
  const direct = path.join(drive, ".media_library.db");
  const directCount = catalogMediaCount(direct);
  const backup = newestValidBackup(drive);
  if (directCount !== null && directCount > 0) return direct;
  if (backup && catalogMediaCount(backup)! > 0) return backup;
  return directCount !== null ? direct : backup;
}

function newestValidBackup(root: string): string | null {
  const backupDir = path.join(root, ".backups");
  if (!fs.existsSync(backupDir)) return null;
  for (const name of fs.readdirSync(backupDir).filter(name => /^media_library-.*\.db$/.test(name)).sort().reverse()) {
    const candidate = path.join(backupDir, name);
    if (catalogMediaCount(candidate) !== null) return candidate;
  }
  return null;
}

// Find an existing catalog before scaffolding an empty one. Snapshots are copied,
// leaving their source intact so recovery can be repeated if needed.
export function recoverCatalog(drivePath: string, destinationRoot: string): string | null {
  const destination = path.join(destinationRoot, ".media_library.db");
  if (fs.existsSync(destination)) return null;
  const drive = fs.realpathSync(drivePath);
  const sources = [newestValidBackup(destinationRoot), driveRootCatalog(drive)];
  const source = sources.find(candidate => candidate && catalogMediaCount(candidate) !== null);
  if (!source) return null;
  fs.mkdirSync(destinationRoot, { recursive: true });
  const temp = `${destination}.${randomUUID()}.tmp`;
  try {
    fs.copyFileSync(source, temp, fs.constants.COPYFILE_EXCL);
    fs.renameSync(temp, destination);
    return source;
  } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

function saveLocations(data: AlbumLocations): void {
  const file = albumLocationsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, file);
    cachedFile = file;
    cachedLocations = data;
  } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

export function setAlbumRoot(drivePath: string, chosenPath: string): string {
  const drive = fs.realpathSync(drivePath);
  const chosen = path.resolve(chosenPath);
  const relative = path.relative(drive, chosen);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Choose a folder inside the selected drive, below its root.");
  }
  if (relative.split(path.sep).some(part => part.startsWith("."))) throw new Error("Choose a visible folder on the selected drive.");
  if (!fs.existsSync(chosen)) throw new Error("Choose an existing folder on the selected drive.");
  if (!fs.statSync(chosen).isDirectory() || fs.realpathSync(chosen) !== chosen) {
    throw new Error("Choose a regular folder on this drive.");
  }
  const realParent = fs.realpathSync(path.dirname(chosen));
  const parentRelative = path.relative(drive, realParent);
  if (parentRelative === ".." || parentRelative.startsWith(`..${path.sep}`) || path.isAbsolute(parentRelative)) {
    throw new Error("Album folder must stay on the selected drive.");
  }
  if (fs.statSync(chosen).dev !== fs.statSync(drive).dev) throw new Error("Album folder must be on the same volume.");

  const normalized = relative.replace(/\\/g, "/");
  if (albumRelativeRoot(drive) === normalized) return normalized;
  const data = readLocations();
  const previous = data.drives[drive];
  const portableFile = portableLocationFile(drive);
  const previousPortable = fs.existsSync(portableFile) ? fs.readFileSync(portableFile) : null;
  try {
    writePortableLocation(drive, normalized);
    data.drives[drive] = normalized;
    saveLocations(data);
    return normalized;
  } catch (error) {
    try {
      if (previousPortable) fs.writeFileSync(portableFile, previousPortable);
      else fs.rmSync(portableFile, { force: true });
      portableLocations.set(drive, previousPortable ? JSON.parse(previousPortable.toString()).albumRelativePath : null);
    } catch {}
    if (previous === undefined) delete data.drives[drive];
    else data.drives[drive] = previous;
    throw error;
  }
}

export function driveForAlbumDb(dbPath: string): string {
  const resolved = path.resolve(dbPath);
  for (const [drive, relative] of Object.entries(readLocations().drives)) {
    if (path.join(drive, relative, ".media_library.db") === resolved) return drive;
  }
  for (let candidate = path.dirname(resolved); ; candidate = path.dirname(candidate)) {
    if (albumDbPath(candidate) === resolved) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
  }
  return path.dirname(path.dirname(resolved));
}
