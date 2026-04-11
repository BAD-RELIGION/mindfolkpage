/**
 * Jupiter Plugin: integrated swap with mindSOL fixed as output; modal fallback if the embed stays blank.
 * Loader: <script src="https://plugin.jup.ag/plugin-v1.js" data-preload defer> in stake-solana.html head.
 * @see https://dev.jup.ag/docs/guides/how-to-embed-a-swap-widget
 */
(function () {
  const MINDSOL_MINT = 'MiNdUFmqL5XyTBpqcfDzgySwKwdqEzunG2rfJMKb3bD';
  const TARGET_ID = 'mindSOL-jupiter-plugin';
  const JUPITER_INSTANCE_ID = 'jupiter-plugin-instance';

  const POLL_MS = 200;
  const POLL_MAX = 16;

  let swapInitialized = false;
  let postInitWatchScheduled = false;

  function destroyMindfolkJupiterSwap() {
    const host = document.getElementById(TARGET_ID);
    if (host) {
      host.innerHTML = '';
    }
    const orphan = document.getElementById(JUPITER_INSTANCE_ID);
    if (orphan && orphan.parentElement) {
      orphan.parentElement.removeChild(orphan);
    }
    swapInitialized = false;
    postInitWatchScheduled = false;
  }

  function restartMindfolkJupiterSwap() {
    destroyMindfolkJupiterSwap();
    liquidFeedback('Reloading swap…', 'info');
    window.requestAnimationFrame(function () {
      tryInit(0);
    });
  }

  function jupiterFormProps() {
    return {
      initialOutputMint: MINDSOL_MINT,
      fixedMint: MINDSOL_MINT
    };
  }

  /** Same-origin logo so local/staging loads; avoids broken img when og URL is missing on CDN. */
  function jupiterLogoUri() {
    try {
      if (typeof window === 'undefined' || !window.location) {
        return 'https://mindfolk.xyz/img/mindfolk-validator-logo.png';
      }
      if (window.location.protocol === 'file:') {
        return 'https://mindfolk.xyz/img/mindfolk-validator-logo.png';
      }
      return new URL('/img/mindfolk-validator-logo.png', window.location.origin).href;
    } catch (e) {
      return 'https://mindfolk.xyz/img/mindfolk-validator-logo.png';
    }
  }

  function jupiterBranding() {
    return {
      name: 'Mindfolk',
      logoUri: jupiterLogoUri()
    };
  }

  function modalFallbackBtn() {
    return document.querySelector('[data-jupiter-modal-fallback]');
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

  function jupiterSeemsRendered() {
    const el = document.getElementById(JUPITER_INSTANCE_ID);
    if (!el) return false;
    if (el.children.length > 0) return true;
    const sr = el.shadowRoot;
    if (sr) {
      if (sr.children.length > 0) return true;
      const text = sr.textContent?.trim() || '';
      if (text.length > 24) return true;
    }
    return false;
  }

  function startPostInitWatch() {
    if (postInitWatchScheduled) return;
    postInitWatchScheduled = true;

    let n = 0;
    function tick() {
      var rendered = jupiterSeemsRendered();
      if (rendered) {
        liquidFeedback('');
        setModalFallbackVisible(false);
        return;
      }
      n += 1;
      if (n >= POLL_MAX) {
        liquidFeedback(
          'The inline swap did not finish loading (often a browser extension or CSP blocking Jupiter). Use “Open swap in popup” below, or allow plugin.jup.ag and *.jup.ag in your network / blocker.',
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
    return {
      containerStyles: {
        width: '100%',
        maxWidth: '100%',
        height: 'auto'
      }
    };
  }

  /** Jupiter integrated shell uses ~max-w-[360px]; stretch to panel when shadow root is open. */
  function injectJupiterFullWidthStyles(shadowRoot) {
    if (!shadowRoot || shadowRoot.querySelector('style[data-mindfolk-jupiter-wide]')) return;
    var st = document.createElement('style');
    st.setAttribute('data-mindfolk-jupiter-wide', '1');
    st.textContent =
      '[class*="360px"]{max-width:100%!important;width:100%!important;}' +
      ':host{display:flex!important;flex-direction:column!important;width:100%!important;height:auto!important;min-height:min(72vh,820px)!important;}' +
      /* Jupiter uses flex + min-h-0 / h-full; in integrated mode that can collapse the token list to ~0px */
      '[class*="min-h-0"]{min-height:min(44vh,420px)!important;}' +
      '[class*="h-full"]{min-height:min(52vh,480px)!important;}' +
      '[class*="flex-col"]{min-height:min(56vh,520px)!important;}';
    shadowRoot.prepend(st);
  }

  function ensureJupiterFullWidthWhenReady() {
    var el = document.getElementById(JUPITER_INSTANCE_ID);
    if (!el) return;
    if (el.shadowRoot) {
      injectJupiterFullWidthStyles(el.shadowRoot);
      return;
    }
    var mo = new MutationObserver(function () {
      if (el.shadowRoot) {
        injectJupiterFullWidthStyles(el.shadowRoot);
        mo.disconnect();
      }
    });
    mo.observe(el, { childList: true, subtree: true });
    window.setTimeout(function () {
      mo.disconnect();
    }, 15000);
  }

  function openJupiterModalSwap() {
    if (!window.Jupiter?.init) {
      liquidFeedback('Jupiter script is not loaded yet. Wait a moment and try again.', 'error');
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
      ensureJupiterFullWidthWhenReady();
      startPostInitWatch();
      return true;
    } catch (err) {
      console.warn('Mindfolk: Jupiter Plugin integrated init failed', err);
      liquidFeedback('Swap widget failed to start. Try “Open swap in popup” or refresh the page.', 'error');
      setModalFallbackVisible(true);
      swapInitialized = true;
      return true;
    }
  }

  function tryInit(attempt) {
    if (swapInitialized) return;
    if (runInit()) return;
    if (attempt >= 160) {
      liquidFeedback(
        'Jupiter loader did not become ready in time. Check your connection, disable blockers for plugin.jup.ag, or use “Open swap in popup”.',
        'error'
      );
      setModalFallbackVisible(true);
      return;
    }
    window.setTimeout(() => tryInit(attempt + 1), 50);
  }

  window.initMindfolkJupiterSwapIfNeeded = function initMindfolkJupiterSwapIfNeeded() {
    if (!document.getElementById(TARGET_ID) || swapInitialized) return;
    tryInit(0);
  };

  window.restartMindfolkJupiterSwap = restartMindfolkJupiterSwap;

  function hookLiquidPanelObserver() {
    const liquid = document.querySelector('[data-panel="liquid"]');
    if (!liquid) return;
    const mo = new MutationObserver(() => {
      if (liquid.classList.contains('active')) {
        window.initMindfolkJupiterSwapIfNeeded();
      } else {
        destroyMindfolkJupiterSwap();
      }
    });
    mo.observe(liquid, { attributes: true, attributeFilter: ['class'] });
  }

  function onReady() {
    modalFallbackBtn()?.addEventListener('click', openJupiterModalSwap);
    document.querySelector('[data-jupiter-restart]')?.addEventListener('click', function () {
      restartMindfolkJupiterSwap();
    });
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
