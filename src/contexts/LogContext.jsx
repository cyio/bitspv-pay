import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const LogContext = createContext();

export const LogProvider = ({ children }) => {
  const [logs, setLogs] = useState([]);
  const [isConsoleVisible, setIsConsoleVisible] = useState(false);

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const newEntry = { timestamp, message: String(message), type };
    setLogs(prev => [...prev.slice(-99), newEntry]); // Keep last 100 logs
  }, []);

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
