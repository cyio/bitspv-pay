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
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './style.css';
import i18n from './i18n'; // Your existing i18n setup
import { I18nextProvider } from 'react-i18next';
import Payment from './pages/Payment'; // Our new Payment page
import { DialogProvider } from './components/Dialogs.jsx';

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <I18nextProvider i18n={i18n}>
                <DialogProvider>
                    <Router>
                        <Routes>
                            <Route path="/" element={<Payment />} />
                            {/* You can add more routes here as you migrate more pages */}
                        </Routes>
                    </Router>
                </DialogProvider>
            </I18nextProvider>
        </React.StrictMode>
    );
}
