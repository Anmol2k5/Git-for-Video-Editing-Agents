import { describe, expect, it } from "vitest";
import { createStreamsService } from "./streams-service";
import { createStream } from "@editvcs/core";

describe("streams service", () => {
  it("stores and retrieves streams without merging", async () => {
    const service = createStreamsService();
    const s1 = createStream("proj_1", "Main edit");
    await service.createStream(s1);

    const streams = await service.getStreams("proj_1");
    expect(streams).toHaveLength(1);
    expect(streams[0].name).toBe("Main edit");

    const active = await service.switchStream(s1.id);
    expect(active?.id).toBe(s1.id);
  });
});
