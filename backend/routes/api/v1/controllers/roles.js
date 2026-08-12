/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in roles.js:
- Roles
- RoleAssignments
- Users

Purpose: Manage role definitions and provide the read-only data needed by
         authorized officers to assign roles later.
*/

import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requirePermission } from "../utils/auth.js";

const router = express.Router();

const ROLE_NAME_MAX_LENGTH = 80;
const ROLE_KEY_MAX_LENGTH = 80;
const ROLE_DESCRIPTION_MAX_LENGTH = 500;

const knownPermissions = new Set([
  "users.roles.manage",
  "events.leadership.approve",
  "events.finance.manage",
  "events.purchases.complete",
]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readRoleFields(body = {}, partial = false) {
  body = body ?? {};
  const fields = {};
  const roleName = typeof body.roleName === "string" ? body.roleName.trim() : undefined;
  const roleKey = typeof body.roleKey === "string" ? body.roleKey.trim().toLowerCase() : undefined;
  const roleDescription = typeof body.roleDescription === "string" ? body.roleDescription.trim() : undefined;

  if (!partial || roleName !== undefined) fields.roleName = roleName;
  if (!partial || roleKey !== undefined) fields.roleKey = roleKey;
  if (!partial || roleDescription !== undefined) fields.roleDescription = roleDescription ?? "";
  if (!partial || body.permissions !== undefined) fields.permissions = body.permissions;
  if (body.isActive !== undefined) fields.isActive = body.isActive;

  if (!partial && (!fields.roleName || !fields.roleKey)) {
    return { error: "roleName and roleKey are required" };
  }
  if (fields.roleName && fields.roleName.length > ROLE_NAME_MAX_LENGTH) {
    return { error: `roleName must be ${ROLE_NAME_MAX_LENGTH} characters or fewer` };
  }
  if (fields.roleKey && fields.roleKey.length > ROLE_KEY_MAX_LENGTH) {
    return { error: `roleKey must be ${ROLE_KEY_MAX_LENGTH} characters or fewer` };
  }
  if (fields.roleDescription && fields.roleDescription.length > ROLE_DESCRIPTION_MAX_LENGTH) {
    return { error: `roleDescription must be ${ROLE_DESCRIPTION_MAX_LENGTH} characters or fewer` };
  }
  if (fields.roleKey && !/^[a-z][a-z0-9_]*$/.test(fields.roleKey)) {
    return { error: "roleKey must use lowercase letters, numbers, and underscores" };
  }
  if (fields.permissions !== undefined && (!Array.isArray(fields.permissions) ||
      fields.permissions.some((permission) => !knownPermissions.has(permission)))) {
    return { error: "permissions contains an unknown permission" };
  }
  if (fields.isActive !== undefined && typeof fields.isActive !== "boolean") {
    return { error: "isActive must be a boolean" };
  }

  return { fields };
}

/*
Purpose: List role definitions so authorized officers can manage the role catalog.
Authentication/Authorization Requirements: users.roles.manage
*/
router.get("/", requirePermission("users.roles.manage"), async (req, res) => {
  try {
    const roles = await req.models.Roles.find().sort({ roleName: 1 }).lean();
    return sendSuccess(res, { roles });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

/*
Purpose: Create a role definition using only backend-approved permissions.
Authentication/Authorization Requirements: users.roles.manage
*/
router.post("/", requirePermission("users.roles.manage"), async (req, res) => {
  const { fields, error } = readRoleFields(req.body);
  if (error) return sendError(res, 400, error);

  try {
    const role = await req.models.Roles.create({
      ...fields,
      createdBy: req.session.userId,
      updatedBy: req.session.userId,
    });
    return res.status(201).json({ status: "success", role });
  } catch (err) {
    if (err.code === 11000) return sendError(res, 409, "Duplicate key error");
    console.error(err);
    return sendError(res, 500);
  }
});

/*
Purpose: Update a role definition without changing its stable roleKey.
Authentication/Authorization Requirements: users.roles.manage
*/
router.patch("/:id", requirePermission("users.roles.manage"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendError(res, 400, "Invalid role ID");
  }

  const { fields, error } = readRoleFields(req.body, true);
  if (error) return sendError(res, 400, error);
  delete fields.roleKey;
  fields.updatedBy = req.session.userId;

  try {
    const role = await req.models.Roles.findByIdAndUpdate(
      req.params.id,
      { $set: fields },
      { new: true, runValidators: true },
    );
    if (!role) return sendError(res, 404, "Role not found");
    return sendSuccess(res, { role });
  } catch (err) {
    console.error(err);
    return sendError(res, 500);
  }
});

/*
Purpose: Search users for the role-management interface without returning secrets.
Authentication/Authorization Requirements: users.roles.manage
*/
router.get("/users", requirePermission("users.roles.manage"), async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search.length < 2) return sendError(res, 400, "search must be at least 2 characters");

  try {
    const pattern = new RegExp(escapeRegex(search), "i");
    const users = await req.models.Users.find({
      $or: [
        { uDisplayName: pattern },
        { uEmail: pattern },
        { uNetId: pattern },
      ],
    })
      .select("_id uFirstName uLastName uDisplayName uEmail uNetId uType")
      .limit(25)
      .lean();

    return sendSuccess(res, { users });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

/*
Purpose: Read a user's active assignments before implementing assignment mutations.
Authentication/Authorization Requirements: users.roles.manage
*/
router.get("/users/:id/assignments", requirePermission("users.roles.manage"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendError(res, 400, "Invalid user ID");
  }

  try {
    const assignments = await req.models.RoleAssignments.find({
      userId: req.params.id,
      isActive: true,
    })
      .populate("roleId")
      .populate("committeeId")
      .populate("reportsToUserId", "uDisplayName uEmail")
      .lean();

    return sendSuccess(res, { assignments });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

export default router;
