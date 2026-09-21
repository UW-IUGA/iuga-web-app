/*
Purpose: Authenticate users via Microsoft Graph, manage user sessions, and provide user profile data.
Authentication/Authorization Requirements: /login is rate-limited and open to holders of a valid Microsoft access token; all other routes require an authenticated session.
Expected Request Information:
- POST /login: Authorization header with Bearer token from Microsoft
- POST /logout: authenticated session
- GET /: authenticated session
- GET /:uId: authenticated session and user id uId
- POST /:uId: authenticated session and user id uId
Expected Response Information:
- 200 with user profile or session summary
- 400 for malformed user identifiers
- 401 when unauthenticated or when Microsoft Graph rejects the bearer token
- 403 when an unauthorized user attempts to edit another user's profile
- 500 on database or session destruction failures
- 502 when Microsoft Graph is unavailable or returns an incomplete profile
*/

import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requireAuth } from "../utils/auth.js";
import { createRateLimiter } from "../utils/rateLimit.js";

var router = express.Router();
/*
 * @behavior Validate that a value is a 24-character hexadecimal MongoDB ObjectId string.
 * @param value — the value to check
 * @returns true when the value is a valid 24-character hexadecimal ObjectId string, false otherwise
 */
function validUserId(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{24}$/i.test(value) &&
    mongoose.isValidObjectId(value)
  );
}
const loginRateLimiter = createRateLimiter({
  limit: 10,
  windowMs: 60_000,
});
const GRAPH_PROFILE_URL = "https://graph.microsoft.com/v1.0/me";
const GRAPH_REQUEST_TIMEOUT_MS = 5000;
const INVALID_AUTHORIZATION_MESSAGE = "Invalid access token";
const GRAPH_UNAVAILABLE_MESSAGE = "Authentication provider unavailable";
const INCOMPLETE_PROFILE_MESSAGE = "Authentication provider returned incomplete identity";
function readBearerToken(header) {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/*
 * @behavior Extract and validate the required user identity fields from Microsoft Graph response data.
 * @param userData — the raw JSON profile object returned by Microsoft Graph
 * @returns an object with email, displayName, firstName, and lastName; or null when identity data is incomplete
 */
function readGraphProfile(userData) {
  const email = isNonEmptyString(userData?.mail)
    ? userData.mail.trim()
    : isNonEmptyString(userData?.userPrincipalName)
      ? userData.userPrincipalName.trim()
      : null;

  if (
    !email ||
    !isNonEmptyString(userData?.displayName) ||
    !isNonEmptyString(userData?.givenName) ||
    !isNonEmptyString(userData?.surname)
  ) {
    return null;
  }

  return {
    email,
    displayName: userData.displayName.trim(),
    firstName: userData.givenName.trim(),
    lastName: userData.surname.trim(),
  };
}

/*
 * @behavior Regenerate the HTTP session to prevent session fixation attacks upon login.
 * @param req — the Express request holding the session
 * @returns a promise that resolves once the session has been regenerated
 * @exceptions Error when session regeneration fails
 */
async function rotateSession(req) {
  if (typeof req.session.regenerate !== "function") return;
  await new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

/*
 * @behavior Authenticate a user with a Microsoft Graph access token, synchronize their profile,
 *           and establish a signed-in session. Anyone with a valid Microsoft token may call this.
 * @param req — the Express request with the Bearer token in the Authorization header
 * @param res — the Express response
 * @returns 200 with the stored user document; 401 when the Authorization header or token is invalid;
 *          500 when session rotation or database storage fails; or 502 when Microsoft Graph is
 *          unavailable, times out, or returns an incomplete profile
 */
router.post("/login", loginRateLimiter, async function (req, res) {
  const accessToken = readBearerToken(req.headers.authorization);
  if (!accessToken) {
    return sendError(res, 401, INVALID_AUTHORIZATION_MESSAGE);
  }

  let response;
  try {
    response = await fetch(GRAPH_PROFILE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(GRAPH_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Graph login request failed:", error?.name ?? "unknown error");
    return sendError(res, 502, GRAPH_UNAVAILABLE_MESSAGE);
  }

  if (!response.ok) {
    if (response.status === 401) {
      return sendError(res, 401, INVALID_AUTHORIZATION_MESSAGE);
    }
    return sendError(res, 502, GRAPH_UNAVAILABLE_MESSAGE);
  }

  let userData;
  try {
    userData = await response.json();
  } catch (error) {
    console.error("Graph login response was not valid JSON:", error?.message);
    return sendError(res, 502, GRAPH_UNAVAILABLE_MESSAGE);
  }

  const profile = readGraphProfile(userData);
  if (!profile) {
    return sendError(res, 502, INCOMPLETE_PROFILE_MESSAGE);
  }

  try {
    await rotateSession(req);
  } catch (error) {
    console.error("Login session rotation failed:", error?.message);
    return sendError(res, 500);
  }

  try {
    let user = await req.models.Users.findOne({ uEmail: profile.email });
    if (!user) {
      user = await new req.models.Users({
        uFirstName: profile.firstName,
        uLastName: profile.lastName,
        uDisplayName: profile.displayName,
        uEmail: profile.email,
      }).save();
    } else {
      const updates = {
        uFirstName: profile.firstName,
        uLastName: profile.lastName,
        uDisplayName: profile.displayName,
      };
      let changed = false;
      for (const [field, value] of Object.entries(updates)) {
        if (user[field] !== value) {
          user[field] = value;
          changed = true;
        }
      }
      if (changed) user = await user.save();
    }

    req.session.isAuthenticated = true;
    req.session.displayName = profile.displayName;
    req.session.email = profile.email;
    req.session.firstName = profile.firstName;
    req.session.lastName = profile.lastName;
    req.session.userId = user._id;
    req.session.memberType = user.uType;
    req.session.isAdmin = user.uType === "Admin";
    return res.status(200).json(user);
  } catch (error) {
    console.error("Login persistence failed:", error?.message);
    return sendError(res, 500);
  }
});

/*
 * @behavior Terminate the current user session and remove its stored session data. Only authenticated
 *           users may call this endpoint.
 * @param req — the Express request holding the active session
 * @param res — the Express response
 * @returns 200 on successful session destruction; 401 when unauthenticated; or 500 when the session
 *          store fails to destroy the session
 */
router.post("/logout", requireAuth, function (req, res) {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout session destruction failed:", error?.message);
      return sendError(res, 500);
    }
    return sendSuccess(res);
  });
});

/*
 * @behavior Retrieve the identity and membership details of the currently signed-in user from their session.
 *           Only authenticated users may call this endpoint.
 * @param req — the Express request holding the active session
 * @param res — the Express response
 * @returns 200 with the caller's session details; or 401 when unauthenticated
 */
router.get("/", requireAuth, async function (req, res) {
  res.status(200).json({
    firstName: req.session.firstName,
    lastName: req.session.lastName,
    displayName: req.session.displayName,
    email: req.session.email,
    memberType: req.session.memberType,
  });
});

/*
 * @behavior Retrieve a user's account information by user identifier. Only authenticated users
 *           may call this endpoint.
 * @param req — the Express request containing the session and target user id uId
 * @param res — the Express response
 * @returns 400 when uId is not a valid user identifier; 401 when unauthenticated; or 500 when
 *          database access fails
 */
router.get("/:uId", requireAuth, async function (req, res) {
  try {
    const uId = req.params.uId;
    if (!validUserId(uId)) {
      return sendError(res, 400, "Invalid user ID");
    }
    const currId = req.session.userId;
    const currUser = await req.models.Users.findById(currId);

    if (currId == uId) {
      //Current user is viewing their own account (account owner view)
    } else if (currId != uId && currUser.uType === "Admin") {
      //An admin is viewing a users account (admin view)
    } else {
      //An outside user is viewing another user's account (Outside user view)
    }
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Update profile information for a user. Only the account owner or an administrator
 *           may call this endpoint.
 * @param req — the Express request containing the session, target user id uId, and profile update fields
 * @param res — the Express response
 * @returns 400 when uId is not a valid user identifier; 401 when unauthenticated; 403 when a non-admin
 *          attempts to edit another user's profile; or 500 when database access fails
 */
router.post("/:uId", requireAuth, async function (req, res) {
  try {
    const uId = req.params.uId;
    if (!validUserId(uId)) {
      return sendError(res, 400, "Invalid user ID");
    }
    const currId = req.session.userId;
    const currUser = await req.models.Users.findById(currId);
    if (currId == uId) {
      //If current user edits their own account
    } else if (currId != uId && currUser.uType === "Admin") {
      //if admin edits user account
    } else {
      return sendError(res, 403, "Access denied");
    }
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

export default router;

