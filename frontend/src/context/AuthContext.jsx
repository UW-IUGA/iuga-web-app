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
  const syncMemo = useRef(new Map());

  /*
   * @behavior: Synchronize an MSAL account with the IUGA backend session. Multiple calls for the
   *            same account share a single in-flight sync unless force is specified; failures are evicted.
   * @param {Object} [account] - MSAL account to sync; falls back to the first active account.
   * @param {Object} [options] - Synchronization options.
   * @param {boolean} [options.force=false] - When true, initiates a fresh sync unless one is already in flight.
   * @returns {Promise<Object|null>} Authenticated backend user or null when signed out.
   */
  const authenticate = (account, { force = false } = {}) => {
    const targetAccount = account || (accounts && accounts.length > 0 ? accounts[0] : null);
    const currentGen = ++authGeneration.current;

    if (!targetAccount) {
      if (currentGen === authGeneration.current) {
        setUser({});
        setLoginState(false);
        setAuthLoading(false);
      }
      return Promise.resolve(null);
    }

    const key = targetAccount.homeAccountId || targetAccount.localAccountId || targetAccount.username || 'default';
    const entry = syncMemo.current.get(key);
    let syncPromise;

    if (entry && (!force || entry.inFlight)) {
      syncPromise = entry.promise;
    } else {
      const syncEntry = { inFlight: true, promise: null };
      syncPromise = (async () => {
        try {
          const result = await ensureBackendAuthentication(targetAccount);
          syncEntry.inFlight = false;
          return result;
        } catch (error) {
          syncMemo.current.delete(key);
          throw error;
        }
      })();
      syncEntry.promise = syncPromise;
      syncMemo.current.set(key, syncEntry);
    }

    return (async () => {
      try {
        const backendUser = await syncPromise;
        if (currentGen !== authGeneration.current) return backendUser;
        setUser(backendUser);
        setLoginState(true);
        return backendUser;
      } catch (error) {
        if (currentGen !== authGeneration.current) throw error;
        setAuthError(error);
        setLoginState(false);
        throw error;
      } finally {
        if (currentGen === authGeneration.current) {
          setAuthLoading(false);
        }
      }
    })();
  };

  useEffect(() => {
    authenticate();
  }, [accounts]);

  const isUserCancellation = (error) => {
    const code = error?.errorCode || error?.code || error?.name || '';
    if (code === 'user_cancelled' || code === 'popup_window_error') {
      return true;
    }
    const message = error?.message || '';
    return message.includes('user_cancelled') || message.includes('popup_window_error');
  };

  /*
   * @behavior: Initiate MSAL interactive login and establish the backend session before resolving.
   *            Resolves the authenticated user on success, and null on cancellation or error. Never rejects.
   * @returns {Promise<Object|null>} Authenticated backend user, or null if sign-in did not complete.
   */
  const signIn = async () => {
    try {
      await ensureDevelopmentBackend();
      let response;
      try {
        response = await instance.loginPopup(loginRequest);
      } catch (popupError) {
        if (
          popupError?.errorCode === 'invalid_grant' ||
          popupError?.errorCode === 'consent_required' ||
          popupError?.code === 'invalid_grant' ||
          popupError?.code === 'consent_required'
        ) {
          response = await instance.loginPopup({
            ...loginRequest,
            prompt: 'consent',
          });
        } else {
          throw popupError;
        }
      }

      const account = response?.account || (accounts && accounts.length > 0 ? accounts[0] : null);
      const authenticatedUser = await authenticate(account, { force: true });
      return authenticatedUser;
    } catch (error) {
      if (isUserCancellation(error)) {
        return null;
      }
      setUser({});
      setLoginState(false);
      setAuthError(error);
      return null;
    }
  };

  /*
   * Purpose: Terminate the application session locally and purge MSAL cached credentials
   *          without redirecting the student away to Microsoft's global account picker.
   * Authentication/Authorization Requirements: None; callable by authenticated or unauthenticated users.
   */
  const signOut = async () => {
    // Invalidate any in-flight authenticate calls so they cannot resurrect signed-in state
    syncMemo.current.clear();
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