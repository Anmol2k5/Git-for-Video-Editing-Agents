import path from "node:path";

export function sanitizePathHint(rawPath: string): string {
  // Simplistic logic to remove private drive/user prefix
  // Assumes anything before the last 2 path segments is private
  const parts = rawPath.split(/[\\/]/);
  if (parts.length <= 2) return rawPath;
  return ".../" + parts.slice(-2).join("/");
}
