import assert from "node:assert/strict";
import test from "node:test";
import {
  GITHUB_PAGES_ORIGIN,
  corsHeaders,
  corsPreflightResponse,
  isCorsOriginAllowed,
} from "../app/lib/cors.js";

function preflight(origin, method = "POST", headers = "content-type, x-progress-key") {
  return new Request("https://entrena-ahp-aeat.casalderrey.chatgpt.site/api/progress", {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": method,
      "access-control-request-headers": headers,
    },
  });
}

test("CORS permite exclusivamente el origen de GitHub Pages", () => {
  const allowed = preflight(GITHUB_PAGES_ORIGIN);
  const rejected = preflight("https://example.com");

  assert.equal(isCorsOriginAllowed(allowed), true);
  assert.equal(corsHeaders(allowed).get("access-control-allow-origin"), GITHUB_PAGES_ORIGIN);
  assert.equal(isCorsOriginAllowed(rejected), false);
  assert.equal(corsHeaders(rejected).get("access-control-allow-origin"), null);
});

test("el preflight acepta solo los métodos y cabeceras necesarios", () => {
  const accepted = corsPreflightResponse(preflight(GITHUB_PAGES_ORIGIN));
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get("access-control-allow-origin"), GITHUB_PAGES_ORIGIN);
  assert.equal(accepted.headers.get("access-control-allow-methods"), "GET, POST");
  assert.equal(accepted.headers.get("access-control-allow-headers"), "content-type, x-progress-key");
  assert.equal(accepted.headers.get("cache-control"), "no-store");

  assert.equal(corsPreflightResponse(preflight(GITHUB_PAGES_ORIGIN, "DELETE")).status, 403);
  assert.equal(corsPreflightResponse(preflight(GITHUB_PAGES_ORIGIN, "POST", "authorization")).status, 403);
  assert.equal(corsPreflightResponse(preflight("https://example.com")).status, 403);
});
