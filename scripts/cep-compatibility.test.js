import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const dist = fileURLToPath(new URL("../apps/premiere-panel/dist/", import.meta.url));

test("built CEP styles avoid CSS features unavailable in Chromium 88", async () => {
  const files = (await readdir(path.join(dist, "assets"))).filter(file => file.endsWith(".css"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const css = postcss.parse(await readFile(path.join(dist, "assets", file), "utf8"));
    css.walkAtRules(rule => assert.ok(!["layer", "property", "theme"].includes(rule.name), `unsupported @${rule.name}`));
    css.walkDecls(declaration => assert.doesNotMatch(declaration.value, /\b(?:oklch|oklab|color-mix)\(/i));
    css.walkRules(rule => assert.doesNotMatch(rule.selector, /&|:has\(/));
  }
});

test("built extension references existing relative local resources", async () => {
  const html = await readFile(path.join(dist, "index.html"), "utf8");
  const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(resources.length > 0);
  for (const resource of resources) {
    assert.ok(resource.startsWith("./"), `extension resource must be relative: ${resource}`);
    await access(path.join(dist, resource));
  }
});
