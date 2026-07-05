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
    pair: () => request<{ token: string }>("/pair", { method: "POST" }),
    createManualSnapshot: (label: string) => request("/snapshots/manual", {
      method: "POST",
      body: JSON.stringify({ label })
    })
  };
}
