# Wallet Verification Guide - Removing "Malicious Website" Warnings

## Why Wallets Flag Websites

Phantom and Solflare use security systems that flag websites as potentially malicious for several reasons:

1. **New/Unknown Domain**: New domains or domains not in their whitelist
2. **Domain Reputation**: Domain not yet established in security databases
3. **Transaction Patterns**: Unusual transaction requests
4. **Missing Security Headers**: Incomplete security configuration
5. **Blacklist Issues**: Domain may be on a security blacklist (false positive)

## Steps to Resolve

### 1. Contact Wallet Support Directly

**Phantom Wallet:**
- **Help Center**: https://help.phantom.app/
- **Email**: [email protected]
- **Twitter**: @phantom
- **Discord**: https://discord.gg/phantom
- **Request**: Ask them to whitelist/verify your domain for dApp connections

**Solflare Wallet:**
- **Help Center**: https://help.solflare.com/
- **Email**: [email protected]
- **Twitter**: @solflare_wallet
- **Request**: Ask them to whitelist/verify your domain for dApp connections

### 2. Improve Domain Reputation

**What to include in your request:**
- Your domain name
- Brief description of your project (Mindfolk validator staking)
- Validator address: `MFLKX9vSfWXa4ZcVVpp4GF64ZbNUiX9EjSqtqNMdFXB`
- Link to your website
- Explain that you're a legitimate Solana validator offering staking services
- Mention that users are getting false positive warnings

### 3. Security Best Practices

Ensure your website follows security best practices:

✅ **Already Implemented:**
- HTTPS enabled (required for wallet connections)
- Content Security Policy (CSP) headers
- Proper transaction signing flow
- Validator address verification

**Additional Recommendations:**
- Add security.txt file (see below)
- Ensure SSL certificate is valid and properly configured
- Use proper HTTP security headers
- Implement rate limiting if possible

### 4. Create security.txt File

Create a `security.txt` file in your website root to help establish legitimacy:

```
Contact: mailto:[your-email]
Expires: 2025-12-31T23:59:59.000Z
Preferred-Languages: en
Canonical: https://yourdomain.com/.well-known/security.txt
```

### 5. Domain Age and Reputation

- **New domains** are more likely to be flagged
- **Established domains** with good reputation are less likely to trigger warnings
- Consider using a subdomain of an established domain if possible

### 6. Community Verification

- Post in Solana community forums/Discord
- Get verified on Solana ecosystem directories
- List your validator on Solana validator directories
- Build community trust and references

## What to Say in Your Support Request

**Template:**

```
Subject: Request to Whitelist Domain for dApp Connection

Hello [Phantom/Solflare] Support Team,

I'm reaching out to request whitelisting/verification of our domain for dApp connections.

Domain: [your-domain.com]
Project: Mindfolk Validator - Solana Staking Service
Validator Address: MFLKX9vSfWXa4ZcVVpp4GF64ZbNUiX9EjSqtqNMdFXB

Our website provides legitimate Solana staking services through our validator. 
However, users are receiving "malicious website" warnings when trying to connect 
their wallets, which is preventing them from using our service.

We follow all security best practices:
- HTTPS enabled
- Content Security Policy implemented
- Proper transaction signing flow
- Validator address verification

Could you please review and whitelist our domain? We're happy to provide any 
additional information or documentation needed.

Thank you for your time and assistance.

Best regards,
[Your Name]
[Your Contact Information]
```

## Alternative Solutions

### For Users (Temporary Workaround)

Users can manually approve the connection despite the warning:
1. When the warning appears, look for "Advanced" or "Details" option
2. Click "Proceed anyway" or "I understand the risks"
3. The connection should still work

**Note**: This is not ideal as it may deter users, but it's a temporary solution while waiting for whitelisting.

### Domain Verification Services

Consider getting verified on:
- **Solana dApp directories** (if available)
- **Security verification services**
- **Blockchain security auditors** (for larger projects)

## Timeline

- **Response Time**: Wallet support teams typically respond within 1-3 business days
- **Verification Process**: Can take 1-2 weeks after initial contact
- **Whitelisting**: Usually happens within 2-4 weeks after verification

## Prevention for Future

1. **Register domain early** and build reputation before launching
2. **Use established domains** when possible
3. **Implement security best practices** from day one
4. **Get security audits** for larger projects
5. **Build community trust** before launch

## Additional Resources

- Phantom Security: https://help.phantom.app/
- Solflare Security: https://help.solflare.com/
- Solana Validator Directory: https://www.validators.app/
- Solana Security Best Practices: https://docs.solana.com/

---

**Last Updated**: 2024
**Status**: Active issue - Contact wallet support teams for resolution



