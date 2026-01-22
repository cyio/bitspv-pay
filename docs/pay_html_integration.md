# Payment Page Integration Guide

The BitSPV payment page is designed as a universal payment handler for Bitcoin SV (BSV). It can be opened in a separate window or integrated into your application via redirection to simplify the payment process and result handling.

## 1. Calling the Payment Page

You can invoke the payment page in two ways, depending on your application's flow and environment.

### Method 1: Using `window.open` in a New Window (Popup Mode)

This method is suitable for desktop or web environments where you don't want to interrupt the user's current page.

**Parent Window Code:**

```javascript
function callPay(paymentParams) {
  // 1. Encode the payment parameters into the URL hash.
  const encodedData = encodeURIComponent(JSON.stringify(paymentParams));
  const paymentUrl = `https://pay.bitspv.com/#${encodedData}`;

  // 2. Open the payment page in a new window.
  const childWindow = window.open(paymentUrl, 'Payment', 'width=500,height=580');

  // 3. Listen for the payment result from the child window.
  const receiveMessage = (event) => {
    // Ensure the message is from the payment window you opened.
    if (event.source !== childWindow) {
      return;
    }

    if (event.data && event.data.type === 'payment_success') {
      const txid = event.data.payload.txid;
      console.log('Received transaction ID from child window:', txid);
      handlePayResult(txid);

      // 4. (Optional) Send a confirmation back to the child window to close it.
      childWindow.postMessage({ type: 'message_received' }, '*');

      // 5. Clean up the event listener.
      window.removeEventListener('message', receiveMessage);
    }
  };

  window.addEventListener('message', receiveMessage, false);
}

// Function to handle the successful payment result.
function handlePayResult(txid) {
  console.log('Payment successful, Transaction ID:', txid);
  // Update your UI or perform other actions based on the txid.
}
```

**Explanation:**
- Payment parameters are passed via the URL hash (`#`).
- The parent window listens for a `message` event. The payment page will send a message with `{ type: 'payment_success', payload: { txid: '...' } }` upon completion.
- After receiving the result, the parent window can optionally send a `message_received` confirmation, which will prompt the payment window to close itself.

### Method 2: Redirecting to the Payment Page

This method is suitable for mobile environments or single-page flows.

**Calling Page Code:**

```javascript
function redirectToPay(paymentParams) {
  // 1. Encode payment parameters into the URL hash.
  const encodedData = encodeURIComponent(JSON.stringify(paymentParams));

  // 2. Specify the URL to return to after payment completion.
  const callbackUrl = encodeURIComponent(window.location.href);

  // 3. Redirect to the payment page.
  const paymentUrl = `https://pay.bitspv.com/?callbackUrl=${callbackUrl}#${encodedData}`;
  window.location.href = paymentUrl;
}
```

**Callback Page Code (The page at `callbackUrl`):**

```javascript
// On the callback page, check for payment results in the URL when the page loads.
function handlePaymentCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const status = urlParams.get('status');
  const txid = urlParams.get('data');

  if (status === 'success' && txid) {
    console.log('Payment successful, Transaction ID:', txid);
    handlePayResult(txid);

    // Clean the URL to remove payment parameters.
    const newUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, newUrl);
  } else if (status === 'error') {
    const errorMessage = urlParams.get('errorMessage');
    console.error('Payment failed:', errorMessage);
  }
}

// Call this function when your page mounts or loads.
handlePaymentCallback();

function handlePayResult(txid) {
  // Update UI or perform other actions.
}
```

**Explanation:**
- The payment parameters are passed via the URL hash.
- The current page's URL is passed as a `callbackUrl` query parameter.
- The payment page will redirect back to the `callbackUrl`, appending the result (`status=success&data=<txid>` or `status=error&errorMessage=...`) as query parameters.
- Your callback page needs logic to parse these parameters from the URL.

## 2. `paymentParams` Structure

`paymentParams` is an array of objects, where each object represents a transaction output.

```javascript
const paymentParams = [
  // Example 1: A data output (OP_RETURN)
  {
    // Data must be an array of hex-encoded strings.
    data: [
        '19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut', // Protocol identifier
        Buffer.from('Hello, BSV!', 'utf8').toString('hex') // Message content
    ],
    satoshis: 0, // satoshis for data outputs are always 0
  },
  // Example 2: A standard payment output
  {
    address: '1...your-receive-address...', // The recipient's BSV address
    satoshis: 1000, // The amount to pay in satoshis
  },
  // ... you can add more outputs if needed
];
```

**Field Descriptions:**
- `data`: An array of hex-encoded strings for an `OP_RETURN` output. Use this for writing data to the blockchain.
- `address`: A valid BSV address for a standard P2PKH payment.
- `satoshis`: The amount in satoshis for that output.

## 3. Error Handling

- **Popup Mode (`window.open`)**: Errors are typically displayed within the payment window itself. The window will not send a `payment_success` message, and the user will likely close it manually. Your parent window can detect when the child window is closed to handle cancellation.
- **Redirect Mode**: Errors are communicated by redirecting to the `callbackUrl` with query parameters like `status=error` and `errorMessage=...`. Implement logic on your callback page to handle these cases.
