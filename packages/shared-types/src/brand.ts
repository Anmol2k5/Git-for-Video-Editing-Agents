export type Brand<K, T> = K & { readonly __brand: T };

export type ProjectId = Brand<string, "ProjectId">;
export type SnapshotId = Brand<string, "SnapshotId">;
export type StreamId = Brand<string, "StreamId">;
export type PairingId = Brand<string, "PairingId">;

/**
 * Type-safe way to create a branded ID from a string.
 * Uses NoInfer to force callers to be explicit about the target type.
 */
export function createId<T extends string>(id: NoInfer<string>): T {
  return id as T;
}

// ─── JSON Serialization Types ────────────────────────────────────────────────

export type JsonPrimitive = string | number | boolean | null;
export type JsonSerializable =
  | JsonPrimitive
  | JsonSerializable[]
  | { [key: string]: JsonSerializable | undefined };
