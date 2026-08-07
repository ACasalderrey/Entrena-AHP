import assert from "node:assert/strict";
import test from "node:test";


async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://entrena-ahp.example/", {
      headers: { accept: "text/html", host: "entrena-ahp.example" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}


test("renders the finished simulator setup", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Entrena AHP \| Tests históricos de Agentes de Hacienda<\/title>/i);
  assert.match(html, /Entrena como el día del examen\./);
  assert.match(html, /372/);
  assert.match(html, /Comenzar test de/);
  assert.match(html, />20(?:<!-- -->)? preguntas<\/button>/);
  assert.match(html, /aciertos menos errores divididos entre cuatro|Una fórmula clara/i);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});


test("uses the incoming host for absolute social metadata", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /https:\/\/entrena-ahp\.example\/og\.png/);
});
