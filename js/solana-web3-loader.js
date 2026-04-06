(() => {
  const PRIMARY = 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.98.4/lib/index.iife.min.js';
  const FALLBACK = 'https://unpkg.com/@solana/web3.js@1.98.4/lib/index.iife.min.js';

  function inject(src, onload, onerror) {
    const s = document.createElement('script');
    s.id = 'solana-web3-script';
    s.src = src;
    s.async = true;
    s.onload = onload;
    s.onerror = onerror;
    document.head.appendChild(s);
  }

  // If already present (e.g., cached page), don’t add twice.
  if (document.getElementById('solana-web3-script')) return;

  inject(PRIMARY, null, () => {
    // Remove failed tag before adding fallback.
    const old = document.getElementById('solana-web3-script');
    if (old) old.remove();
    inject(FALLBACK);
  });
})();

