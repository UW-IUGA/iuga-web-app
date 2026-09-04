/*
 * Purpose: Global authentication state provider coordinating MSAL, backend sessions, and role checks.
 * Authentication/Authorization Requirements: Handles sign-in, session synchronization, and local sign-out.
 * Expected Request: React subtree consumers via useAuthContext() hook invoking signIn(), signOut(), or reading state.
 * Expected Response: AuthContext value exposing user, isAuthenticated, isAdmin, authLoading, authError, signIn, and signOut.
 */
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
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
  const authGeneration = useRef(0);

  const authenticate = () => {
    return new Promise(async (resolve, reject) => {
      const currentGen = ++authGeneration.current;
      if (accounts.length > 0) {
        try {
          const user = await ensureBackendAuthentication();
          if (currentGen !== authGeneration.current) return;
          setUser(user);
          setLoginState(true);
          resolve();
        } catch (error) {
          if (currentGen !== authGeneration.current) return;
          setAuthError(error);
          setLoginState(false);
          reject(error);
        } finally {
          if (currentGen === authGeneration.current) {
            setAuthLoading(false);
          }
        }
      } else {
        if (currentGen === authGeneration.current) {
          setUser({});
          setLoginState(false);
          setAuthLoading(false);
        }
        resolve();
      }
    });
  };

  useEffect(() => {
    authenticate();
  }, [accounts]);

  const signIn = async () => {
    try {
      await ensureDevelopmentBackend();
      await instance.loginPopup(loginRequest);
    } catch (error) {
      if (error.errorCode === "invalid_grant" || error.errorCode === "consent_required") {
        try {
          await instance.loginPopup({
            ...loginRequest,
            prompt: "consent"
          });
        } catch (authError) {
          console.error('Error during loginPopup:', authError);
          setAuthError(authError);
        }
      } else {
        setUser({});
        setLoginState(false);
        setAuthError(error);
      }
    }
  };

  /*
   * Purpose: Terminate the application session locally and purge MSAL cached credentials
   *          without redirecting the student away to Microsoft's global account picker.
   * Authentication/Authorization Requirements: None; callable by authenticated or unauthenticated users.
   */
  const signOut = async () => {
    // Invalidate any in-flight authenticate calls so they cannot resurrect signed-in state
    authGeneration.current++;
    try {
      const response = await fetch('/api/v1/user/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        console.error(`Backend logout returned status ${response.status}`);
      }
    } catch (error) {
      console.error('Backend logout session destruction encountered an error:', error);
    } finally {
      setUser({});
      setLoginState(false);
      try {
        const account = accounts && accounts.length > 0 ? accounts[0] : undefined;
        await instance.logoutRedirect({
          account,
          onRedirectNavigate: () => false,
        });
      } catch (msalError) {
        console.error('Local MSAL cache clearance failed:', msalError);
        setAuthError(msalError);
      }
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