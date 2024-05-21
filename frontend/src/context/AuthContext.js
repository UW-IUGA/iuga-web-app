import React, { createContext, useState, useEffect, useContext } from 'react';
import { useMsal } from '@azure/msal-react';
import useAuth from '../hooks/useAuth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const { instance, accounts } = useMsal();
  const { ensureBackendAuthentication } = useAuth();
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const authenticate = async () => {
      if (accounts.length > 0 && !isAuthenticated) {
        try {
          await ensureBackendAuthentication();
          setIsAuthenticated(true);
        } catch (error) {
          setAuthError(error);
        } finally {
          setAuthLoading(false);
        }
      } else {
        setAuthLoading(false);
      }
    };

    authenticate();
  }, [accounts, ensureBackendAuthentication, isAuthenticated]);

  const signIn = async () => {
    try {
      await instance.loginPopup();
      await ensureBackendAuthentication();
      setIsAuthenticated(true);
    } catch (error) {
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
      setIsAuthenticated(false);
    } catch (error) {
      setAuthError(error);
    }
  };

  return (
    <AuthContext.Provider value={{ authLoading, authError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  return useContext(AuthContext);
};