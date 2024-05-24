import mongoose from 'mongoose';

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
    
    /* Calendars Schema:
        If a user makes a calendar or event, they must input all fields.
        In the case that the user fails to input all fields, catch the error that returns.
    */
        const calendarsSchema = new mongoose.Schema({
            calEvents: [{
                cEDate: { type: Date, required: true },
                cEID: { type: mongoose.Schema.Types.ObjectId, ref: 'Events'},
            }] 
        }) 

    /* Events Schema:
        image fields such as ePics are handled by Multer.
    */
        const eventsSchema = new mongoose.Schema({
            eName: {type: String, required: true },
            eOrganizers: {type: String, required: true },
            eStartDate: { type: Date, required: true },
            eEndDate: Date,
            eAltLink: {
                title: { type: String, required: false },
                url: { type: String, required: false }
            },
            eLocation: { type: String, required: true },
            eDescription: { type: String, required: true },
            eThumbnailPath: String, 
            // {
            //     data: Buffer,
            //     contentType: String
            // },
            eLabels: [String],
            eParticipants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Participants' }],
            eShowParticipants: { type: Boolean, default: true },
            eRsvpEnabled: { type: Boolean, default: true },
            rsvpQuestions: [{
                qId: { type: String, required: true},
                qString: { type: String, required: true}
            }]
        })

    /* Participants Schema:
        The aList field's aNumber should correlated with qList's qNumber
        By default the user is not anonymous.
    */
        const participantsSchema = new mongoose.Schema({
            pUID: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true},
            eID: { type: mongoose.Schema.Types.ObjectId, ref: 'Events', required: true },  //
            rsvpAnswers: [{
                qId: {type: String, required: true},
                aString: { type: String, required: true}
            }],
            confirmationEmailSent: { type: Boolean, default: false },
            reminderEmailSent: { type: Boolean, default: false },
        }) 

    /* Feedback Schema:
        Saving information submitted via the feedback form.
    */
        const feedbackSchema = new mongoose.Schema({
            fUID: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true},
            fType: {type: String, default: "General"},
            fTopic: { type: String, required: true},
            fDescription: { type: String, required: true},
            fRating: Number
        }) 

    /* Users Schema:
        Basic information when a user signs up
        Default user account type is Member, unless otherwise noted.
    */
        const usersSchema = new mongoose.Schema({
            uId: Number,
            // uPic: {
            //     data: Buffer,
            //     contentType: String
            // },
            uFirstName: String,
            uLastName: String,
            uDisplayName: String,
            uEmail: String,
            // uBio: String,
            // uMajor: {type:String, default: ""},
            uType: {type: String, default: "Member"},
            uPrivate: { type: Boolean, default: false }
        }) 

    /* Officers Schema:
        ofUID refers to the officer's user id.
    */
        const officersSchema = new mongoose.Schema({
            offTitle: {type: String, required: true},
            offDescription: {type: String, required: true},
            offTermYear: Number,
            offUID: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true},
            offPic: {
                data: Buffer,
                contentType: String
            },
            offSocials: [{
                platform: String,
                link: String 
            }]
        }) 

    /* Committees Schema:
        The cmeMembers field will be an array of userID along with their chosen committee pic.
    */
        const committeesSchema = new mongoose.Schema({
            cmeName: {type: String, required: true},
            cmeDescription: {type: String, required: true},
            cmeYear: {type: Number, required: true},
            cmeMembers: [{
                cmeUID: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true},
                memberPic: {
                    data: Buffer,
                    contentType: String
                }
            }]
        }) 

    /* Organization Schema:
        For storing both org logo and name.
    */
        const organizationSchema = new mongoose.Schema({
            orgName: {type: String, required:true},
            orgPic: {
                data: Buffer,
                contentType: String
            }
        })

    //wrap up all the schemas into the models variable
    models.Calendars = mongoose.model('Calendars', calendarsSchema)
    models.Events = mongoose.model('Events', eventsSchema)
    models.Participants = mongoose.model('Participants', participantsSchema)
    models.Feedback = mongoose.model('Feedback', feedbackSchema)
    models.Users = mongoose.model('Users', usersSchema)
    models.Officers = mongoose.model('Officers', officersSchema)
    models.Committees = mongoose.model('Committees', committeesSchema)
    models.Organizations = mongoose.model('Organizations', organizationSchema)

    console.log('mongoose models created')
}

//Ship the models variable with all the schemas in it to be used externally.
export { models, connectToDatabase };