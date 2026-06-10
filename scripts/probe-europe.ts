/**
 * One-off probe for the Europe Customer Payment Totals client.
 *
 * Exercises the real EuropeApiClient against whatever EUROPE_API_BASE_URL /
 * EUROPE_API_TOKEN point to in your .env — no service deploy, no DB.
 *
 * Usage:
 *   npx tsx scripts/probe-europe.ts --email alice@example.com
 *   npx tsx scripts/probe-europe.ts --email a@b.com --email c@d.com --lookback 24
 *   npx tsx scripts/probe-europe.ts --keycloak-id 3f1a9c8e-... --raw
 *
 * Flags:
 *   --email <addr>        repeatable
 *   --keycloak-id <sub>   repeatable
 *   --lookback <months>   1..1200 (default: client default of 12)
 *   --raw                 print the raw upstream JSON instead of the mapped view
 */
import 'dotenv/config';
import { EuropeApiClient } from '../src/europe/paymentTotalsClient';
import { mapResult } from '../src/europe/contributions';

interface Args {
  emails: string[];
  keycloakIds: string[];
  lookbackMonths?: number;
  raw: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { emails: [], keycloakIds: [], raw: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${flag}`);
      return v;
    };
    switch (flag) {
      case '--email':
        args.emails.push(next());
        break;
      case '--keycloak-id':
        args.keycloakIds.push(next());
        break;
      case '--lookback':
        args.lookbackMonths = Number(next());
        break;
      case '--raw':
        args.raw = true;
        break;
      default:
        throw new Error(`unknown argument: ${flag}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.emails.length === 0 && args.keycloakIds.length === 0) {
    console.error('Provide at least one --email or --keycloak-id. See header of this file for usage.');
    process.exit(2);
  }

  // Show what we're sending, with the token redacted.
  const baseUrl = process.env.EUROPE_API_BASE_URL ?? '(unset)';
  const token = process.env.EUROPE_API_TOKEN ?? '';
  console.log('→ endpoint:', baseUrl + '/billing/api/customer/payment-totals/');
  console.log('→ token:   ', token ? `${token.slice(0, 4)}…(${token.length} chars)` : '(unset!)');
  console.log('→ emails:  ', args.emails);
  console.log('→ keycloak:', args.keycloakIds);
  console.log('→ lookback:', args.lookbackMonths ?? '(default 12)');
  console.log('');

  const client = new EuropeApiClient();
  const startedAt = Date.now();
  const response = await client.getPaymentTotals({
    emails: args.emails,
    keycloakIds: args.keycloakIds,
    lookbackMonths: args.lookbackMonths,
  });
  const ms = Date.now() - startedAt;

  if (args.raw) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    console.log(`✓ ${response.results.length} result(s) in ${ms}ms`);
    console.log(`  lookback_months=${response.lookback_months}  cutoff=${response.cutoff_date}`);
    for (const result of response.results) {
      const mapped = mapResult(result);
      console.log(
        `  [${result.identifier_type}] ${result.identifier}` +
          `  found=${mapped.found}  customer_id=${result.customer_id ?? 'null'}`,
      );
      console.log(`      resolved_emails: ${JSON.stringify(result.resolved_emails)}`);
      console.log(`      contributions:   ${JSON.stringify(mapped.contributions)}`);
    }
  }
}

main().catch((err: Error) => {
  console.error(`\n✗ ${err.name}: ${err.message}`);
  process.exit(1);
});
