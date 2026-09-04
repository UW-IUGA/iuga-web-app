/*
 * Purpose: Configuration settings for Microsoft Authentication Library (MSAL) and Azure AD authentication.
 * Authentication/Authorization Requirements: Public client configuration for Microsoft Entra ID / UW NetID.
 * Expected Request: Imported during application initialization and token acquisition requests.
 * Expected Response: Configured MSAL configuration object and default login scopes.
 */
import { apiBaseUrl } from "./runtime";

// Documentation: https://learn.microsoft.com/en-us/azure/active-directory/develop/tutorial-v2-react
export const msalConfig = {
    auth: {
        clientId:  "e8b7183b-7796-4256-aa97-434bd09060d5",
        authority: "https://login.microsoftonline.com/f6b6dd5b-f02f-441a-99a0-162ac5060bd2", // This is a URL (e.g. https://login.microsoftonline.com/{your tenant ID})
        redirectUri: `${apiBaseUrl}/`,
        postLogoutRedirectUri: `${apiBaseUrl}/`,
    },
    cache: {
        cacheLocation: "sessionStorage", // This configures where your cache will be stored
        storeAuthStateInCookie: true, // Set this to "true" if you are having issues on IE11 or Edge
    }
};
  
export const loginRequest = {   
    scopes: ["User.Read"]
};
