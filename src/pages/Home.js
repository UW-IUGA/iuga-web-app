import React from "react";
import { useMsal } from "@azure/msal-react";
import { useEffect } from "react";
import { loginRequest } from "../authConfig";
import Cookies from "js-cookie";



function HomePage() {
    const { instance, accounts, inProgress } = useMsal();

    const signin = async (event) => {
        const interactionIncomplete = Cookies.get('msal.interaction.status');

            if (interactionIncomplete) {
                console.log("Microsoft sign out was incomplete.");
                console.log(interactionIncomplete);
            } else {
                await instance
                    .loginPopup(loginRequest)
                    .then(res => {
                        if (res.ok) {
                            console.log(res);
                        }
                    })
                    .catch(e => { console.log(e) });
            }
    }

    const signout = async (event) => {
        const interactionIncomplete = Cookies.get('msal.interaction.status');

            if (interactionIncomplete) {
                console.log("Microsoft sign out was incomplete.");
                console.log(interactionIncomplete);
            } else {
                await instance.logoutPopup().then(res => {
                    console.log(res);
                }).catch(e => { console.log(e) });
            }
    }
    
    if (accounts.length > 0) {
        return <div>
            <span>There are currently {accounts.length} users signed in!</span>
            <button onClick={() => signout()}>Signout</button>
        </div>
    } else if (inProgress === "login") {
        return <span>Login is currently in progress!</span>
    } else {
        return (
            <>
                <span>There are currently no users signed in!</span>
                <button onClick={() => signin()}>Login</button>
            </>
        );
    }
}
  
export default HomePage;
  