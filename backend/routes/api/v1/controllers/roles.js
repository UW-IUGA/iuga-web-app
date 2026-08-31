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
import { requireOfficerRolePermission } from "../utils/auth.js";

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

function isProvided(value) {
  return value !== undefined && value !== null;
}

function normalizeRoleFields(body, partial) {
  const source = body ?? {};
  const fields = {};
  const roleName =
    typeof source.roleName === "string" ? source.roleName.trim() : undefined;
  const roleKey =
    typeof source.roleKey === "string"
      ? source.roleKey.trim().toLowerCase()
      : undefined;
  const roleDescription =
    typeof source.roleDescription === "string"
      ? source.roleDescription.trim()
      : undefined;

  if (!partial || roleName !== undefined) fields.roleName = roleName;
  if (!partial || roleKey !== undefined) fields.roleKey = roleKey;
  if (!partial || roleDescription !== undefined) {
    fields.roleDescription = roleDescription ?? "";
  }
  if (!partial || source.permissions !== undefined) {
    fields.permissions = source.permissions;
  }
  if (source.isActive !== undefined) fields.isActive = source.isActive;

  return fields;
}

function validateRoleFields(fields, partial) {
  if (!partial && (!fields.roleName || !fields.roleKey)) {
    return "roleName and roleKey are required";
  }

  const maxLengths = {
    roleName: ROLE_NAME_MAX_LENGTH,
    roleKey: ROLE_KEY_MAX_LENGTH,
    roleDescription: ROLE_DESCRIPTION_MAX_LENGTH,
  };
  for (const [field, maxLength] of Object.entries(maxLengths)) {
    if (fields[field] && fields[field].length > maxLength) {
      return `${field} must be ${maxLength} characters or fewer`;
    }
  }

  if (fields.roleKey && !/^[a-z][a-z0-9_]*$/.test(fields.roleKey)) {
    return "roleKey must use lowercase letters, numbers, and underscores";
  }
  if (
    fields.permissions !== undefined &&
    (!Array.isArray(fields.permissions) ||
      fields.permissions.some(
        (permission) => !knownPermissions.has(permission),
      ))
  ) {
    return "permissions contains an unknown permission";
  }
  if (fields.isActive !== undefined && typeof fields.isActive !== "boolean") {
    return "isActive must be a boolean";
  }

  return null;
}

function readRoleFields(body = {}, partial = false) {
  const fields = normalizeRoleFields(body, partial);
  const error = validateRoleFields(fields, partial);
  return error ? { error } : { fields };
}

/*
Purpose: List role definitions so authorized officers can manage the role catalog.
Authentication/Authorization Requirements: users.roles.manage
*/
router.get("/", requireOfficerRolePermission("users.roles.manage"), async (req, res) => {
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
router.post("/", requireOfficerRolePermission("users.roles.manage"), async (req, res) => {
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
router.patch(
  "/:id",
  requireOfficerRolePermission("users.roles.manage"),
  async (req, res) => {
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
        { returnDocument: "after", runValidators: true },
      );
      if (!role) return sendError(res, 404, "Role not found");
      return sendSuccess(res, { role });
    } catch (err) {
      console.error(err);
      return sendError(res, 500);
    }
  },
);

/*
Purpose: Search users for the role-management interface without returning secrets.
Authentication/Authorization Requirements: users.roles.manage
*/
router.get(
  "/users",
  requireOfficerRolePermission("users.roles.manage"),
  async (req, res) => {
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search.length < 2)
      return sendError(res, 400, "search must be at least 2 characters");

    try {
      const pattern = new RegExp(escapeRegex(search), "i");
      const users = await req.models.Users.find({
        $or: [
          { uDisplayName: pattern },
          { uEmail: pattern },
        ],
      })
        .select("_id uFirstName uLastName uDisplayName uEmail uType")
        .limit(25)
        .lean();

      return sendSuccess(res, { users });
    } catch (error) {
      console.error(error);
      return sendError(res, 500);
    }
  },
);

/*
Purpose: Read a user's active assignments before implementing assignment mutations.
Authentication/Authorization Requirements: users.roles.manage
*/
router.get(
  "/users/:id/assignments",
  requireOfficerRolePermission("users.roles.manage"),
  async (req, res) => {
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
  },
);

/*
Purpose: Assign a role to a user.
Authentication/Authorization Requirements: users.roles.manage
*/
router.post(
  "/users/:id/assignments",
  requireOfficerRolePermission("users.roles.manage"),
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid user ID");
    }

    const { roleId, committeeId, reportsToUserId, expiresAt } = req.body ?? {};

    if (!roleId || !mongoose.isValidObjectId(roleId)) {
      return sendError(res, 400, "Invalid role ID");
    }

    if (isProvided(committeeId) && !mongoose.isValidObjectId(committeeId)) {
      return sendError(res, 400, "Invalid committee ID");
    }

    if (
      isProvided(reportsToUserId) &&
      !mongoose.isValidObjectId(reportsToUserId)
    ) {
      return sendError(res, 400, "Invalid reporting user ID");
    }

    let expiration = null;
    if (isProvided(expiresAt)) {
      expiration = new Date(expiresAt);
      if (Number.isNaN(expiration.getTime())) {
        return sendError(res, 400, "Invalid expiration date");
      }
    }

    try {
      const user = await req.models.Users.findById(req.params.id);
      if (!user) {
        return sendError(res, 404, "User not found");
      }

      const role = await req.models.Roles.findById(roleId);
      if (!role) {
        return sendError(res, 404, "Role not found");
      }
      if (!role.isActive) {
        return sendError(res, 409, "Role is inactive");
      }

      if (isProvided(committeeId)) {
        const committee = await req.models.Committees.findById(committeeId);
        if (!committee) {
          return sendError(res, 404, "Committee not found");
        }
      }

      if (isProvided(reportsToUserId)) {
        if (reportsToUserId === req.params.id) {
          return sendError(res, 400, "User cannot report to themselves");
        }
        const reportingUser = await req.models.Users.findById(reportsToUserId);
        if (!reportingUser) {
          return sendError(res, 404, "Reporting user not found");
        }
      }

      const existingAssignment = await req.models.RoleAssignments.findOne({
        userId: req.params.id,
        roleId,
        isActive: true,
      });
      if (existingAssignment) {
        return sendError(res, 409, "Role already assigned");
      }

      const assignment = await req.models.RoleAssignments.create({
        userId: req.params.id,
        roleId,
        committeeId: committeeId ?? null,
        reportsToUserId: reportsToUserId ?? null,
        assignedBy: req.session.userId,
        assignedAt: new Date(),
        expiresAt: expiration,
        isActive: true,
      });

      return res.status(201).json({ status: "success", assignment });
    } catch (error) {
      console.error(error);
      return sendError(res, 500);
    }
  },
);

/*
Purpose: Deactivate a user's role assignment without deleting its history.
Authentication/Authorization Requirements: users.roles.manage
*/
router.delete(
  "/users/:id/assignments/:assignmentId",
  requireOfficerRolePermission("users.roles.manage"),
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid user ID");
    }
    if (!mongoose.isValidObjectId(req.params.assignmentId)) {
      return sendError(res, 400, "Invalid assignment ID");
    }

    try {
      const assignment = await req.models.RoleAssignments.findOneAndUpdate(
        {
          _id: req.params.assignmentId,
          userId: req.params.id,
          isActive: true,
        },
        {
          $set: {
            isActive: false,
            deactivatedBy: req.session.userId,
            deactivatedAt: new Date(),
          },
        },
        { returnDocument: "after", runValidators: true },
      );

      if (!assignment) {
        return sendError(res, 404, "Active assignment not found");
      }
      return sendSuccess(res, { assignment });
    } catch (error) {
      console.error(error);
      return sendError(res, 500);
    }
  },
);

export default router;
