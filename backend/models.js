import mongoose from 'mongoose';
import {
    eventsSchema,
    participantsSchema,
    usersSchema
} from './schemas/schemas.js';

let models = {};

async function connectToDatabase(){
    console.log('connecting to mongodb')
    if (process.env.DEPLOY) {
        console.log(process.env.TEST_ENV_VAR)
        // Temporary
        await mongoose.connect('mongodb+srv://iuga:78B5aJunY5ZrypC1@cluster0.ejo8heu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
        console.log("successfully connected to deployment mongodb")
    } else {
        await mongoose.connect('mongodb+srv://iuga:78B5aJunY5ZrypC1@cluster0.ejo8heu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
        console.log("successfully connected to dev mongodb")
    }
    

    models.Events = mongoose.model('Events', eventsSchema)
    models.Participants = mongoose.model('Participants', participantsSchema)
    models.Users = mongoose.model('Users', usersSchema)

    console.log('mongoose models created')
}

//Ship the models variable with all the schemas in it to be used externally.
export { models, connectToDatabase };