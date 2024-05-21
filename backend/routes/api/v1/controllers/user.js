/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in users.js:
- Users
*/

import express from 'express';
import fetch from 'node-fetch';

var router = express.Router();

/* 
    @endpoint: /login
    @method: GET
    @description: Given the Microsoft Access Token in the Authorization header,
                  get information about the user using Graph API. Save information
                  about the user if already exists. Create user session.
*/ 
router.post('/login', async function(req, res) {
    const authorizationHeader = req.headers.authorization;
    try {
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

            //Check if user is already in database, if not then make them an account
            let user = await req.models.Users.findOne({uEmail:req.session.email})
            if (!user) {
                const newUser = new req.models.Users({
                    uFirstName: req.session.firstName,
                    uLastName: req.session.lastName,
                    uDisplayName: req.session.displayName,
                    uEmail: req.session.email,
                })

                user = await newUser.save();
            }

            req.session.userId = user._id;
            req.session.memberType = user.uType;
            req.session.isAdmin = user.uType === "Admin";
            res.status(200).json(user);
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
router.get("/", async function(req,res) {
    if(req.session.isAuthenticated) {
        res.status(200).json({
            firstName: req.session.firstName,
            lastName: req.session.lastName,
            displayName: req.session.displayName,
            email: req.session.email,
            memberType: req.session.memberType
        });  
    } else {
        res.status(400).json({
            status: "error",
            error: "User is not logged in"
        })
    } 
})

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