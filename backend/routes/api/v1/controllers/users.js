/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in users.js:
- Users
*/

import express from 'express';

var router = express.Router();

/* 
    @endpoint: /ms-login
    @method: POST
    @description: Given the Microsoft Access Token in the Authorization header,
                  get information about the user using Graph API. Save information
                  about the user if already exists. Create user session.
*/ 
router.post('/login', async function(req, res, next) {
    const authorizationHeader = req.headers.authorization;
    const accessToken = authorizationHeader.split(' ')[1];
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (response.ok) {
        const userData = await response.json();

        // Create a new session with the user
        req.session.isAuthenticated = true;
        req.session.displayName = userData.displayName;
        req.session.email = userData.mail;
        req.session.firstName = userData.givenName;
        req.session.lastName = userData.surname;
        //req.session.id = userData.id; ???
        //req.session.major = userData.major; ???
        //req.session.picture = userData.pic ???

        console.log(req.session);
    
        try {
            res.status(200).json(
                {
                    message: "success"
                }
            )

            const userId = req.session.id 
            //Check if user is already in database, if not then make them an account
            const user = await req.models.Users.findOne({uId:userId})
            if (user == null) {
                const newUser = new req.models.Users({
                    uId: userId,
                    uPic: "TBD", //Choose a default user pic to show from the response info, or somewhere else
                    uFirstName: req.session.firstName,
                    uLastName: req.session.lastName,
                    uDisplayName: req.session.displayName,
                    uEmail: req.session.email,
                    uBio: "Write about yourself here!",
                    uMajor: "TBD", //Need to verify from the response info
                    uType: "TBD", //Either this comes from the response info, or we need a different system for this
                })
            }

        } catch (err) {
            console.log(err);
            res.status(500).json(
                {
                    status: "error",
                    error: "Error from our side :("
                 }
            )
        }
    }
})



/* 
    @endpoint: /logout
    @method: POST
    @description: destroy user session.
*/ 
router.post('/logout', function(req, res, next) {
    if (req.session.isAuthenticated) {
        req.session.destroy();

        res.status(200).json({
            "status": "success"
        });
    } else {
        res.status(400).json(
            {
                status: "error",
                error: "User is not logged in"
            }
        )
    }
});

//Get the user's specific information from the user's perspective, from an outsider perspective, and from the admin perspective
router.get("/:uId", async function(req,res) {
    if(req.session.isAuthenticated) {
        try {
            const uId = req.params.uId;
            const currId = req.session.id;
            const currUser = await req.models.Users.findById({currId})

            if (currId == uId) { //Current user is viewing their own account (account owner view)
                
            } else if (currId != uId && currUser.uType === "Admin") { //An admin is viewing a users account (admin view)

            } else { //An outside user is viewing another user's account (Outside user view)

            }
        } catch (error) {
            console.log(error);
            res.status(500).json({status:"error", message:error.message});
        }
    } else {
        res.status(400).json({
            status: "error",
            error: "User is not logged in"
        })
    }    
})

//User wants to update their own profile information, or an admin is trying to change a user's information. 
router.post("/:uId", async function(req,res) {
    if(req.session.isAuthenticated) {
        try {
            const uId = req.params.uId;
            const currId = req.session.id;
            const currUser = await req.models.Users.findById({currId})
            if (currId == uId) { //If current user edits their own account

            } else if (currId != uId && currUser.uType === "Admin") { //if admin edits user account

            } else {
                res.status(400).json({
                    status:"error",
                    error: "Access denied"
                })
            }
            
        } catch (error) {
            console.log(error);
            res.status(500).json({status:"error", message:error.message});
        }
    } else {
        res.status(400).json({
            status: "error",
            error: "User is not logged in"
        })
    }
})

export default router