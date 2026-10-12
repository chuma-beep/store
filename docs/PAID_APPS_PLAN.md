# Omarchy Store — Paid Apps & Developer Revenue System

## Revenue Model
- **90% to Developer** — paid directly to their crypto wallet
- **10% to Store** — covers hosting, marketing, curation
- **No refunds** — all sales final (clearly stated at checkout)

## Payment Flow Architecture

### Option A: Solana Pay + Smart Contract Split (RECOMMENDED)
```
User clicks "Buy $X" 
    → Connects wallet (Phantom, Solflare, etc.)
    → Signs transaction to SPLIT CONTRACT
    → Contract auto-sends 90% to dev wallet, 10% to store wallet
    → Backend receives webhook confirmation
    → User gets download/install access
```

**Pros:**
- Instant settlement (no 30-day holds like Apple/Google)
- Automatic split — no manual payouts ever
- Low fees (~$0.001 per tx)
- No chargebacks/refunds possible on-chain
- Works globally, no bank needed

**Cons:**
- Users need crypto wallet
- Price volatility (can use USDC stablecoin)

### Option B: BTCPay Server Split Payments
```
User clicks "Buy $X"
    → BTCPay generates invoice
    → User pays BTC/Lightning
    → BTCPay auto-splits to configured wallets
    → Webhook confirms payment
    → User gets access
```

**Pros:**
- Self-hosted, no third party
- Bitcoin + Lightning support
- Split payments built-in

**Cons:**
- More complex setup
- BTC volatility

### Option C: Hybrid (Stripe + Manual Crypto Option)
Not recommended — Stripe takes 2.9% + can freeze funds

---

## Recommended Implementation: Solana Pay + USDC

### Why Solana + USDC:
1. **USDC = stable** — pegged to $1, no volatility
2. **Instant splits** — smart contract handles it
3. **No middleman** — direct wallet-to-wallet
4. **Low fees** — ~$0.001 per transaction
5. **No chargebacks** — blockchain is final
6. **Global** — works anywhere, no bank required

### Developer Onboarding:
1. Developer submits app via omarchystore.com/submit
2. Enters their Solana wallet address (for USDC payments)
3. Sets price in USD
4. We review & approve
5. App goes live with "Buy" button
6. Every purchase auto-splits 90/10

### Store Wallet:
- Create dedicated Solana wallet for store revenue
- Public address in config (transparency)
- You control private keys in cold storage

### Smart Contract:
Simple Solana program that:
1. Receives payment amount
2. Calculates 90/10 split
3. Transfers 90% to dev_wallet (from app listing)
4. Transfers 10% to store_wallet (hardcoded)
5. Emits event for backend webhook

---

## No Refunds Policy

Clearly stated at checkout:
> "All purchases are final. By completing this purchase, you acknowledge that digital goods are non-refundable. The developer receives payment immediately upon purchase."

This is standard for:
- Steam (no refund after 2 hours / 14 days)
- Most crypto/Web3 stores (blockchain = final)
- Many indie game stores

---

## Developer Attraction Strategy

### Value Proposition:
- **90% revenue share** (vs Apple/Google's 70%)
- **Instant payouts** (vs 30-60 day holds)
- **No $99/year fee** (vs Apple Developer Program)
- **Featured placement** for quality apps
- **Built-in audience** of Omarchy/Linux users
- **Marketing support** — we promote on social

### Outreach Channels:
1. r/linux, r/opensource, r/unixporn — "Looking for Linux app developers"
2. GitHub Discussions on popular Linux tools
3. Direct outreach to theme/icon pack creators
4. Omarchy Discord/community
5. Linux YouTubers who make tools

### Submit Page Features:
- App name, description, screenshots
- GitHub repo (for open source) or binary upload
- Price (free or $X)
- Developer Solana wallet address
- License type
- Contact email

---

## Implementation Steps

### Phase 1: Backend (This Week)
1. [ ] Create Solana wallet for store
2. [ ] Write split-payment smart contract
3. [ ] Deploy to Solana devnet for testing
4. [ ] Add payment endpoints to Cloudflare Worker

### Phase 2: Frontend (Next Week)  
1. [ ] Add "Buy" button to paid app listings
2. [ ] Wallet connect modal (Phantom, etc.)
3. [ ] Purchase confirmation flow
4. [ ] Download/install access after payment

### Phase 3: Developer Portal
1. [ ] Enhanced /submit page with pricing
2. [ ] Developer dashboard (sales, earnings)
3. [ ] Payout history (on-chain, verifiable)

### Phase 4: Launch
1. [ ] Announce developer program on social
2. [ ] Reach out to theme/icon creators
3. [ ] First paid apps go live

---

## Questions to Decide:
1. **Minimum price?** ($1? $0.99? $5?)
2. **Free trial option?** (X days free, then pay?)
3. **Subscription model?** (monthly/yearly for some apps?)
4. **Exclusive apps?** (only on Omarchy Store?)
