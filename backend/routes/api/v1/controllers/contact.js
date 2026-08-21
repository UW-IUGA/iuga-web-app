import express from "express";
import { sendError } from "../helpers/sendError.js";
import { sendContactEmail as deliverContactEmail } from "../services/contactEmail.js";

const INQUIRY_TYPES = new Set(["Student", "Faculty", "Professional", "Other"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readContact(body = {}) {
  const fields = {};
  for (const [name, maxLength] of [["name", 120], ["email", 254], ["inquiryType", 32], ["message", 5000]]) {
    const value = body[name];
    if (typeof value !== "string" || value.trim() === "") {
      return { error: `${name} is required` };
    }
    if (value.trim().length > maxLength) {
      return { error: `${name} must be ${maxLength} characters or fewer` };
    }
    fields[name] = value.trim();
  }

  if (!EMAIL_PATTERN.test(fields.email)) return { error: "email must be valid" };
  if (!INQUIRY_TYPES.has(fields.inquiryType)) return { error: "inquiryType is invalid" };
  return { fields };
}

export function createContactRouter({ sendContactEmail = deliverContactEmail } = {}) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    if (typeof req.body?.website === "string" && req.body.website.trim() !== "") {
      return res.status(201).json({ status: "success" });
    }

    const { fields, error } = readContact(req.body);
    if (error) return sendError(res, 400, error);

    try {
      await sendContactEmail(fields);
      return res.status(201).json({ status: "success" });
    } catch (error) {
      if (error?.name === "ContactEmailConfigurationError") {
        return sendError(res, 503, "Contact form is temporarily unavailable");
      }
      console.error("Contact email delivery failed", error?.message);
      return sendError(res, 502, "Unable to deliver your message right now");
    }
  });

  return router;
}

export default createContactRouter();
