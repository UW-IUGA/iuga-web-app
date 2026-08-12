import mongoose from "mongoose";
import {
  eventsSchema,
  participantsSchema,
  usersSchema,
  feedbackSchema,
  rolesSchema,
  roleAssignmentsSchema,
  eventRequestsSchema,
  eventReviewsSchema,
} from "./schemas/schemas.js";

let models = {};

async function connectToDatabase(){
    const db_uri = process.env.DB_URI;
    if (!db_uri) throw new Error('DB_URI is not set (set it in backend/env/.env.dev or inject via pipeline)');
    const connectionStartedAt = Date.now();
    console.log(`[startup] connecting to mongodb at ${new Date(connectionStartedAt).toISOString()}`)
    await mongoose.connect(db_uri);
    console.log(`[startup] successfully connected to mongodb after ${Date.now() - connectionStartedAt}ms`)

  models.Events = mongoose.model("Events", eventsSchema);
  models.Participants = mongoose.model("Participants", participantsSchema);
  models.Users = mongoose.model("Users", usersSchema);
  models.Feedback = mongoose.model("Feedback", feedbackSchema);
  models.Roles = mongoose.model("Roles", rolesSchema);
  models.RoleAssignments = mongoose.model("RoleAssignments", roleAssignmentsSchema);
  models.EventRequests = mongoose.model("EventRequests", eventRequestsSchema);
  models.EventReviews = mongoose.model("EventReviews", eventReviewsSchema);

  console.log(`[startup] mongoose models created after ${Date.now() - connectionStartedAt}ms`);
}

//Ship the models variable with all the schemas in it to be used externally.
export { models, connectToDatabase };

