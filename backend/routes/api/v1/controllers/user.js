/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in users.js:
- Users
*/

import express from "express";
import fetch from "node-fetch";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requireAuth } from "../utils/auth.js";

var router = express.Router();

/*
    @endpoint: /login
    @method: GET
    @description: Given the Microsoft Access Token in the Authorization header,
                  get information about the user using Graph API. Save information
                  about the user if already exists. Create user session.
*/
router.post("/login", async function (req, res) {
  const authorizationHeader = req.headers.authorization;
  try {
    const accessToken = authorizationHeader.split(" ")[1];
    const response = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const userData = await response.json();

      // Create a new session with the user
      req.session.isAuthenticated = true;
      req.session.displayName = userData.displayName;
      req.session.email = userData.mail;
      req.session.firstName = userData.givenName;
      req.session.lastName = userData.surname;

      //Check if user is already in database, if not then make them an account
      let user = await req.models.Users.findOne({ uEmail: req.session.email });
      if (!user) {
        const newUser = new req.models.Users({
          uFirstName: req.session.firstName,
          uLastName: req.session.lastName,
          uDisplayName: req.session.displayName,
          uEmail: req.session.email,
        });

        user = await newUser.save();
      }

      req.session.userId = user._id;
      req.session.memberType = user.uType;
      req.session.isAdmin = user.uType === "Admin";
      res.status(200).json(user);
    }
  } catch (err) {
    console.log(err);
    return sendError(res, 500);
  }
});

/*
    @endpoint: /logout
    @method: POST
    @description: destroy user session.
*/
router.post("/logout", requireAuth, function (req, res, next) {
  req.session.destroy();
  return sendSuccess(res);
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
    const currId = req.session.id;
    const currUser = await req.models.Users.findById({ currId });

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
    const currId = req.session.id;
    const currUser = await req.models.Users.findById({ currId });
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

