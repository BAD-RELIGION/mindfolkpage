# stakesol.mindfolk.xyz redirect

This is a tiny static site that redirects to:

- `https://mindfolk.xyz/stake-solana.html`

## How to publish on GitHub Pages

1. Create a new GitHub repository (public).
2. Upload these files (`index.html`, `404.html`) to the repository root.
3. In GitHub: **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: `master` (or `main`) and folder `/ (root)`
4. In GitHub: **Settings → Pages → Custom domain**
   - Set custom domain to `stakesol.mindfolk.xyz`
   - Save (GitHub will show the DNS record(s) you need)
5. In Unstoppable Domains DNS:
   - Add the DNS record(s) GitHub tells you to add (usually a `CNAME` for `stakesol`)
6. Wait for DNS to propagate (often 5–30 minutes; sometimes longer).

That’s it — visiting `https://stakesol.mindfolk.xyz` will redirect to the staking page.

