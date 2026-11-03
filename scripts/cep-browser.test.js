import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const dist = path.resolve(fileURLToPath(new URL("../apps/premiere-panel/dist/", import.meta.url)));
const browserCandidates = [process.env.EDITVCS_CHROMIUM_EXECUTABLE, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe')].filter(Boolean);

async function browserExecutable() {
  for (const executable of browserCandidates) {
    try { await access(executable); return executable; } catch { /* try the next installed browser */ }
  }
  throw Error('Install Chromium/Chrome or set EDITVCS_CHROMIUM_EXECUTABLE to run the CEP browser regression.');
}

test('built CEP panel boots, applies styles and creates save points in a real browser', { timeout: 30000 }, async () => {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!pathname.startsWith('/extension/')) { res.writeHead(404).end(); return; }
      const target = path.resolve(dist, pathname.slice('/extension/'.length) || 'index.html');
      if (!target.startsWith(dist + path.sep)) { res.writeHead(403).end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
      res.setHeader('content-type', types[path.extname(target)] || 'application/octet-stream');
      res.end(await readFile(target));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await browserExecutable(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 300, height: 680 } });
    const errors = [];
    const failedResources = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().includes('/extension/') && !response.ok()) failedResources.push(response.url()); });
    await page.addInitScript(() => {
      sessionStorage.setItem('editvcs_session_token', 'browser-session');
      window.__adobe_cep__ = {
        getHostEnvironment: () => '{}',
        getSystemPath: () => '/fixture/extension',
        evalScript: (script, callback) => {
          const projectPath = '/fixture/Browser.prproj';
          if (script.includes('getActiveProjectPath')) { callback(projectPath); return; }
          const argument = script.match(/\((.*)\)\s*$/)?.[1];
          const expected = argument ? JSON.parse(argument) : projectPath;
          if (script.includes('saveActiveProject')) { callback(expected === projectPath ? 'SUCCESS' : 'FAILED'); return; }
          callback(JSON.stringify(expected === projectPath ? { projectName: 'Browser', projectPath, sequenceId: 'main', sequenceName: 'Main', framerate: 24, videoTracks: [], audioTracks: [] } : { error: 'PROJECT_CHANGED' }));
        }
      };
    });
    const snapshots = [];
    await page.route('http://127.0.0.1:8731/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'authorization,content-type,x-editvcs-client' };
      if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
      let body;
      if (pathname === '/health') body = { status: 'ok' };
      else {
        assert.equal(request.headers().authorization, 'Bearer browser-session');
        if (pathname === '/projects/register') body = { projectId: 'proj_browser' };
        else if (pathname === '/snapshots/manual') {
          const input = request.postDataJSON();
          assert.equal(input.projectId, 'proj_browser');
          assert.equal(input.manifest.projectName, 'Browser');
          assert.equal(input.manifestStatus, 'best-effort');
          snapshots.push({ id: 'snap_browser', projectId: 'proj_browser', sequenceNumber: 1, createdAt: '2026-11-03T00:00:00Z', trigger: 'manual', label: input.label, projectFile: { originalFileName: 'Browser.prproj', sha256: 'a'.repeat(64) } });
          body = { created: true };
        } else if (pathname === '/snapshots') body = snapshots;
        else throw Error(`Unexpected browser API request: ${pathname}`);
      }
      await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/extension/index.html`);
    await page.getByPlaceholder('What changes did you make in this cut?').fill('Browser build regression');
    const save = page.locator('button.btn-primary').filter({ hasText: 'Create Save Point' });
    assert.equal(await save.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(167, 139, 250)');
    assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(13, 13, 18)');
    assert.equal(await page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth), true);
    await save.click();
    await page.getByText('Browser build regression', { exact: true }).waitFor();
    assert.equal(snapshots.length, 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(failedResources, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
