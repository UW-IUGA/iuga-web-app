/*
Purpose: Serve merchandise shop catalog information to prospective buyers.
         Provides public endpoints for browsing available apparel, allowed sizes,
         pricing, and the drop's sale window state.

Authentication/Authorization Requirements:
- GET /catalog: None (public browsing, unauthenticated)

Expected Request Information:
- GET /catalog: None

Expected Response Information:
- 200 {
    status: "success",
    catalog: {
      dropId: string,
      catalogVersion: string,
      currency: string,
      opensAt: string (ISO),
      closesAt: string (ISO),
      saleState: "scheduled" | "open" | "closed",
      items: [
        {
          sku: string,
          name: string,
          sizes: string[],
          unitAmount: number (cents)
        }
      ]
    }
  }
*/

import express from "express";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { publicCatalog } from "../utils/shopCatalog.js";

/*
 * @behavior Factory creating an Express router for shop endpoints with dependency injection.
 * @param options.catalog — catalog definition containing dropId, version, currency, dates, and items
 * @param options.now — clock function returning current timestamp in milliseconds (defaults to Date.now)
 * @returns Express router instance
 */
export function createShopRouter({ catalog, now = Date.now }) {
  const router = express.Router();

  /*
  Purpose: Retrieve the public merchandise drop catalog and current sale window state.
  Authentication/Authorization Requirements: None (public browsing).
  Expected Request Information: None.
  Expected Response Information:
  - 200 { status: "success", catalog: publicCatalog(...) }
  */
  router.get("/catalog", (_req, res) => {
    const currentMs = now();
    const catalogData = publicCatalog(catalog, currentMs);
    return sendSuccess(res, { catalog: catalogData });
  });

  return router;
}
