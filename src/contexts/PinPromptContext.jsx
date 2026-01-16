import { createContext, useContext } from 'react';

export const PinPromptContext = createContext({
  promptForPin: () => Promise.reject(new Error('PinPromptContext not initialized')),
  showInfo: () => Promise.reject(new Error('PinPromptContext not initialized')),
});

export const usePinPrompt = () => useContext(PinPromptContext);
