import { config } from '../common/config';
import { ValidationError } from '../common/errors';
import { PaymentTotalsRequest, PaymentTotalsResponse } from './types';

// Trailing slash is required by the upstream.
const PAYMENT_TOTALS_PATH = '/billing/api/customer/payment-totals/';

const DEFAULT_LOOKBACK_MONTHS = 12;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_IDENTIFIERS = 100; // emails + keycloak_ids combined
const MIN_LOOKBACK_MONTHS = 1;
const MAX_LOOKBACK_MONTHS = 1200;

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

/**
 * Thin client over the European department's Customer Payment Totals API.
 * Stateless: authenticates with a static application-secret token. No OAuth,
 * no per-company concept, no persistence.
 */
export class EuropeApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string = config.europeApiBaseUrl, token: string = config.europeApiToken) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  async getPaymentTotals(req: PaymentTotalsRequest): Promise<PaymentTotalsResponse> {
    const emails = req.emails ?? [];
    const keycloakIds = req.keycloakIds ?? [];
    const identifierCount = emails.length + keycloakIds.length;

    // Validate against the upstream's documented rules so we fail fast with a
    // 400-mapped error instead of paying a round-trip.
    if (identifierCount < 1) {
      throw new ValidationError('at least one email or keycloak_id is required');
    }
    if (identifierCount > MAX_IDENTIFIERS) {
      throw new ValidationError(`at most ${MAX_IDENTIFIERS} identifiers allowed per request`);
    }

    const lookbackMonths = req.lookbackMonths ?? DEFAULT_LOOKBACK_MONTHS;
    if (lookbackMonths < MIN_LOOKBACK_MONTHS || lookbackMonths > MAX_LOOKBACK_MONTHS) {
      throw new ValidationError(
        `lookback_months must be between ${MIN_LOOKBACK_MONTHS} and ${MAX_LOOKBACK_MONTHS}`,
      );
    }

    const body = JSON.stringify({
      emails,
      keycloak_ids: keycloakIds,
      lookback_months: lookbackMonths,
    });

    let response: FetchResponse;
    try {
      response = await fetch(this.baseUrl + PAYMENT_TOTALS_PATH, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.token}`,
          'Content-Type': 'application/json',
        },
        body,
        // Never silently follow a redirect. Per the Fetch Standard (HTTP-redirect fetch),
        // a 301/302 on a POST — and any 303 — rewrites the method to GET and drops the body,
        // which this upstream then rejects with a confusing 405. The base URL must point at
        // the canonical (locale-prefixed) path so no redirect occurs; if one ever does,
        // fail loudly here instead of corrupting the method.
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`europeApiClient.getPaymentTotals: request failed: ${(err as Error).message}`);
    }

    // Upstream 400 means the caller's input was invalid (e.g. bad email) — surface as a ValidationError (→ 400).
    if (response.status === 400) {
      throw new ValidationError(`europe upstream rejected request: ${await safeReadBody(response)}`);
    }

    // 401/403 mean OUR token is missing/unauthorised — a service misconfiguration, not a caller error.
    // Everything non-2xx is therefore an internal error (→ 500, logged + Sentry), never reflected to the caller.
    if (!response.ok) {
      throw new Error(
        `europeApiClient.getPaymentTotals: upstream ${response.status}: ${await safeReadBody(response)}`,
      );
    }

    return (await response.json()) as PaymentTotalsResponse;
  }
}

async function safeReadBody(response: FetchResponse): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '<unreadable body>';
  }
}
