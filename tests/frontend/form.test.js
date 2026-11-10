import {
  afterEach, describe, expect, it, vi,
} from 'vitest';

// Boots the real form module against a fresh DOM. `main.js` reads
// window.PLEDGE_CONFIG at import time, so it must be set before the dynamic
// import, and the module registry reset to re-render between tests.
//
// Rendering the full form under jsdom is comparatively slow (a few seconds), so
// related cases are grouped into one boot where they share state; the pure
// pricing maths has its own fast suite in pledge-math.test.js.
async function boot({ search = '', config = {} } = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState({}, '', search ? `/?${search}` : '/');
  window.PLEDGE_CONFIG = { submitUrl: 'https://api.test/api/pledges', dev: true, ...config };
  vi.resetModules();
  await import('../../src/main.js');
  return document.querySelector('#pledge-form');
}

function dispatchSubmit(form) {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

// In dev mode a submit may open the JSON preview popup; confirm it if it appears.
// (`devPayloadConfirmed` toggles each submit, so it can appear on any attempt.)
function confirmPendingPopup() {
  const send = document.querySelector('.dev-popup-send');
  if (send) send.click();
  return Boolean(send);
}

const submitErrorCause = () => document.querySelector('#submit-error-cause').textContent;
const submitButton = () => document.querySelector('button.submit');

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('form boot', () => {
  it('renders the form, loads test data and calculates a positive total', async () => {
    await boot();
    expect(document.querySelector('#pledge-form')).toBeTruthy();
    expect(document.querySelector('#dev-fill')).toBeTruthy();

    document.querySelector('#dev-fill').click();

    expect(document.querySelector('[name="parentName"]').value.length).toBeGreaterThan(0);
    expect(Number(document.querySelector('[name="totalPledge"]').value)).toBeGreaterThan(0);
    expect(document.querySelector('#year-total').textContent).toMatch(/\$/);
    expect(document.querySelector('#term-total').textContent).toMatch(/\$/);
  });
});

describe('blank print setup', () => {
  it('uses the chosen child counts and names throughout the printed form', async () => {
    await boot({ search: 'admin=1', config: { formUrl: 'https://example.org/pledge-form' } });

    const setCount = (selector, value) => {
      const select = document.querySelector(selector);
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setCount('#admin-print-school-count', '2');
    setCount('#admin-print-kindergarten-count', '1');
    document.querySelector('[data-print-name="school1"]').value = 'Aria Thompson';
    document.querySelector('[data-print-name="school2"]').value = 'Milo Thompson';
    document.querySelector('[data-print-name="kindergarten1"]').value = 'Ruby Thompson';

    document.querySelector('#admin-print-blank').click();

    expect(document.querySelectorAll('#school-children .child-row')).toHaveLength(2);
    expect(document.querySelectorAll('#kindergarten-children .child-row')).toHaveLength(1);
    expect(document.querySelector('[name="school1Name"]').value).toBe('Aria Thompson');
    expect(document.querySelector('[name="kindergarten1Name"]').value).toBe('Ruby Thompson');
    expect([...document.querySelectorAll('#medical-info-rows .medical-info-row strong')].map((element) => element.textContent))
      .toEqual(['Aria Thompson', 'Milo Thompson', 'Ruby Thompson']);
    expect(document.querySelector('#eotc-school-consent .consent-names').textContent).toBe('Aria Thompson and Milo Thompson');
    expect(document.body.classList.contains('print-blank')).toBe(true);

    const note = document.querySelector('#print-note');
    expect(note.hidden).toBe(false);
    expect(note.querySelector('a').getAttribute('href')).toBe('https://example.org/pledge-form');
    expect(document.querySelector('#medical-info-rows textarea').hasAttribute('placeholder')).toBe(false);
    expect(document.querySelector('.return-to-office').textContent).toBe('Please return this form to the school office.');
    expect(document.querySelector('.print-final footer')).toBeTruthy();
    expect(document.querySelector('#pledge-form > .sign-card')).toBeNull();
    expect(document.querySelector('.disbursement-card')).toBeTruthy();
    expect(document.querySelector('.payment-card')).toBeTruthy();
    expect(document.querySelector('.pledge-card .disbursement-block')).toBeNull();
    expect(document.querySelector('.family-type').hidden).toBe(false);
    expect(document.querySelector('[name="otherParentName"]').closest('label').hidden).toBe(false);
    expect(document.querySelector('#other-parent-signature').hidden).toBe(false);

    window.dispatchEvent(new Event('afterprint'));
    expect(document.body.classList.contains('print-blank')).toBe(false);
    expect(note.hidden).toBe(true);
    expect(document.querySelector('.print-final')).toBeNull();
    expect(document.querySelector('.print-subcard')).toBeNull();
    expect(document.querySelector('#pledge-form > .sign-card')).toBeTruthy();
    expect(document.querySelector('.shell > footer')).toBeTruthy();
    expect(document.querySelector('.pledge-card .disbursement-block')).toBeTruthy();
  });
});

describe('successful submission', () => {
  it('posts the serialized form with submission metadata and no warning', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ message: 'Pledge received' }) }));
    vi.stubGlobal('fetch', fetchMock);

    const form = await boot();
    document.querySelector('#dev-fill').click();
    dispatchSubmit(form);
    confirmPendingPopup();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/api/pledges');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.form.parentName.length).toBeGreaterThan(0);
    expect(body.dev).toBe(true);
    expect(body.formVersion).toBeTruthy();
    expect(typeof body.timeOnPageMs).toBe('number');
    expect(body.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await vi.waitFor(() => expect(document.querySelector('#submit-success').hidden).toBe(false));
    expect(document.querySelector('#success-warning').hidden).toBe(true);
  });

  it('warns the parent when the confirmation email could not be sent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        message: 'Pledge received',
        confirmationEmailSent: false,
        warning: 'The school has received your pledge, but a confirmation email could not be sent to test@example.com. Please check that your email address is correct, or contact the school office.',
      }),
    })));

    const form = await boot();
    document.querySelector('#dev-fill').click();
    dispatchSubmit(form);
    confirmPendingPopup();

    await vi.waitFor(() => expect(document.querySelector('#submit-success').hidden).toBe(false));
    const warning = document.querySelector('#success-warning');
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toMatch(/could not be sent/);
  });
});

describe('failed submission', () => {
  const ERROR_CASES = [
    { status: 400, body: { error: 'Validation failed', details: ['Missing required field: email'] }, expected: /rejected the form: Missing required field: email/i },
    { status: 400, body: { error: 'Validation failed' }, expected: /rejected the form\. Something may be missing or invalid\./i },
    { status: 404, body: {}, expected: /submission address could not be found/i },
    { status: 413, body: {}, expected: /too large for the school.s server/i },
    { status: 429, body: {}, expected: /Too many submissions/i },
    { status: 500, body: {}, expected: /internal error/i },
    { status: 502, body: { error: 'Failed to send notification email' }, expected: /could not complete the submission/i },
    { status: 503, body: {}, expected: /temporarily unavailable/i },
    { status: 504, body: {}, expected: /took too long/i },
  ];

  it('shows the right message and keeps the form retryable for every failure', async () => {
    const form = await boot();
    document.querySelector('#dev-fill').click();

    for (const { status, body, expected } of ERROR_CASES) {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status, json: async () => body })));
      dispatchSubmit(form);
      confirmPendingPopup();

      await vi.waitFor(() => expect(submitErrorCause()).toMatch(expected));
      expect(document.querySelector('#submit-error').hidden).toBe(false);
      expect(document.querySelector('#submit-success').hidden).toBe(true);
      // The parent can try again: the button is back and enabled.
      expect(submitButton()).toBeTruthy();
      expect(submitButton().disabled).toBe(false);
      expect(submitButton().textContent).toMatch(/Submit pledge/);
    }

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    dispatchSubmit(form);
    confirmPendingPopup();
    await vi.waitFor(() => expect(submitErrorCause()).toMatch(/couldn.t reach the school.s server/i));
    expect(submitButton().disabled).toBe(false);

    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    }));
    dispatchSubmit(form);
    confirmPendingPopup();
    await vi.waitFor(() => expect(submitErrorCause()).toMatch(/timed out before the school.s server responded/i));
    expect(submitButton().disabled).toBe(false);
  });

  it('blocks an oversized payload before contacting the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const form = await boot();
    document.querySelector('#dev-fill').click();

    // First submit in a fresh boot always opens the JSON popup; make it 2 MB+.
    dispatchSubmit(form);
    const send = document.querySelector('.dev-popup-send');
    expect(send).toBeTruthy();
    const textarea = document.querySelector('.dev-popup-json');
    const payload = JSON.parse(textarea.value);
    payload.form.pledgeComments = 'x'.repeat(2 * 1024 * 1024 + 100);
    textarea.value = JSON.stringify(payload);
    send.click();

    await vi.waitFor(() => expect(submitErrorCause()).toMatch(/too long to send/i));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('#submit-success').hidden).toBe(true);
  });

  it('never silently drops a honeypot submission', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    const form = await boot();
    document.querySelector('#dev-fill').click();
    form.querySelector('[name="website"]').value = 'http://spam.example';
    dispatchSubmit(form);
    expect(confirmPendingPopup()).toBe(true);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.form.website).toBe('http://spam.example');
    // It is an error path, not a faked success.
    expect(document.querySelector('#submit-success').hidden).toBe(true);
  });

  it('never silently drops a too-fast submission', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    const form = await boot();
    document.querySelector('#dev-fill').click();

    dispatchSubmit(form);
    const send = document.querySelector('.dev-popup-send');
    expect(send).toBeTruthy();
    const textarea = document.querySelector('.dev-popup-json');
    const payload = JSON.parse(textarea.value);
    payload.timeOnPageMs = 100;
    textarea.value = JSON.stringify(payload);
    send.click();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.timeOnPageMs).toBe(100);
    expect(document.querySelector('#submit-success').hidden).toBe(true);
  });
});
