/*
Purpose: Manage role definitions, query users for role assignment, and assign or deactivate user roles.
Authentication/Authorization Requirements: Every endpoint requires an active officer role assignment with the `users.roles.manage` permission.
Expected Request Information:
- GET /: none
- POST /: JSON body with roleName, roleKey, optional roleDescription, permissions array, isActive boolean
- PATCH /:id: role ObjectId in path; optional JSON body with roleName, roleDescription, permissions, isActive
- GET /users: query parameter `search` with at least 2 characters
- GET /users/:id/assignments: target user ObjectId in path
- POST /users/:id/assignments: target user ObjectId in path; JSON body with roleId, optional committeeId, optional reportsToUserId, optional expiresAt
- DELETE /users/:id/assignments/:assignmentId: target user ObjectId and assignment ObjectId in path
Expected Response Information:
- 200 with role list, user search results, assignments list, updated role, or deactivated assignment
- 201 with newly created role or assignment document
- 400 for invalid ObjectIds, search queries under 2 characters, malformed fields, or invalid dates
- 401 when unauthenticated
- 403 when the caller lacks the `users.roles.manage` permission
- 404 when a referenced role, user, committee, supervisor, or assignment does not exist
- 409 for duplicate role keys, inactive roles, or duplicate active assignments
- 500 on unexpected database errors
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

/*
 * @behavior Escape special regular expression characters in a string for safe use in a RegExp.
 * @param value — the raw search text to escape
 * @returns the string with all regular expression metacharacters escaped
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isProvided(value) {
  return value !== undefined && value !== null;
}

/*
 * @behavior Clean and extract role definition fields from an incoming request body.
 * @param body — the raw JSON request body
 * @param partial — true when parsing an update where missing fields should be omitted
 * @returns an object containing the trimmed and normalized role fields
 */
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
 * @behavior List all role definitions sorted alphabetically by role name. Only officers with the
 *           users.roles.manage permission may call this endpoint.
 * @param req — the Express request
 * @param res — the Express response
 * @returns 200 with the list of roles; 401 when unauthenticated; 403 when lacking permission;
 *          or 500 when database access fails
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
 * @behavior Create a new role definition with validated name, key, and approved permissions. Only
 *           officers with the users.roles.manage permission may call this endpoint.
 * @param req — the Express request containing the session and role definition body
 * @param res — the Express response
 * @returns 201 with the created role; 400 when required fields are missing or invalid; 401 when
 *          unauthenticated; 403 when lacking permission; 409 when the role key already exists;
 *          or 500 when database creation fails
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
 * @behavior Update an existing role definition's mutable fields without changing its immutable roleKey.
 *           Only officers with the users.roles.manage permission may call this endpoint.
 * @param req — the Express request containing role id in params and update fields in body
 * @param res — the Express response
 * @returns 200 with the updated role; 400 when the role id or fields are invalid; 401 when
 *          unauthenticated; 403 when lacking permission; 404 when the role is not found;
 *          or 500 when database update fails
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
 * @behavior Search users by display name or email for assignment to roles, returning up to 25 matches.
 *           Only officers with the users.roles.manage permission may call this endpoint.
 * @param req — the Express request containing the search query parameter
 * @param res — the Express response
 * @returns 200 with matching users; 400 when the search query is shorter than 2 characters; 401
 *          when unauthenticated; 403 when lacking permission; or 500 when database access fails
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
 * @behavior Retrieve all active role assignments for a user, populated with role, committee, and
 *           supervisor details. Only officers with the users.roles.manage permission may call this.
 * @param req — the Express request containing the target user id in params
 * @param res — the Express response
 * @returns 200 with the user's active assignments; 400 when the user id is invalid; 401 when
 *          unauthenticated; 403 when lacking permission; or 500 when database access fails
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
 * @behavior Assign an active role to a user, with optional committee, supervisor, and expiration date.
 *           Only officers with the users.roles.manage permission may call this endpoint.
 * @param req — the Express request containing target user id in params and assignment details in body
 * @param res — the Express response
 * @returns 201 with the created assignment; 400 when ids or dates are invalid or user reports to
 *          themselves; 401 when unauthenticated; 403 when lacking permission; 404 when the user,
 *          role, committee, or supervisor does not exist; 409 when the role is inactive or already
 *          assigned to this user; or 500 when database creation fails
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
 * @behavior Deactivate a user's role assignment while preserving the assignment record for history.
 *           Only officers with the users.roles.manage permission may call this endpoint.
 * @param req — the Express request containing the target user id and assignment id in params
 * @param res — the Express response
 * @returns 200 with the deactivated assignment; 400 when user id or assignment id is invalid; 401
 *          when unauthenticated; 403 when lacking permission; 404 when no active assignment matches;
 *          or 500 when database update fails
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
