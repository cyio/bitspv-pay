# Vue to React Migration Plan - Progress Update

This document tracks the progress of migrating the BitSPV Pay application from Vue.js to React.

## Current Progress (As of 2026-01-13)

### Phase 1: Environment Setup (Completed)
- ✅ Installed React, ReactDOM, and related type definitions.
- ✅ Installed Vite plugin for React (`@vitejs/plugin-react`).
- ✅ Created a new git branch `feat/react-migration` for the migration work.

### Phase 2: Core Logic Migration (Completed)
- ✅ Migrated `composables` to React `hooks`.
  - `useWallet.js`
  - `usePinManager.js`
  - `useStorage.js`

### Phase 3: Component & App Initialization Migration (In Progress)
- ✅ **Component Migration**: `Payment.vue` has been migrated to `src/pages/Payment.jsx`. Other components are currently placeholder/stubbed.
- ✅ **App Entry Point**: The application entry point has been moved from `src/main.js` to `src/main.jsx` to use React's `createRoot`.
- ✅ **Internationalization (i18n)**: Migrated from `vue-i18n` to `react-i18next` and reconfigured in `src/i18n.js`.

### Phase 4: Integration, Testing, and Debugging (In Progress)

#### Issues Encountered:
1.  **Development Server Instability**: The Vite development server has been crashing repeatedly, resulting in `ERR_CONNECTION_REFUSED` errors in the browser. This seems to be related to the Vite configuration (`vite.config.ts`) and the `index.html` setup after removing Vue-specific plugins.
2.  **Infinite Re-render Loop**: An infinite loop was identified and fixed in `Payment.jsx`. It was caused by an incorrect dependency in a `useEffect` hook that was constantly calling the `createWallet` function.

#### Current Status:
- The project is currently in a non-runnable state due to the server instability.
- The immediate priority is to stabilize the development environment.

## Next Steps

1.  **Stabilize the Development Server:**
    -   [ ] Re-evaluate and correct `vite.config.ts`. The previous simplification might have been too aggressive. Consider re-introducing `vite-plugin-html` to explicitly manage the `index.html` entry point.
    -   [ ] Ensure `index.html` correctly points to the `src/main.jsx` script.
    -   [ ] Restart the server and verify it runs without crashing.

2.  **Verify Basic Page Render:**
    -   [ ] Once the server is stable, launch the browser and confirm that the `Payment.jsx` component renders without errors or loops.

3.  **Continue Component Migration (Sequential):**
    -   [ ] Migrate `WalletManager.vue` to a React component.
    -   [ ] Migrate `TransactionHistory.vue` to a React component.
    -   [ ] Migrate modals (`DonationModal`, `PayModal`, etc.).
    -   [ ] Replace all remaining Vue components with their React equivalents.

4.  **Final Testing and Cleanup:**
    -   [ ] Conduct end-to-end testing of the entire application flow.
    -   [ ] Restore or update the Content Security Policy (CSP) in `index.html`.
    -   [ ] Remove all placeholder code and unused Vue files.
    -   [ ] Delete the old `src/views` and `src/components` directories.

This plan will be updated as the migration progresses.
