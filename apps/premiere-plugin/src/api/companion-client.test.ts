import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanionClient } from "./companion-client";

afterEach(() => vi.unstubAllGlobals());

describe("companion client contract", () => {
  it("starts pairing without claiming a token and completes it using the displayed code", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (url.endsWith("/pair/start")) {
        return Response.json({ pairingId: "pair-1", expiresAt: 1000 });
      }
      if (url.endsWith("/pair/complete") && init.body === JSON.stringify({ pairingId: "pair-1", code: "123456" })) {
        return Response.json({ sessionToken: "session-token", expiresAt: 2000 });
      }
      return new Response(null, { status: 404 });
    });
    const client = createCompanionClient({ baseUrl: "http://127.0.0.1:4317" });

    const pairing = await client.startPairing();
    expect(pairing).toEqual({ pairingId: "pair-1", expiresAt: 1000 });
    expect(await client.completePairing({ pairingId: pairing.pairingId, code: "123456" }))
      .toEqual({ sessionToken: "session-token", expiresAt: 2000 });
    expect(requests.map(({ url, init }) => [url, init.method])).toEqual([
      ["http://127.0.0.1:4317/pair/start", "POST"],
      ["http://127.0.0.1:4317/pair/complete", "POST"]
    ]);
  });

  it("includes the registered project ID and bearer token when creating a save point", async () => {
    let request: { url: string; init: RequestInit } | undefined;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      request = { url, init };
      const body = JSON.parse(String(init.body));
      return Response.json({ created: body.projectId === "proj_registered" });
    });
    const client = createCompanionClient({ baseUrl: "http://127.0.0.1:4317", token: "session-token" });

    expect(await client.createManualSnapshot({ projectId: "proj_registered" as any, label: "Before export" }))
      .toEqual({ created: true });
    expect(request?.url).toBe("http://127.0.0.1:4317/snapshots/manual");
    expect(JSON.parse(String(request?.init.body))).toEqual({ projectId: "proj_registered", label: "Before export" });
    expect(request?.init.headers).toMatchObject({ authorization: "Bearer session-token", "content-type": "application/json" });
  });
});
