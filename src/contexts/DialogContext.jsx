import { createContext, useContext } from 'react';

export const DialogContext = createContext({
  showDialog: () => Promise.reject(new Error('DialogContext not initialized')),
});

export const useDialog = () => useContext(DialogContext);
