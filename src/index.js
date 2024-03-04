import React from 'react';
import ReactDOM from 'react-dom/client';
import './stylesheets/main.scss';
import App from './App';
import { msalConfig } from './authConfig'
import { MsalProvider } from '@azure/msal-react' 
import { PublicClientApplication } from '@azure/msal-browser'

const msalInstance = new PublicClientApplication(msalConfig);

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  </React.StrictMode>
);
