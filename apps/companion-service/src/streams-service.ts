import path from "node:path";
import fs from "node:fs/promises";
import type { VersionStream } from "@editvcs/shared-types";
import { writeJsonAtomic } from "@editvcs/storage";
import { config } from "./config";

export function createStreamsService(storageRoot: string = config.storageRoot) {
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
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        console.error("Failed to load streams:", err);
      }
    }
    loaded = true;
  }

  async function save() {
    await fs.mkdir(storageRoot, { recursive: true });
    await writeJsonAtomic(streamsFile, Array.from(streams.values()));
  }

  return {
    async createStream(stream: VersionStream) {
      await load();
      streams.set(stream.id, stream);
      await save();
      return stream;
    },
    async getStreams(projectId: string) {
      await load();
      return Array.from(streams.values()).filter(s => s.projectId === projectId);
    },
    async switchStream(streamId: string) {
      await load();
      return streams.get(streamId) || null;
    }
  };
}
