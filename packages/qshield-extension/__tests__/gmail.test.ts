import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sha256,
  findComposeBody,
  getRecipients,
  getSubject,
  createStaticBadgeHtml,
  injectBadge,
  debounce,
  trySignWithApi,
  attachToComposeBody,
  scanForComposes,
  BADGE_CLASS,
  COMPOSE_BODY_SELECTORS,
  COMPOSE_CONTAINER_SELECTOR,
} from '../src/content/gmail';

// ── Chrome API mock ──────────────────────────────────────────────

const mockSendMessage = vi.fn();
vi.stubGlobal('chrome', {
  runtime: { sendMessage: mockSendMessage },
});

beforeEach(() => {
  document.body.innerHTML = '';
  mockSendMessage.mockReset();
});

// ── sha256 ───────────────────────────────────────────────────────

describe('sha256', () => {
  it('produces a 64-char hex string', async () => {
    const hash = await sha256('hello');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const a = await sha256('test input');
    const b = await sha256('test input');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await sha256('input A');
    const b = await sha256('input B');
    expect(a).not.toBe(b);
  });
});

// ── findComposeBody ──────────────────────────────────────────────

describe('findComposeBody', () => {
  it.each(COMPOSE_BODY_SELECTORS)(
    'finds element matching selector: %s',
    (selector) => {
      const container = document.createElement('div');
      const body = document.createElement('div');

      // Parse the selector to set attributes
      if (selector.includes('role="textbox"')) {
        body.setAttribute('role', 'textbox');
        body.setAttribute('aria-label', 'Message Body');
      } else if (selector.includes('Am')) {
        body.className = 'Am Al editable';
      } else if (selector.includes('g_editable')) {
        body.setAttribute('g_editable', 'true');
      }

      container.appendChild(body);
      expect(findComposeBody(container)).toBe(body);
    },
  );

  it('returns null when no matching element exists', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>nothing here</p>';
    expect(findComposeBody(container)).toBeNull();
  });
});

// ── getRecipients ────────────────────────────────────────────────

describe('getRecipients', () => {
  it('extracts emails from span[email] in parent hierarchy', () => {
    const form = document.createElement('div');
    form.innerHTML = `
      <div>
        <span email="alice@example.com"></span>
        <span email="bob@example.com"></span>
      </div>
      <div class="body-wrapper"><div id="body"></div></div>
    `;
    document.body.appendChild(form);

    const body = form.querySelector('#body')!;
    const result = getRecipients(body);
    expect(result).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('returns empty array when no recipients found', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(getRecipients(el)).toEqual([]);
  });
});

// ── getSubject ───────────────────────────────────────────────────

describe('getSubject', () => {
  it('extracts value from input[name="subjectbox"]', () => {
    const form = document.createElement('div');
    form.innerHTML = `
      <input name="subjectbox" value="Hello World" />
      <div id="body"></div>
    `;
    document.body.appendChild(form);

    const body = form.querySelector('#body')!;
    expect(getSubject(body)).toBe('Hello World');
  });

  it('returns empty string when no subject input found', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(getSubject(el)).toBe('');
  });
});

// ── createStaticBadgeHtml ────────────────────────────────────────

describe('createStaticBadgeHtml', () => {
  it('contains verification text', () => {
    const html = createStaticBadgeHtml();
    expect(html).toContain('Verified by QShield');
    expect(html).toContain('protected against interception');
  });

  it('contains verify link text', () => {
    const html = createStaticBadgeHtml();
    expect(html).toContain('Verify');
  });
});

// ── injectBadge ──────────────────────────────────────────────────

describe('injectBadge', () => {
  it('appends a badge div to the body element', () => {
    const body = document.createElement('div');
    injectBadge(body, '<span>badge</span>');

    const badge = body.querySelector(`.${BADGE_CLASS}`);
    expect(badge).not.toBeNull();
    expect(badge!.innerHTML).toContain('badge');
    expect(badge!.getAttribute('contenteditable')).toBe('false');
  });

  it('replaces existing badge on re-inject', () => {
    const body = document.createElement('div');
    injectBadge(body, '<span>first</span>');
    injectBadge(body, '<span>second</span>');

    const badges = body.querySelectorAll(`.${BADGE_CLASS}`);
    expect(badges).toHaveLength(1);
    expect(badges[0].innerHTML).toContain('second');
  });
});

// ── debounce ─────────────────────────────────────────────────────

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resets timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced(); // reset
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledOnce();
  });
});

// ── trySignWithApi ───────────────────────────────────────────────

describe('trySignWithApi', () => {
  it('sends SIGN_EMAIL message via chrome.runtime', async () => {
    mockSendMessage.mockResolvedValue({ success: false });

    const body = document.createElement('div');
    body.innerText = 'Hello email body';
    await trySignWithApi(body);

    expect(mockSendMessage).toHaveBeenCalledOnce();
    const msg = mockSendMessage.mock.calls[0][0];
    expect(msg.type).toBe('SIGN_EMAIL');
    expect(msg.data.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(msg.data.platform).toBe('gmail');
  });

  it('updates badge when API returns success', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      badgeHtml: '<span>signed badge</span>',
      verificationId: 'abc-123',
    });

    const body = document.createElement('div');
    body.innerText = 'Hello email body';
    await trySignWithApi(body);

    const badge = body.querySelector(`.${BADGE_CLASS}`);
    expect(badge).not.toBeNull();
    expect(badge!.innerHTML).toContain('signed badge');
  });

  it('handles API failure gracefully', async () => {
    mockSendMessage.mockRejectedValue(new Error('disconnected'));

    const body = document.createElement('div');
    body.innerText = 'Hello email body';

    // Should not throw
    await expect(trySignWithApi(body)).resolves.toBeUndefined();
  });

  it('skips when body text is empty', async () => {
    const body = document.createElement('div');
    body.innerText = '';
    await trySignWithApi(body);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

// ── attachToComposeBody ──────────────────────────────────────────

describe('attachToComposeBody', () => {
  it('injects a static badge immediately', async () => {
    mockSendMessage.mockResolvedValue({ success: false });

    const body = document.createElement('div');
    body.innerText = 'draft text';
    await attachToComposeBody(body);

    const badge = body.querySelector(`.${BADGE_CLASS}`);
    expect(badge).not.toBeNull();
    expect(badge!.innerHTML).toContain('Verified by QShield');
  });

  it('skips already-processed bodies', async () => {
    mockSendMessage.mockResolvedValue({ success: false });

    const body = document.createElement('div');
    body.innerText = 'draft text';
    await attachToComposeBody(body);
    await attachToComposeBody(body);

    // Should only have one badge (not duplicated)
    const badges = body.querySelectorAll(`.${BADGE_CLASS}`);
    expect(badges).toHaveLength(1);
  });
});

// ── scanForComposes ──────────────────────────────────────────────

describe('scanForComposes', () => {
  it('finds compose bodies via container selector', () => {
    mockSendMessage.mockResolvedValue({ success: false });

    // Create a compose container with a compose body
    const container = document.createElement('div');
    container.className = 'M9';
    const body = document.createElement('div');
    body.setAttribute('role', 'textbox');
    body.setAttribute('aria-label', 'Message Body');
    body.innerText = 'test';
    container.appendChild(body);
    document.body.appendChild(container);

    scanForComposes();

    const badge = body.querySelector(`.${BADGE_CLASS}`);
    expect(badge).not.toBeNull();
  });

  it('finds compose bodies via direct selector fallback', () => {
    mockSendMessage.mockResolvedValue({ success: false });

    // Create a compose body without a container
    const body = document.createElement('div');
    body.className = 'Am Al editable';
    body.innerText = 'test';
    document.body.appendChild(body);

    scanForComposes();

    const badge = body.querySelector(`.${BADGE_CLASS}`);
    expect(badge).not.toBeNull();
  });
});
