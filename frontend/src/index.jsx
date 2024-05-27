import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { msalConfig } from './authConfig'
import { MsalProvider } from '@azure/msal-react' 
import { PublicClientApplication } from '@azure/msal-browser'
import { AuthProvider } from './context/AuthContext';
import ReactGA from "react-ga4";
import './stylesheets/main.scss';

const msalInstance = new PublicClientApplication(msalConfig);
await msalInstance.initialize();

const root = ReactDOM.createRoot(document.getElementById('root'));
ReactGA.initialize("G-S0M9Y5V0XT");
root.render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </MsalProvider>
  </React.StrictMode>
);
