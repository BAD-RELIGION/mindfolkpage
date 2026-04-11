/**
 * Registers Solana Mobile Wallet Adapter (MWA) with Wallet Standard so
 * embedded UIs (e.g. Jupiter) and our stake panel can discover mobile wallets
 * on Android / Seeker (HTTPS + secure context required).
 *
 * @see https://docs.solanamobile.com/developers/mobile-wallet-adapter
 */
try {
  const [{ registerMwa }, { SOLANA_MAINNET_CHAIN }] = await Promise.all([
    import(
      'https://esm.sh/@solana-mobile/wallet-standard-mobile@0.5.1?deps=@solana-mobile/mobile-wallet-adapter-protocol@2.2.7&target=es2022'
    ),
    import('https://esm.sh/@solana/wallet-standard-chains@1.1.1?target=es2022'),
  ]);

  registerMwa({
    appIdentity: {
      name: 'Mindfolk',
      uri: globalThis.location.origin,
      icon: new URL('/img/mindfolk-validator-logo.png', globalThis.location.href).toString(),
    },
    chains: [SOLANA_MAINNET_CHAIN],
  });
} catch (err) {
  console.warn('[Mindfolk] MWA registration skipped:', err?.message || err);
}
