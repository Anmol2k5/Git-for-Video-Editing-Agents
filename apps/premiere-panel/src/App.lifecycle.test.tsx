// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import hostScript from '../jsx/hostscript.jsx?raw';
import vm from 'node:vm';
import { companionClient } from './engine';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
let activePath: string;
let staleToken: boolean;
let authUnavailable: boolean;
let serviceOffline: boolean;
let pendingPair: ReturnType<typeof deferred<Response>> | undefined;
let pendingRevoke: ReturnType<typeof deferred<Response>> | undefined;
let pendingRestore: ReturnType<typeof deferred<Response>> | undefined;
let comparisons: Array<ReturnType<typeof deferred<Response>>>;
let registeredPaths: string[];
let snapshotRequests: Array<Record<string, unknown>>;
let pendingManual: Record<string, ReturnType<typeof deferred<Response>>>;
let executeHost: ((script: string) => string) | undefined;
const history = (projectId: string) => [3, 2, 1].map(sequenceNumber => ({
  id: `${projectId}-${sequenceNumber}`, projectId, sequenceNumber, createdAt: `2026-11-0${sequenceNumber}`,
  trigger: 'manual', label: `${projectId} version ${sequenceNumber}`,
  projectFile: { originalFileName: `${projectId}.prproj`, sha256: 'a'.repeat(64) }
}));

beforeEach(() => {
  sessionStorage.clear(); companionClient.sessionToken = null; companionClient.resetRestartCounter();
  activePath = '/tmp/A.prproj'; staleToken = false; authUnavailable = false; serviceOffline = false; pendingPair = undefined; pendingRevoke = undefined; pendingRestore = undefined; comparisons = []; registeredPaths = []; snapshotRequests = []; pendingManual = {}; executeHost = undefined;
  (window as any).__adobe_cep__ = {};
  window.CSInterface = class {
    getSystemPath() { return '/extension'; }
    evalScript(script: string, callback?: (result: string) => void) {
      if (executeHost) { callback?.(executeHost(script)); return; }
      callback?.(script.includes('getActiveProjectPath') ? activePath : script.includes('saveActiveProject') ? 'SUCCESS' : JSON.stringify({ projectName: 'Film', sequenceName: 'Main', videoTracks: [], audioTracks: [] }));
    }
  };
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname === '/health') return serviceOffline ? json({ error: 'Offline' }, 503) : json({ status: 'ok' });
    if (url.pathname === '/pair/start') return json({ pairingId: 'pair', expiresAt: Date.now() + 60000 });
    if (url.pathname === '/pair/complete') return pendingPair?.promise ?? json({ sessionToken: 'new-pair-token' });
    if (url.pathname === '/sessions/revoke') return pendingRevoke?.promise ?? json({ revoked: true });
    if (url.pathname === '/projects/register') {
      const { projectPath } = JSON.parse(init!.body as string); registeredPaths.push(projectPath);
      return json({ projectId: projectPath.includes('B.prproj') ? 'B' : 'A' });
    }
    if (url.pathname === '/snapshots') {
      if (authUnavailable) return json({ error: 'Unavailable' }, 503);
      if (staleToken) return json({ error: 'Unauthorized' }, 401);
      return json(url.searchParams.has('projectId') ? history(url.searchParams.get('projectId')!) : []);
    }
    if (url.pathname === '/snapshots/manual') {
      const payload = JSON.parse(init!.body as string); snapshotRequests.push(payload);
      return pendingManual[payload.projectId]?.promise ?? json({ created: true });
    }
    if (url.pathname.endsWith('/changes')) {
      const pending = deferred<Response>(); comparisons.push(pending); return pending.promise;
    }
    if (url.pathname === '/snapshots/restore-copy') return pendingRestore?.promise ?? json({ restoredPath: '/tmp/Copy.prproj' });
    return json({});
  }));
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); delete (window as any).__adobe_cep__; delete (window as any).require; sessionStorage.clear();
});
async function openPanel() {
  sessionStorage.setItem('editvcs_session_token', 'session'); render(<App />);
  await screen.findByText('A version 3');
}
async function openPairing() {
  render(<App />); fireEvent.click(await screen.findByRole('button', { name: 'Start & Authenticate' }));
  fireEvent.change(await screen.findByLabelText('Six-digit pairing code'), { target: { value: '123456' } });
}
const result = (summary: string) => json({ confidence: 'best-effort', summary: [summary], groups: [], unsupported: [] });

it('requires pairing when a healthy companion rejects the restored session', async () => {
  staleToken = true; sessionStorage.setItem('editvcs_session_token', 'stale'); render(<App />);
  await screen.findByText('Authorization Required');
  expect(registeredPaths).toEqual([]);
  expect(sessionStorage.getItem('editvcs_session_token')).toBeNull();
});
it('disconnects locally before an unresponsive revoke request completes', async () => {
  await openPanel(); pendingRevoke = deferred<Response>();
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  await screen.findByText('Authorization Required');
  expect(companionClient.sessionToken).toBeNull();
  expect(sessionStorage.getItem('editvcs_session_token')).toBeNull();
});
it('ignores successful pairing after the user cancels the pending completion', async () => {
  await openPairing(); pendingPair = deferred<Response>();
  fireEvent.click(screen.getByRole('button', { name: 'Pair Panel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await act(async () => { pendingPair!.resolve(json({ sessionToken: 'obsolete-token' })); });
  expect(screen.getByText('Authorization Required')).toBeTruthy();
  expect(companionClient.sessionToken).toBeNull();
  expect(sessionStorage.getItem('editvcs_session_token')).toBeNull();
});
it('keeps the newest comparison when an older comparison finishes last', async () => {
  await openPanel();
  fireEvent.click(screen.getAllByRole('button', { name: 'Diff' })[0]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Diff' })[1]);
  await waitFor(() => expect(comparisons).toHaveLength(2));
  await act(async () => { comparisons[1].resolve(result('New selection')); });
  expect(await screen.findByText('New selection')).toBeTruthy();
  await act(async () => { comparisons[0].resolve(result('Obsolete selection')); });
  expect(screen.getByText('New selection')).toBeTruthy();
  expect(screen.queryByText('Obsolete selection')).toBeNull();
});
it('keeps the new project restore dialog when a previous restore completes', async () => {
  await openPanel(); pendingRestore = deferred<Response>();
  fireEvent.click(screen.getAllByRole('button', { name: 'Restore as Copy' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Restore' }));
  activePath = '/tmp/B.prproj'; fireEvent.click(screen.getByTitle('Refresh Project'));
  await screen.findByText('B version 3');
  fireEvent.click(screen.getAllByRole('button', { name: 'Restore as Copy' })[0]);
  expect((screen.getByRole('button', { name: 'Confirm Restore' }) as HTMLButtonElement).disabled).toBe(false);
  await act(async () => { pendingRestore!.resolve(json({ restoredPath: '/tmp/A-copy.prproj' })); });
  expect(screen.getByPlaceholderText('Folder absolute path...')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Confirm Restore' }) as HTMLButtonElement).disabled).toBe(false);
});

it('does not open projects when the startup authentication check is unavailable', async () => {
  authUnavailable = true; sessionStorage.setItem('editvcs_session_token', 'unverified'); render(<App />);
  await screen.findByText('Reconnecting...');
  expect(registeredPaths).toEqual([]);
  expect(screen.queryByText('A version 3')).toBeNull();
});

it('continues startup supervision without a session after the first launch fails', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  serviceOffline = true; render(<App />);
  await act(async () => {});
  expect(screen.getByText('Reconnecting...')).toBeTruthy();
  serviceOffline = false;
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByText('Authorization Required')).toBeTruthy();
});

function saveButton() {
  return screen.getAllByRole('button', { name: 'Create Save Point' }).find(button => button.classList.contains('btn-primary')) as HTMLButtonElement;
}
function note(value: string) {
  fireEvent.change(screen.getByPlaceholderText('What changes did you make in this cut?'), { target: { value } });
}
function realHost(swapDuring: 'saveActiveProject' | 'getTimelineState') {
  const saved: string[] = [];
  const project = (name: string) => ({
    path: `/tmp/${name}.prproj`, name,
    save() { saved.push(name); return 0; },
    activeSequence: { sequenceID: name, name: `${name} sequence`, videoTracks: { numTracks: 0 }, audioTracks: { numTracks: 0 } }
  });
  const a = project('A'); const b = project('B');
  const context = vm.createContext({ $: {}, app: { project: a } });
  vm.runInContext(hostScript, context);
  executeHost = script => {
    const swap = script.includes(swapDuring);
    if (swap) context.app.project = b;
    try { return vm.runInContext(script, context); }
    finally { context.app.project = a; }
  };
  return saved;
}
it('does not save another project when Premiere changes just before the host save command', async () => {
  const saved = realHost('saveActiveProject'); await openPanel();
  note('A edit'); fireEvent.click(saveButton());
  await waitFor(() => expect(saveButton().disabled).toBe(false));
  expect(saved).toEqual([]);
  expect(snapshotRequests).toEqual([]);
});
it('rejects another project metadata even when Premiere switches back before the final path check', async () => {
  const saved = realHost('getTimelineState'); await openPanel();
  note('A edit'); fireEvent.click(saveButton());
  await waitFor(() => expect(saveButton().disabled).toBe(false));
  expect(saved).toEqual(['A']);
  expect(snapshotRequests).toEqual([]);
});
it('does not let a previous save completion clear the new project save progress', async () => {
  await openPanel(); pendingManual.A = deferred<Response>(); pendingManual.B = deferred<Response>();
  note('A edit'); fireEvent.click(saveButton());
  await waitFor(() => expect(snapshotRequests).toHaveLength(1));
  activePath = '/tmp/B.prproj'; fireEvent.click(screen.getByTitle('Refresh Project'));
  await screen.findByText('B version 3'); note('B edit');
  expect(saveButton().disabled).toBe(false);
  fireEvent.click(saveButton());
  await waitFor(() => expect(snapshotRequests).toHaveLength(2));
  await act(async () => { pendingManual.A.resolve(json({ created: true })); });
  expect((screen.getByRole('button', { name: 'Creating Save Point...' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { pendingManual.B.resolve(json({ created: true })); });
  expect((screen.getByPlaceholderText('What changes did you make in this cut?') as HTMLInputElement).value).toBe('');
});

it('does not authorize an unmounted panel when a pending pairing completes', async () => {
  await openPairing(); pendingPair = deferred<Response>();
  fireEvent.click(screen.getByRole('button', { name: 'Pair Panel' }));
  cleanup();
  await act(async () => { pendingPair!.resolve(json({ sessionToken: 'obsolete-unmounted-token' })); });
  expect(companionClient.sessionToken).toBeNull();
  expect(sessionStorage.getItem('editvcs_session_token')).toBeNull();
});
it('does not repopulate authorization when an automatic restart finishes after Disconnect', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  sessionStorage.setItem('editvcs_session_token', 'session'); render(<App />);
  await act(async () => {});
  expect(screen.getByText('A version 3')).toBeTruthy();
  (window as any).require = (name: string) => {
    if (name === 'crypto') return { randomBytes: () => ({ toString: () => 'restart-token' }) };
    if (name === 'child_process') return { spawn: () => ({ once() { return this; }, unref() {} }) };
    if (name === 'path') return { join: () => '/extension/server/companion.cjs' };
    if (name === 'fs') return { existsSync: () => true };
    if (name === 'process') return { env: {} };
    throw Error(name);
  };
  serviceOffline = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  serviceOffline = false;
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(screen.getByText('Authorization Required')).toBeTruthy();
  expect(companionClient.sessionToken).toBeNull();
  expect(sessionStorage.getItem('editvcs_session_token')).toBeNull();
});

it('keeps successful active-sequence capture explicitly best effort', async () => {
  await openPanel(); note('A edit'); fireEvent.click(saveButton());
  await waitFor(() => expect(snapshotRequests).toHaveLength(1));
  expect(snapshotRequests[0]).toMatchObject({
    projectId: 'A', manifestStatus: 'best-effort',
    manifest: { projectPathHint: '/tmp/A.prproj', sequences: [{ name: 'Main', clips: [] }] }
  });
  expect(snapshotRequests[0].manifestReason).toMatch(/active sequence only/);
});
it('creates a file snapshot with unavailable metadata when there is no active sequence', async () => {
  await openPanel();
  executeHost = script => script.includes('getActiveProjectPath') ? activePath
    : script.includes('saveActiveProject') ? 'SUCCESS'
    : JSON.stringify({ error: 'No active sequence', reason: 'No active sequence is selected.' });
  note('A edit'); fireEvent.click(saveButton());
  await waitFor(() => expect(snapshotRequests).toHaveLength(1));
  expect(snapshotRequests[0]).toMatchObject({
    projectId: 'A', manifestStatus: 'unavailable', manifest: null,
    manifestReason: 'No active sequence is selected.'
  });
});

it('preserves a note entered while an earlier save point is still pending', async () => {
  await openPanel(); pendingManual.A = deferred<Response>();
  note('Saved note'); fireEvent.click(saveButton());
  await waitFor(() => expect(snapshotRequests).toHaveLength(1));
  note('Next save point note');
  await act(async () => { pendingManual.A.resolve(json({ created: true })); });
  expect((screen.getByPlaceholderText('What changes did you make in this cut?') as HTMLInputElement).value).toBe('Next save point note');
});
