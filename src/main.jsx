// Create a Trusted Types policy
if (window.trustedTypes && window.trustedTypes.createPolicy) {
  window.trustedTypes.createPolicy('default', {
    createHTML: (string) => string,
    createScriptURL: (string) => string,
    createScript: (string) => string
  });
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import ReactGA from "react-ga4";
import './style.css';
import i18n from './i18n'; // Your existing i18n setup
import { I18nextProvider } from 'react-i18next';
import Payment from './pages/Payment';
import { DialogProvider } from './components/Dialogs.jsx';
import { LogProvider } from './contexts/LogContext';

const isOfflineBuild = import.meta.env.VITE_OFFLINE_BUILD === 'true';
const Router = isOfflineBuild ? HashRouter : BrowserRouter;

if (!isOfflineBuild) {
    ReactGA.initialize('G-924QNFV4HX');
}

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <I18nextProvider i18n={i18n}>
                <LogProvider>
                    <DialogProvider>
                        <Router>
                            <Routes>
                                <Route path="/" element={<Payment />} />
                                {/* Add more routes here */}
                            </Routes>
                        </Router>
                    </DialogProvider>
                </LogProvider>
            </I18nextProvider>
        </React.StrictMode>
    );
}
