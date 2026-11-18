import mongoose from "mongoose";

export const DRAFT_LIFETIME_MS = 60 * 60 * 1000;

// What an officer has typed into the /event form so far. Reviewers never see drafts; sending one
// for review creates a DiscordEventSubmissions row. MongoDB deletes a draft once expiresAt passes.
export const discordEventDraftsSchema = new mongoose.Schema(
  {
    submitterDiscordId: { type: String, required: true },
    rsoKey: { type: String, required: true },
    rsoName: { type: String, required: true },
    entries: {
      name: { type: String, default: "", maxlength: 200 },
      when: { type: String, default: "", maxlength: 200 },
      location: { type: String, default: "", maxlength: 200 },
      description: { type: String, default: "", maxlength: 2000 },
      categories: { type: [String], default: [] },
    },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);
