// This module holds the global state for Google connectivity.

let isGoogleReachable = true; // Default to true

export const getGoogleReachable = () => isGoogleReachable;

export const setGoogleReachable = (value) => {
  isGoogleReachable = value;
};

// Function to check connectivity
export async function checkGoogleConnectivity() {
    try {
        // We use a no-cors request to a Google endpoint that is likely to be up.
        // We don't need the response, just to see if the request is not blocked.
        const response = await fetch('https://www.google.com/generate_204', {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-store'
        });
        setGoogleReachable(true);
        return true;
    } catch (error) {
        // A network error likely means we are in a restricted environment (like mainland China).
        console.warn('Google connectivity check failed. Assuming restricted network environment.', error);
        setGoogleReachable(false);
        return false;
    }
}
