export function isCepRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as { __adobe_cep__?: unknown }).__adobe_cep__) && typeof (window as unknown as { CSInterface?: unknown }).CSInterface === "function";
}
