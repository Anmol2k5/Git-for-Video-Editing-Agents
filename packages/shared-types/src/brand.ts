export type Brand<K, T> = K & { readonly __brand: T };

export type ProjectId = Brand<string, "ProjectId">;
export type SnapshotId = Brand<string, "SnapshotId">;
export type StreamId = Brand<string, "StreamId">;
export type PairingId = Brand<string, "PairingId">;

/**
 * Type-safe way to create a branded ID from a string.
 */
export function createId<T extends string>(id: string): T {
  return id as T;
}
