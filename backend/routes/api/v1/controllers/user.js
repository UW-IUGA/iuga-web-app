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
import {
  EntraTokenError,
  verifyEntraAccessToken,
} from "../utils/entraAccessToken.js";

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
const INVALID_AUTHORIZATION_MESSAGE = "Invalid access token";
const AUTHENTICATION_UNAVAILABLE_MESSAGE = "Authentication provider unavailable";

function readBearerToken(header) {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function isDuplicateKey(error) {
  return error?.code === 11000;
}

async function rotateSession(req) {
  if (typeof req.session.regenerate !== "function") return;
  await new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

async function persistUser(Users, profile) {
  let user = await Users.findOne({ entraObjectId: profile.oid });
  if (!user) {
    const emailOwner = await Users.findOne({ uEmail: profile.email });
    if (emailOwner) {
      throw new EntraTokenError("identity_conflict", "This email is linked to another account");
    }
    try {
      user = await new Users({
        entraObjectId: profile.oid,
        uFirstName: profile.firstName,
        uLastName: profile.lastName,
        uDisplayName: profile.displayName,
        uEmail: profile.email,
      }).save();
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      user = await Users.findOne({ entraObjectId: profile.oid });
      if (!user) {
        const emailOwner = await Users.findOne({ uEmail: profile.email });
        if (emailOwner) {
          throw new EntraTokenError("identity_conflict", "This email is linked to another account");
        }
        throw error;
      }
    }
  }

  const emailOwner = await Users.findOne({ uEmail: profile.email });
  if (emailOwner && !sameId(emailOwner._id, user._id)) {
    throw new EntraTokenError("identity_conflict", "This email is linked to another account");
  }

  const updates = {
    entraObjectId: profile.oid,
    uEmail: profile.email,
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
  return changed ? user.save() : user;
}


/*
    @endpoint: /login
    @method: POST
    @description: Verify the Entra access token, converge the local user
                  record, and create a rotated authenticated session.
*/
router.post("/login", loginRateLimiter, async function (req, res) {
  const accessToken = readBearerToken(req.headers.authorization);
  if (!accessToken) {
    return sendError(res, 401, INVALID_AUTHORIZATION_MESSAGE);
  }

  let profile;
  try {
    profile = await verifyEntraAccessToken(accessToken);
  } catch (error) {
    if (error instanceof EntraTokenError && error.code === "unavailable") {
      return sendError(res, 502, AUTHENTICATION_UNAVAILABLE_MESSAGE);
    }
    if (error instanceof EntraTokenError && error.code === "configuration") {
      console.error("Entra authentication configuration is incomplete");
      return sendError(res, 503, AUTHENTICATION_UNAVAILABLE_MESSAGE);
    }
    return sendError(res, 401, INVALID_AUTHORIZATION_MESSAGE);
  }

  let user;
  try {
    user = await persistUser(req.models.Users, profile);
  } catch (error) {
    if (error instanceof EntraTokenError && error.code === "identity_conflict") {
      return sendError(res, 409, error.message);
    }
    if (isDuplicateKey(error)) {
      return sendError(res, 409, "Unable to associate this identity");
    }
    console.error("Login persistence failed:", error?.message);
    return sendError(res, 500);
  }

  try {
    await rotateSession(req);
  } catch (error) {
    console.error("Login session rotation failed:", error?.message);
    return sendError(res, 500);
  }

  req.session.isAuthenticated = true;
  req.session.displayName = user.uDisplayName;
  req.session.email = user.uEmail;
  req.session.firstName = user.uFirstName;
  req.session.lastName = user.uLastName;
  req.session.userId = user._id;
  req.session.memberType = user.uType;
  req.session.isAdmin = user.uType === "Admin";
  return res.status(200).json(user);
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

