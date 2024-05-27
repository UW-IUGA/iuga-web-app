import mongoose from 'mongoose';
import {
    eventsSchema,
    participantsSchema,
    usersSchema
} from './schemas/schemas.js';

let models = {};

const prod_account = {
    user: process.env.DB_PROD_USERNAME,
    password: process.env.DB_PROD_PASSWORD,
}

const dev_account = {
    user: process.env.DB_DEV_USERNAME,
    password: process.env.DB_DEV_PASSWORD,
}

async function connectToDatabase(){
    console.log('connecting to mongodb')
    if (process.env.DEPLOY) {
        const prod_uri = `mongodb://${prod_account.user}:${prod_account.password}@mongo:27017/iuga`;
        await mongoose.connect(prod_uri);
        console.log("successfully connected to prod mongodb")
    } else {
        const dev_uri = `mongodb+srv://${dev_account.user}:${dev_account.password}@cluster0.ejo8heu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
        await mongoose.connect(dev_uri);
        console.log("successfully connected to dev mongodb")
    }
    

    models.Events = mongoose.model('Events', eventsSchema)
    models.Participants = mongoose.model('Participants', participantsSchema)
    models.Users = mongoose.model('Users', usersSchema)

    console.log('mongoose models created')
}

//Ship the models variable with all the schemas in it to be used externally.
export { models, connectToDatabase };