# Omarchy Store — Crypto Payment System

## RECOMMENDED SOLUTION: Solana Pay + USDC (No Smart Contract Needed)

### Why This Approach:
- **$0 cost** — No deployment fees, no hosting costs
- **No smart contract required** — Just JavaScript SDK
- **Auto-split payments** — Built into the transaction
- **USDC stablecoin** — No price volatility
- **Instant settlement** — ~400ms confirmation
- **No chargebacks** — Blockchain is final (no refunds)
- **Works with Phantom, Solflare, etc.** — Any Solana wallet

---

## How It Works

```
User clicks "Buy $5" on app page
    ↓
Phantom wallet opens (or QR code for mobile)
    ↓
User confirms ONE transaction that:
    → Sends $4.50 USDC (90%) to DEVELOPER wallet
    → Sends $0.50 USDC (10%) to STORE wallet
    ↓
Backend webhook confirms payment
    ↓
User gets download access
```

**The split happens in the SAME transaction** — not two separate transfers. This is built into Solana's transaction model (multiple instructions in one atomic tx).

---

## Implementation

### 1. Install Dependencies
```bash
npm install @solana/web3.js @solana/spl-token @solana/pay
```

### 2. Store Wallet (One-Time Setup)
Create a Solana wallet for the store's 10% cut:
```bash
# Generate a new wallet (do this once, save the keypair securely)
solana-keygen new -o ~/omarchy-store-wallet.json
solana address -k ~/omarchy-store-wallet.json
# Example output: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

Store the PUBLIC address in your config. Keep the private key in cold storage.

### 3. Developer Registration
When a developer submits a paid app:
- They provide their Solana wallet address (USDC)
- We store it in the app's registry JSON
- Example: `"developer_wallet": "DevWa11etAddressHere123..."`

### 4. Payment Transaction Builder (Cloudflare Worker)

```javascript
// backend/src/pay.js
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // Mainnet USDC
const STORE_WALLET = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'); // Your store wallet
const RPC = 'https://api.mainnet-beta.solana.com'; // or Helius/Quicknode for production

export async function createSplitPaymentTx(buyerWallet, developerWallet, amountUSDC) {
  const connection = new Connection(RPC);
  const buyer = new PublicKey(buyerWallet);
  const developer = new PublicKey(developerWallet);
  
  // Calculate split (USDC has 6 decimals)
  const totalLamports = Math.floor(amountUSDC * 1_000_000);
  const devShare = Math.floor(totalLamports * 0.90);  // 90% to developer
  const storeShare = totalLamports - devShare;         // 10% to store
  
  // Get token accounts
  const buyerATA = await getAssociatedTokenAddress(USDC_MINT, buyer);
  const devATA = await getAssociatedTokenAddress(USDC_MINT, developer);
  const storeATA = await getAssociatedTokenAddress(USDC_MINT, STORE_WALLET);
  
  // Build transaction with TWO transfers in ONE atomic tx
  const tx = new Transaction();
  
  // Transfer 90% to developer
  tx.add(createTransferInstruction(
    buyerATA, devATA, buyer, devShare
  ));
  
  // Transfer 10% to store
  tx.add(createTransferInstruction(
    buyerATA, storeATA, buyer, storeShare
  ));
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = buyer;
  
  return tx;
}
```

### 5. Frontend Buy Button

```javascript
// On app page
import { useWallet } from '@solana/wallet-adapter-react';

function BuyButton({ appId, price, developerWallet }) {
  const { publicKey, signTransaction } = useWallet();
  
  const handleBuy = async () => {
    // 1. Get transaction from backend
    const res = await fetch('/api/create-payment', {
      method: 'POST',
      body: JSON.stringify({
        buyer: publicKey.toString(),
        developer: developerWallet,
        amount: price,
        appId
      })
    });
    const { transaction } = await res.json();
    
    // 2. User signs in their wallet (Phantom popup)
    const tx = Transaction.from(Buffer.from(transaction, 'base64'));
    const signed = await signTransaction(tx);
    
    // 3. Send to network
    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(sig);
    
    // 4. Confirm with backend & get download
    await fetch('/api/confirm-payment', {
      method: 'POST',
      body: JSON.stringify({ signature: sig, appId })
    });
    
    // 5. Show download button
    window.location.href = `/download/${appId}`;
  };
  
  return <button onClick={handleBuy}>Buy ${price} USDC</button>;
}
```

### 6. Payment Verification (Backend)

```javascript
// Verify the transaction actually happened
export async function verifyPayment(signature, expectedDev, expectedStore, expectedAmount) {
  const connection = new Connection(RPC);
  const tx = await connection.getTransaction(signature, { commitment: 'confirmed' });
  
  if (!tx || tx.meta.err) return false;
  
  // Check the transaction transferred the right amounts to the right wallets
  // (Parse tx.meta.preTokenBalances / postTokenBalances)
  // Return true if valid
}
```

---

## No Smart Contract Needed

The split happens **client-side** in the transaction instructions. Solana transactions can contain multiple instructions that execute atomically. Either ALL transfers happen, or NONE do.

This is different from Ethereum where you'd need a smart contract to split funds. On Solana, we just build a transaction with multiple transfer instructions.

---

## Developer Onboarding Flow

1. Developer goes to omarchystore.com/submit
2. Fills out app details + price
3. Enters their Solana wallet address (for USDC payouts)
4. We store: `{ "price": 5.00, "developer_wallet": "ABC123..." }`
5. App goes live with Buy button
6. Every purchase auto-splits 90/10

---

## Costs

| Item | Cost |
|------|------|
| Solana transaction fee | ~$0.00025 per tx |
| USDC transfer | $0 (SPL token transfer) |
| Hosting (Cloudflare Worker) | Free tier |
| RPC endpoint | Free tier (Helius/Quicknode) |
| **Total** | **~$0** |

---

## Files to Create

1. `backend/src/pay.js` — Payment transaction builder
2. `site/js/wallet.js` — Wallet connect + buy flow
3. `registry/apps/*.json` — Add `developer_wallet` and `price` fields

---

## Alternative: Solana Pay QR Code

For mobile users without wallet-adapter:

```javascript
import { createQR, encodeURL } from '@solana/pay';

const url = encodeURL({
  recipient: STORE_WALLET,
  splToken: USDC_MINT,
  amount: new BigNumber(price),
  reference: new PublicKey(orderId), // For tracking
  label: 'Omarchy Store',
  message: `Purchase: ${appName}`
});

const qr = createQR(url);
```

But this only sends to ONE wallet. For split payments, we need the transaction-based approach above.

---

## Next Steps

1. [ ] Create store Solana wallet (save address to config)
2. [ ] Add `developer_wallet` field to app registry schema
3. [ ] Build payment endpoint in Cloudflare Worker
4. [ ] Add wallet-adapter to site (Phantom, Solflare, etc.)
5. [ ] Create Buy button component
6. [ ] Test on devnet with fake USDC
7. [ ] Deploy to mainnet

---

## X: Follow Developers

These are the X handles of developers we're featuring. Follow them to get their attention:

```
@OldJobobo
@OpenAtMicrosoft
@Ron_Dilley
@amitwt
@anom538
@anomalyco
@chrisatlee
@hancore_linux
@iamdothash
@valecodes
@zdanailov7
```

Total: 11 developers to follow on X
