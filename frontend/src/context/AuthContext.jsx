import React, { createContext, useState, useEffect, useContext } from 'react';
import { useMsal } from '@azure/msal-react';
import useAuth from '../hooks/useAuth';

const AuthContext = createContext();

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
      await instance.loginPopup();
      await authenticate();
    } catch (error) {
      setUser({});
      setLoginState(false)
      setAuthError(error);
    }
  };

  const signOut = async () => {
    try {
      await instance.logoutPopup();
      await fetch('http://localhost:7777/api/v1/user/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      setUser({});
      setLoginState(false);
    } catch (error) {
      setAuthError(error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, authLoading, authError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  return useContext(AuthContext);
};