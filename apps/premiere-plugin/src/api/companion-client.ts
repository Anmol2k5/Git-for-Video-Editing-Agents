import type {
  CreateSnapshotRequest,
  CreateSnapshotResponse,
  PairStartResponse,
  PairCompleteRequest,
  PairCompleteResponse
} from "@editvcs/shared-types";

export interface CompanionClientOptions {
  baseUrl: string;
  token?: string;
}

export function createCompanionClient(options: CompanionClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${options.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers
      }
    });

    if (!response.ok) {
      throw new Error(`Companion request failed: ${response.status}`);
    }

    return await response.json() as T;
  }

  return {
    health: () => request<{ status: string }>("/health"),
    startPairing: () => request<PairStartResponse>("/pair/start", { method: "POST" }),
    completePairing: (input: PairCompleteRequest) => request<PairCompleteResponse>("/pair/complete", {
      method: "POST",
      body: JSON.stringify(input)
    }),
    createManualSnapshot: (input: CreateSnapshotRequest) => request<CreateSnapshotResponse>("/snapshots/manual", {
      method: "POST",
      body: JSON.stringify(input)
    })
  };
}
