import mongoose from 'mongoose';
import {
    eventsSchema,
    participantsSchema,
    usersSchema
} from './schemas/schemas.js';

let models = {};

async function connectToDatabase(){
    const db_uri = process.env.DB_URI;
    if (!db_uri) throw new Error('DB_URI is not set (set it in backend/env/.env.dev or inject via pipeline)');
    console.log('connecting to mongodb')
    await mongoose.connect(db_uri);
    console.log("successfully connected to mongodb")

    models.Events = mongoose.model('Events', eventsSchema)
    models.Participants = mongoose.model('Participants', participantsSchema)
    models.Users = mongoose.model('Users', usersSchema)

    console.log('mongoose models created')
}

//Ship the models variable with all the schemas in it to be used externally.
export { models, connectToDatabase };