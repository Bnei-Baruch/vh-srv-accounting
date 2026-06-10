// Wire types — mirror the upstream Customer Payment Totals API contract exactly
// (snake_case as documented). See europe_accounting_api.md.

export interface CurrencyTotal {
  currency: string; // ISO 4217, e.g. "EUR"
  total: string; // string-decimal, 2dp; refunds subtracted; may be negative in edge cases
  transaction_count: number;
}

export interface PaymentTotalsResult {
  identifier_type: 'email' | 'keycloak_id';
  identifier: string;
  customer_id: number | null;
  resolved_emails: string[];
  totals_by_currency: CurrencyTotal[];
}

export interface PaymentTotalsResponse {
  lookback_months: number;
  cutoff_date: string; // ISO-8601
  results: PaymentTotalsResult[];
}

// Our internal (camelCase) request shape, translated to the wire body by the client.
export interface PaymentTotalsRequest {
  emails?: string[];
  keycloakIds?: string[];
  lookbackMonths?: number;
}
