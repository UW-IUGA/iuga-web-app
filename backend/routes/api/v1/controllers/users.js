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
   
        console.log(req.session);
    
        try {
            res.status(200).json(
                {
                    message: "success"
                }
            )
            // const newUser = new req.models.Users(parsedUser);        
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
router.get('/logout', function(req, res, next) {
    console.log("logout")
    console.log(req.session)
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

export default router