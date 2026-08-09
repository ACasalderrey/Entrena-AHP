export const GITHUB_PAGES_ORIGIN = "https://acasalderrey.github.io";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH"]);
const ALLOWED_HEADERS = new Set(["content-type", "x-progress-key"]);

/**
 * @param {Request} request
 * @returns {boolean}
 */
export function isCorsOriginAllowed(request) {
  return request.headers.get("origin") === GITHUB_PAGES_ORIGIN;
}

/**
 * Headers shared by actual CORS responses. Requests from other origins receive
 * no allow-origin header, while same-origin traffic continues to work normally.
 *
 * @param {Request} request
 * @returns {Headers}
 */
export function corsHeaders(request) {
  const headers = new Headers({ vary: "Origin" });
  if (isCorsOriginAllowed(request)) {
    headers.set("access-control-allow-origin", GITHUB_PAGES_ORIGIN);
  }
  return headers;
}

/**
 * @param {Request} request
 * @returns {Response}
 */
export function corsPreflightResponse(request) {
  const headers = corsHeaders(request);
  headers.set("cache-control", "no-store");
  headers.set(
    "vary",
    "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
  );

  const requestedMethod = request.headers.get("access-control-request-method")?.toUpperCase();
  const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const validRequest =
    isCorsOriginAllowed(request) &&
    (!requestedMethod || ALLOWED_METHODS.has(requestedMethod)) &&
    requestedHeaders.every((header) => ALLOWED_HEADERS.has(header));

  if (!validRequest) {
    headers.delete("access-control-allow-origin");
    return new Response(null, { status: 403, headers });
  }

  headers.set("access-control-allow-methods", [...ALLOWED_METHODS].join(", "));
  headers.set("access-control-allow-headers", [...ALLOWED_HEADERS].join(", "));
  return new Response(null, { status: 204, headers });
}
