# nftstake.mindfolk.xyz redirect

This is a tiny static site that redirects to:

- `https://www.gotmlabz.io/nftstake/mindfolk`

## How to publish on GitHub Pages

1. Create a new GitHub repository (public).
2. Upload these files (`index.html`, `404.html`) to the repository root.
3. In GitHub: **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: `master` (or `main`) and folder `/ (root)`
4. In GitHub: **Settings → Pages → Custom domain**
   - Set custom domain to `nftstake.mindfolk.xyz`
   - Save (GitHub will show the DNS record(s) you need)
5. In Unstoppable Domains DNS:
   - Add the DNS record(s) GitHub tells you to add (usually a `CNAME` for `nftstake`)
6. Wait for DNS to propagate (often 5–30 minutes; sometimes longer).

Visiting `https://nftstake.mindfolk.xyz` will redirect to GOTM LABZ staking.

Note: this is a redirect; after it loads, the browser address bar will show `gotmlabz.io`.

