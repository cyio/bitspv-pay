/**
 * Expected CSP allowlist (baseline).
 *
 * The set of network endpoints the wallet is *expected* to contact, derived
 * from the documented security model (see docs/pin-security.md). Used at
 * runtime to detect any origin that was added to the CSP beyond this baseline.
 *
 * IMPORTANT — trust boundary:
 *   This baseline ships inside the app, so it can only detect *drift* from a
 *   known-good release and accidental / third-party additions. It cannot defend
 *   against a malicious author who edits both the deployed page and this file.
 *   The real trust anchors are the open-source repository and the outbound
 *   allowlist fingerprint shown at runtime — pin that fingerprint in the
 *   changelog and compare it across versions/releases.
 *
 * Origins are normalized the same way the runtime checker normalizes CSP
 * sources: `scheme://host` with no path, wildcards kept as-is.
 */

export const EXPECTED_CSP_ORIGINS = {
  'connect-src': [
    'https://223.5.5.5', // AliDNS — connectivity / DNS-over-HTTPS check
    'https://www.google.com', // connectivity check
    'https://dns.google.com', // DNS-over-HTTPS
    'https://dns.google', // DNS-over-HTTPS
    'https://www.google-analytics.com', // analytics
    'https://clients3.google.com', // connectivity check (captive portal detect)
    'https://api.whatsonchain.com', // BSV API
    'https://api.bitails.io', // BSV API
    'https://beef.xn--nda.network', // BSV BEEF endpoint (punycode: beef.ö.network)
    'https://*.gorillapool.io', // BSV API
    'https://arc.taal.com', // BSV ARC broadcast
    'https://api.taal.com', // BSV API
    'https://*.handcash.io', // paymail / handle resolution
    'https://*.rockwallet.net', // paymail / handle resolution
    'https://bananablocks.com', // BSV block explorer / API
  ],
  'script-src': [
    'https://www.google-analytics.com', // analytics
    'https://www.googletagmanager.com', // Google Tag Manager
  ],
};
