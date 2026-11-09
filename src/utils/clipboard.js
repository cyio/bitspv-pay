/**
 * Copy text to the clipboard.
 *
 * Uses the async Clipboard API when available and falls back to a hidden
 * textarea + execCommand('copy') for older browsers and WebViews (e.g. WeChat)
 * where the async API is missing or blocked.
 *
 * @param {string} text
 * @returns {Promise<boolean>} true when the text was copied
 */
export async function copyText(text) {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn('Clipboard API failed, trying fallback:', error);
    }
  }

  let textarea;
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch (error) {
    console.error('Clipboard fallback failed:', error);
    return false;
  } finally {
    if (textarea?.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
  }
}
