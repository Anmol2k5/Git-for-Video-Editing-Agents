import path from "node:path";

export function createRestoreFileName(originalFileName: string, label: string, createdAt: string): string {
  const parsed = path.parse(originalFileName);
  const safeLabel = label.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "Save_point";
  const date = createdAt.slice(0, 10);
  return `${parsed.name}_restored_${safeLabel}_${date}${parsed.ext}`;
}
