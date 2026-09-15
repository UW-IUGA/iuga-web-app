/*
 * Purpose: Serve the compiled SPA shell for browser routes that may be loaded directly.
 * Auth/Authorization Requirements: None; route access remains enforced by API middleware.
 * Expected Request: A GET request for one of the frontend's client-side routes.
 * Expected Response: The compiled frontend index.html document.
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

export function createSpaRouter({ indexPath }) {
  const router = express.Router();
  const shellPath = indexPath instanceof URL ? fileURLToPath(indexPath) : indexPath;

  router.get(SPA_ROUTES, (req, res, next) => {
    res.sendFile(shellPath, next);
  });

  return router;
}
