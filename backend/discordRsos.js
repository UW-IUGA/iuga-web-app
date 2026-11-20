import mongoose from "mongoose";

// RSOs known to the Discord bot and the role that marks each one's verified officers. Only rsoDirectory reads or writes it.
export const discordRsosSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 80 },
    rsoKey: { type: String, required: true, unique: true, maxlength: 80 },
    discordRoleId: { type: String, default: null },
    createdByDiscordId: { type: String, required: true },
  },
  { timestamps: true },
);

discordRsosSchema.index({ discordRoleId: 1 });
