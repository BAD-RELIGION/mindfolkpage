const VALIDATOR_VOTE_ACCOUNT = 'MFLKX9vSfWXa4ZcVVpp4GF64ZbNUiX9EjSqtqNMdFXB';
const MINDSOL_MINT = 'MiNdUFmqL5XyTBpqcfDzgySwKwdqEzunG2rfJMKb3bD';

(() => {
  const MAX_ATTEMPTS = 60;
  const RETRY_DELAY_MS = 200;

  window.solanaWeb3LoadFailed = false;

  document.addEventListener(
    'click',
    (ev) => {
      if (!window.solanaWeb3LoadFailed) return;
      const t = ev.target.closest('[data-connect-wallet]');
      if (t && !t.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        alert('Wallet libraries failed to load. Check your network, disable blockers for this site, then refresh the page.');
      }
    },
    true
  );

  function resolveWeb3() {
    if (typeof window === 'undefined') return undefined;
    const candidates = [
      window.solanaWeb3,
      typeof solanaWeb3 !== 'undefined' ? solanaWeb3 : null,
      (() => {
        const script = document.getElementById('solana-web3-script');
        const globalName = script?.getAttribute?.('data-global');
        return globalName && window[globalName] ? window[globalName] : null;
      })(),
      window.solana?.Web3
    ];
    for (const c of candidates) {
      if (c && typeof c.Connection === 'function' && typeof c.PublicKey === 'function') {
        return c;
      }
    }
    return undefined;
  }

  function waitForWeb3(attempt = 0) {
    const web3 = resolveWeb3();
    if (web3) {
      window.solanaWeb3 = web3;
      const run = () => initStaking(web3);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
      } else {
        run();
      }
      return;
    }
    if (attempt >= MAX_ATTEMPTS) {
      console.error('Solana web3 library failed to load.');
      window.solanaWeb3LoadFailed = true;
      return;
    }
    setTimeout(() => waitForWeb3(attempt + 1), RETRY_DELAY_MS);
  }

  waitForWeb3();

  function initStaking(web3) {
    const stakingSection = document.getElementById('staking');
    if (!stakingSection) return;

    function getHeliusRpcUrl() {
      try {
        const k =
          (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.HELIUS_API_KEY) ||
          (typeof localStorage !== 'undefined' && localStorage.getItem('helius_api_key')) ||
          '';
        const trimmed = String(k || '').trim();
        if (!trimmed) return null;
        return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(trimmed)}`;
      } catch (e) {
        return null;
      }
    }

    const HELIUS_RPC = getHeliusRpcUrl();
    const WRITE_RPC = HELIUS_RPC || 'https://api.mainnet-beta.solana.com';

    // Same @solana/web3.js build the MWA stack resolves (see connectSolanaMobileWalletInner deps).
    // Building stake txs with the page IIFE web3 while the adapter signs an esm-bundled Transaction
    // often yields "Missing signature" / verify failures.
    let esmWeb3ForMobile = null;
    async function loadEsmWeb3ForMobile() {
      if (esmWeb3ForMobile) return esmWeb3ForMobile;
      const mod = await import('https://esm.sh/@solana/web3.js@1.98.4');
      const w = mod.default && typeof mod.default.Transaction === 'function' ? mod.default : mod;
      esmWeb3ForMobile = w;
      return esmWeb3ForMobile;
    }

    // Connection for all operations (Helius if configured; otherwise public RPC)
    const writeConnection = new web3.Connection(WRITE_RPC, 'confirmed');

    // Wallet detection
    function isSolanaMobileEnvironment() {
      try {
        return (
          typeof window !== 'undefined' &&
          window.isSecureContext === true &&
          /android/i.test(navigator.userAgent || '')
        );
      } catch (_) {
        return false;
      }
    }

    function getWalletProvider(walletName) {
      switch (walletName) {
        case 'solanaMobile':
          return null;
        case 'phantom':
          // Phantom injects as window.solana with isPhantom flag
          if (window.solana?.isPhantom) return window.solana;
          if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
          return null;
        case 'solflare':
          // Solflare can be window.solflare or window.solana with isSolflare
          if (window.solflare) return window.solflare;
          if (window.solana?.isSolflare) return window.solana;
          // Some versions inject as window.solflare.solana
          if (window.solflare?.solana) return window.solflare.solana;
          return null;
        case 'backpack':
          // Backpack injects as window.backpack.solana or window.solana with isBackpack
          if (window.backpack?.solana) return window.backpack.solana;
          if (window.solana?.isBackpack) return window.solana;
          return null;
        default:
          return null;
      }
    }

    function detectAvailableWallets() {
      const available = [];
      if (isSolanaMobileEnvironment()) available.push('solanaMobile');
      if (getWalletProvider('phantom')) available.push('phantom');
      if (getWalletProvider('solflare')) available.push('solflare');
      if (getWalletProvider('backpack')) available.push('backpack');
      return available;
    }

    const nativePanel = stakingSection.querySelector('[data-panel="native"]');
    const toggleButtons = Array.from(stakingSection.querySelectorAll('.staking-toggle-btn'));
    const panels = Array.from(stakingSection.querySelectorAll('.staking-panel'));

    if (!nativePanel) return;

    const amountInput = nativePanel.querySelector('#nativeAmount');
    const quickButtons = Array.from(nativePanel.querySelectorAll('[data-quick-amount]'));
    const balanceEl = nativePanel.querySelector('[data-wallet-balance]');
    const connectButton = stakingSection.querySelector('[data-connect-wallet]');
    const disconnectButton = stakingSection.querySelector('[data-disconnect-wallet]');
    const submitButton = nativePanel.querySelector('[data-submit-stake]');
    const feedbackEl = stakingSection.querySelector('[data-feedback]');
    const summaryAmountEl = nativePanel.querySelector('[data-summary-amount]');
    const summaryRewardEl = nativePanel.querySelector('[data-summary-reward]');
    const rentFeeEl = nativePanel.querySelector('[data-rent-fee]');
    const rentAmountEl = nativePanel.querySelector('[data-rent-amount]');
    const totalCostEl = nativePanel.querySelector('[data-total-cost]');
    const totalAmountEl = nativePanel.querySelector('[data-total-amount]');
    const summaryValidatorEl = nativePanel.querySelector('[data-summary-validator]');
    const validatorDisplayEl = nativePanel.querySelector('[data-validator-display]');
    const usdConversionEl = nativePanel.querySelector('[data-usd-conversion]');
    const walletModal = document.getElementById('walletModal');
    const walletModalBackdrop = document.getElementById('walletModalBackdrop');
    const walletGrid = document.getElementById('walletGrid');
    const unstakingSection = nativePanel.querySelector('[data-unstaking-section]');
    const totalStakedEl = nativePanel.querySelector('[data-total-staked]');
    const unstakeBtn = nativePanel.querySelector('[data-unstake-btn]');
    const unstakingFeedbackEl = nativePanel.querySelector('[data-unstaking-feedback]');
    const refreshStakesBtn = nativePanel.querySelector('[data-refresh-stakes]');

    if (!amountInput || !connectButton || !disconnectButton || !submitButton || !feedbackEl || !summaryAmountEl || !summaryRewardEl || !balanceEl) {
      console.warn('staking preview: missing required DOM nodes');
      return;
    }

    if (validatorDisplayEl) validatorDisplayEl.textContent = VALIDATOR_VOTE_ACCOUNT;
    summaryValidatorEl?.textContent && (summaryValidatorEl.textContent = summaryValidatorEl.textContent);

    const STATE = {
      wallet: null,
      balanceLamports: 0,
      connecting: false,
      submitting: false,
      unstaking: false,
      listenersBound: false,
      solPriceUsd: 0,
      rentExemptLamports: null,
      currentProvider: null,
      currentWalletName: null,
      stakeAccounts: [],
      totalStakedLamports: 0,
      priceIntervalId: null, // Store interval ID for cleanup
      activeTimeouts: [] // Store timeout IDs for cleanup
    };

    const APY_NATIVE = parseFloat(nativePanel.dataset.apy || '0');
    const liquidPanel = stakingSection.querySelector('[data-panel="liquid"]');

    function formatSol(value, decimals = 4) {
      if (!Number.isFinite(value) || value <= 0) return '0';
      return Number(value).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals
      });
    }

    function setFeedback(message, type = 'info') {
      feedbackEl.textContent = '';
      const inWalletStrip = Boolean(feedbackEl.closest('.staking-wallet-strip'));
      feedbackEl.className = inWalletStrip ? 'staking-feedback mb-0' : 'staking-feedback mb-3';
      if (!message) return;
      feedbackEl.textContent = message;
      feedbackEl.classList.add(`staking-feedback--${type}`);
    }

    function setUnstakingFeedback(message, type = 'info') {
      if (!unstakingFeedbackEl) return;
      unstakingFeedbackEl.textContent = '';
      unstakingFeedbackEl.className = 'unstaking-feedback mb-3';
      if (!message) return;
      unstakingFeedbackEl.textContent = message;
      unstakingFeedbackEl.classList.add(`staking-feedback--${type}`);
    }

    async function updateSummary() {
      const amount = parseFloat(amountInput.value);
      const cleanAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
      const apyReward = cleanAmount * APY_NATIVE;
      summaryAmountEl.textContent = `${formatSol(cleanAmount)} SOL`;
      summaryRewardEl.textContent = `${formatSol(apyReward, 5)} SOL`;
      summaryValidatorEl?.textContent && (summaryValidatorEl.textContent = summaryValidatorEl.textContent);
      
      // Update USD conversion
      if (usdConversionEl && STATE.solPriceUsd > 0) {
        const usdValue = cleanAmount * STATE.solPriceUsd;
        usdConversionEl.textContent = `≈ $${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else if (usdConversionEl) {
        usdConversionEl.textContent = '≈ $0.00';
      }
      
      // Update rent fee and total cost if amount > 0
      if (cleanAmount > 0 && rentFeeEl && rentAmountEl && totalCostEl && totalAmountEl) {
        try {
          // Fetch rent exemption amount (use cached value if available, or fetch it)
          if (!STATE.rentExemptLamports) {
            STATE.rentExemptLamports = await writeConnection.getMinimumBalanceForRentExemption(web3.StakeProgram.space, 'confirmed');
          }
          const rentSol = STATE.rentExemptLamports / web3.LAMPORTS_PER_SOL;
          const totalSol = cleanAmount + rentSol;
          
          rentAmountEl.textContent = `~${formatSol(rentSol, 5)} SOL`;
          totalAmountEl.textContent = `${formatSol(totalSol, 5)} SOL`;
          
          // Show rent fee and total cost
          rentFeeEl.style.display = 'flex';
          totalCostEl.style.display = 'flex';
        } catch (err) {
          console.warn('Failed to fetch rent exemption:', err);
          // Use approximate value if fetch fails
          const approxRent = 0.00228;
          const totalSol = cleanAmount + approxRent;
          rentAmountEl.textContent = `~${formatSol(approxRent, 5)} SOL`;
          totalAmountEl.textContent = `${formatSol(totalSol, 5)} SOL`;
          rentFeeEl.style.display = 'flex';
          totalCostEl.style.display = 'flex';
        }
      } else if (rentFeeEl && totalCostEl) {
        // Hide rent fee and total cost if amount is 0
        rentFeeEl.style.display = 'none';
        totalCostEl.style.display = 'none';
      }
    }

    function updateQuickButtons() {
      quickButtons.forEach((btn) => {
        const fraction = parseFloat(btn.dataset.quickAmount || '0');
        if (!Number.isFinite(fraction) || fraction <= 0) return;
        btn.disabled = !STATE.wallet || STATE.balanceLamports <= 0;
        if (!STATE.wallet || STATE.balanceLamports <= 0) {
          btn.title = 'Connect a wallet to use this shortcut.';
          return;
        }
        const lamports = STATE.balanceLamports * fraction;
        const sol = lamports / web3.LAMPORTS_PER_SOL;
        btn.title = `Use ${Math.round(fraction * 100)}% (~${formatSol(sol, 4)} SOL)`;
      });
    }

    function updateSubmitState() {
      const amount = parseFloat(amountInput.value);
      const hasAmount = Number.isFinite(amount) && amount > 0;
      submitButton.disabled = !(STATE.wallet && hasAmount && !STATE.submitting);
      
      // Change button color based on amount
      if (hasAmount && STATE.wallet && !STATE.submitting) {
        submitButton.classList.remove('btn-light');
        submitButton.classList.add('btn-warning');
      } else {
        submitButton.classList.remove('btn-warning');
        submitButton.classList.add('btn-light');
      }
    }

    function updateConnectButton() {
      const walletStrip = connectButton.closest('.staking-wallet-strip');
      connectButton.classList.remove('btn-warning', 'btn-outline-light', 'btn-secondary');
      disconnectButton.classList.add('d-none');
      walletStrip?.classList.remove('staking-wallet-strip--connected');

      if (STATE.wallet) {
        const walletName = getWalletDisplayName(STATE.currentWalletName || '');
        const shortKey = STATE.wallet.toBase58();
        connectButton.textContent = `Wallet: ${shortKey.slice(0, 4)}…${shortKey.slice(-4)}`;
        connectButton.disabled = STATE.connecting;
        connectButton.classList.add('btn-outline-light');
        disconnectButton.classList.remove('d-none');
        disconnectButton.disabled = STATE.connecting;
        walletStrip?.classList.add('staking-wallet-strip--connected');
        return;
      }

      if (STATE.connecting) {
        const walletName = getWalletDisplayName(STATE.currentWalletName || '');
        connectButton.textContent = `Connecting ${walletName}…`;
        connectButton.disabled = true;
        connectButton.classList.add('btn-warning');
        return;
      }

      connectButton.textContent = 'Connect Wallet';
      connectButton.disabled = false;
      connectButton.classList.add('btn-warning');
    }
    
    function getWalletDisplayName(walletName) {
      const names = {
        phantom: 'Phantom',
        solflare: 'Solflare',
        backpack: 'Backpack',
        solanaMobile: 'Solana Mobile Adapter'
      };
      return names[walletName] || walletName.charAt(0).toUpperCase() + walletName.slice(1).replace(/([A-Z])/g, ' $1');
    }
    
    function getWalletIcon(walletName) {
      const icons = {
        phantom: 'fa-solid fa-ghost',
        solflare: 'fa-solid fa-sun',
        backpack: 'fa-solid fa-bag-shopping',
        solanaMobile: 'fa-brands fa-android'
      };
      return icons[walletName] || 'fa-solid fa-wallet';
    }
    
    function getWalletLogoUrl(walletName) {
      // Using placeholder paths - user can replace with actual logo files
      const logos = {
        phantom: 'img/wallets/phantom.png',
        solflare: 'img/wallets/solflare.png',
        backpack: 'img/wallets/backpack.png',
        solanaMobile: 'img/wallets/solana-mobile-adapter.png'
      };
      return logos[walletName] || 'img/wallets/default.png';
    }
    
    function updateWalletIndicator() {
      const indicator = document.getElementById('walletIndicator');
      const icon = document.getElementById('walletIndicatorIcon');
      const name = document.getElementById('walletIndicatorName');
      const balance = document.getElementById('walletIndicatorBalance');
      
      if (!indicator || !icon || !name || !balance) return;
      
      if (STATE.wallet && STATE.currentWalletName) {
        const walletName = getWalletDisplayName(STATE.currentWalletName);
        const sol = STATE.balanceLamports / web3.LAMPORTS_PER_SOL;
        const shortKey = STATE.wallet.toBase58();
        
        icon.src = getWalletLogoUrl(STATE.currentWalletName);
        icon.alt = walletName;
        name.textContent = walletName;
        balance.textContent = `${formatSol(sol, 2)} SOL`;
        
        indicator.style.display = 'block';
        
        // Add click handler to disconnect wallet
        const walletIndicatorDiv = indicator.querySelector('.wallet-indicator');
        if (walletIndicatorDiv) {
          walletIndicatorDiv.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            disconnectWallet();
          };
          walletIndicatorDiv.title = 'Click to disconnect wallet';
        }
      } else {
        indicator.style.display = 'none';
      }
    }
    
    function populateWalletOptions() {
      if (!walletGrid) return;
      walletGrid.replaceChildren();
      
      const wallets = [];
      if (isSolanaMobileEnvironment()) {
        wallets.push({ id: 'solanaMobile', name: 'Solana Mobile Adapter', color: '#14F195' });
      }
      wallets.push(
        { id: 'phantom', name: 'Phantom', color: '#AB9FF2' },
        { id: 'solflare', name: 'Solflare', color: '#FFB800' },
        { id: 'backpack', name: 'Backpack', color: '#FF6B35' }
      );
      
      const available = detectAvailableWallets();
      
      wallets.forEach((wallet) => {
        const isAvailable = available.includes(wallet.id);
        const walletCard = document.createElement('button');
        walletCard.className = `wallet-option ${!isAvailable ? 'wallet-option-disabled' : ''}`;
        walletCard.type = 'button';
        walletCard.dataset.walletId = wallet.id;
        walletCard.disabled = !isAvailable;
        
        // Create wallet card with logo
        const logoImg = document.createElement('img');
        logoImg.src = getWalletLogoUrl(wallet.id);
        logoImg.alt = wallet.name;
        logoImg.className = 'wallet-option-logo';
        logoImg.onerror = function() {
          this.style.display = 'none';
          const fallback = this.nextElementSibling;
          if (fallback) fallback.style.display = 'flex';
        };
        
        const fallbackDiv = document.createElement('div');
        fallbackDiv.className = 'wallet-option-icon-fallback';
        fallbackDiv.style.cssText = 'display: none; background: linear-gradient(135deg, ' + wallet.color + '22, ' + wallet.color + '11); width: 100%; height: 100%; align-items: center; justify-content: center; border-radius: 12px;';
        const fallbackIcon = document.createElement('i');
        fallbackIcon.className = getWalletIcon(wallet.id);
        fallbackIcon.style.color = wallet.color;
        fallbackDiv.appendChild(fallbackIcon);
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'wallet-option-icon';
        iconDiv.appendChild(logoImg);
        iconDiv.appendChild(fallbackDiv);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'wallet-option-content';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'wallet-option-name';
        nameDiv.textContent = wallet.name;
        const statusDiv = document.createElement('div');
        statusDiv.className = 'wallet-option-status';
        statusDiv.textContent = isAvailable
          ? wallet.id === 'solanaMobile'
            ? 'Android / Seeker'
            : 'Detected'
          : 'Not installed';
        contentDiv.appendChild(nameDiv);
        contentDiv.appendChild(statusDiv);
        
        walletCard.appendChild(iconDiv);
        walletCard.appendChild(contentDiv);
        
        if (isAvailable) {
          const arrow = document.createElement('i');
          arrow.className = 'fa-solid fa-chevron-right wallet-option-arrow';
          walletCard.appendChild(arrow);
        }
        
        if (isAvailable) {
          walletCard.addEventListener('click', () => {
            closeWalletModal();
            connectToWallet(wallet.id);
          });
        }
        
        walletGrid.appendChild(walletCard);
      });
    }
    
    function openWalletModal() {
      if (!walletModal || !walletModalBackdrop) return;
      populateWalletOptions();
      walletModal.classList.add('wallet-modal-show');
      walletModalBackdrop.classList.add('wallet-modal-backdrop-show');
      document.body.style.overflow = 'hidden';
    }
    
    function closeWalletModal() {
      if (!walletModal || !walletModalBackdrop) return;
      walletModal.classList.remove('wallet-modal-show');
      walletModalBackdrop.classList.remove('wallet-modal-backdrop-show');
      document.body.style.overflow = '';
    }
    
    function connectToWallet(walletId) {
      STATE.currentWalletName = walletId;
      connectWallet();
    }

    async function refreshBalance() {
      if (!STATE.wallet) return;
      try {
        // Use Helius directly (public RPC often returns 403)
        const lamports = await writeConnection.getBalance(STATE.wallet, 'confirmed');
        STATE.balanceLamports = lamports;
        updateQuickButtons();
        const sol = lamports / web3.LAMPORTS_PER_SOL;
        balanceEl.hidden = false;
        const balanceText = balanceEl.querySelector('.staking-balance__text');
        const balStr = `Balance: ${formatSol(sol, 4)} SOL`;
        if (balanceText) balanceText.textContent = balStr;
        else balanceEl.textContent = balStr;
        updateWalletIndicator();
        // Refresh stake accounts asynchronously without blocking
        refreshStakeAccounts().catch(err => {
          console.warn('Stake accounts refresh failed (non-blocking):', err);
        });
      } catch (err) {
        console.error('Failed to fetch balance', err);
        setFeedback('Unable to fetch wallet balance.', 'error');
      }
    }

    async function refreshStakeAccounts() {
      if (!STATE.wallet || !unstakingSection) return;
      
      // Show loading state
      if (totalStakedEl) totalStakedEl.textContent = 'Loading...';
      if (unstakeBtn) unstakeBtn.disabled = true;
      
      try {
        const validatorPubkey = new web3.PublicKey(VALIDATOR_VOTE_ACCOUNT);
        
        // Get all stake accounts for this wallet
        // Use Helius RPC directly (public RPC returns 403 errors, so we skip it)
        let stakeAccounts = [];
        
        try {
          // Method 1: Use Helius with getParsedProgramAccounts and base58 string
          // Helius RPC works reliably and supports base58 in memcmp filters
          try {
            stakeAccounts = await writeConnection.getParsedProgramAccounts(
              web3.StakeProgram.programId,
              {
                filters: [
                  {
                    memcmp: {
                      offset: 12, // Authorized staker offset
                      bytes: STATE.wallet.toBase58() // Use base58 string directly
                    }
                  }
                ]
              },
              'confirmed'
            );
            // Success - found stake accounts using Helius
          } catch (method1Error) {
            // If getParsedProgramAccounts fails, try getProgramAccounts with manual decoding
            console.warn('getParsedProgramAccounts failed, trying getProgramAccounts:', method1Error.message);
            
            // Method 2: Use getProgramAccounts with base58 string and decode manually
            try {
              const rawAccounts = await writeConnection.getProgramAccounts(
                web3.StakeProgram.programId,
                {
                  filters: [
                    { dataSize: 200 }, // Stake account data size
                    {
                      memcmp: {
                        offset: 12,
                        bytes: STATE.wallet.toBase58() // Use base58 string
                      }
                    }
                  ]
                },
                'confirmed'
              );
              
              // Decode each account
              const walletPubkeyStr = STATE.wallet.toBase58();
              for (const account of rawAccounts) {
                try {
                  const stakeData = web3.StakeProgram.decode(account.account.data);
                  
                  // Verify authorized staker matches
                  const authorizedStaker = stakeData.authorized?.staker;
                  if (!authorizedStaker) continue;
                  
                  let stakerMatches = false;
                  if (authorizedStaker.equals && typeof authorizedStaker.equals === 'function') {
                    stakerMatches = authorizedStaker.equals(STATE.wallet);
                  } else {
                    const stakerStr = authorizedStaker.toString ? authorizedStaker.toString() : String(authorizedStaker);
                    stakerMatches = stakerStr === walletPubkeyStr;
                  }
                  
                  if (stakerMatches) {
                    // Convert to parsed format
                    stakeAccounts.push({
                      pubkey: account.pubkey,
                      account: {
                        data: {
                          parsed: {
                            type: 'stake',
                            info: {
                              meta: stakeData.meta,
                              stake: stakeData.stake,
                              lamports: account.account.lamports
                            }
                          }
                        },
                        lamports: account.account.lamports
                      }
                    });
                  }
                } catch (decodeErr) {
                  continue;
                }
              }
            } catch (method2Error) {
              console.error('All methods failed:', method2Error);
              throw new Error('Unable to query stake accounts. Please try refreshing the page or check your connection.');
            }
          }
        } catch (filterError) {
          console.error('Failed to fetch stake accounts:', filterError);
          console.error('This might be an RPC issue. Please try refreshing or check the console for details.');
          stakeAccounts = [];
          // Don't throw - show error to user but continue
          setUnstakingFeedback('Unable to load staking information. The RPC query failed. Please try the "Refresh Stakes" button or refresh the page.', 'error');
        }

        const delegatedAccounts = [];
        let totalStaked = BigInt(0);

        console.log(`Found ${stakeAccounts.length} stake accounts for wallet ${STATE.wallet.toString()}`);
        console.log(`Looking for validator: ${VALIDATOR_VOTE_ACCOUNT}`);

        for (const accountInfo of stakeAccounts) {
          try {
            const parsed = accountInfo.account.data?.parsed;
            
            // Debug logging (can be removed in production)
            // console.log('Account data structure:', {
            //   pubkey: accountInfo.pubkey.toString(),
            //   hasData: !!accountInfo.account.data,
            //   hasParsed: !!parsed,
            //   parsedType: parsed?.type
            // });
            
            if (!parsed) {
              console.log('Skipping account - no parsed data:', accountInfo.pubkey.toString());
              continue;
            }
            
            // Some RPCs return stake accounts with type 'delegated' or 'stake' - both are valid
            // Check if it has stake-related info
            if (!parsed.info && parsed.type !== 'stake' && parsed.type !== 'delegated') {
              console.log('Skipping non-stake account (type:', parsed.type, '):', accountInfo.pubkey.toString());
              continue;
            }
            
            // 'delegated' is a valid type for stake accounts that are delegated to a validator
            // No warning needed - this is expected behavior
            
            // Handle both parsed and potentially unparsed data
            let stakeInfo = null;
            
            // Try to get stake info from parsed data
            if (parsed.info) {
              stakeInfo = parsed.info;
            } else if (parsed.type === 'stake' && parsed.data) {
              // Some RPCs might nest it differently
              stakeInfo = parsed.data;
            } else if (accountInfo.account.data && !accountInfo.account.data.parsed) {
              // If we have raw data, try to decode it
              try {
                const decoded = web3.StakeProgram.decode(accountInfo.account.data);
                // Convert decoded data to a structure similar to parsed
                stakeInfo = {
                  meta: decoded.meta,
                  stake: decoded.stake,
                  lamports: accountInfo.account.lamports
                };
                console.log('Decoded raw stake account data for:', accountInfo.pubkey.toString());
              } catch (decodeErr) {
                console.warn('Could not decode raw data:', decodeErr);
              }
            }
            
            if (!stakeInfo) {
              console.warn('Could not extract stake info from account:', accountInfo.pubkey.toString());
              continue;
            }
            
            // Debug logging (commented out - uncomment if needed for debugging)
            // console.log('Stake account structure:', {
            //   pubkey: accountInfo.pubkey.toString(),
            //   hasStake: !!stakeInfo?.stake,
            //   hasDelegation: !!stakeInfo?.stake?.delegation,
            //   lamports: accountInfo.account.lamports || stakeInfo.lamports
            // });
            
            // Check if this account is delegated - try multiple paths
            let delegation = null;
            let votePubkey = null;
            
            // Path 1: stakeInfo.stake.delegation (most common)
            if (stakeInfo?.stake?.delegation) {
              delegation = stakeInfo.stake.delegation;
              votePubkey = delegation.voter;
            }
            // Path 2: stakeInfo.delegation (alternative structure)
            else if (stakeInfo?.delegation) {
              delegation = stakeInfo.delegation;
              votePubkey = delegation.voter || delegation.voteAccountAddress;
            }
            // Path 3: Check if there's delegation info elsewhere
            else if (stakeInfo?.meta?.authorized) {
              // Account exists but might not be delegated yet
              console.log(`Stake account ${accountInfo.pubkey.toString()} exists but not yet delegated`);
              continue;
            }
            
            if (delegation && votePubkey) {
              // Normalize vote pubkey to string for comparison
              let votePubkeyStr = null;
              if (typeof votePubkey === 'string') {
                votePubkeyStr = votePubkey;
              } else if (votePubkey?.toString) {
                votePubkeyStr = votePubkey.toString();
              } else if (votePubkey?.toBase58) {
                votePubkeyStr = votePubkey.toBase58();
              }
              
              if (votePubkeyStr) {
                // Compare with our validator (case-insensitive, trim whitespace)
                const normalizedVotePubkey = votePubkeyStr.trim();
                const normalizedValidator = VALIDATOR_VOTE_ACCOUNT.trim();
                
                if (normalizedVotePubkey === normalizedValidator) {
                  // Success - found matching stake account
                  // console.log(`✅ Found matching stake account: ${accountInfo.pubkey.toString()}`);
                  
                  // Get stake amount - try multiple sources
                  let stakeAmount = '0';
                  
                  // Try delegation.stake first (active stake amount)
                  if (delegation.stake && typeof delegation.stake === 'string') {
                    stakeAmount = delegation.stake;
                  } else if (delegation.stake && typeof delegation.stake === 'number') {
                    stakeAmount = delegation.stake.toString();
                  }
                  // Fallback to account lamports (includes rent)
                  else if (accountInfo.account.lamports) {
                    // Subtract rent exemption (~0.00228 SOL = ~2280000 lamports)
                    const rentExempt = 2280000;
                    stakeAmount = Math.max(0, accountInfo.account.lamports - rentExempt).toString();
                  } else if (stakeInfo.lamports) {
                    const rentExempt = 2280000;
                    stakeAmount = Math.max(0, stakeInfo.lamports - rentExempt).toString();
                  }
                  
                  // Ensure we have a valid stake amount
                  if (stakeAmount === '0' || BigInt(stakeAmount) <= 0) {
                    console.warn(`Stake account ${accountInfo.pubkey.toString()} has zero or invalid stake amount`);
                    // Still add it but with a note
                  }
                  
                  delegatedAccounts.push({
                    pubkey: accountInfo.pubkey.toString(),
                    stakeAmount: stakeAmount,
                    activationEpoch: delegation.activationEpoch,
                    deactivationEpoch: delegation.deactivationEpoch
                  });
                  totalStaked += BigInt(stakeAmount);
                }
                // else: Account delegated to different validator - silently skip
              }
              // else: Could not extract vote pubkey - silently skip
            }
            // else: Account not delegated - silently skip
          } catch (parseErr) {
            console.warn('Failed to parse stake account:', parseErr, accountInfo);
            continue;
          }
        }

        console.log(`Total delegated accounts found: ${delegatedAccounts.length}, Total staked: ${Number(totalStaked) / web3.LAMPORTS_PER_SOL} SOL`);

        STATE.stakeAccounts = delegatedAccounts;
        STATE.totalStakedLamports = Number(totalStaked);

        // Always show the section when wallet is connected, even if no stakes found
        unstakingSection.style.display = 'block';
        
        if (delegatedAccounts.length > 0) {
          const totalSol = STATE.totalStakedLamports / web3.LAMPORTS_PER_SOL;
          
          if (totalStakedEl) totalStakedEl.textContent = `${formatSol(totalSol, 4)} SOL`;
          
          if (unstakeBtn) unstakeBtn.disabled = STATE.unstaking;
          setUnstakingFeedback('');
        } else {
          if (totalStakedEl) totalStakedEl.textContent = '0 SOL';
          if (unstakeBtn) unstakeBtn.disabled = true;
          setUnstakingFeedback('No staked SOL found with Mindfolk validator. If you just staked, wait a few seconds and click "Refresh Stakes".', 'info');
        }
      } catch (err) {
        console.error('Failed to fetch stake accounts', err);
        setUnstakingFeedback('Unable to load staking information. Please try refreshing.', 'error');
        if (totalStakedEl) totalStakedEl.textContent = 'Error';
        if (unstakingSection) unstakingSection.style.display = 'block'; // Show section even on error
        if (unstakeBtn) unstakeBtn.disabled = true;
      }
    }

    function resetBalanceDisplay() {
      balanceEl.hidden = true;
      const balanceText = balanceEl.querySelector('.staking-balance__text');
      if (balanceText) balanceText.textContent = 'Balance: -- SOL';
      else balanceEl.textContent = 'Balance: -- SOL';
      updateQuickButtons();
    }

    function bindProviderEvents() {
      if (!STATE.currentProvider || STATE.listenersBound || typeof STATE.currentProvider.on !== 'function') return;
      STATE.currentProvider.on('disconnect', () => {
        STATE.wallet = null;
        STATE.balanceLamports = 0;
        STATE.currentProvider = null;
        STATE.currentWalletName = null;
        updateConnectButton();
        updateWalletIndicator();
        resetBalanceDisplay();
        updateSubmitState();
        setFeedback('Wallet disconnected.', 'info');
      });
      STATE.currentProvider.on('accountChanged', (newAccount) => {
        if (!newAccount) {
          STATE.wallet = null;
          STATE.balanceLamports = 0;
          STATE.currentProvider = null;
          STATE.currentWalletName = null;
          if (walletSelect) walletSelect.value = '';
          updateConnectButton();
          resetBalanceDisplay();
          updateSubmitState();
          setFeedback('Wallet disconnected.', 'info');
          return;
        }
        try {
          const nextKey = typeof newAccount === 'string' ? newAccount : newAccount?.toString?.();
          if (!nextKey) return;
          STATE.wallet = new web3.PublicKey(nextKey);
          refreshBalance();
          updateConnectButton();
          updateQuickButtons();
          updateSubmitState();
          setFeedback('Switched wallet account.', 'info');
        } catch (err) {
          console.warn('Account change error', err);
        }
      });
      STATE.listenersBound = true;
    }

    function mwaErrorChainCode(err, depth = 0) {
      if (!err || depth > 6) return '';
      const c = err.code;
      if (typeof c === 'string' && c.startsWith('ERROR_')) return c;
      return mwaErrorChainCode(err.cause, depth + 1);
    }

    function mwaConnectFailureMessage(err) {
      const msg = String(err?.message || '');
      const code = mwaErrorChainCode(err);
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
      const looksWebView = /\bwv\b|; wv\)/i.test(ua);

      if (code === 'ERROR_WALLET_NOT_FOUND' || /ERROR_WALLET_NOT_FOUND|wallet not found/i.test(msg)) {
        return 'Mobile Wallet Adapter could not open a wallet on this device. Open this site in Chrome (not an in-app browser), keep HTTPS, and allow Local network access if Android asks.';
      }
      if (code === 'ERROR_BROWSER_NOT_SUPPORTED' || looksWebView) {
        return 'This browser cannot use Mobile Wallet Adapter. Open the same URL in Chrome on Android.';
      }
      if (code === 'ERROR_LOOPBACK_ACCESS_BLOCKED' || /loopback|local network/i.test(msg)) {
        return 'Chrome blocked local loopback access to your wallet. Allow local network access and try again.';
      }
      if (/timed out|timeout/i.test(msg)) {
        return 'Wallet connection timed out. If a wallet sheet opened, approve it there; otherwise retry in Chrome.';
      }
      if (/public key/i.test(msg)) {
        return 'Wallet connected but did not expose an account. Close wallet app and retry.';
      }
      return msg || 'Solana Mobile Adapter connection failed.';
    }

    async function connectSolanaMobileWalletInner() {
      const mobileMod = await import(
        'https://esm.sh/@solana-mobile/wallet-adapter-mobile@2.2.7?deps=@solana/web3.js@1.98.4,@solana/wallet-adapter-base@0.9.27,@solana-mobile/mobile-wallet-adapter-protocol@2.2.7,@solana-mobile/mobile-wallet-adapter-protocol-web3js@2.2.7'
      );
      const baseMod = await import(
        'https://esm.sh/@solana/wallet-adapter-base@0.9.27?deps=@solana/web3.js@1.98.4'
      );

      const Adapter = mobileMod.SolanaMobileWalletAdapter || mobileMod.default;
      const createDefaultAddressSelector = mobileMod.createDefaultAddressSelector;
      const createDefaultAuthorizationResultCache = mobileMod.createDefaultAuthorizationResultCache;
      const { WalletAdapterNetwork } = baseMod;

      if (!Adapter || typeof Adapter !== 'function' || !createDefaultAddressSelector) {
        throw new Error('Could not load Solana Mobile Adapter modules.');
      }

      const adapter = new Adapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: 'Mindfolk',
          uri: window.location.origin
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: WalletAdapterNetwork.Mainnet,
        onWalletNotFound: async () => {
          console.warn('[MWA] onWalletNotFound (no responding wallet). UA:', navigator.userAgent);
        }
      });

      // wallet-adapter-mobile 2.2.x: connect() can resolve before selected account is published.
      const publicKey = await new Promise((resolve, reject) => {
        const timeoutMs = 120000;
        let timer = setTimeout(() => {
          cleanup();
          reject(new Error('Timed out waiting for wallet public key'));
        }, timeoutMs);

        function cleanup() {
          if (timer) clearTimeout(timer);
          timer = null;
          if (typeof adapter.off === 'function') adapter.off('connect', onConnect);
          else if (typeof adapter.removeListener === 'function') adapter.removeListener('connect', onConnect);
        }

        function onConnect() {
          const k = adapter.publicKey;
          if (!k) return;
          cleanup();
          resolve(k);
        }

        if (typeof adapter.on === 'function') adapter.on('connect', onConnect);

        (async () => {
          try {
            await adapter.connect();
            if (adapter.publicKey) {
              cleanup();
              resolve(adapter.publicKey);
            }
          } catch (err) {
            cleanup();
            reject(err);
          }
        })();
      });

      if (!publicKey) throw new Error('Wallet did not provide a public key.');
      STATE.currentProvider = adapter;
      STATE.wallet = new web3.PublicKey(publicKey.toString());
      STATE.listenersBound = false;
      bindProviderEvents();
    }

    async function connectWallet() {
      const selectedWallet = STATE.currentWalletName || '';
      if (!selectedWallet) {
        openWalletModal();
        return;
      }

      if (selectedWallet === 'solanaMobile') {
        if (STATE.wallet || STATE.connecting) return;
        if (!isSolanaMobileEnvironment()) {
          setFeedback('Solana Mobile Adapter is only available on Android over HTTPS.', 'error');
          return;
        }
        STATE.connecting = true;
        updateConnectButton();
        try {
          await connectSolanaMobileWalletInner();
          refreshBalance().catch((err) => {
            console.warn('Balance refresh failed (non-blocking):', err);
            setFeedback('Wallet connected, but unable to fetch balance. Please refresh.', 'warning');
          });
          refreshStakeAccounts().catch((err) => {
            console.warn('Stake accounts refresh failed (non-blocking):', err);
          });
          updateWalletIndicator();
          setFeedback(`${getWalletDisplayName('solanaMobile')} connected.`, 'success');
        } catch (err) {
          if (err?.code === 4001) {
            setFeedback('Wallet connection cancelled.', 'error');
          } else {
            console.error('Solana Mobile connect error', err);
            setFeedback(mwaConnectFailureMessage(err), 'error');
          }
          STATE.currentProvider = null;
          STATE.currentWalletName = null;
          STATE.wallet = null;
          STATE.listenersBound = false;
        } finally {
          STATE.connecting = false;
          updateConnectButton();
          updateQuickButtons();
          updateSubmitState();
        }
        return;
      }
      
      const provider = getWalletProvider(selectedWallet);
      if (!provider) {
        const walletName = getWalletDisplayName(selectedWallet);
        setFeedback(`${walletName} wallet not detected. Install the extension and refresh this page.`, 'error');
        return;
      }
      
      if (STATE.wallet || STATE.connecting) return;
      STATE.connecting = true;
      STATE.currentProvider = provider;
      updateConnectButton();
      
      try {
        let resp;
        try {
          resp = await provider.connect({ onlyIfTrusted: false });
        } catch (e1) {
          if (e1 && e1.code === 4001) throw e1;
          resp = await provider.connect();
        }
        const pubkey = resp?.publicKey || provider.publicKey;
        if (!pubkey) throw new Error('Wallet did not provide a public key.');
        STATE.wallet = new web3.PublicKey(pubkey.toString());
        bindProviderEvents();
        // Refresh balance and stake accounts asynchronously to avoid blocking
        refreshBalance().catch(err => {
          console.warn('Balance refresh failed (non-blocking):', err);
          setFeedback('Wallet connected, but unable to fetch balance. Please refresh.', 'warning');
        });
        refreshStakeAccounts().catch(err => {
          console.warn('Stake accounts refresh failed (non-blocking):', err);
        });
        updateWalletIndicator();
        const walletName = getWalletDisplayName(selectedWallet);
        setFeedback(`${walletName} wallet connected.`, 'success');
      } catch (err) {
        if (err?.code === 4001) {
          setFeedback('Wallet connection cancelled.', 'error');
        } else {
          console.error('Wallet connect error', err);
          setFeedback(err?.message || 'Failed to connect wallet.', 'error');
        }
        STATE.currentProvider = null;
        STATE.currentWalletName = null;
      } finally {
        STATE.connecting = false;
        updateConnectButton();
        updateQuickButtons();
        updateSubmitState();
      }
    }

    async function disconnectWallet() {
      if (!STATE.currentProvider || !STATE.wallet) return;
      try {
        // Clean up event listeners
        if (STATE.currentProvider && typeof STATE.currentProvider.removeAllListeners === 'function') {
          STATE.currentProvider.removeAllListeners('disconnect');
          STATE.currentProvider.removeAllListeners('accountChanged');
        }
        
        await STATE.currentProvider.disconnect?.();
      } catch (err) {
        console.warn('Wallet disconnect error', err);
      } finally {
        // Clear all active timeouts
        STATE.activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        STATE.activeTimeouts = [];
        
        STATE.wallet = null;
        STATE.balanceLamports = 0;
        STATE.connecting = false;
        STATE.submitting = false;
        STATE.unstaking = false;
        STATE.currentProvider = null;
        STATE.currentWalletName = null;
        STATE.listenersBound = false;
        STATE.stakeAccounts = [];
        STATE.totalStakedLamports = 0;
        amountInput.value = '';
        updateSummary();
        resetBalanceDisplay();
        updateSubmitState();
        updateConnectButton();
        updateWalletIndicator();
        if (unstakingSection) unstakingSection.style.display = 'none';
        setFeedback('Wallet disconnected.', 'info');
        setUnstakingFeedback('');
      }
    }

    async function handleStake(event) {
      event.preventDefault();
      setFeedback('');

      if (!STATE.currentProvider || !STATE.wallet) {
        setFeedback('Connect your wallet before staking.', 'error');
        return;
      }

      const amount = parseFloat(amountInput.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        setFeedback('Enter a stake amount greater than zero.', 'error');
        return;
      }

      const lamports = Math.round(amount * web3.LAMPORTS_PER_SOL);

      const useEsmWeb3 = STATE.currentWalletName === 'solanaMobile';
      const w3tx = useEsmWeb3 ? await loadEsmWeb3ForMobile() : web3;
      const walletPub = new w3tx.PublicKey(STATE.wallet.toBase58());

      // NOTE: Solana requires a new stake account for each staking transaction.
      // You cannot directly "add" SOL to an existing stake account.
      // Each stake account requires a one-time rent fee (~0.00228 SOL).
      // This is the standard Solana staking approach - multiple stake accounts are normal.
      const stakeAccount = w3tx.Keypair.generate();

      STATE.submitting = true;
      submitButton.disabled = true;
      submitButton.textContent = 'Staking…';
      amountInput.disabled = true;

      try {
        const txConn = useEsmWeb3 ? new w3tx.Connection(WRITE_RPC, 'confirmed') : writeConnection;

        // Use Helius for rent calculation (avoids 403 errors from public RPC)
        const rentExemptLamports = await txConn.getMinimumBalanceForRentExemption(w3tx.StakeProgram.space, 'confirmed');
        const totalLamports = rentExemptLamports + lamports;

        if (STATE.balanceLamports < totalLamports) {
          const needed = totalLamports / web3.LAMPORTS_PER_SOL;
          setFeedback(`Insufficient balance. You need ~${formatSol(needed, 4)} SOL including rent-exempt reserve.`, 'error');
          return;
        }

        const createAccountIx = w3tx.SystemProgram.createAccount({
          fromPubkey: walletPub,
          newAccountPubkey: stakeAccount.publicKey,
          lamports: totalLamports,
          space: w3tx.StakeProgram.space,
          programId: w3tx.StakeProgram.programId
        });

        const authorized = new w3tx.Authorized(walletPub, walletPub);
        const lockup = new w3tx.Lockup(0, 0, walletPub);

        const initStakeIx = w3tx.StakeProgram.initialize({
          stakePubkey: stakeAccount.publicKey,
          authorized,
          lockup
        });

        // SECURITY: Verify validator address before creating transaction
        const validatorPubkey = new w3tx.PublicKey(VALIDATOR_VOTE_ACCOUNT);
        if (!validatorPubkey) {
          throw new Error('Invalid validator address');
        }
        
        const delegateIx = w3tx.StakeProgram.delegate({
          stakePubkey: stakeAccount.publicKey,
          authorizedPubkey: walletPub,
          votePubkey: validatorPubkey
        });

        const transaction = new w3tx.Transaction().add(createAccountIx, initStakeIx, delegateIx);
        transaction.feePayer = walletPub;
        
        // SECURITY: Log transaction details for user verification (visible in console)
        console.log('%c=== TRANSACTION SECURITY CHECK ===', 'color: #ffc107; font-weight: bold; font-size: 14px;');
        console.log('%cValidator Address:', 'color: #ff6b6b; font-weight: bold;', VALIDATOR_VOTE_ACCOUNT);
        console.log('%cExpected Validator:', 'color: #4ecdc4; font-weight: bold;', 'MFLKX9vSfWXa4ZcVVpp4GF64ZbNUiX9EjSqtqNMdFXB');
        console.log('%cMatch:', VALIDATOR_VOTE_ACCOUNT === 'MFLKX9vSfWXa4ZcVVpp4GF64ZbNUiX9EjSqtqNMdFXB' ? '✅ CORRECT' : '❌ MISMATCH - DO NOT SIGN!', VALIDATOR_VOTE_ACCOUNT === 'MFLKX9vSfWXa4ZcVVpp4GF64ZbNUiX9EjSqtqNMdFXB' ? 'color: #51cf66; font-weight: bold;' : 'color: #ff6b6b; font-weight: bold;');
        console.log('Stake Amount:', formatSol(amount, 4), 'SOL');
        console.log('Stake Account:', stakeAccount.publicKey.toString());
        console.log('%c=== VERIFY IN YOUR WALLET BEFORE SIGNING ===', 'color: #ffc107; font-weight: bold; font-size: 14px;');

        // Get fresh blockhash right before signing (minimizes expiration risk)
        const latestBlockhash = await txConn.getLatestBlockhash('finalized');
        transaction.recentBlockhash = latestBlockhash.blockhash;
        
        let signature;
        try {
          // Solana Mobile Wallet Adapter overrides sendTransaction and calls
          // transaction.serialize() with no options before SignAndSend / sign flows.
          // Web3.js defaults require every signature slot to be filled, so multi-signer
          // stake txs (fee payer + new stake account) fail with "Missing signature…"
          // unless we partial-sign locally and serialize with relaxed verification so
          // the wallet can add the remaining signature(s). The adapter also ignores
          // BaseSignerWalletAdapter's `options.signers` merge.
          if (useEsmWeb3) {
            transaction.partialSign(stakeAccount);
            const origSerialize = transaction.serialize.bind(transaction);
            transaction.serialize = (config) =>
              origSerialize({
                requireAllSignatures: false,
                verifySignatures: false,
                ...(config && typeof config === 'object' ? config : {})
              });
            try {
              signature = await STATE.currentProvider.sendTransaction(transaction, txConn, {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 0
              });
            } finally {
              transaction.serialize = origSerialize;
            }
          } else if (typeof STATE.currentProvider.sendTransaction === 'function') {
            signature = await STATE.currentProvider.sendTransaction(transaction, txConn, {
              signers: [stakeAccount],
              skipPreflight: false,
              preflightCommitment: 'confirmed',
              maxRetries: 0
            });
          } else {
            // Fallback path for providers without sendTransaction.
            transaction.partialSign(stakeAccount);
            const signedTx = await STATE.currentProvider.signTransaction(transaction);
            if (typeof signedTx.partialSign === 'function') {
              signedTx.partialSign(stakeAccount);
            }
            const rawConn = useEsmWeb3 ? txConn : writeConnection;
            signature = await rawConn.sendRawTransaction(signedTx.serialize(), {
              skipPreflight: false,
              maxRetries: 0
            });
          }
        } catch (sendError) {
          console.error('Failed to send transaction:', sendError);
          throw new Error(`Failed to send transaction: ${sendError.message || 'Unknown error'}`);
        }
        
        // Validate signature before proceeding
        if (!signature || typeof signature !== 'string' || signature.length < 32) {
          throw new Error('Invalid transaction signature received');
        }
        
        const solscanUrl = `https://solscan.io/tx/${signature}`;
        
        // Show feedback that transaction was sent
        setFeedback(`Transaction sent! Confirming... (this usually takes 5-15 seconds)`, 'info');
        
        // Use efficient polling with adaptive intervals for faster confirmation
        // Poll more frequently at first (every 500ms), then slow down (every 1s)
        // This is more reliable than confirmTransaction which can timeout
        let confirmed = false;
        let transactionFailed = false;
        let errorMessage = null;
        const maxAttempts = 30; // Check for up to ~20 seconds (10 fast + 20 slow)
        let attempt = 0;
        
        // Poll for confirmation with adaptive intervals
        while (attempt < maxAttempts && !confirmed && !transactionFailed) {
          try {
            // Check status - don't use searchTransactionHistory initially (faster)
            // Only use it if we haven't found it after a few attempts
            const useSearch = attempt > 5;
            const status = await writeConnection.getSignatureStatus(signature, useSearch ? { searchTransactionHistory: true } : undefined);
            
            if (status?.value?.err) {
              // Transaction failed
              transactionFailed = true;
              errorMessage = status.value.err.toString();
              break;
            }
            
            // Check if confirmed (accept processed, confirmed, or finalized)
            const confirmationStatus = status?.value?.confirmationStatus;
            if (confirmationStatus === 'processed' || confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
              confirmed = true;
              break;
            }
            
            // Update feedback every 3 seconds
            if (attempt > 0 && attempt % 6 === 0) {
              setFeedback(`Transaction sent! Still confirming... (${Math.floor(attempt / 2)} seconds)`, 'info');
            }
          } catch (statusError) {
            // If status check fails, continue polling (transaction might still be processing)
            // Only log after a few attempts to avoid console spam
            if (attempt > 3) {
              console.warn('Status check error (non-critical):', statusError);
            }
          }
          
          // Use faster polling for first 10 attempts (500ms), then slower (1s)
          const delay = attempt < 10 ? 500 : 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          attempt++;
        }
        
        // If still not confirmed after polling, do a final check
        if (!confirmed && !transactionFailed) {
          try {
            const finalStatus = await writeConnection.getSignatureStatus(signature, { searchTransactionHistory: true });
            if (finalStatus?.value?.err) {
              transactionFailed = true;
              errorMessage = finalStatus.value.err.toString();
            } else if (finalStatus?.value?.confirmationStatus === 'processed' || 
                       finalStatus?.value?.confirmationStatus === 'confirmed' || 
                       finalStatus?.value?.confirmationStatus === 'finalized') {
              confirmed = true;
            } else {
              // Transaction sent but not yet confirmed - show warning with link
              setFeedback(`⚠️ Transaction sent! Confirmation is taking longer than usual. Please check your wallet or view on Solscan: ${solscanUrl}\n\nIf the transaction appears successful on Solscan, your stake went through!`, 'warning');
              amountInput.value = '';
              updateSummary();
              await refreshBalance();
              await refreshStakeAccounts();
              return; // Exit early - transaction might still succeed
            }
          } catch (finalError) {
            // Final check failed - transaction might still be processing
            setFeedback(`⚠️ Transaction sent! Please check your wallet or view on Solscan: ${solscanUrl}\n\nIf the transaction appears successful on Solscan, your stake went through!`, 'warning');
            amountInput.value = '';
            updateSummary();
            await refreshBalance();
            await refreshStakeAccounts();
            return;
          }
        }
        
        // If transaction failed, throw error (will be caught by outer catch block)
        if (transactionFailed) {
          throw new Error(`Transaction failed: ${errorMessage || 'Unknown error'}. Check status: ${solscanUrl}`);
        }
        
        // Only show success modal if transaction is confirmed and successful
        if (confirmed) {
          showSuccessModal(`SOL Staked with Mindfolk Validator!\n\nAmount:\n${formatSol(amount, 4)} SOL\n\nValidator:\n${VALIDATOR_VOTE_ACCOUNT}\n\nStake Account:\n${stakeAccount.publicKey.toString()}\n\nView on Solscan:\n<a href="${solscanUrl}" target="_blank" rel="noopener noreferrer">${solscanUrl}</a>`);
          
          // Show success feedback
          setFeedback('✅ Transaction confirmed!', 'success');
          
          // Clear input and update UI
          amountInput.value = '';
          updateSummary();
          await refreshBalance();
          
          // Wait a few seconds before refreshing stake accounts (they need time to be indexed)
          setFeedback('✅ Transaction confirmed!', 'success');
          setTimeout(async () => {
            try {
              await refreshStakeAccounts();
              setFeedback('✅ Transaction confirmed!', 'success');
            } catch (err) {
              console.warn('Failed to refresh stake accounts after staking:', err);
              setFeedback('✅ Transaction confirmed!', 'success');
            }
          }, 3000); // Wait 3 seconds for indexing
        }

        // Verify the stake account is delegated to our validator (wait a moment for confirmation)
        // Note: This is optional verification - the transaction confirmation above is the primary success indicator
        const verifyTimeoutId = setTimeout(async () => {
          try {
            // Use Helius for verification (public RPC often blocked)
            const stakeAccountInfo = await writeConnection.getAccountInfo(stakeAccount.publicKey);
            if (stakeAccountInfo && stakeAccountInfo.data) {
              try {
                // Try to decode stake account data - use try-catch since decode method may vary by Web3.js version
                // The transaction confirmation above is the primary success indicator, this is just extra verification
                let stakeData;
                try {
                  // Try different decode methods depending on Web3.js version
                  if (typeof web3.StakeProgram.decode === 'function') {
                    stakeData = web3.StakeProgram.decode(stakeAccountInfo.data);
                  } else if (typeof web3.StakeProgram.decodeAccountData === 'function') {
                    stakeData = web3.StakeProgram.decodeAccountData(stakeAccountInfo.data);
                  } else {
                    // If no decode method available, just verify account exists (transaction already confirmed)
                    console.log('✅ Stake account created successfully');
                    return;
                  }
                  
                  if (stakeData?.stake?.delegation) {
                    const delegation = stakeData.stake.delegation;
                    const delegatedValidator = delegation.voter.toString();
                    if (delegatedValidator === VALIDATOR_VOTE_ACCOUNT) {
                      // Success already shown above, just log for verification
                      console.log('✅ Delegation verified to Mindfolk Validator');
                    } else {
                      setFeedback(`⚠️ WARNING: Delegated to wrong validator! Expected: ${VALIDATOR_VOTE_ACCOUNT}, Got: ${delegatedValidator}`, 'error');
                    }
                  }
                } catch (decodeErr) {
                  // Decode failed, but account exists - transaction was successful
                  console.log('✅ Stake account created (delegation verification skipped)');
                }
              } catch (e) {
                // Decode error is not critical - transaction already confirmed
                // The account might not be fully initialized yet, or decode method might differ
                console.warn('Could not verify delegation (non-critical):', e);
              }
            }
          } catch (err) {
            // Verification failure is not critical - transaction already confirmed
            console.warn('Could not verify stake account (non-critical):', err);
          }
        }, 5000); // Wait 5 seconds for account to be fully initialized
        STATE.activeTimeouts.push(verifyTimeoutId);
      } catch (err) {
        console.error('Stake error', err);
        let msg = err?.message || 'Failed to submit stake delegation.';
        
        // Provide helpful error message for blockhash expiration
        if (msg.includes('Blockhash not found') || msg.includes('blockhash') || msg.includes('Blockhash')) {
          msg = 'Transaction expired. Please try again - the blockhash expired while you were signing. This happens if you take too long to approve the transaction in your wallet.';
        }
        
        // If error message includes a Solscan URL, preserve it
        // Otherwise, if we have a signature from the error context, add it
        if (!msg.includes('solscan.io') && err?.signature) {
          msg += `\n\nCheck transaction status: https://solscan.io/tx/${err.signature}`;
        }
        
        setFeedback(msg, 'error');
      } finally {
        STATE.submitting = false;
        submitButton.textContent = 'Stake SOL';
        amountInput.disabled = false;
        updateSubmitState();
      }
    }

    function activatePanel(targetMode) {
      toggleButtons.forEach((btn) => {
        const isActive = btn.dataset.mode === targetMode;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
      });

      panels.forEach((panel) => {
        const isActive = panel.dataset.panel === targetMode;
        panel.classList.toggle('active', isActive);
        panel.setAttribute('aria-hidden', String(!isActive));
        if (isActive) {
          const numInput = panel.querySelector('input[type="number"]');
          if (numInput) numInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      stakingSection.setAttribute('data-staking-mode', targetMode);
      if (targetMode === 'native') {
        updateConnectButton();
      }

      if (targetMode === 'liquid') {
        requestAnimationFrame(() => {
          if (typeof window.initMindfolkJupiterSwapIfNeeded === 'function') {
            window.initMindfolkJupiterSwapIfNeeded();
          }
        });
      }
    }

    toggleButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) return;
        activatePanel(btn.dataset.mode);
      });
    });

    activatePanel('native');

    if (liquidPanel) {
      const copyMintBtn = liquidPanel.querySelector('[data-copy-mindsol-mint]');
      const liquidFeedback = liquidPanel.querySelector('[data-liquid-feedback]');

      function setLiquidFeedback(message, type = 'info') {
        if (!liquidFeedback) return;
        liquidFeedback.textContent = '';
        liquidFeedback.className = 'staking-feedback mb-2';
        if (!message) {
          liquidFeedback.hidden = true;
          return;
        }
        liquidFeedback.hidden = false;
        liquidFeedback.textContent = message;
        liquidFeedback.classList.add(`staking-feedback--${type}`);
      }

      copyMintBtn?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(MINDSOL_MINT);
          setLiquidFeedback('Mint address copied.', 'success');
          const tid = window.setTimeout(() => setLiquidFeedback(''), 2200);
          STATE.activeTimeouts.push(tid);
        } catch (e) {
          setLiquidFeedback('Could not copy automatically—select the mint address and copy manually.', 'error');
        }
      });
    }

    // Fetch SOL price from CoinGecko
    async function fetchSolPrice() {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error('Price fetch failed');
        const data = await response.json();
        if (data?.solana?.usd) {
          STATE.solPriceUsd = data.solana.usd;
          updateSummary(); // Update display with current price
        }
      } catch (err) {
        console.warn('Failed to fetch SOL price:', err);
        // Silently fail - USD conversion just won't show
      }
    }

    // Fetch price on init and refresh every 60 seconds
    fetchSolPrice();
    STATE.priceIntervalId = setInterval(fetchSolPrice, 60000);

    quickButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const fraction = parseFloat(btn.dataset.quickAmount || '0');
        if (!Number.isFinite(fraction) || fraction <= 0) return;
        if (!STATE.wallet) {
          setFeedback('Connect a wallet to use quick stake amounts.', 'error');
          return;
        }
        const lamports = STATE.balanceLamports * fraction;
        const sol = lamports / web3.LAMPORTS_PER_SOL;
        amountInput.value = formatSol(sol, 4);
        updateSummary();
        updateSubmitState();
      });
    });

    amountInput.addEventListener('input', () => {
      updateSummary();
      updateSubmitState();
    });

    if (connectButton) {
      connectButton.addEventListener('click', (event) => {
        event.preventDefault();
        if (window.solanaWeb3LoadFailed) {
          setFeedback('Wallet libraries failed to load. Refresh the page or check your network.', 'error');
          return;
        }
        if (STATE.wallet) return; // Already connected
        try {
          openWalletModal();
        } catch (err) {
          console.error('Error opening wallet modal:', err);
          setFeedback('Error opening wallet selection. Please refresh the page.', 'error');
        }
      });
    } else {
      console.error('Connect button not found!');
    }

    disconnectButton.addEventListener('click', (event) => {
      event.preventDefault();
      disconnectWallet();
    });
    
    // Close modal when clicking backdrop or close button
    if (walletModalBackdrop) {
      walletModalBackdrop.addEventListener('click', closeWalletModal);
    }
    
    if (walletModal) {
      const closeBtn = walletModal.querySelector('.wallet-modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', closeWalletModal);
      }
      // Escape key handler will be added below (unified with success modal)
    }

    async function handleUnstake() {
      if (!STATE.currentProvider || !STATE.wallet || STATE.stakeAccounts.length === 0) {
        setUnstakingFeedback('No staked accounts found.', 'error');
        return;
      }

      if (STATE.unstaking) return;
      STATE.unstaking = true;
      setUnstakingFeedback('');
      
      if (unstakeBtn) {
        unstakeBtn.disabled = true;
        unstakeBtn.textContent = 'Processing...';
      }

      try {
        const transactions = [];
        const validatorPubkey = new web3.PublicKey(VALIDATOR_VOTE_ACCOUNT);

        for (const stakeAccount of STATE.stakeAccounts) {
          const stakePubkey = new web3.PublicKey(stakeAccount.pubkey);
          
          // Check if already deactivated (use read connection)
          // Use Helius for stake activation check (public RPC often blocked)
          const stakeInfo = await writeConnection.getStakeActivation(stakePubkey);
          
          if (stakeInfo.state === 'active' || stakeInfo.state === 'activating') {
            // Deactivate stake account
            const deactivateIx = web3.StakeProgram.deactivate({
              stakePubkey: stakePubkey,
              authorizedPubkey: STATE.wallet
            });
            transactions.push({ instruction: deactivateIx, stakePubkey });
          } else if (stakeInfo.state === 'inactive') {
            // Withdraw from deactivated stake account (use Helius - public RPC often blocked)
            const stakeAccountInfo = await writeConnection.getAccountInfo(stakePubkey);
            if (stakeAccountInfo) {
              const withdrawIx = web3.StakeProgram.withdraw({
                stakePubkey: stakePubkey,
                authorizedPubkey: STATE.wallet,
                toPubkey: STATE.wallet,
                lamports: stakeAccountInfo.lamports,
                programId: web3.StakeProgram.programId
              });
              transactions.push({ instruction: withdrawIx, stakePubkey, isWithdraw: true });
            }
          }
        }

        if (transactions.length === 0) {
          setUnstakingFeedback('No actions needed. All stake accounts are already processed.', 'info');
          return;
        }

        // Process transactions one by one
        let successCount = 0;
        for (const tx of transactions) {
          try {
            const transaction = new web3.Transaction().add(tx.instruction);
            transaction.feePayer = STATE.wallet;
            // Use Helius for getting latest blockhash (more reliable for transactions)
            const latestBlockhash = await writeConnection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = latestBlockhash.blockhash;

            const signedTx = await STATE.currentProvider.signTransaction(transaction);
            // Use Helius for write operations (more reliable)
            const signature = await writeConnection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false });
            await writeConnection.confirmTransaction(
              {
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
              },
              'confirmed'
            );
            successCount++;
            
            const action = tx.isWithdraw ? 'withdrawn' : 'deactivated';
            setUnstakingFeedback(`${action.charAt(0).toUpperCase() + action.slice(1)} successfully. Transaction: ${signature.slice(0, 8)}...`, 'success');
          } catch (err) {
            console.error('Unstake transaction error', err);
            setUnstakingFeedback(`Failed to process one account: ${err?.message || 'Unknown error'}`, 'error');
          }
        }

        if (successCount > 0) {
          await refreshBalance();
          await refreshStakeAccounts();
        }
      } catch (err) {
        console.error('Unstake error', err);
        setUnstakingFeedback(err?.message || 'Failed to unstake. Please try again.', 'error');
      } finally {
        STATE.unstaking = false;
        if (unstakeBtn) {
          unstakeBtn.disabled = false;
          unstakeBtn.textContent = 'Unstake All';
        }
      }
    }

    if (unstakeBtn) {
      unstakeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        handleUnstake();
      });
    }

    if (refreshStakesBtn) {
      refreshStakesBtn.addEventListener('click', (event) => {
        event.preventDefault();
        refreshStakeAccounts();
      });
    }

    // Success modal functions
    const successModal = document.getElementById('successModal');
    const successModalBackdrop = document.getElementById('successModalBackdrop');
    const successModalMessage = document.getElementById('successModalMessage');
    const successModalClose = document.getElementById('successModalClose');

    function showSuccessModal(message) {
      if (!successModal || !successModalBackdrop || !successModalMessage) return;
      
      // Render as text-only to avoid HTML injection.
      // If you need links, pass them separately and construct DOM nodes explicitly.
      successModalMessage.replaceChildren();
      const lines = String(message || '').split('\n');
      for (const line of lines) {
        if (line.trim() === '') {
          successModalMessage.appendChild(document.createElement('br'));
          continue;
        }
        const row = document.createElement('div');
        row.textContent = line;
        successModalMessage.appendChild(row);
      }
      
      successModal.style.display = 'flex';
      successModalBackdrop.style.display = 'block';
      
      // Trigger animation
      setTimeout(() => {
        successModal.classList.add('show');
        successModalBackdrop.classList.add('show');
      }, 10);
      
      document.body.style.overflow = 'hidden';
    }

    function hideSuccessModal() {
      if (!successModal || !successModalBackdrop) return;
      
      successModal.classList.remove('show');
      successModalBackdrop.classList.remove('show');
      
      setTimeout(() => {
        successModal.style.display = 'none';
        successModalBackdrop.style.display = 'none';
        document.body.style.overflow = '';
      }, 300);
    }

    if (successModalClose) {
      successModalClose.addEventListener('click', hideSuccessModal);
    }

    if (successModalBackdrop) {
      successModalBackdrop.addEventListener('click', hideSuccessModal);
    }

    // Unified Escape key handler for both modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Close success modal if open
        if (successModal && successModal.classList.contains('show')) {
          hideSuccessModal();
        }
        // Close wallet modal if open
        if (walletModal && walletModal.classList.contains('wallet-modal-show')) {
          closeWalletModal();
        }
      }
    });

    nativePanel.querySelector('form')?.addEventListener('submit', handleStake);

    updateSummary();
    updateQuickButtons();
    updateSubmitState();
    populateWalletOptions();
    updateConnectButton();

    // Try to auto-connect if a wallet is already connected
    (async () => {
      const availableWallets = detectAvailableWallets();
      for (const walletName of availableWallets) {
        const provider = getWalletProvider(walletName);
        if (provider && provider.publicKey) {
          try {
            STATE.wallet = new web3.PublicKey(provider.publicKey.toString());
            STATE.currentProvider = provider;
            STATE.currentWalletName = walletName;
            bindProviderEvents();
            await refreshBalance();
            // Refresh stake accounts asynchronously without blocking
            refreshStakeAccounts().catch(err => {
              console.warn('Stake accounts refresh failed (non-blocking):', err);
            });
            updateConnectButton();
            updateWalletIndicator();
            updateSubmitState();
            const displayName = getWalletDisplayName(walletName);
            setFeedback(`${displayName} wallet already connected.`, 'success');
            break;
          } catch (_) {
            /* ignore */
          }
        }
      }
    })();
    
    // Cleanup on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
      if (STATE.priceIntervalId) {
        clearInterval(STATE.priceIntervalId);
      }
      STATE.activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
      if (STATE.currentProvider && typeof STATE.currentProvider.removeAllListeners === 'function') {
        STATE.currentProvider.removeAllListeners();
      }
    });
  }
})();

