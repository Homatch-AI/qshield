# Gmail Integration Setup

QShield's Gmail adapter uses Google OAuth 2.0 to read email headers and metadata for trust monitoring. This guide explains how to set up the required OAuth credentials.

## Prerequisites

- A Google Cloud Platform account
- A project in Google Cloud Console

## Step 1: Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project
3. Navigate to **APIs & Services > Credentials**
4. Click **+ CREATE CREDENTIALS > OAuth client ID**
5. Select **Desktop app** as the application type
6. Name it `QShield Desktop`
7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

## Step 2: Enable the Gmail API

1. Navigate to **APIs & Services > Library**
2. Search for **Gmail API**
3. Click **Enable**

## Step 3: Configure OAuth Consent Screen

1. Navigate to **APIs & Services > OAuth consent screen**
2. Choose **External** (or Internal if using Google Workspace)
3. Fill in the required fields:
   - App name: `QShield Desktop`
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.metadata`
5. Add test users (required while in "Testing" status)

## Step 4: Set Environment Variables

Set these environment variables before launching QShield:

```bash
export QSHIELD_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export QSHIELD_GOOGLE_CLIENT_SECRET="your-client-secret"
```

On macOS, you can add these to your shell profile (`~/.zshrc` or `~/.bashrc`).

For development with Electron:
```bash
QSHIELD_GOOGLE_CLIENT_ID="..." QSHIELD_GOOGLE_CLIENT_SECRET="..." pnpm dev
```

## Step 5: Connect Gmail in QShield

1. Launch QShield Desktop
2. Go to **Settings**
3. Find the **Gmail Connection** section
4. Click **Connect Gmail**
5. A browser window opens with Google's consent screen
6. Grant read-only access
7. You'll see "Connected as user@gmail.com" in Settings

## Security Notes

- QShield requests **read-only** access. It cannot send, delete, or modify emails.
- OAuth tokens are stored encrypted on your device via `electron-store`.
- Tokens are never logged or transmitted to any server.
- You can revoke access at any time from Settings or from [Google Account Permissions](https://myaccount.google.com/permissions).

## Scopes Used

| Scope | Purpose |
|-------|---------|
| `gmail.readonly` | Read email messages and headers |
| `gmail.metadata` | Read email metadata (headers only, no body) |

## Troubleshooting

### "OAuth credentials not configured"
Set the `QSHIELD_GOOGLE_CLIENT_ID` and `QSHIELD_GOOGLE_CLIENT_SECRET` environment variables.

### "OAuth flow timed out"
The consent flow has a 2-minute timeout. Ensure your browser opened the Google consent page. Try again.

### "History expired, re-syncing"
This is normal — Gmail's history API has a limited retention window. QShield automatically falls back to listing recent messages.

### Port 18736 already in use
QShield uses port 18736 for the OAuth callback. If another process is using this port, close it and try again.
