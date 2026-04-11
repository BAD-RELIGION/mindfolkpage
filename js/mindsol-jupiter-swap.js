/**
 * Jupiter Plugin: integrated swap with mindSOL fixed as output; modal fallback if the embed stays blank.
 * Loader: <script src="https://plugin.jup.ag/plugin-v1.js" data-preload defer> in stake-solana.html head.
 */
(function () {
  const MINDSOL_MINT = 'MiNdUFmqL5XyTBpqcfDzgySwKwdqEzunG2rfJMKb3bD';
  const TARGET_ID = 'mindSOL-jupiter-plugin';
  const POLL_MS = 200;
  const POLL_MAX = 16;
  const EXTERNAL_SWAP_URL = `https://jup.ag/swap/SOL-${MINDSOL_MINT}`;

  let swapInitialized = false;
  let postInitWatchScheduled = false;
  let runtimeHandlerBound = false;

  function jupiterFormProps() {
    return {
      initialOutputMint: MINDSOL_MINT,
      fixedMint: MINDSOL_MINT
    };
  }

  function jupiterLogoUri() {
    try {
      if (typeof window === 'undefined' || !window.location) return 'https://mindfolk.xyz/img/mindfolk-validator-logo.png';
      if (window.location.protocol === 'file:') return 'https://mindfolk.xyz/img/mindfolk-validator-logo.png';
      return new URL('/img/mindfolk-validator-logo.png', window.location.origin).href;
    } catch (_) {
      return 'https://mindfolk.xyz/img/mindfolk-validator-logo.png';
    }
  }

  function jupiterBranding() {
    return { name: 'Mindfolk', logoUri: jupiterLogoUri() };
  }

  function modalFallbackBtn() {
    return document.querySelector('[data-jupiter-modal-fallback]');
  }

  function isSeekerBrowser() {
    try {
      const ua = (navigator.userAgent || '').toLowerCase();
      return ua.includes('seeker') || ua.includes('solana mobile') || ua.includes('solanamobile');
    } catch (_) {
      return false;
    }
  }

  function liquidFeedback(message, type) {
    const panel = document.querySelector('[data-panel="liquid"]');
    const el = panel?.querySelector('[data-liquid-feedback]');
    if (!el) return;
    el.textContent = '';
    el.className = 'staking-feedback mb-2';
    if (!message) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = message;
    if (type) el.classList.add(`staking-feedback--${type}`);
  }

  function setModalFallbackVisible(show) {
    const btn = modalFallbackBtn();
    if (!btn) return;
    btn.classList.toggle('d-none', !show);
  }

  function isWalletPublicKeyRuntimeErrorMessage(msg) {
    if (!msg) return false;
    const m = String(msg).toLowerCase();
    return m.includes('walletpublickeyerror') || m.includes('invalid public key input');
  }

  function handleRuntimeWalletKeyError() {
    // Inline plugin can fail on some embedded Android wallet browsers (notably Seeker webview)
    // when wallet-standard account info is parsed as a PublicKey.
    swapInitialized = true;
    setModalFallbackVisible(true);
    liquidFeedback(
      'Inline swap is not stable in this browser wallet. Use "Open swap in popup" below.',
      'warning'
    );
  }

  function bindRuntimeErrorFallbackOnce() {
    if (runtimeHandlerBound) return;
    runtimeHandlerBound = true;

    window.addEventListener('error', function onJupiterRuntimeError(event) {
      const msg = event?.error?.message || event?.message || '';
      if (isWalletPublicKeyRuntimeErrorMessage(msg)) {
        handleRuntimeWalletKeyError();
      }
    });

    window.addEventListener('unhandledrejection', function onJupiterUnhandledRejection(event) {
      const reason = event?.reason;
      const msg =
        (reason && (reason.message || reason.toString && reason.toString())) || '';
      if (isWalletPublicKeyRuntimeErrorMessage(msg)) {
        handleRuntimeWalletKeyError();
      }
    });
  }

  function jupiterSeemsRendered() {
    const host = document.getElementById(TARGET_ID);
    if (!host) return false;
    if (host.children.length > 0) return true;
    const text = host.textContent?.trim() || '';
    return text.length > 24;
  }

  function startPostInitWatch() {
    if (postInitWatchScheduled) return;
    postInitWatchScheduled = true;

    let n = 0;
    function tick() {
      if (jupiterSeemsRendered()) {
        liquidFeedback('');
        setModalFallbackVisible(false);
        return;
      }
      n += 1;
      if (n >= POLL_MAX) {
        liquidFeedback(
          'The inline swap did not finish loading. Try "Open swap in popup", or allow plugin.jup.ag and *.jup.ag.',
          'error'
        );
        setModalFallbackVisible(true);
        return;
      }
      window.setTimeout(tick, POLL_MS);
    }

    window.setTimeout(tick, POLL_MS);
  }

  function jupiterContainerProps() {
    return { containerStyles: { width: '100%', maxWidth: '100%' } };
  }

  function openJupiterModalSwap() {
    if (isSeekerBrowser()) {
      window.open(EXTERNAL_SWAP_URL, '_blank', 'noopener,noreferrer');
      liquidFeedback('Opening Jupiter in a new tab for Seeker compatibility.', 'info');
      return;
    }

    if (!window.Jupiter?.init) {
      window.open(EXTERNAL_SWAP_URL, '_blank', 'noopener,noreferrer');
      liquidFeedback('Inline swap loader unavailable. Opened Jupiter in a new tab.', 'warning');
      return;
    }
    try {
      window.Jupiter.init({
        displayMode: 'modal',
        formProps: jupiterFormProps(),
        branding: jupiterBranding(),
        ...jupiterContainerProps()
      });
      liquidFeedback('Swap opened in a popup. Close it when you are done.', 'info');
    } catch (err) {
      console.warn('Mindfolk: Jupiter modal init failed', err);
      liquidFeedback('Could not open the Jupiter popup. Try refreshing the page.', 'error');
    }
  }

  function runInit() {
    const host = document.getElementById(TARGET_ID);
    if (!host || swapInitialized || !window.Jupiter?.init) return false;

    if (isSeekerBrowser()) {
      swapInitialized = true;
      setModalFallbackVisible(true);
      liquidFeedback('Seeker browser uses external Jupiter swap for best stability.', 'info');
      return true;
    }

    try {
      postInitWatchScheduled = false;
      setModalFallbackVisible(false);
      window.Jupiter.init({
        displayMode: 'integrated',
        integratedTargetId: TARGET_ID,
        formProps: jupiterFormProps(),
        branding: jupiterBranding(),
        ...jupiterContainerProps()
      });
      swapInitialized = true;
      liquidFeedback('');
      startPostInitWatch();
      return true;
    } catch (err) {
      console.warn('Mindfolk: Jupiter Plugin integrated init failed', err);
      liquidFeedback('Swap widget failed to start. Try "Open swap in popup" or refresh the page.', 'error');
      setModalFallbackVisible(true);
      swapInitialized = true;
      return true;
    }
  }

  function tryInit(attempt) {
    if (swapInitialized) return;
    if (runInit()) return;
    if (attempt >= 160) {
      liquidFeedback('Jupiter loader did not become ready in time. Try "Open swap in popup".', 'error');
      setModalFallbackVisible(true);
      return;
    }
    window.setTimeout(() => tryInit(attempt + 1), 50);
  }

  window.initMindfolkJupiterSwapIfNeeded = function initMindfolkJupiterSwapIfNeeded() {
    if (!document.getElementById(TARGET_ID) || swapInitialized) return;
    tryInit(0);
  };

  function hookLiquidPanelObserver() {
    const liquid = document.querySelector('[data-panel="liquid"]');
    if (!liquid) return;
    const mo = new MutationObserver(() => {
      if (liquid.classList.contains('active')) {
        window.initMindfolkJupiterSwapIfNeeded();
      }
    });
    mo.observe(liquid, { attributes: true, attributeFilter: ['class'] });
  }

  function onReady() {
    bindRuntimeErrorFallbackOnce();
    const fallbackBtn = modalFallbackBtn();
    if (isSeekerBrowser() && fallbackBtn) {
      fallbackBtn.textContent = 'Open Jupiter swap';
      fallbackBtn.classList.remove('d-none');
    }
    fallbackBtn?.addEventListener('click', openJupiterModalSwap);
    hookLiquidPanelObserver();
    if (document.querySelector('[data-panel="liquid"]')?.classList.contains('active')) {
      window.initMindfolkJupiterSwapIfNeeded();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
})();
