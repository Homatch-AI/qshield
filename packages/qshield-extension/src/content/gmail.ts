/**
 * Gmail content script — detects compose windows and injects
 * QShield verification badges automatically.
 *
 * Strategy:
 * 1. MutationObserver watches for new compose windows
 * 2. When compose detected, inject badge immediately (static fallback)
 * 3. Try to sign with Desktop API — update badge with real verification ID
 * 4. On content changes, re-sign periodically (debounced)
 */

import { injectSecureButton } from './secure-button';

export const COMPOSE_BODY_SELECTORS = [
  'div[role="textbox"][aria-label="Message Body"]',
  'div.Am.Al.editable',
  'div[g_editable="true"]',
];
export const COMPOSE_CONTAINER_SELECTOR = 'div.M9, div.AD';
const RECIPIENT_SELECTOR = 'span[email]';
const SUBJECT_SELECTOR = 'input[name="subjectbox"]';
export const BADGE_CLASS = 'qshield-verification-badge';

const processedBodies = new WeakSet<Element>();

// ── Helpers ─────────────────────────────────────────────────────

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function findComposeBody(container: Element): HTMLElement | null {
  for (const sel of COMPOSE_BODY_SELECTORS) {
    const el = container.querySelector(sel) as HTMLElement | null;
    if (el) return el;
  }
  return null;
}

export function getRecipients(root: Element): string[] {
  // Walk up to find the compose form
  let el: Element | null = root;
  for (let i = 0; i < 20 && el; i++) {
    const recipients = el.querySelectorAll(RECIPIENT_SELECTOR);
    if (recipients.length > 0) {
      return Array.from(recipients)
        .map((r) => r.getAttribute('email'))
        .filter((e): e is string => !!e);
    }
    el = el.parentElement;
  }
  return [];
}

export function getSubject(root: Element): string {
  let el: Element | null = root;
  for (let i = 0; i < 20 && el; i++) {
    const input = el.querySelector(SUBJECT_SELECTOR) as HTMLInputElement | null;
    if (input) return input.value ?? '';
    el = el.parentElement;
  }
  return '';
}

// ── Static fallback badge (no API needed) ────────────────────────

export function createStaticBadgeHtml(): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin-top:12px;">
  <tr>
    <td style="padding:8px 0;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;border-left:3px solid #0ea5e9;">
        <tr>
          <td style="padding:8px 12px;vertical-align:middle;">
            <span style="font-size:13px;font-weight:600;color:#1e293b;">🛡 Verified by QShield</span>
            <span style="font-size:11px;color:#64748b;margin-left:8px;">This email is protected against interception</span>
          </td>
          <td style="padding:8px 12px;vertical-align:middle;">
            <span style="font-size:11px;color:#0ea5e9;font-weight:500;">Verify ↗</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:2px 0 0 0;">
      <span style="font-size:9px;color:#94a3b8;">Protected by </span>
      <span style="font-size:9px;color:#94a3b8;font-weight:600;">QShield</span>
      <span style="font-size:9px;color:#cbd5e1;"> — Verify your emails too → qshield.io</span>
    </td>
  </tr>
</table>`;
}

// ── Badge injection ──────────────────────────────────────────────

export function injectBadge(body: HTMLElement, html: string): void {
  // Remove existing badge
  body.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());

  const wrapper = document.createElement('div');
  wrapper.className = BADGE_CLASS;
  wrapper.contentEditable = 'false';
  wrapper.style.cssText = 'user-select:none;pointer-events:auto;margin-top:8px;';
  wrapper.innerHTML = html;
  body.appendChild(wrapper);
}

export async function trySignWithApi(body: HTMLElement): Promise<void> {
  const bodyText = body.innerText?.trim();
  if (!bodyText) return;

  try {
    const contentHash = await sha256(bodyText);

    const response = await chrome.runtime.sendMessage({
      type: 'SIGN_EMAIL',
      data: {
        contentHash,
        subject: getSubject(body),
        recipients: (() => { const r = getRecipients(body); return r.length > 0 ? r : ['draft']; })(),
        timestamp: new Date().toISOString(),
        platform: 'gmail',
      },
    });

    if (response?.success && response.badgeHtml) {
      injectBadge(body, response.badgeHtml);
      console.log('[QShield] Badge updated with verification ID:', response.verificationId);
    }
  } catch {
    // API not available — static badge is already showing
    console.log('[QShield] Desktop API not available, using static badge');
  }
}

// ── Attach Secure button ─────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ATTACH_LOCK_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path></svg>`;
const ATTACH_CLIP_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function truncateName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  const ext = name.split('.').pop() || '';
  const base = name.slice(0, maxLen - ext.length - 4);
  return base + '...' + ext;
}

function showAttachTooltip(btn: HTMLElement, message: string): void {
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: #1e293b;
    color: #e2e8f0;
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 6px;
    pointer-events: none;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    max-width: 280px;
    white-space: normal;
  `;
  tooltip.textContent = message;
  btn.style.position = 'relative';
  btn.appendChild(tooltip);
  setTimeout(() => tooltip.remove(), 3000);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function buildAttachmentCard(
  fileName: string,
  sizeBytes: number,
  shareUrl: string,
  expiresAt?: string,
): string {
  const sizeText = formatFileSize(sizeBytes);
  const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
  const expiryText = expiresAt
    ? `Expires: ${new Date(expiresAt).toLocaleDateString()}`
    : 'Expires in 7 days';

  const iconMap: Record<string, string> = {
    PDF: '\uD83D\uDCD5', DOC: '\uD83D\uDCD8', DOCX: '\uD83D\uDCD8',
    XLS: '\uD83D\uDCD7', XLSX: '\uD83D\uDCD7', PPT: '\uD83D\uDCD9',
    PPTX: '\uD83D\uDCD9', TXT: '\uD83D\uDCC4', CSV: '\uD83D\uDCCA',
    JSON: '\uD83D\uDCCB', ZIP: '\uD83D\uDCE6', PNG: '\uD83D\uDDBC\uFE0F',
    JPG: '\uD83D\uDDBC\uFE0F', JPEG: '\uD83D\uDDBC\uFE0F', GIF: '\uD83D\uDDBC\uFE0F',
  };
  const icon = iconMap[ext] || '\uD83D\uDCC4';

  return `
    <div style="margin:12px 0;">&nbsp;</div>
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:420px;width:100%;">
      <tr>
        <td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:0;overflow:hidden;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="background:#f0f9ff;border-bottom:1px solid #e0f2fe;padding:10px 16px;">
                <span style="font-size:12px;font-weight:700;color:#0c4a6e;letter-spacing:0.02em;">
                  \uD83D\uDD12 SECURE ATTACHMENT
                </span>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:16px;">
            <tr>
              <td style="width:40px;vertical-align:top;">
                <div style="font-size:28px;line-height:1;">${icon}</div>
              </td>
              <td style="padding-left:12px;vertical-align:top;">
                <div style="font-size:14px;font-weight:600;color:#1e293b;word-break:break-all;">${fileName}</div>
                <div style="font-size:12px;color:#64748b;margin-top:2px;">${ext} \u2022 ${sizeText}</div>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:0 16px 16px;">
            <tr>
              <td align="center">
                <a href="${shareUrl}" style="display:inline-block;background:#0ea5e9;color:white;text-decoration:none;padding:10px 28px;border-radius:8px;font-weight:600;font-size:14px;">
                  Download Securely \u2192
                </a>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:0 16px 12px;">
            <tr>
              <td style="font-size:11px;color:#94a3b8;text-align:center;">
                \uD83D\uDD10 End-to-end encrypted &nbsp;\u2022&nbsp; ${expiryText}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <div style="text-align:left;margin-top:6px;">
      <span style="font-size:11px;color:#94a3b8;">
        Protected by <a href="https://qshield.io" style="color:#0ea5e9;text-decoration:none;">QShield</a> \u2014
        Secure your files too \u2192 <a href="https://qshield.io" style="color:#0ea5e9;text-decoration:none;">qshield.io</a>
      </span>
    </div>
  `;
}

async function handleFileAttach(
  composeEl: Element,
  btn: HTMLElement,
  file: File,
): Promise<void> {
  if (file.size > MAX_FILE_SIZE) {
    showAttachTooltip(btn, `File too large (max 10 MB). ${file.name} is ${formatFileSize(file.size)}`);
    return;
  }
  if (file.size === 0) {
    showAttachTooltip(btn, 'File is empty');
    return;
  }

  const originalHtml = btn.innerHTML;

  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: qshield-spin 1s linear infinite"><path d="M12 2v4m0 12v4m-8-10H2m20 0h-4"/></svg> Encrypting ${truncateName(file.name, 20)}...`;
  btn.style.pointerEvents = 'none';

  if (!document.querySelector('#qshield-spin-style')) {
    const style = document.createElement('style');
    style.id = 'qshield-spin-style';
    style.textContent = '@keyframes qshield-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }';
    document.head.appendChild(style);
  }

  try {
    const base64Data = await readFileAsBase64(file);

    const response = await chrome.runtime.sendMessage({
      type: 'UPLOAD_SECURE_FILE',
      data: {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: base64Data,
        expiresIn: '7d',
        maxDownloads: 3,
      },
    }) as { success?: boolean; shareUrl?: string; expiresAt?: string; error?: string } | undefined;

    if (response?.success && response.shareUrl) {
      const bodyEl = composeEl.querySelector('div[role="textbox"]')
        || composeEl.querySelector('div.Am.Al.editable');

      if (bodyEl) {
        (bodyEl as HTMLElement).innerHTML += buildAttachmentCard(
          file.name,
          file.size,
          response.shareUrl,
          response.expiresAt,
        );
      }

      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> <span style="color:#10b981">Attached</span>`;
      btn.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      btn.style.pointerEvents = 'auto';

      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.style.borderColor = 'rgba(14, 165, 233, 0.25)';
      }, 3000);
    } else {
      throw new Error(response?.error || 'Upload failed');
    }
  } catch (err) {
    console.warn('[QShield] Secure file attach failed:', err);
    btn.innerHTML = originalHtml;
    btn.style.pointerEvents = 'auto';
    showAttachTooltip(btn, 'QShield Desktop not connected');
  }
}

function injectAttachSecureButton(body: HTMLElement): void {
  let composeEl: Element | null = body;
  for (let i = 0; i < 20 && composeEl; i++) {
    if (composeEl.querySelector('[data-qshield-attach-btn]')) return;

    const toolbar = composeEl.querySelector('.btC')
      || composeEl.querySelector('tr.btC')
      || composeEl.querySelector('div[role="toolbar"]');
    if (toolbar) {
      const attachBtn = composeEl.querySelector('div[command="Files"]')
        || composeEl.querySelector('div[aria-label*="Attach"]')
        || composeEl.querySelector('div.a1.aaA.aMZ');

      const btn = document.createElement('div');
      btn.setAttribute('data-qshield-attach-btn', 'true');
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', 'Attach encrypted file');
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        margin-left: 6px;
        background: rgba(14, 165, 233, 0.08);
        border: 1px solid rgba(14, 165, 233, 0.25);
        color: #0ea5e9;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 600;
        border-radius: 16px;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
        vertical-align: middle;
      `;
      btn.innerHTML = `${ATTACH_LOCK_SVG} ${ATTACH_CLIP_SVG} Attach Secure`;

      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(14, 165, 233, 0.15)';
        btn.style.borderColor = 'rgba(14, 165, 233, 0.4)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(14, 165, 233, 0.08)';
        btn.style.borderColor = 'rgba(14, 165, 233, 0.25)';
      });

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';
      fileInput.setAttribute('data-qshield-file-input', 'true');
      fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.zip,.png,.jpg,.jpeg,.gif';
      btn.appendChild(fileInput);

      const capturedCompose = composeEl;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileInput.click();
      });

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        await handleFileAttach(capturedCompose, btn, file);
        fileInput.value = '';
      });

      if (attachBtn && attachBtn.parentElement) {
        attachBtn.parentElement.insertBefore(btn, attachBtn.nextSibling);
      } else {
        toolbar.appendChild(btn);
      }
      return;
    }
    composeEl = composeEl.parentElement;
  }
}

// ── Compose window handling ──────────────────────────────────────

export function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout>;
  return () => { clearTimeout(timer); timer = setTimeout(fn, ms); };
}

export async function attachToComposeBody(body: HTMLElement): Promise<void> {
  if (processedBodies.has(body)) return;
  processedBodies.add(body);

  console.log('[QShield] Compose window detected, injecting badge');

  // 1. Inject static badge immediately (works without API)
  injectBadge(body, createStaticBadgeHtml());

  // 1b. Inject "Secure" and "Attach Secure" buttons into compose toolbar
  injectSecureButton(body, {
    bodySelector: 'div[role="textbox"], div.Am.Al.editable',
    subjectSelector: 'input[name="subjectbox"]',
    recipientSelector: 'span[email]',
    toolbarSelector: '.btC, tr.btC, div[role="toolbar"]',
    sendButtonSelector: 'div[role="button"][aria-label*="Send"], div.T-I.J-J5-Ji.aoO',
    getRecipientEmail: (el) => el.getAttribute('email') || '',
  });
  injectAttachSecureButton(body);

  // 2. Try to get a real signed badge from Desktop API
  await trySignWithApi(body);

  // 3. Watch for content changes — re-sign periodically
  const debouncedResign = debounce(() => trySignWithApi(body), 3000);

  const contentObserver = new MutationObserver(() => {
    // Don't re-trigger on our own badge injection
    const lastChild = body.lastElementChild;
    if (lastChild?.classList.contains(BADGE_CLASS)) return;
    debouncedResign();
  });

  contentObserver.observe(body, { childList: true, characterData: true, subtree: true });
}

export function scanForComposes(): void {
  // Method 1: Find compose containers
  const containers = document.querySelectorAll(COMPOSE_CONTAINER_SELECTOR);
  for (const container of containers) {
    const body = findComposeBody(container);
    if (body) attachToComposeBody(body);
  }

  // Method 2: Direct search for editable textboxes (fallback)
  for (const sel of COMPOSE_BODY_SELECTORS) {
    const bodies = document.querySelectorAll(sel);
    for (const body of bodies) {
      attachToComposeBody(body as HTMLElement);
    }
  }
}

// ── Initialize ───────────────────────────────────────────────────

export function init(): void {
  const observer = new MutationObserver(() => scanForComposes());
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan
  scanForComposes();

  // Also scan periodically as a safety net (Gmail can be tricky)
  setInterval(scanForComposes, 2000);

  console.log('[QShield] Gmail content script loaded');
}

init();
