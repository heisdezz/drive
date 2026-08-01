import path from "node:path";

/**
 * Normalize a Windows path for consistent file operations.
 * Converts mixed path separators to platform-appropriate format.
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

/**
 * Normalize URL path separators to forward slashes.
 * Used when constructing HTTP URLs from Windows file paths.
 */
export function normalizePathForUrl(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/**
 * Join path components safely for both Windows and Unix.
 */
export function joinPath(...components: string[]): string {
  return path.join(...components);
}
