export const ALE_EXTERNAL_API_RETIREMENT_VERSION = "ale-external-api-retirement/1";

const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

const RETIRED_BODY = Object.freeze({
  code: "ALE_EXTERNAL_API_RETIRED",
  error: "The external Adaptive Learning Engine API has been retired.",
});

/**
 * Fail-closed tombstone for the obsolete cross-project ALE bridge.
 *
 * Deliberately does not inspect credentials, query a database, provision users,
 * mint sessions, or contact downstream ALE functions. Internal Lumina adaptive-
 * learning services remain separate and are not changed by this handler.
 */
export function handleRetiredAleApiRequest(request: Request): Response {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
    });
  }

  return new Response(JSON.stringify(RETIRED_BODY), {
    status: 410,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}
