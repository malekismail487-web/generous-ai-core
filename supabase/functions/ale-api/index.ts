// The legacy external Adaptive Learning Engine gateway is permanently retired.
// Keep this deployed function as a fail-closed tombstone so old callers receive
// an explicit terminal response instead of reaching any authentication or ALE
// execution path.

import { handleRetiredAleApiRequest } from "./retirement.ts";

Deno.serve(handleRetiredAleApiRequest);
