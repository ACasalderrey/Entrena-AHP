import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("la compilación de Pages usa el subdirectorio del repositorio", async () => {
  const html = await readFile(new URL("../dist-pages/index.html", import.meta.url), "utf8");

  assert.match(html, /\/Entrena-AHP\/assets\//);
  assert.match(html, /\/Entrena-AHP\/manifest\.webmanifest/);
  assert.match(
    html,
    /name="entrena-ahp-progress-api"\s+content="https:\/\/entrena-ahp-aeat\.casalderrey\.chatgpt\.site\/api\/progress"/,
  );
  assert.match(html, /<html lang="es">/);
});

test("la compilación de Pages resuelve el endpoint remoto con fallback local", async () => {
  const assetsUrl = new URL("../dist-pages/assets/", import.meta.url);
  const assetNames = await readdir(assetsUrl);
  const scripts = await Promise.all(
    assetNames
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFile(new URL(name, assetsUrl), "utf8")),
  );
  const bundle = scripts.join("\n");

  assert.match(bundle, /entrena-ahp-progress-api/);
  assert.match(bundle, /\/api\/progress/);
  assert.match(bundle, /entrena-ahp-progress-cache:v1:/);
  assert.match(bundle, /entrena-ahp-progress-backup/);
  assert.match(bundle, /Exportar historial/);
  assert.match(bundle, /Importar copia/);
  assert.match(bundle, /application\/json/);
});

test("el manifiesto y el service worker funcionan desde una ruta base", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../dist-pages/manifest.webmanifest", import.meta.url), "utf8"),
  );
  const serviceWorker = await readFile(new URL("../dist-pages/sw.js", import.meta.url), "utf8");

  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.match(serviceWorker, /self\.registration\.scope/);
  assert.match(serviceWorker, /pathname\.startsWith\(new URL\("api\/"/);
});
