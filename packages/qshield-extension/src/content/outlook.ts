/**
 * Outlook Web content script — watches for compose windows and injects
 * QShield verification badges when the user clicks Send.
 *
 * Self-contained: no imports from other modules (content scripts
 * run as classic scripts in Chrome, not ES modules).
 */

const SEND_BUTTON_SELECTOR = 'button[aria-label="Send"], button[title="Send"]';
const COMPOSE_BODY_SELECTOR = 'div[role="textbox"][aria-label="Message body"]';
const COMPOSE_CONTAINER_SELECTOR = 'div[role="dialog"], div[class*="compose"]';
const RECIPIENT_SELECTOR = 'div[role="listbox"] span.wellItemText, span[class*="PersonaText"]';
const SUBJECT_SELECTOR = 'input[aria-label="Add a subject"]';

const processedComposes = new WeakSet<Element>();

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getRecipients(compose: Element): string[] {
  return Array.from(compose.querySelectorAll(RECIPIENT_SELECTOR))
    .map((el) => el.textContent?.trim())
    .filter((e): e is string => !!e && e.includes('@'));
}

function getSubject(compose: Element): string {
  const input = compose.querySelector(SUBJECT_SELECTOR) as HTMLInputElement | null;
  return input?.value ?? '';
}

function getBodyElement(compose: Element): HTMLElement | null {
  return compose.querySelector(COMPOSE_BODY_SELECTOR) as HTMLElement | null;
}

async function signAndInject(compose: Element): Promise<void> {
  const body = getBodyElement(compose);
  if (!body) return;

  const bodyText = body.innerText?.trim();
  if (!bodyText) return;

  body.querySelectorAll('.qshield-verification-badge').forEach((el) => el.remove());

  try {
    const contentHash = await sha256(bodyText);

    const response = await chrome.runtime.sendMessage({
      type: 'SIGN_EMAIL',
      data: {
        contentHash,
        subject: getSubject(compose),
        recipients: getRecipients(compose),
        timestamp: new Date().toISOString(),
        platform: 'outlook',
      },
    });

    if (!response?.success || !response.badgeHtml) return;

    const badge = document.createElement('div');
    badge.className = 'qshield-verification-badge';
    badge.setAttribute('data-verification-id', response.verificationId ?? '');
    badge.innerHTML = response.badgeHtml;
    body.appendChild(badge);
  } catch (err) {
    console.warn('[QShield] Badge injection failed:', err);
  }
}

async function attachToCompose(compose: Element): Promise<void> {
  if (processedComposes.has(compose)) return;
  processedComposes.add(compose);

  const configResult = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
  if (!configResult?.enabled || !configResult?.autoInject) return;

  const sendBtn = compose.querySelector(SEND_BUTTON_SELECTOR);
  if (sendBtn) {
    sendBtn.addEventListener(
      'click',
      () => { signAndInject(compose); },
      { capture: true, once: true },
    );
  }
}

function scanForComposes(): void {
  const containers = document.querySelectorAll(COMPOSE_CONTAINER_SELECTOR);
  for (const el of containers) {
    if (el.querySelector(COMPOSE_BODY_SELECTOR)) {
      attachToCompose(el);
    }
  }
}

const observer = new MutationObserver(() => scanForComposes());
observer.observe(document.body, { childList: true, subtree: true });

scanForComposes();

console.log('[QShield] Outlook content script loaded');
