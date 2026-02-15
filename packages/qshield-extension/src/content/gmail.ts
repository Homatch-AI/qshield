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
