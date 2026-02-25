# Privacy Policy

**QShield Desktop** by Homatch AI, Inc.
Effective date: February 25, 2026

This policy explains what data QShield collects, how we use it, and your rights. We've written it in plain English because we believe you should actually understand what software does with your information.

---

## 1. Data Collected Locally (On Your Device)

QShield runs primarily on your machine. The following data is created and stored locally in encrypted SQLite databases:

- **Trust signals** from enabled adapters (Zoom, Teams, Email, File Watcher, API Listener, Crypto Wallet, AI Agent Monitor). Each signal includes the source adapter, a numeric score, weight, and timestamp.
- **Evidence records** — every trust event is hashed (HMAC-SHA256) and encrypted (AES-256-GCM) before being stored locally. Records are linked into a tamper-evident hash chain.
- **Configuration and preferences** — your settings, adapter configuration, license key, shield position, and notification preferences.
- **Adapter connection status** — whether each adapter is running, paused, or errored.

**What we do NOT collect locally:**
- No keystrokes or keyboard input
- No screen captures or screenshots
- No file contents — only filenames and metadata (size, modification time) for alert purposes
- No meeting audio or video recordings

## 2. Data Transmitted to Gateway (Only When You Connect)

If you choose to connect QShield to a Gateway server (Settings > Gateway), the following data is transmitted:

- **Trust signal scores** — source adapter, numeric score, weight, and timestamp
- **Evidence chain hashes** — cryptographic hashes only, not raw payloads. Your encrypted evidence payloads stay on your device.
- **Verification records** — when you embed trust scores in email signatures, the verification link metadata (score, timestamp, recipient domain) is stored on the Gateway
- **Certificate attestation data** — trust certificate metadata for verification purposes

All data transmission uses TLS 1.3 encryption. No data is sent to the Gateway unless you explicitly enable the connection.

## 3. Data We Never Collect

Regardless of configuration, QShield never collects:

- **File contents** or full file paths (only filenames appear in alerts)
- **Email bodies** (only sender address, subject line, and headers are processed)
- **Meeting audio or video** (only connection status: in-call, camera on/off, screen sharing)
- **Passwords, credentials, or API keys** (your secrets are managed by your OS keychain)
- **Browsing history** or web activity
- **Location data**

## 4. Third-Party Services

- **QShield Gateway** — hosted by Homatch AI on Railway. Used only when you enable Gateway sync. Subject to this privacy policy.
- **Analytics** — QShield includes no third-party analytics by default. We do not use Google Analytics, Mixpanel, or similar services.
- **Crash reporting** — Optional crash reporting via Sentry can be enabled in Settings. It is off by default. When enabled, it sends stack traces and device metadata (OS version, app version) to help us fix bugs. No trust data or evidence is included.

## 5. Data Retention

- **Local evidence and trust history** — retained on your device until you delete it. Uninstalling QShield or deleting the SQLite databases removes all local data.
- **Gateway data** — retained for 90 days, then automatically purged. You can delete your Gateway data at any time from Settings > Gateway > Disconnect & Delete.
- **Verification page data** — retained for 30 days after the last click/view, then automatically purged.

## 6. Your Rights

You have full control over your data:

- **Export** — Export all your data from Settings > Export Data (JSON format)
- **Delete cloud data** — Settings > Gateway > Disconnect & Delete removes all your data from our servers
- **Delete local data** — Uninstall QShield or delete the SQLite databases in your application support directory

**GDPR (European users):**
- Right to access your personal data
- Right to rectification of inaccurate data
- Right to erasure ("right to be forgotten")
- Right to data portability
- Right to restrict processing

**CCPA (California users):**
- Right to know what personal information we collect
- Right to delete your personal information
- Right to opt-out of the sale of personal information — we never sell your data to anyone

## 7. Children's Privacy

QShield is not intended for users under 16 years of age. We do not knowingly collect information from children. If you believe a child has provided us with personal data, please contact us at privacy@qshield.app and we will delete it.

## 8. Changes to This Policy

If we make material changes to this policy, we will notify you via in-app update notes before the changes take effect. Continued use of QShield after changes constitutes acceptance of the updated policy.

## 9. Contact

For privacy questions or data requests:

**Email:** privacy@qshield.app
**Company:** Homatch AI, Inc.
**Website:** https://qshield.app
