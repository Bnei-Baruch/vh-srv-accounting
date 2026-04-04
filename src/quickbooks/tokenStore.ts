import { Pool } from 'pg';
import { encrypt, decrypt } from './tokenCrypto';

export interface OAuthToken {
  id: number;
  provider: string;
  companyId: string;
  companyName: string | null;
  enabled: boolean;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: Date;
  refreshTokenExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function rowToToken(row: Record<string, unknown>): OAuthToken {
  return {
    id: row.id as number,
    provider: row.provider as string,
    companyId: row.company_id as string,
    companyName: row.company_name as string | null,
    enabled: row.enabled as boolean,
    accessToken: row.access_token as string,
    refreshToken: row.refresh_token as string,
    tokenType: row.token_type as string,
    expiresAt: row.expires_at as Date,
    refreshTokenExpiresAt: row.refresh_token_expires_at as Date,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export class TokenStore {
  constructor(
    private readonly db: Pool,
    private readonly encryptionKey: string,
  ) {}

  private enc(value: string): string {
    return encrypt(value, this.encryptionKey);
  }

  private dec(value: string): string {
    return decrypt(value, this.encryptionKey);
  }

  private decryptRow(row: Record<string, unknown>): Record<string, unknown> {
    return {
      ...row,
      access_token: this.dec(row.access_token as string),
      refresh_token: this.dec(row.refresh_token as string),
    };
  }

  async getToken(provider: string, companyId: string): Promise<OAuthToken | null> {
    const result = await this.db.query(
      `SELECT * FROM oauth_tokens WHERE provider = $1 AND company_id = $2`,
      [provider, companyId],
    );
    return result.rows.length > 0 ? rowToToken(this.decryptRow(result.rows[0])) : null;
  }

  async getAllTokens(provider: string): Promise<OAuthToken[]> {
    const result = await this.db.query(
      `SELECT * FROM oauth_tokens WHERE provider = $1 ORDER BY created_at ASC`,
      [provider],
    );
    return result.rows.map((row) => rowToToken(this.decryptRow(row)));
  }

  async upsertToken(
    provider: string,
    companyId: string,
    companyName: string | null,
    accessToken: string,
    refreshToken: string,
    tokenType: string,
    expiresAt: Date,
    refreshTokenExpiresAt: Date,
  ): Promise<OAuthToken> {
    const result = await this.db.query(
      `INSERT INTO oauth_tokens
         (provider, company_id, company_name, access_token, refresh_token, token_type, expires_at, refresh_token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (provider, company_id) DO UPDATE SET
         company_name             = COALESCE($3, oauth_tokens.company_name),
         access_token             = $4,
         refresh_token            = $5,
         token_type               = $6,
         expires_at               = $7,
         refresh_token_expires_at = $8,
         updated_at               = NOW()
       RETURNING *`,
      [provider, companyId, companyName, this.enc(accessToken), this.enc(refreshToken), tokenType, expiresAt, refreshTokenExpiresAt],
    );
    return rowToToken(this.decryptRow(result.rows[0]));
  }

  async updateTokens(
    provider: string,
    companyId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: Date,
    refreshTokenExpiresAt: Date,
  ): Promise<void> {
    await this.db.query(
      `UPDATE oauth_tokens
       SET access_token = $3, refresh_token = $4, expires_at = $5,
           refresh_token_expires_at = $6, updated_at = NOW()
       WHERE provider = $1 AND company_id = $2`,
      [provider, companyId, this.enc(accessToken), this.enc(refreshToken), expiresAt, refreshTokenExpiresAt],
    );
  }

  async updateCompany(
    id: number,
    fields: { companyName?: string; enabled?: boolean },
  ): Promise<OAuthToken | null> {
    const sets: string[] = [];
    const params: unknown[] = [id];

    if (fields.companyName !== undefined) {
      params.push(fields.companyName);
      sets.push(`company_name = $${params.length}`);
    }
    if (fields.enabled !== undefined) {
      params.push(fields.enabled);
      sets.push(`enabled = $${params.length}`);
    }
    if (sets.length === 0) return null;

    sets.push('updated_at = NOW()');

    const result = await this.db.query(
      `UPDATE oauth_tokens SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );
    return result.rows.length > 0 ? rowToToken(result.rows[0]) : null;
  }

  async deleteToken(id: number): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM oauth_tokens WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
