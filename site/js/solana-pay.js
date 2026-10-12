/**
 * Omarchy Store - Solana Pay Integration
 * 
 * Supports: Phantom, Solflare, Backpack, and any Solana wallet
 * Payment: USDC (SPL token) with automatic 90/10 split
 */

// Solana constants
const SOLANA_NETWORK = 'mainnet-beta';  // Change to 'devnet' for testing
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';  // Mainnet USDC
const USDC_DECIMALS = 6;
const STORE_WALLET = '13XS2jdwJKZbvj8KcuJwgKcysea5y5nrQe8N5maKoaUU';  // Omarchy Store wallet

// Detect available wallets
function getAvailableWallets() {
  const wallets = [];
  
  if (window.phantom?.solana?.isPhantom) {
    wallets.push({
      name: 'Phantom',
      icon: 'https://phantom.app/img/logo.png',
      provider: window.phantom.solana
    });
  }
  
  if (window.solflare?.isSolflare) {
    wallets.push({
      name: 'Solflare',
      icon: 'https://solflare.com/favicon.ico',
      provider: window.solflare
    });
  }
  
  if (window.backpack?.isBackpack) {
    wallets.push({
      name: 'Backpack',
      icon: 'https://backpack.app/favicon.ico',
      provider: window.backpack
    });
  }
  
  // Generic injected wallet
  if (window.solana && !wallets.length) {
    wallets.push({
      name: 'Solana Wallet',
      icon: null,
      provider: window.solana
    });
  }
  
  return wallets;
}

// Connect to wallet
async function connectWallet(provider) {
  try {
    const resp = await provider.connect();
    return resp.publicKey.toString();
  } catch (err) {
    console.error('Wallet connection failed:', err);
    throw new Error('Failed to connect wallet');
  }
}

// Create split payment transaction
async function createSplitPaymentTransaction(buyerPubkey, developerWallet, amountUSDC) {
  // Import Solana web3.js from CDN (loaded separately)
  const { Connection, PublicKey, Transaction, SystemProgram } = solanaWeb3;
  const { createTransferInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = splToken;
  
  const connection = new Connection(`https://api.${SOLANA_NETWORK}.solana.com`);
  
  const buyer = new PublicKey(buyerPubkey);
  const developer = new PublicKey(developerWallet);
  const store = new PublicKey(STORE_WALLET);
  const usdcMint = new PublicKey(USDC_MINT);
  
  // Calculate split (USDC has 6 decimals)
  const totalLamports = Math.floor(amountUSDC * Math.pow(10, USDC_DECIMALS));
  const devShare = Math.floor(totalLamports * 0.90);   // 90% to developer
  const storeShare = totalLamports - devShare;          // 10% to store
  
  // Get associated token accounts
  const buyerATA = await getAssociatedTokenAddress(usdcMint, buyer);
  const devATA = await getAssociatedTokenAddress(usdcMint, developer);
  const storeATA = await getAssociatedTokenAddress(usdcMint, store);
  
  // Build transaction with TWO transfers in ONE atomic tx
  const tx = new Transaction();
  
  // Transfer 90% to developer
  tx.add(createTransferInstruction(
    buyerATA,
    devATA,
    buyer,
    devShare,
    [],
    TOKEN_PROGRAM_ID
  ));
  
  // Transfer 10% to store
  tx.add(createTransferInstruction(
    buyerATA,
    storeATA,
    buyer,
    storeShare,
    [],
    TOKEN_PROGRAM_ID
  ));
  
  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = buyer;
  
  return tx;
}

// Main payment function
async function purchaseApp(appId, price, developerWallet) {
  // Check for wallets
  const wallets = getAvailableWallets();
  
  if (wallets.length === 0) {
    // No wallet found - show install options
    showWalletInstallModal();
    return;
  }
  
  // If multiple wallets, let user choose
  let selectedWallet;
  if (wallets.length === 1) {
    selectedWallet = wallets[0];
  } else {
    selectedWallet = await showWalletSelectModal(wallets);
    if (!selectedWallet) return;  // User cancelled
  }
  
  try {
    // Connect wallet
    const buyerPubkey = await connectWallet(selectedWallet.provider);
    
    // Create transaction
    const tx = await createSplitPaymentTransaction(buyerPubkey, developerWallet, price);
    
    // Sign with wallet
    const signedTx = await selectedWallet.provider.signTransaction(tx);
    
    // Send transaction
    const connection = new solanaWeb3.Connection(`https://api.${SOLANA_NETWORK}.solana.com`);
    const signature = await connection.sendRawTransaction(signedTx.serialize());
    
    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');
    
    // Record purchase
    await recordPurchase(appId, signature, buyerPubkey);
    
    // Show success and download
    showPurchaseSuccess(appId, signature);
    
  } catch (err) {
    console.error('Purchase failed:', err);
    showPurchaseError(err.message);
  }
}

// Show wallet installation options
function showWalletInstallModal() {
  const modal = document.createElement('div');
  modal.className = 'wallet-modal';
  modal.innerHTML = `
    <div class="wallet-modal-content">
      <h2>Install a Solana Wallet</h2>
      <p>To purchase apps, you need a Solana wallet with USDC.</p>
      <div class="wallet-options">
        <a href="https://phantom.app/" target="_blank" class="wallet-option">
          <img src="https://phantom.app/img/logo.png" alt="Phantom">
          <span>Phantom</span>
          <small>Most popular</small>
        </a>
        <a href="https://solflare.com/" target="_blank" class="wallet-option">
          <img src="https://solflare.com/favicon.ico" alt="Solflare">
          <span>Solflare</span>
        </a>
        <a href="https://backpack.app/" target="_blank" class="wallet-option">
          <img src="https://backpack.app/favicon.ico" alt="Backpack">
          <span>Backpack</span>
        </a>
      </div>
      <button onclick="this.closest('.wallet-modal').remove()">Close</button>
    </div>
  `;
  document.body.appendChild(modal);
}

// Show wallet selection modal
function showWalletSelectModal(wallets) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'wallet-modal';
    modal.innerHTML = `
      <div class="wallet-modal-content">
        <h2>Select Wallet</h2>
        <div class="wallet-options">
          ${wallets.map((w, i) => `
            <button class="wallet-option" data-index="${i}">
              ${w.icon ? `<img src="${w.icon}" alt="${w.name}">` : ''}
              <span>${w.name}</span>
            </button>
          `).join('')}
        </div>
        <button class="cancel-btn" onclick="this.closest('.wallet-modal').remove()">Cancel</button>
      </div>
    `;
    
    modal.querySelectorAll('.wallet-option').forEach(btn => {
      btn.onclick = () => {
        const index = parseInt(btn.dataset.index);
        modal.remove();
        resolve(wallets[index]);
      };
    });
    
    modal.querySelector('.cancel-btn').onclick = () => {
      modal.remove();
      resolve(null);
    };
    
    document.body.appendChild(modal);
  });
}

// Record purchase to backend
async function recordPurchase(appId, signature, buyer) {
  // For now, just store in localStorage
  // TODO: Backend verification
  const purchases = JSON.parse(localStorage.getItem('omarchy_purchases') || '{}');
  purchases[appId] = {
    signature,
    buyer,
    timestamp: Date.now()
  };
  localStorage.setItem('omarchy_purchases', JSON.stringify(purchases));
}

// Check if user has purchased an app
function hasPurchased(appId) {
  const purchases = JSON.parse(localStorage.getItem('omarchy_purchases') || '{}');
  return !!purchases[appId];
}

// Show purchase success
function showPurchaseSuccess(appId, signature) {
  const modal = document.createElement('div');
  modal.className = 'wallet-modal success';
  modal.innerHTML = `
    <div class="wallet-modal-content">
      <h2>✓ Purchase Complete!</h2>
      <p>Your payment has been confirmed on the blockchain.</p>
      <p class="signature">
        <a href="https://solscan.io/tx/${signature}" target="_blank">View transaction</a>
      </p>
      <button onclick="location.href='/download/${appId}'" class="download-btn">Download App</button>
      <button onclick="this.closest('.wallet-modal').remove()">Close</button>
    </div>
  `;
  document.body.appendChild(modal);
}

// Show purchase error
function showPurchaseError(message) {
  const modal = document.createElement('div');
  modal.className = 'wallet-modal error';
  modal.innerHTML = `
    <div class="wallet-modal-content">
      <h2>Payment Failed</h2>
      <p>${message}</p>
      <p>No funds were transferred. Please try again.</p>
      <button onclick="this.closest('.wallet-modal').remove()">Close</button>
    </div>
  `;
  document.body.appendChild(modal);
}

// Export for use
window.OmarchyPay = {
  getAvailableWallets,
  connectWallet,
  purchaseApp,
  hasPurchased
};
