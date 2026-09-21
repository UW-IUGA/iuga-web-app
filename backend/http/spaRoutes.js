/*
* Purpose: Serve the built frontend page for the browser routes a visitor can open directly.
* Authentication/Authorization Requirements: None; being signed in is still checked by the API, not by
* this page.
* Expected Request Information: A GET for one of the frontend's own routes, such as /events or /shop.
* Expected Response Information: The built index.html, which then loads the frontend application.
*/

import express from "express";
import { fileURLToPath } from "node:url";

export const SPA_ROUTES = [
  "/",
  "/events",
  "/resources",
  "/student-voice",
  "/shop",
  "/elections",
  "/electionfaq",
  "/about",
  "/get-involved",
  "/contact",
];

/*
 * @behavior Build the router that answers the frontend's own routes with the built page.
 * @param options.indexPath — where the built index.html lives; a `file:` URL is accepted and
 *                            converted to a path
 * @returns the router to mount after the API routes, so an API path is never answered with the page
 */
export function createSpaRouter({ indexPath }) {
  const router = express.Router();
  const shellPath = indexPath instanceof URL ? fileURLToPath(indexPath) : indexPath;

  router.get(SPA_ROUTES, (req, res, next) => {
    res.sendFile(shellPath, next);
  });

  return router;
}
