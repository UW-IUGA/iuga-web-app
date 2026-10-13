/*
Purpose: Answer the Microsoft Graph profile lookup locally, so the shop smoke suite can sign in test
         students without network access. Preloaded into the backend child process with `node --import`.
Expected Request Information: Authorization: Bearer smoke:<slug> on GET https://graph.microsoft.com/v1.0/me.
Expected Response Information: 200 with a profile for a valid slug; 401 with {} for any other token.
         Every other request goes to the original fetch unchanged.
*/

// Replacing fetch changes every outbound request in the process, so the file refuses to load unless the
// caller opts in with IUGA_SHOP_SMOKE=1.
if (process.env.IUGA_SHOP_SMOKE !== "1") {
  throw new Error(
    "shopSmokeGraphStub refused to load: it replaces global fetch for the Graph profile URL and only runs when IUGA_SHOP_SMOKE=1.",
  );
}

const GRAPH_PROFILE_URL = "https://graph.microsoft.com/v1.0/me";
const TEST_TOKEN_PATTERN = /^Bearer smoke:([a-z0-9]{1,30})$/;
const originalFetch = globalThis.fetch;

/*
 * @behavior Read the request URL from a string, a URL, or a Request.
 */
function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url;
}

/*
 * @behavior Read the Authorization header. Headers in init replace the Request's own headers, as in fetch.
 */
function requestAuthorization(input, init) {
  const source = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  return new Headers(source).get("authorization") ?? "";
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = async function shopSmokeFetch(input, init) {
  if (requestUrl(input) !== GRAPH_PROFILE_URL) {
    return originalFetch(input, init);
  }

  const match = TEST_TOKEN_PATTERN.exec(requestAuthorization(input, init));
  if (!match) {
    return jsonResponse(401, {});
  }

  const slug = match[1];
  return jsonResponse(200, {
    mail: `${slug}@smoke.test`,
    displayName: `Smoke ${slug}`,
    givenName: slug,
    surname: "Smoke",
  });
};
