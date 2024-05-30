// src/hooks/useAuth.js
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../authConfig';
import { InteractionRequiredAuthError, EventType } from '@azure/msal-browser';

const useAuth = () => {
  const { instance, accounts } = useMsal();

  const ensureBackendAuthentication = async () => {
    if (accounts.length > 0) {
      try {
        console.log("Acquire token silently...")
        const tokenResponse = await instance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });
        const accessToken = tokenResponse.accessToken;
        return await sendTokenToBackend(accessToken);
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          console.error('Interaction required to acquire token:', error);
          try {
            const tokenResponse = await instance.acquireTokenRedirect({
              ...loginRequest,
              account: accounts[0],
              prompt: 'consent',
            });
            const accessToken = tokenResponse.accessToken;
            return await sendTokenToBackend(accessToken);
          } catch (popupError) {
            console.error('Error during acquireTokenPopup:', popupError);
            throw popupError;
          }
        }
      }
    }
  };

  return { ensureBackendAuthentication };
};

const sendTokenToBackend = async (accessToken) => {
  try {
    const response = await fetch(`${process.env.REACT_APP_API_URL}/api/v1/user/login`, {
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
