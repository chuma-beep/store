/**
 * Omarchy Store - QR Code Scanner
 * 
 * Scans crypto wallet addresses from QR codes using the device camera.
 * Uses the native BarcodeDetector API where available, with jsQR fallback.
 */

(function() {
  'use strict';

  // Check for camera support
  const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  
  // Check for native BarcodeDetector (Chrome/Edge 83+, Opera, Android WebView)
  const hasBarcodeDetector = 'BarcodeDetector' in window;
  
  // jsQR library loaded lazily when needed
  let jsQR = null;
  const JSQR_CDN = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';

  /**
   * Load jsQR library on demand
   */
  async function loadJsQR() {
    if (jsQR) return jsQR;
    if (window.jsQR) { jsQR = window.jsQR; return jsQR; }
    
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = JSQR_CDN;
      script.onload = () => { jsQR = window.jsQR; resolve(jsQR); };
      script.onerror = () => reject(new Error('Failed to load QR scanner library'));
      document.head.appendChild(script);
    });
  }

  /**
   * Create and show the scanner modal
   */
  function createScannerModal(onResult, onClose) {
    const modal = document.createElement('div');
    modal.className = 'qr-scanner-modal';
    modal.innerHTML = `
      <div class="qr-scanner-content">
        <div class="qr-scanner-header">
          <h2>Scan Wallet QR Code</h2>
          <button class="qr-close-btn" aria-label="Close">&times;</button>
        </div>
        <div class="qr-scanner-body">
          <div class="qr-video-container">
            <video class="qr-video" playsinline autoplay muted></video>
            <canvas class="qr-canvas" hidden></canvas>
            <div class="qr-overlay">
              <div class="qr-frame"></div>
            </div>
            <div class="qr-status">Accessing camera...</div>
          </div>
          <p class="qr-hint">Point your camera at a wallet address QR code</p>
        </div>
        <div class="qr-scanner-footer">
          <button class="qr-switch-btn" hidden>Switch Camera</button>
        </div>
      </div>
    `;

    // Add styles if not already present
    if (!document.getElementById('qr-scanner-styles')) {
      const styles = document.createElement('style');
      styles.id = 'qr-scanner-styles';
      styles.textContent = `
        .qr-scanner-modal {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: qr-fade-in 0.2s ease;
        }
        @keyframes qr-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .qr-scanner-content {
          background: var(--card, #1a1b2e);
          border-radius: 20px;
          width: 100%;
          max-width: 420px;
          overflow: hidden;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        }
        .qr-scanner-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--line, #2e3150);
        }
        .qr-scanner-header h2 {
          margin: 0;
          font-size: 18px;
          color: var(--text, #eef0ff);
        }
        .qr-close-btn {
          background: none;
          border: none;
          font-size: 28px;
          color: var(--t2, #a9adcf);
          cursor: pointer;
          padding: 0;
          line-height: 1;
          transition: color 0.15s;
        }
        .qr-close-btn:hover {
          color: var(--text, #eef0ff);
        }
        .qr-scanner-body {
          padding: 20px;
        }
        .qr-video-container {
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          background: #000;
          border-radius: 12px;
          overflow: hidden;
        }
        .qr-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .qr-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .qr-frame {
          width: 65%;
          aspect-ratio: 1;
          border: 3px solid var(--accent, #7aa2f7);
          border-radius: 16px;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.4);
          animation: qr-pulse 2s ease-in-out infinite;
        }
        @keyframes qr-pulse {
          0%, 100% { border-color: var(--accent, #7aa2f7); }
          50% { border-color: var(--good, #9ece6a); }
        }
        .qr-status {
          position: absolute;
          bottom: 12px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.7);
          color: #fff;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          white-space: nowrap;
        }
        .qr-status.error {
          background: var(--bad, #f7768e);
        }
        .qr-status.success {
          background: var(--good, #9ece6a);
          color: #000;
        }
        .qr-hint {
          text-align: center;
          color: var(--t2, #a9adcf);
          font-size: 14px;
          margin: 14px 0 0;
        }
        .qr-scanner-footer {
          padding: 0 20px 20px;
          display: flex;
          justify-content: center;
        }
        .qr-switch-btn {
          background: var(--card2, #23253d);
          color: var(--text, #eef0ff);
          border: none;
          padding: 10px 20px;
          border-radius: 999px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .qr-switch-btn:hover {
          background: var(--line, #2e3150);
        }
        .qr-scan-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          background: var(--card2, #23253d);
          border: none;
          border-radius: 8px;
          color: var(--accent, #7aa2f7);
          font-size: 13px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .qr-scan-btn:hover {
          background: var(--line, #2e3150);
        }
        .qr-scan-btn svg {
          width: 18px;
          height: 18px;
        }
        /* Input wrapper for scan button */
        .wallet-input-wrap {
          display: flex;
          gap: 8px;
          align-items: stretch;
        }
        .wallet-input-wrap input {
          flex: 1;
          min-width: 0;
        }
      `;
      document.head.appendChild(styles);
    }

    document.body.appendChild(modal);

    const video = modal.querySelector('.qr-video');
    const canvas = modal.querySelector('.qr-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const status = modal.querySelector('.qr-status');
    const switchBtn = modal.querySelector('.qr-switch-btn');
    const closeBtn = modal.querySelector('.qr-close-btn');

    let stream = null;
    let scanning = true;
    let facingMode = 'environment'; // Start with back camera
    let cameras = [];

    // Close handler
    function close() {
      scanning = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      modal.remove();
      if (onClose) onClose();
    }

    closeBtn.onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };

    // Escape key closes
    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);
    modal.addEventListener('remove', () => document.removeEventListener('keydown', escHandler));

    // Start camera
    async function startCamera() {
      try {
        // Get list of cameras
        const devices = await navigator.mediaDevices.enumerateDevices();
        cameras = devices.filter(d => d.kind === 'videoinput');
        
        if (cameras.length > 1) {
          switchBtn.hidden = false;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingMode,
            width: { ideal: 1280 },
            height: { ideal: 1280 }
          },
          audio: false
        });

        video.srcObject = stream;
        await video.play();
        
        // Set canvas to video size
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        status.textContent = 'Scanning...';
        status.className = 'qr-status';
        
        // Start scanning loop
        scan();
      } catch (err) {
        console.error('Camera error:', err);
        status.textContent = err.name === 'NotAllowedError' 
          ? 'Camera access denied' 
          : 'Could not access camera';
        status.className = 'qr-status error';
      }
    }

    // Switch camera
    switchBtn.onclick = async () => {
      facingMode = facingMode === 'environment' ? 'user' : 'environment';
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      await startCamera();
    };

    // Scan for QR codes
    async function scan() {
      if (!scanning) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.drawImage(video, 0, 0);
        
        try {
          let result = null;

          // Try native BarcodeDetector first (faster, more accurate)
          if (hasBarcodeDetector) {
            const detector = new BarcodeDetector({ formats: ['qr_code'] });
            const codes = await detector.detect(canvas);
            if (codes.length > 0) {
              result = codes[0].rawValue;
            }
          } else {
            // Fallback to jsQR
            if (!jsQR) await loadJsQR();
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, canvas.width, canvas.height, {
              inversionAttempts: 'dontInvert'
            });
            if (code) {
              result = code.data;
            }
          }

          if (result) {
            // Parse the result - handle various formats
            const address = parseWalletAddress(result);
            
            if (address) {
              scanning = false;
              status.textContent = 'Found!';
              status.className = 'qr-status success';
              
              // Brief delay to show success
              setTimeout(() => {
                close();
                if (onResult) onResult(address);
              }, 400);
              return;
            }
          }
        } catch (err) {
          // BarcodeDetector can throw, just continue scanning
        }
      }

      // Continue scanning
      if (scanning) {
        requestAnimationFrame(scan);
      }
    }

    startCamera();
    return modal;
  }

  /**
   * Parse wallet address from QR code data
   * Handles various formats: raw address, URI schemes, etc.
   */
  function parseWalletAddress(data) {
    if (!data || typeof data !== 'string') return null;
    
    data = data.trim();

    // Solana Pay URI: solana:<address>?...
    if (data.startsWith('solana:')) {
      const match = data.match(/^solana:([1-9A-HJ-NP-Za-km-z]{32,44})/);
      if (match) return { address: match[1], chain: 'sol' };
    }

    // Bitcoin URI: bitcoin:<address>?...
    if (data.startsWith('bitcoin:')) {
      const match = data.match(/^bitcoin:([13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})/i);
      if (match) return { address: match[1], chain: 'btc' };
    }

    // Ethereum URI: ethereum:<address>@<chainId>?... or ethereum:<address>?...
    if (data.startsWith('ethereum:')) {
      const match = data.match(/^ethereum:(0x[a-fA-F0-9]{40})/);
      if (match) return { address: match[1], chain: 'evm' };
    }

    // XRP URI: xrp:<address>?... or ripple:<address>?...
    if (data.startsWith('xrp:') || data.startsWith('ripple:')) {
      const match = data.match(/^(?:xrp|ripple):([rR][1-9A-HJ-NP-Za-km-z]{25,34})/);
      if (match) return { address: match[1], chain: 'xrp' };
    }

    // Raw addresses
    // Solana: base58, 32-44 chars
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(data)) {
      return { address: data, chain: 'sol' };
    }

    // Ethereum/Base: 0x + 40 hex chars
    if (/^0x[a-fA-F0-9]{40}$/i.test(data)) {
      return { address: data, chain: 'evm' };
    }

    // Bitcoin legacy: starts with 1 or 3, 26-35 chars
    if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(data)) {
      return { address: data, chain: 'btc' };
    }

    // Bitcoin bech32: starts with bc1
    if (/^bc1[a-z0-9]{39,59}$/i.test(data)) {
      return { address: data, chain: 'btc' };
    }

    // XRP: starts with r
    if (/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(data)) {
      return { address: data, chain: 'xrp' };
    }

    // Unknown format - return raw if it looks like it could be an address
    if (/^[a-zA-Z0-9]{25,64}$/.test(data)) {
      return { address: data, chain: 'unknown' };
    }

    return null;
  }

  /**
   * Create a scan button to attach to an input
   */
  function createScanButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qr-scan-btn';
    btn.title = 'Scan QR code';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="3" height="3"/>
        <path d="M17 17h4v4"/>
        <path d="M14 21h3"/>
        <path d="M21 14v3"/>
      </svg>
    `;
    return btn;
  }

  /**
   * Wrap an input with a scan button
   */
  function wrapInputWithScanner(input, chainHint) {
    if (!hasCamera) return; // No camera support
    if (input.dataset.qrWrapped) return; // Already wrapped
    
    input.dataset.qrWrapped = 'true';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'wallet-input-wrap';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    
    const btn = createScanButton();
    wrapper.appendChild(btn);
    
    btn.onclick = () => {
      createScannerModal((result) => {
        input.value = result.address;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Visual feedback
        input.style.transition = 'background 0.3s';
        input.style.background = 'rgba(158, 206, 106, 0.2)';
        setTimeout(() => { input.style.background = ''; }, 1000);
      });
    };
  }

  /**
   * Initialize QR scanner on wallet inputs
   * Looks for inputs with name starting with "p_" (p_evm, p_sol, p_btc, p_xrp)
   */
  function initWalletInputs() {
    if (!hasCamera) return;
    
    const inputs = document.querySelectorAll('input[name^="p_"]');
    inputs.forEach(input => {
      const chain = input.name.replace('p_', '');
      wrapInputWithScanner(input, chain);
    });
  }

  /**
   * Open scanner and return a promise with the result
   */
  function scanQRCode() {
    return new Promise((resolve, reject) => {
      if (!hasCamera) {
        reject(new Error('Camera not available'));
        return;
      }
      
      createScannerModal(
        (result) => resolve(result),
        () => reject(new Error('Scanner closed'))
      );
    });
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWalletInputs);
  } else {
    initWalletInputs();
  }

  // Re-initialize when new forms are added (SPA navigation)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        setTimeout(initWalletInputs, 100);
        break;
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Export API
  window.OmarchyQR = {
    scan: scanQRCode,
    parseAddress: parseWalletAddress,
    wrapInput: wrapInputWithScanner,
    isSupported: hasCamera
  };

})();
