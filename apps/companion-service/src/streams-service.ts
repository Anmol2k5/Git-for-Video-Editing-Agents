import path from "node:path";
import fs from "node:fs/promises";
import type { VersionStream } from "@editvcs/shared-types";
import { writeJsonAtomic } from "@editvcs/storage";
import { config } from "./config";

export interface StreamsService {
  createStream(stream: VersionStream): Promise<VersionStream>;
  getStreams(projectId: string): Promise<VersionStream[]>;
  switchStream(streamId: string): Promise<VersionStream | null>;
}

export function createStreamsService(storageRoot: string = config.storageRoot): StreamsService {
  const streamsFile = path.join(storageRoot, "streams.json");
  const streams = new Map<string, VersionStream>();
  let loaded = false;

  async function load() {
    if (loaded) return;
    try {
      const data = await fs.readFile(streamsFile, "utf-8");
      const list = JSON.parse(data) as VersionStream[];
      for (const stream of list) {
        streams.set(stream.id, stream);
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to load streams:", err);
      }
    }
    loaded = true;
  }

  async function save() {
    await fs.mkdir(storageRoot, { recursive: true });
    await writeJsonAtomic(streamsFile, Array.from(streams.values()) as any);
  }

  return {
    async createStream(stream: VersionStream): Promise<VersionStream> {
      await load();
      streams.set(stream.id, stream);
      await save();
      return stream;
    },
    async getStreams(projectId: string): Promise<VersionStream[]> {
      await load();
      return Array.from(streams.values()).filter(s => s.projectId === projectId);
    },
    async switchStream(streamId: string): Promise<VersionStream | null> {
      await load();
      return streams.get(streamId) || null;
    }
  };
}
