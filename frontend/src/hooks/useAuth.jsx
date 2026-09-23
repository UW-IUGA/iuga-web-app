/*
 * Purpose: Custom React hook for acquiring MSAL access tokens and synchronizing backend sessions.
 * Authentication/Authorization Requirements: Used internally by AuthProvider.
 * Expected Request: ensureBackendAuthentication(account?) invoked when synchronizing an MSAL account with the backend.
 * Expected Response: Authenticated user profile returned from /api/v1/user/login, or throws on failure.
 */
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../authConfig';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
const useAuth = () => {
    const { instance, accounts } = useMsal();

    /*
     * @behavior: Acquire an access token for the given account (or active MSAL account) and sync with the backend.
     * @param {Object} [account] - MSAL account object to authenticate against the backend.
     * @returns {Promise<Object>} Authenticated user profile returned from the backend.
     * @throws {Error} When no account is available, token acquisition fails, or backend returns a non-OK status.
     */
    const ensureBackendAuthentication = async (account) => {
        const targetAccount = account || (accounts && accounts.length > 0 ? accounts[0] : null);
        if (!targetAccount) {
            throw new Error('No MSAL account available for backend authentication');
        }

        let tokenResponse;
        try {
            tokenResponse = await instance.acquireTokenSilent({
                ...loginRequest,
                account: targetAccount,
            });
        } catch (error) {
            if (error instanceof InteractionRequiredAuthError || error?.name === 'InteractionRequiredAuthError') {
                tokenResponse = await instance.acquireTokenPopup({
                    ...loginRequest,
                    account: targetAccount,
                    prompt: 'consent',
                });
            } else {
                throw error;
            }
        }

        const accessToken = tokenResponse?.accessToken;
        if (!accessToken) {
            throw new Error('Failed to acquire access token');
        }
        return await sendTokenToBackend(accessToken);
    };

    return { ensureBackendAuthentication };
};

const sendTokenToBackend = async (accessToken) => {
    try {
        const response = await fetch('/api/v1/user/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ token: accessToken }),
        });

        if (!response.ok) {
            throw new Error('Token validation failed');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error sending token to backend:', error);
        throw error;
    }
};

export default useAuth;
