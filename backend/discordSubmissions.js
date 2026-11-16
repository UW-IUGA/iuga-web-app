import mongoose from "mongoose";
import { CATEGORIES } from "./discordSubmissionRules.js";

// Pending Discord event requests. Events is public with no status field, so requests wait here until approved.
export const discordSubmissionsSchema = new mongoose.Schema(
  {
    submitterDiscordId: { type: String, required: true },
    rsoKey: { type: String, required: true },
    rsoName: { type: String, required: true },
    eName: { type: String, required: true, maxlength: 120 },
    eStartDate: { type: Date, required: true },
    eEndDate: { type: Date },
    eLocation: { type: String, required: true, maxlength: 120 },
    eDescription: { type: String, required: true, maxlength: 1000 },
    eLabel: { type: String, enum: CATEGORIES, required: true },
    rsvpUrl: { type: String, maxlength: 300 },
    status: {
      type: String,
      enum: ["pending", "approved", "denied"],
      default: "pending",
      required: true,
    },
    denyReason: { type: String, maxlength: 500 },
    reviewerDiscordId: { type: String },
    discordMessageId: { type: String },
    publishedEventId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true },
);

discordSubmissionsSchema.index({ status: 1, createdAt: 1 });
