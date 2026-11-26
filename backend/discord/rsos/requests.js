import mongoose from "mongoose";

// Requests to be verified as an RSO officer. openKey is set only while a request is open
// (pending or approving), so the unique index allows one open request per member per RSO.
export const discordRsoRequestsSchema = new mongoose.Schema(
  {
    requesterDiscordId: { type: String, required: true },
    rsoKey: { type: String, required: true, maxlength: 80 },
    rsoName: { type: String, required: true, maxlength: 80 },
    position: { type: String, required: true, maxlength: 60 },
    status: {
      type: String,
      enum: ["pending", "approving", "approved", "denied"],
      default: "pending",
      required: true,
    },
    openKey: { type: String },
    claimedAt: { type: Date },
    reviewerDiscordId: { type: String },
    reviewedAt: { type: Date },
    denyReason: { type: String, maxlength: 500 },
    discordMessageId: { type: String },
  },
  { timestamps: true },
);

discordRsoRequestsSchema.index({ openKey: 1 }, { unique: true, sparse: true });
discordRsoRequestsSchema.index({ status: 1, createdAt: 1 });
