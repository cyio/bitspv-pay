# BitSPV MicroPay

A lightweight, non-custodial BSV web wallet and payment tool for sending and receiving payments. It supports both legacy addresses and Paymail, and can be integrated with third-party websites to facilitate payment flows.

As a lightweight wrapper for the BSV SDK, this project aims for minimal dependencies and enhanced security via a strict Content Security Policy (CSP). It relies on public indexer services like `Whatsonchain` and `Bitails` for blockchain data.

## Features

- **Lightweight & Focused**: A simple interface for core payment tasks.
- **Easy Integration**: Can be used as a standalone payment page or integrated with third-party sites.
- **Non-custodial**: Users have full control of their private keys, which are stored locally.
- **Flexible Payments**: Supports sending to both legacy BSV addresses and Paymail.
- **Internationalization**: Multi-language support.

## Tech Stack

- **Frontend Framework**: React
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **UI Component Library**: shadcn/ui
- **Payment Processing**: `@bsv/sdk` and `@bsv/paymail`
- **Internationalization**: `react-i18next`
- **State Management**: React Hooks

## Architecture Overview

This diagram illustrates the flow for handling a payment request from an integrated third-party site.

```mermaid
graph TD
    subgraph "Browser"
        A[Parent/Calling Window]
    end

    subgraph "BitSPV Payment App"
        subgraph "UI Components (React)"
            B[Payment Page]
            D[Wallet Manager]
            P[PIN Prompt Dialog]
        end

        subgraph "Core Logic (Hooks)"
            C[usePaymentFlow]
            E[useWallet]
            F[usePinManager]
            G[useStorage]
        end

        subgraph "Utilities"
            H[@bsv/sdk]
            I[API Utils]
        end
    end

    subgraph "External Services"
        J[BSV Blockchain]
        K[API Provider]
    end

    A -- "1. Opens with payment params in URL" --> B
    B -- "2. Triggers" --> C
    C -- "3. Polls for sufficient balance" --> E
    E -- "4. Needs private key to send" --> F
    F -- "5. Prompts user" --> P
    P -- "6. User enters PIN" --> F
    F -- "7. Unlocks key from" --> G
    G -- "8. Provides key" --> E
    E -- "9. Creates & signs transaction via" --> H
    E -- "10. Broadcasts transaction via" --> I
    I -- "11. Submits to" --> K
    K -- "12. Relays to" --> J
    E -- "13. Returns txid" --> C
    C -- "14. Triggers onPaymentSuccess" --> B
    B -- "15. Returns result to" --> A
end
```

**Key Business Logic:**

- **Integration Payment Flow**:
    1. **Receive Request**: The payment page loads with payment details in the URL hash.
    2. **Check Balance**: It polls the wallet balance to see if funds are sufficient for the transaction.
    3. **Process Payment**: Once the balance is confirmed, it prompts for a PIN (if required), constructs the transaction, and broadcasts it.
    4. **Return Result**: Communicates the transaction ID back to the originating site using `postMessage` (popup mode) or a URL redirect (redirect mode).
- **Wallet Management**:
    - Create, import, and back up the wallet.
    - Manually send BSV to legacy addresses or Paymail.
    - View transaction history.
- **Security**:
    - Private keys are encrypted with a user-defined PIN and stored in the browser's local storage.

## Development and Deployment

### Local Development

1.  **Install dependencies**:
    ```bash
    pnpm install
    ```
2.  **Run the development server**:
    ```bash
    pnpm dev
    ```
    The application will run at `http://localhost:5173` (or a similar address).

### Building for Production

```bash
pnpm build
```
The build artifacts will be located in the `dist/` directory.

## Contributing

Contributions to this project are welcome! If you have any feature suggestions, bug reports, or improvements, please feel free to submit a Pull Request or Issue.

## License

This project is licensed under the Open BSV License.
