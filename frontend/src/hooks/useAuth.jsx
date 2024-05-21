// src/hooks/useAuth.js
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../authConfig';

const useAuth = () => {
  const { instance, accounts } = useMsal();

  const ensureBackendAuthentication = async () => {
    if (accounts.length > 0) {
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });
        const accessToken = tokenResponse.accessToken;
        return await sendTokenToBackend(accessToken);
      } catch (error) {
        console.error('Error acquiring token silently:', error);
        throw error;
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
