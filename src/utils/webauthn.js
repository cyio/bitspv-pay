// src/utils/webauthn.js

/**
 * Converts an ArrayBuffer to a Base64URL-encoded string.
 * @param {ArrayBuffer} buffer The ArrayBuffer to convert.
 * @returns {string} The Base64URL-encoded string.
 */
export function arrayBufferToBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Converts a Base64URL-encoded string to an ArrayBuffer.
 * @param {string} base64Url The Base64URL-encoded string.
 * @returns {ArrayBuffer} The resulting ArrayBuffer.
 */
export function base64UrlToArrayBuffer(base64Url) {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives an encryption key from a PIN using PBKDF2.
 * @param {string} pin The user's PIN.
 * @param {ArrayBuffer} salt The salt for PBKDF2.
 * @returns {Promise<CryptoKey>} The derived CryptoKey for AES-GCM.
 */
async function deriveKeyFromPin(pin, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts data using AES-GCM.
 * @param {string} plaintext The string to encrypt.
 * @param {string} pin The user's PIN.
 * @returns {Promise<{ciphertext: string, iv: string, salt: string}>} Object containing base64url encoded ciphertext, iv, and salt.
 */
export async function encryptData(plaintext, pin) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPin(pin, salt);

  const encryptedData = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: arrayBufferToBase64Url(encryptedData),
    iv: arrayBufferToBase64Url(iv),
    salt: arrayBufferToBase64Url(salt),
  };
}

/**
 * Decrypts data using AES-GCM.
 * @param {string} ciphertextB64Url Base64URL encoded ciphertext.
 * @param {string} ivB64Url Base64URL encoded IV.
 * @param {string} saltB64Url Base64URL encoded salt.
 * @param {string} pin The user's PIN.
 * @returns {Promise<string | null>} The decrypted string, or null if decryption fails.
 */
export async function decryptData(ciphertextB64Url, ivB64Url, saltB64Url, pin) {
  try {
    const salt = base64UrlToArrayBuffer(saltB64Url);
    const iv = base64UrlToArrayBuffer(ivB64Url);
    const key = await deriveKeyFromPin(pin, salt);
    const ciphertext = base64UrlToArrayBuffer(ciphertextB64Url);

    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
}

/**
 * Registers a new Passkey.
 * @param {string} username A username for the credential (can be a generated ID).
 * @param {string} displayName A display name for the user.
 * @returns {Promise<PublicKeyCredential | null>} The created PublicKeyCredential or null on error.
 */
export async function registerPasskey(username, displayName) {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const isAndroidChrome = navigator.userAgent.includes('Android') && 
                          navigator.userAgent.includes('Chrome');

    const publicKeyCredentialCreationOptions = {
      challenge: challenge,
      rp: {
        name: document.title || 'BSV MicroPay',
        id: window.location.hostname,
      },
      user: {
        id: userId,
        name: username,
        displayName: displayName,
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: isAndroidChrome ? undefined : 'platform',
        userVerification: isAndroidChrome ? 'required' : 'preferred',
        residentKey: 'required',
        requireResidentKey: true,
      },
      transports: isAndroidChrome ? ['internal', 'hybrid'] : undefined,
      timeout: 60000,
      attestation: 'none',
    };

    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    });

    if (credential) {
      return credential;
    }
    return null;
  } catch (error) {
    const errorInfo = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      userAgent: navigator.userAgent,
      isAndroid: navigator.userAgent.includes('Android'),
      timestamp: new Date().toISOString()
    };
    console.error('Passkey registration failed:', errorInfo);
    const enhancedError = new Error(`Passkey注册失败: ${error.message} (设备: ${errorInfo.isAndroid ? '安卓' : '其他'})`);
    enhancedError.details = errorInfo;
    throw enhancedError;
  }
}

/**
 * Authenticates with an existing Passkey.
 * @param {ArrayBuffer} credentialId The ID of the credential to authenticate with.
 * @returns {Promise<PublicKeyCredential | null>} The authenticated PublicKeyCredential or null on error.
 */
export async function authenticateWithPasskey(credentialIdB64Url) {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const allowCredentials = [];
    if (credentialIdB64Url) {
        allowCredentials.push({
            type: 'public-key',
            id: base64UrlToArrayBuffer(credentialIdB64Url),
            transports: ['internal', 'hybrid', 'usb', 'nfc', 'ble'], // Common transports
        });
    }


    const publicKeyCredentialRequestOptions = {
      challenge: challenge,
      rpId: window.location.hostname,
      allowCredentials, // Optional: specify credentials if you know them
      userVerification: 'preferred', // 'required', 'preferred', or 'discouraged'
      timeout: 60000,
    };

    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    });

    if (assertion) {
      // IMPORTANT: In a real scenario with a server, you would send
      // assertion.rawId, assertion.response.authenticatorData,
      // assertion.response.clientDataJSON, and assertion.response.signature
      // to the server for verification.
      return assertion;
    }
    return null;
  } catch (error) {
    const errorInfo = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      userAgent: navigator.userAgent,
      isAndroid: navigator.userAgent.includes('Android'),
      timestamp: new Date().toISOString()
    };
    console.error('Passkey authentication failed:', errorInfo);
    const enhancedError = new Error(`Passkey验证失败: ${error.message} (设备: ${errorInfo.isAndroid ? '安卓' : '其他'})`);
    enhancedError.details = errorInfo;
    throw enhancedError;
  }
}
