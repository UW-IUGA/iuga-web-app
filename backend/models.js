import mongoose from "mongoose";
import {
  eventsSchema,
  participantsSchema,
  usersSchema,
  feedbackSchema,
} from "./schemas/schemas.js";

let models = {};

async function connectToDatabase() {
  if (
    process.env.DEPLOY_ENV === "production" ||
    process.env.DEPLOY_ENV === "staging"
  ) {
    console.log("connecting to prod database");
    const prod_uri = process.env.DB_PROD_URI;
    if (!prod_uri) throw new Error("DB_PROD_URI is not set in .env.prod");
    await mongoose.connect(prod_uri);
    console.log("successfully connected to prod mongodb");
  } else {
    console.log("connecting to dev database");
    const dev_uri = process.env.DB_DEV_URI;
    if (!dev_uri) throw new Error("DB_DEV_URI is not set in .env.dev");
    await mongoose.connect(dev_uri);
    console.log("successfully connected to dev mongodb");
  }

  models.Events = mongoose.model("Events", eventsSchema);
  models.Participants = mongoose.model("Participants", participantsSchema);
  models.Users = mongoose.model("Users", usersSchema);
  models.Feedback = mongoose.model("Feedback", feedbackSchema);

  console.log("mongoose models created");
}

//Ship the models variable with all the schemas in it to be used externally.
export { models, connectToDatabase };

