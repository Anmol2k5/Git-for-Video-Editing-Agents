// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { companionClient } from "./engine";

let activePath: string;
let registrations: string[];
let snapshots: Array<Record<string, unknown>>;
let failB: boolean;
let resolveA: ((response: Response) => void) | undefined;
let delayA: boolean;
let resolveSave: ((response: Response) => void) | undefined;
let delaySave: boolean;
let delayHistory: boolean;
let resolveHistory: ((response: Response) => void) | undefined;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  sessionStorage.clear(); companionClient.sessionToken = null; companionClient.resetRestartCounter();
  activePath = "/tmp/A.prproj"; registrations = []; snapshots = []; failB = false; delayA = false; resolveA = undefined; delaySave = false; resolveSave = undefined;
  delayHistory = false; resolveHistory = undefined;
  (window as any).__adobe_cep__ = {};
  window.CSInterface = class {
    evalScript(script: string, callback?: (result: string) => void) {
      callback?.(script.includes("getActiveProjectPath") ? activePath : script.includes("saveActiveProject") ? "SUCCESS" : JSON.stringify({ projectName: "Film", sequenceName: "Main", videoTracks: [], audioTracks: [] }));
    }
    getSystemPath() { return "/extension"; }
  };
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname === "/health") return json({ status: "ok" });
    if (url.pathname === "/pair/start") return json({ pairingId: "pairing", expiresAt: Date.now() + 60000 });
    if (url.pathname === "/pair/complete") return json({ sessionToken: "paired-token" });
    if (url.pathname === "/projects/register") {
      const { projectPath } = JSON.parse(init!.body as string); registrations.push(projectPath);
      if (delayA && projectPath.includes("A.prproj")) return new Promise<Response>(resolve => { resolveA = resolve; });
      return json({ projectId: projectPath.includes("B.prproj") ? "id-B" : "id-A" }, failB && projectPath.includes("B.prproj") ? 400 : 200);
    }
    if (url.pathname === "/snapshots/manual") {
      snapshots.push(JSON.parse(init!.body as string));
      if (delaySave) return new Promise<Response>(resolve => { resolveSave = resolve; });
      return json({ created: true });
    }
    if (url.pathname === "/snapshots") {
      if (delayHistory && url.searchParams.get("projectId") === "id-A" && snapshots.length) return new Promise<Response>(resolve => { resolveHistory = resolve; });
      return json(url.searchParams.get("projectId") === "id-A" && snapshots.length ? [{ id: "snap-A", projectId: "id-A", sequenceNumber: 1, createdAt: "2026-11-02", trigger: "manual", label: "A-only-history", projectFile: { originalFileName: "A.prproj", sha256: "a".repeat(64) } }] : []);
    }
    return json({});
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); delete (window as any).__adobe_cep__; sessionStorage.clear(); });
function saveButton() {
  return screen.getAllByRole("button", { name: "Create Save Point" }).find(button => button.classList.contains("btn-primary")) as HTMLButtonElement;
}
async function authenticatedPanel() {
  sessionStorage.setItem("editvcs_session_token", "session"); render(<App />);
  await screen.findByPlaceholderText("What changes did you make in this cut?");
}
it("starts manual pairing for an externally running companion and allows cancellation", async () => {
  render(<App />); fireEvent.click(await screen.findByRole("button", { name: "Start & Authenticate" }));
  expect(await screen.findByPlaceholderText("000000")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByPlaceholderText("000000")).toBeNull());
});
it("never saves B using A's ID after B registration fails", async () => {
  await authenticatedPanel(); activePath = "/tmp/B.prproj"; failB = true;
  fireEvent.click(screen.getByTitle("Refresh Project"));
  await waitFor(() => expect(registrations).toContain("/tmp/B.prproj"));
  const note = screen.queryByPlaceholderText("What changes did you make in this cut?");
  if (note) {
    fireEvent.change(note, { target: { value: "B edit" } });
    const save = saveButton();
    expect(save.disabled).toBe(true);
  }
  expect(snapshots).toEqual([]);
});
it("clears project state when the active project closes", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  await authenticatedPanel(); activePath = "";
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByText(/No project open\. Open a Premiere Pro project/)).toBeTruthy();
  expect(screen.queryByPlaceholderText("What changes did you make in this cut?")).toBeNull();
});
it("rechecks host identity before creating a save point", async () => {
  await authenticatedPanel();
  fireEvent.change(screen.getByPlaceholderText("What changes did you make in this cut?"), { target: { value: "A edit" } });
  activePath = "/tmp/B.prproj";
  fireEvent.click(saveButton());
  await waitFor(() => expect(registrations).toContain("/tmp/B.prproj"));
  expect(snapshots).toEqual([]);
});
it("ignores an older registration response after switching projects", async () => {
  delayA = true; sessionStorage.setItem("editvcs_session_token", "session"); render(<App />);
  await waitFor(() => expect(resolveA).toBeTypeOf("function"));
  activePath = "/tmp/B.prproj"; fireEvent.click(screen.getByTitle("Refresh Project"));
  await waitFor(() => expect(registrations).toContain("/tmp/B.prproj"));
  await act(async () => { resolveA!(json({ projectId: "id-A" })); });
  fireEvent.change(await screen.findByPlaceholderText("What changes did you make in this cut?"), { target: { value: "B edit" } });
  fireEvent.click(saveButton());
  await waitFor(() => expect(snapshots).toHaveLength(1));
  expect(snapshots[0].projectId).toBe("id-B");
});
it("does not register fictional browser projects when the SDK exists without CEP", async () => {
  delete (window as any).__adobe_cep__;
  sessionStorage.setItem("editvcs_session_token", "session"); render(<App />);
  await screen.findByText(/No project open\. Open a Premiere Pro project/);
  expect(registrations).toEqual([]);
});

it("completes code pairing and opens the registered project", async () => {
  render(<App />); fireEvent.click(await screen.findByRole("button", { name: "Start & Authenticate" }));
  fireEvent.change(await screen.findByLabelText("Six-digit pairing code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Pair Panel" }));
  await screen.findByPlaceholderText("What changes did you make in this cut?");
  expect(sessionStorage.getItem("editvcs_session_token")).toBe("paired-token");
  expect(registrations).toContain("/tmp/A.prproj");
});

it("expires a pending pairing without leaving code entry active", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  render(<App />); fireEvent.click(await screen.findByRole("button", { name: "Start & Authenticate" }));
  await screen.findByLabelText("Six-digit pairing code");
  await act(async () => { await vi.advanceTimersByTimeAsync(61000); });
  expect(screen.queryByLabelText("Six-digit pairing code")).toBeNull();
  expect(screen.getByText(/Pairing session expired/)).toBeTruthy();
});

it("does not replace B history with a delayed A save response", async () => {
  await authenticatedPanel(); delaySave = true;
  fireEvent.change(screen.getByPlaceholderText("What changes did you make in this cut?"), { target: { value: "A edit" } });
  fireEvent.click(saveButton()); await waitFor(() => expect(resolveSave).toBeTypeOf("function"));
  activePath = "/tmp/B.prproj"; fireEvent.click(screen.getByTitle("Refresh Project"));
  await waitFor(() => expect(registrations).toContain("/tmp/B.prproj"));
  fireEvent.change(screen.getByPlaceholderText("What changes did you make in this cut?"), { target: { value: "B unsaved note" } });
  await act(async () => { resolveSave!(json({ created: true })); });
  expect(screen.queryByText("A-only-history")).toBeNull();
  expect((screen.getByPlaceholderText("What changes did you make in this cut?") as HTMLInputElement).value).toBe("B unsaved note");
});

it("ignores delayed A history fetched after a successful A save", async () => {
  await authenticatedPanel(); delayHistory = true;
  fireEvent.change(screen.getByPlaceholderText("What changes did you make in this cut?"), { target: { value: "A edit" } });
  fireEvent.click(saveButton()); await waitFor(() => expect(resolveHistory).toBeTypeOf("function"));
  activePath = "/tmp/B.prproj"; fireEvent.click(screen.getByTitle("Refresh Project"));
  await waitFor(() => expect(registrations).toContain("/tmp/B.prproj"));
  await act(async () => { resolveHistory!(json([{ id: "snap-A", projectId: "id-A", sequenceNumber: 1, createdAt: "2026-11-02", trigger: "manual", label: "A-only-history", projectFile: { originalFileName: "A.prproj", sha256: "a".repeat(64) } }])); });
  expect(screen.queryByText("A-only-history")).toBeNull();
});
