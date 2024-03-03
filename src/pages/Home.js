import React from "react";
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal, useMsalAuthentication } from "@azure/msal-react";
import { InteractionType } from '@azure/msal-browser';
import { useEffect } from "react";

function HomePage() {
    const { instance, accounts, inProgress } = useMsal();
    
    if (accounts.length > 0) {
        return <span>There are currently {accounts.length} users signed in!</span>
    } else if (inProgress === "login") {
        return <span>Login is currently in progress!</span>
    } else {
        return (
            <>
                <span>There are currently no users signed in!</span>
                <button onClick={() => instance.loginPopup()}>Login</button>
            </>
        );
    }
    
//     const request = {
//         loginHint: "name@example.com",
//         scopes: ["User.Read"]
//     }

//     const { login, result, error } = useMsalAuthentication(InteractionType.Silent, request);

//     useEffect(() => {
//         if (error) {
//             login(InteractionType.Popup, request);
//         }
//     }, [error]);

//     const { accounts } = useMsal();

//     return (
//         <React.Fragment>
//             <p>Anyone can see this paragraph.</p>
//             <AuthenticatedTemplate>
//                 <p>Signed in as: {accounts[0]?.username}</p>
//             </AuthenticatedTemplate>
//             <UnauthenticatedTemplate>
//                 <p>No users are signed in!</p>
//             </UnauthenticatedTemplate>
//         </React.Fragment>
//     );
}
  
export default HomePage;
  