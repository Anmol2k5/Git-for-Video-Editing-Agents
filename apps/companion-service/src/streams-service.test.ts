import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createStreamsService } from "./streams-service";
import { createStream } from "@editvcs/core";

describe("streams service", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "editvcs-streams-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("stores and retrieves streams without merging", async () => {
    const service = createStreamsService(dir);
    const s1 = createStream("proj_1", "Main edit");
    await service.createStream(s1);

    const streams = await service.getStreams("proj_1");
    expect(streams).toHaveLength(1);
    expect(streams[0].name).toBe("Main edit");

    const active = await service.switchStream(s1.id);
    expect(active?.id).toBe(s1.id);
  });
});
