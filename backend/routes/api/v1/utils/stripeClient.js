/*
Purpose: Instantiate a Stripe API client with fail-closed key validation and
         automatic network retries.

Authentication/Authorization Requirements: N/A (utility module, not a route)

Expected Request Information: N/A
Expected Response Information: N/A
*/

import Stripe from "stripe";

/*
 * @behavior Create a configured Stripe SDK client instance if an API key is present.
 * @param env — environment object containing STRIPE_SECRET_KEY (defaults to process.env)
 * @returns Stripe client instance or null if unconfigured
 */
export function createStripeClient(env = process.env) {
  const secretKey = env?.STRIPE_SECRET_KEY;
  if (typeof secretKey !== "string" || secretKey.trim() === "") {
    return null;
  }
  return new Stripe(secretKey.trim(), {
    maxNetworkRetries: 2,
  });
}
