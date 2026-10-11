import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { logSecurityAudit } from '../utils/runtimeDiagnostics';

const LogContext = createContext();

export const LogProvider = ({ children }) => {
  const [logs, setLogs] = useState([]);
  const [isConsoleVisible, setIsConsoleVisible] = useState(false);

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const newEntry = { timestamp, message: String(message), type };
    setLogs(prev => [...prev.slice(-99), newEntry]); // Keep last 100 logs
  }, []);

  // Run a security / integrity audit automatically when the app boots.
  // The `cancelled` guard keeps React StrictMode from logging the audit twice.
  useEffect(() => {
    let cancelled = false;
    logSecurityAudit((message, type) => {
      if (!cancelled) addLog(message, type);
    });
    return () => {
      cancelled = true;
    };
  }, [addLog]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const toggleConsole = useCallback(() => setIsConsoleVisible(prev => !prev), []);

  return (
    <LogContext.Provider value={{ logs, addLog, clearLogs, isConsoleVisible, toggleConsole }}>
      {children}
    </LogContext.Provider>
  );
};

export const useLog = () => {
  const context = useContext(LogContext);
  if (!context) {
    throw new Error('useLog must be used within a LogProvider');
  }
  return context;
};

// Log levels
export const LOG_TYPES = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  SUCCESS: 'success'
};
