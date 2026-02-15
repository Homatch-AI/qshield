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

// ── Secure message button ────────────────────────────────────────

function showTooltip(btn: HTMLElement, message: string): void {
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
    white-space: nowrap;
    pointer-events: none;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  tooltip.textContent = message;
  btn.style.position = 'relative';
  btn.appendChild(tooltip);
  setTimeout(() => tooltip.remove(), 2500);
}

const SECURE_BTN_LOCK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path></svg>`;

function buildSecureEmailBody(subject: string, shareUrl: string, expiresAt?: string): string {
  const expiryText = expiresAt
    ? `This link expires: ${new Date(expiresAt).toLocaleString()}`
    : 'This link expires in 24 hours';

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:24px;margin:8px 0;text-align:center;">
    <div style="font-size:32px;margin-bottom:8px;">\uD83D\uDD12</div>
    <div style="font-size:18px;font-weight:600;color:#0c4a6e;margin-bottom:4px;">Secure Message</div>
    <div style="font-size:14px;color:#475569;margin-bottom:16px;">This message has been encrypted with QShield for your protection.</div>
    <a href="${shareUrl}" style="display:inline-block;background:#0ea5e9;color:white;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:15px;">Read Secure Message \u2192</a>
    <div style="font-size:12px;color:#94a3b8;margin-top:12px;">${expiryText}</div>
  </div>
  <div style="text-align:center;margin-top:8px;">
    <span style="font-size:11px;color:#94a3b8;">Protected by <a href="https://qshield.io" style="color:#0ea5e9;text-decoration:none;">QShield</a> \u2014 Verify your emails too \u2192 <a href="https://qshield.io" style="color:#0ea5e9;text-decoration:none;">qshield.io</a></span>
  </div>
</div>`;
}

async function handleSecureClick(composeEl: Element, btn: HTMLElement): Promise<void> {
  const bodyEl = composeEl.querySelector('div[role="textbox"]')
    || composeEl.querySelector('div.Am.Al.editable');

  if (!bodyEl) return;

  const plainText = bodyEl.textContent?.trim() || '';
  if (!plainText) {
    showTooltip(btn, 'Write your message first');
    return;
  }

  const subjectInput = composeEl.querySelector('input[name="subjectbox"]') as HTMLInputElement | null;
  const subject = subjectInput?.value || 'Secure Message';

  const recipientEls = composeEl.querySelectorAll('span[email]');
  const recipients = Array.from(recipientEls).map((el) => el.getAttribute('email') || '');

  // Loading state
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: qshield-spin 1s linear infinite"><path d="M12 2v4m0 12v4m-8-10H2m20 0h-4m-1.4-6.6l-2.8 2.8m-5.6 5.6l-2.8 2.8m11.2 0l-2.8-2.8m-5.6-5.6L4.9 4.9"/></svg> Encrypting...`;
  btn.style.pointerEvents = 'none';

  if (!document.querySelector('#qshield-spin-style')) {
    const style = document.createElement('style');
    style.id = 'qshield-spin-style';
    style.textContent = '@keyframes qshield-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }';
    document.head.appendChild(style);
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_SECURE_MESSAGE',
      data: {
        subject,
        content: plainText,
        recipients,
        expiresIn: '24h',
        maxViews: -1,
        requireVerification: false,
      },
    }) as { success?: boolean; shareUrl?: string; expiresAt?: string; error?: string } | undefined;

    if (response?.success && response.shareUrl) {
      (bodyEl as HTMLElement).innerHTML = buildSecureEmailBody(subject, response.shareUrl, response.expiresAt);

      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Secured`;
      btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      btn.style.pointerEvents = 'auto';

      setTimeout(() => {
        btn.innerHTML = `${SECURE_BTN_LOCK_SVG} Secure`;
        btn.style.background = 'linear-gradient(135deg, #0ea5e9, #06b6d4)';
      }, 3000);
    } else {
      throw new Error(response?.error || 'Failed to create secure message');
    }
  } catch (err) {
    console.warn('[QShield] Secure message failed:', err);
    btn.innerHTML = `${SECURE_BTN_LOCK_SVG} Secure`;
    btn.style.pointerEvents = 'auto';
    showTooltip(btn, 'QShield Desktop not connected');
  }
}

export function injectSecureButton(body: HTMLElement): void {
  // Walk up to find the compose container
  let composeEl: Element | null = body;
  for (let i = 0; i < 20 && composeEl; i++) {
    if (composeEl.querySelector('[data-qshield-secure-btn]')) return;
    // Look for the toolbar within this ancestor
    const toolbar = composeEl.querySelector('.btC')
      || composeEl.querySelector('tr.btC')
      || composeEl.querySelector('div[role="toolbar"]');
    if (toolbar) {
      const btn = document.createElement('div');
      btn.setAttribute('data-qshield-secure-btn', 'true');
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', 'Send as secure message');
      btn.setAttribute('data-tooltip', 'Convert to encrypted message');
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        margin-left: 8px;
        background: linear-gradient(135deg, #0ea5e9, #06b6d4);
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        border-radius: 18px;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
        box-shadow: 0 1px 3px rgba(14, 165, 233, 0.3);
        vertical-align: middle;
      `;
      btn.innerHTML = `${SECURE_BTN_LOCK_SVG} Secure`;

      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'linear-gradient(135deg, #0284c7, #0891b2)';
        btn.style.boxShadow = '0 2px 8px rgba(14, 165, 233, 0.4)';
        btn.style.transform = 'translateY(-1px)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'linear-gradient(135deg, #0ea5e9, #06b6d4)';
        btn.style.boxShadow = '0 1px 3px rgba(14, 165, 233, 0.3)';
        btn.style.transform = 'translateY(0)';
      });

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handleSecureClick(composeEl!, btn);
      });

      // Insert after the Send button or at the end of toolbar
      const sendButton = composeEl.querySelector('div[role="button"][aria-label*="Send"]')
        || composeEl.querySelector('div.T-I.J-J5-Ji.aoO');
      if (sendButton && sendButton.parentElement) {
        sendButton.parentElement.insertBefore(btn, sendButton.nextSibling);
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

  // 1b. Inject "Secure" button into compose toolbar
  injectSecureButton(body);

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
