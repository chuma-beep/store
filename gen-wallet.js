const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

const keypair = Keypair.generate();
const publicKey = keypair.publicKey.toBase58();
const secretKey = Array.from(keypair.secretKey);

console.log('=== OMARCHY STORE WALLET ===');
console.log('');
console.log('PUBLIC ADDRESS (safe to share):');
console.log(publicKey);
console.log('');
console.log('PRIVATE KEY (KEEP SECRET):');
console.log(JSON.stringify(secretKey));

// Save to secure location
const walletPath = process.env.HOME + '/.config/omarchy-store/wallet.json';
fs.mkdirSync(process.env.HOME + '/.config/omarchy-store', { recursive: true });
fs.writeFileSync(walletPath, JSON.stringify({ publicKey, secretKey }, null, 2), { mode: 0o600 });
console.log('');
console.log('Saved to:', walletPath);
