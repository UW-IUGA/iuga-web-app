/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in users.js:
- Users
*/

import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requireAuth } from "../utils/auth.js";
import { createRateLimiter } from "../utils/rateLimit.js";

var router = express.Router();
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

async function rotateSession(req) {
  if (typeof req.session.regenerate !== "function") return;
  await new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

/*
    @endpoint: /login
    @method: GET
    @description: Given the Microsoft Access Token in the Authorization header,
                  get information about the user using Graph API. Save information
                  about the user if already exists. Create user session.
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
    @endpoint: /logout
    @method: POST
    @description: destroy user session.
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

//Get the user's specific information from the user's perspective, from an outsider perspective, and from the admin perspective
router.get("/", requireAuth, async function (req, res) {
  res.status(200).json({
    firstName: req.session.firstName,
    lastName: req.session.lastName,
    displayName: req.session.displayName,
    email: req.session.email,
    memberType: req.session.memberType,
  });
});

//Get the user's specific information from the user's perspective, from an outsider perspective, and from the admin perspective
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

//User wants to update their own profile information, or an admin is trying to change a user's information.
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

