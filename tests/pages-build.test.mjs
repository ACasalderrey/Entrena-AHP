import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la compilación de Pages usa el subdirectorio del repositorio", async () => {
  const html = await readFile(new URL("../dist-pages/index.html", import.meta.url), "utf8");

  assert.match(html, /\/Entrena-AHP\/assets\//);
  assert.match(html, /\/Entrena-AHP\/manifest\.webmanifest/);
  assert.match(html, /<html lang="es">/);
});

test("el manifiesto y el service worker funcionan desde una ruta base", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../dist-pages/manifest.webmanifest", import.meta.url), "utf8"),
  );
  const serviceWorker = await readFile(new URL("../dist-pages/sw.js", import.meta.url), "utf8");

  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.match(serviceWorker, /self\.registration\.scope/);
});
