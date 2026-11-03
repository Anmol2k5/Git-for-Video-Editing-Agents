import { mkdtemp, writeFile, readFile, readdir, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createSnapshotService } from './snapshot-service';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'editvcs-recovery-')); dirs.push(dir);
  const project = path.join(dir, 'Film.prproj'); await writeFile(project, 'version-A');
  const storage = path.join(dir, 'storage');
  return { project, storage, service: createSnapshotService({ storageRoot: storage }) };
}

it('refuses new history when existing metadata is corrupt rather than reusing sequence numbers', async () => {
  const { project, storage, service } = await fixture();
  const first = await service.createManualSnapshot({ projectId: 'proj_recovery', projectPath: project, label: 'First' });
  const file = path.join(storage, 'projects', 'proj_recovery', 'snapshots', first.snapshot!.id + '.json');
  await writeFile(file, '{corrupt'); await writeFile(project, 'version-B');
  await expect(service.createManualSnapshot({ projectId: 'proj_recovery', projectPath: project, label: 'Second' })).rejects.toThrow(/history|recovery|unavailable|corrupt/i);
  expect(await readFile(file, 'utf8')).toBe('{corrupt');
  expect(await readdir(path.dirname(file))).toEqual([first.snapshot!.id + '.json']);
  expect(await readdir(path.join(storage, 'objects', '.tmp'))).toEqual([]);
});

it('cleans temporary project copies when object publication fails', async () => {
  const { project, storage, service } = await fixture();
  const hash = createHash('sha256').update('version-A').digest('hex');
  await mkdir(path.join(storage, 'objects'), { recursive: true });
  await writeFile(path.join(storage, 'objects', hash.slice(0, 2)), 'blocked directory');
  await expect(service.createManualSnapshot({ projectId: 'proj_recovery', projectPath: project, label: 'First' })).rejects.toThrow();
  expect(await readdir(path.join(storage, 'objects', '.tmp'))).toEqual([]);
});
