import React, { createContext, useState, useEffect, useContext } from 'react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../authConfig';
import useAuth from '../hooks/useAuth';
import { isProduction, apiBaseUrl } from '../runtime';
import AlertDialog from '../components/AlertDialog';

const LOCAL_BACKEND_MESSAGE = 'Local sign-in requires the Docker development environment. Start Docker and run npm run dev, then try again. Read docs/TROUBLESHOOTING.md#local-development-sign-in for help.';
const AuthContext = createContext();
const ensureDevelopmentBackend = async () => {
  if (isProduction) return;

  try {
    const response = await fetch(`${apiBaseUrl}/readyz`);
    if (!response.ok) throw new Error('Backend readiness check failed');
  } catch {
    throw new Error(LOCAL_BACKEND_MESSAGE);
  }
};

export const AuthProvider = ({ children }) => {
  const { instance, accounts } = useMsal();
  const { ensureBackendAuthentication } = useAuth();
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isAuthenticated, setLoginState] = useState(false);
  const [user, setUser] = useState({});

  const authenticate = () => {
    return new Promise(async (resolve, reject) => {
      if (accounts.length > 0) {
        try {
          const user = await ensureBackendAuthentication();
          setUser(user);
          setLoginState(true);
          resolve();
        } catch (error) {
          setAuthError(error);
          setLoginState(false);
          reject(error);
        } finally {
          setAuthLoading(false);
        }
      } else {
        setAuthLoading(false);
      }
    });
  };

  useEffect(() => {
    authenticate();
  }, [accounts]);

  const signIn = async () => {
    try {
      await ensureDevelopmentBackend();
      await instance.loginRedirect();
      console.log("Acquire token silently...")
    } catch (error) {
      if (error.errorCode === "invalid_grant" || error.errorCode === "consent_required") {
        console.log("error")
        try {
          await instance.loginRedirect({
            ...loginRequest,
            prompt: "consent"
          });
        } catch (authError) {
          console.error('Error during loginPopup:', authError);
          setAuthError(authError);
        }
      } else {
        setUser({});
        setLoginState(false)
        setAuthError(error);
      }
    }
  };

  const signOut = async () => {
    try {
      await fetch('/api/v1/user/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      setUser({});
      setLoginState(false);
      await instance.logoutRedirect();
    } catch (error) {
      setAuthError(error);
    }
  };

  const isAdmin = user?.uType === "Admin";
  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isAdmin, authLoading, authError, signIn, signOut }}>
      {authError ? (
        <AlertDialog
          eyebrow="Local environment"
          title="Local sign-in unavailable"
          message={authError.message}
          confirmLabel="I understand"
          onConfirm={() => setAuthError(null)}
        />
      ) : null}
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  return useContext(AuthContext);
};