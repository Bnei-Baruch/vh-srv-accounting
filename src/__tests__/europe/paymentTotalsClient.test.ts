import { EuropeApiClient } from '../../europe/paymentTotalsClient';
import { ValidationError } from '../../common/errors';
import { PaymentTotalsResponse } from '../../europe/types';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const EMPTY_RESPONSE: PaymentTotalsResponse = {
  lookback_months: 12,
  cutoff_date: '2025-06-09T02:58:43.380862Z',
  results: [],
};

describe('EuropeApiClient.getPaymentTotals', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue(jsonResponse(EMPTY_RESPONSE));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function client() {
    return new EuropeApiClient('https://europe.test', 'secret-token');
  }

  test('POSTs to the payment-totals path with the required trailing slash', async () => {
    await client().getPaymentTotals({ emails: ['a@b.com'] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://europe.test/billing/api/customer/payment-totals/');
    expect(init.method).toBe('POST');
  });

  test('strips trailing slashes from the configured base URL', async () => {
    await new EuropeApiClient('https://europe.test/', 'tok').getPaymentTotals({ emails: ['a@b.com'] });
    expect(fetchMock.mock.calls[0][0]).toBe('https://europe.test/billing/api/customer/payment-totals/');
  });

  test('preserves a locale (or any) path prefix on the base URL', async () => {
    await new EuropeApiClient('https://kabbalah.academy/en', 'tok').getPaymentTotals({ emails: ['a@b.com'] });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://kabbalah.academy/en/billing/api/customer/payment-totals/',
    );
  });

  test('disables redirect-following so a 302 cannot downgrade the POST to GET', async () => {
    await client().getPaymentTotals({ emails: ['a@b.com'] });
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error');
  });

  test('sends the Token auth header and JSON content type', async () => {
    await client().getPaymentTotals({ emails: ['a@b.com'] });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Token secret-token');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  test('translates camelCase request to the snake_case wire body with default lookback', async () => {
    await client().getPaymentTotals({ emails: ['a@b.com'], keycloakIds: ['sub-1'] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ emails: ['a@b.com'], keycloak_ids: ['sub-1'], lookback_months: 12 });
  });

  test('forwards a custom lookback window', async () => {
    await client().getPaymentTotals({ emails: ['a@b.com'], lookbackMonths: 24 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).lookback_months).toBe(24);
  });

  test('returns the parsed upstream response', async () => {
    const payload: PaymentTotalsResponse = {
      ...EMPTY_RESPONSE,
      results: [
        {
          identifier_type: 'email',
          identifier: 'a@b.com',
          customer_id: 1,
          resolved_emails: ['a@b.com'],
          totals_by_currency: [{ currency: 'EUR', total: '10.00', transaction_count: 1 }],
        },
      ],
    };
    fetchMock.mockResolvedValue(jsonResponse(payload));
    await expect(client().getPaymentTotals({ emails: ['a@b.com'] })).resolves.toEqual(payload);
  });

  test('rejects when no identifiers are supplied — without calling fetch', async () => {
    await expect(client().getPaymentTotals({})).rejects.toBeInstanceOf(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects when more than 100 identifiers are supplied', async () => {
    const emails = Array.from({ length: 101 }, (_, i) => `u${i}@b.com`);
    await expect(client().getPaymentTotals({ emails })).rejects.toBeInstanceOf(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('counts emails and keycloak_ids together against the 100 cap', async () => {
    const emails = Array.from({ length: 60 }, (_, i) => `u${i}@b.com`);
    const keycloakIds = Array.from({ length: 41 }, (_, i) => `s${i}`);
    await expect(client().getPaymentTotals({ emails, keycloakIds })).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects lookback_months outside [1, 1200]', async () => {
    await expect(client().getPaymentTotals({ emails: ['a@b.com'], lookbackMonths: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      client().getPaymentTotals({ emails: ['a@b.com'], lookbackMonths: 1201 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('maps an upstream 400 to a ValidationError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ emails: ['Enter a valid email address.'] }, 400));
    await expect(client().getPaymentTotals({ emails: ['bad'] })).rejects.toBeInstanceOf(ValidationError);
  });

  test('maps an upstream 401/403 (our token) to a generic error, not a ValidationError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'no permission' }, 403));
    const err = await client()
      .getPaymentTotals({ emails: ['a@b.com'] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ValidationError);
    expect(err.message).toContain('upstream 403');
  });

  test('maps an upstream 500 to a generic error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'boom' }, 500));
    await expect(client().getPaymentTotals({ emails: ['a@b.com'] })).rejects.toThrow('upstream 500');
  });

  test('wraps a network/timeout failure with the method name', async () => {
    fetchMock.mockRejectedValue(new Error('aborted'));
    await expect(client().getPaymentTotals({ emails: ['a@b.com'] })).rejects.toThrow(
      'europeApiClient.getPaymentTotals: request failed: aborted',
    );
  });
});
