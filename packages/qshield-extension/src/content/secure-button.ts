/**
 * Shared "Secure" button logic — used by both Gmail and Outlook content scripts.
 *
 * Extracts compose body text, sends CREATE_SECURE_MESSAGE to the background
 * service worker, and replaces the email body with a secure link.
 */

// ── Types ────────────────────────────────────────────────────────

export interface SecureButtonConfig {
  /** CSS selectors for the editable body element (comma-separated or single). */
  bodySelector: string;
  /** CSS selector for the subject input. */
  subjectSelector: string;
  /** CSS selector for recipient elements. */
  recipientSelector: string;
  /** CSS selectors for the compose toolbar (comma-separated or single). */
  toolbarSelector: string;
  /** CSS selectors for the Send button (comma-separated or single). */
  sendButtonSelector: string;
  /** How to extract email from recipient elements. */
  getRecipientEmail?: (el: Element) => string;
}

// ── Constants ────────────────────────────────────────────────────

const SECURE_BTN_LOCK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path></svg>`;

const SPINNER_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: qshield-spin 1s linear infinite"><path d="M12 2v4m0 12v4m-8-10H2m20 0h-4m-1.4-6.6l-2.8 2.8m-5.6 5.6l-2.8 2.8m11.2 0l-2.8-2.8m-5.6-5.6L4.9 4.9"/></svg>`;

const CHECK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

// ── Tooltip ──────────────────────────────────────────────────────

export function showTooltip(btn: HTMLElement, message: string): void {
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

// ── Secure email body HTML ───────────────────────────────────────

export function buildSecureEmailBody(subject: string, shareUrl: string, expiresAt?: string): string {
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

// ── Click handler ────────────────────────────────────────────────

async function handleSecureClick(
  composeEl: Element,
  btn: HTMLElement,
  config: SecureButtonConfig,
): Promise<void> {
  const bodyEl = queryFirst(composeEl, config.bodySelector);
  if (!bodyEl) return;

  const plainText = bodyEl.textContent?.trim() || '';
  if (!plainText) {
    showTooltip(btn, 'Write your message first');
    return;
  }

  const subjectInput = composeEl.querySelector(config.subjectSelector) as HTMLInputElement | null;
  const subject = subjectInput?.value || 'Secure Message';

  const recipientEls = composeEl.querySelectorAll(config.recipientSelector);
  const getEmail = config.getRecipientEmail ?? ((el: Element) => el.getAttribute('email') || el.textContent?.trim() || '');
  const recipients = Array.from(recipientEls).map(getEmail).filter(Boolean);

  // Loading state
  btn.innerHTML = `${SPINNER_SVG} Encrypting...`;
  btn.style.pointerEvents = 'none';

  ensureSpinAnimation();

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

      btn.innerHTML = `${CHECK_SVG} Secured`;
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

// ── Button injection ─────────────────────────────────────────────

/**
 * Injects a "Secure" button into the compose toolbar closest to `body`.
 * Walks up the DOM from the body element to find the toolbar.
 */
export function injectSecureButton(body: HTMLElement, config: SecureButtonConfig): void {
  let composeEl: Element | null = body;
  for (let i = 0; i < 20 && composeEl; i++) {
    if (composeEl.querySelector('[data-qshield-secure-btn]')) return;

    const toolbar = queryFirst(composeEl, config.toolbarSelector);
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

      // Capture composeEl reference for the click handler closure
      const capturedCompose = composeEl;
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handleSecureClick(capturedCompose, btn, config);
      });

      // Insert after the Send button or at the end of toolbar
      const sendButton = queryFirst(composeEl, config.sendButtonSelector);
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

// ── Helpers ──────────────────────────────────────────────────────

/** Try each comma-separated selector until one matches. */
function queryFirst(root: Element, selectors: string): Element | null {
  for (const sel of selectors.split(',').map((s) => s.trim())) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function ensureSpinAnimation(): void {
  if (!document.querySelector('#qshield-spin-style')) {
    const style = document.createElement('style');
    style.id = 'qshield-spin-style';
    style.textContent = '@keyframes qshield-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }';
    document.head.appendChild(style);
  }
}
