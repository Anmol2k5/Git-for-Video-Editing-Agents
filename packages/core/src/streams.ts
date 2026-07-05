import type { VersionStream } from "@editvcs/shared-types";

export function createStream(projectId: string, name: string, baseSnapshotId?: string): VersionStream {
  return {
    id: `stream_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "untitled"}_${Date.now()}`,
    projectId,
    name,
    baseSnapshotId,
    createdAt: new Date().toISOString(),
    currentSnapshotId: baseSnapshotId
  };
}

export function describeStreamRelationship(input: { sameStream: boolean }) {
  if (input.sameStream) {
    return {
      title: "Same version stream",
      body: "These save points are part of the same edit history."
    };
  }

  return {
    title: "These edits were made separately.",
    body: "You can restore either version as a copy and manually combine the changes in Premiere."
  };
}
