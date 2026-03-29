BEGIN;

CREATE TABLE oauth_tokens (
    id                       SERIAL PRIMARY KEY,
    provider                 VARCHAR(50)  NOT NULL DEFAULT 'quickbooks',
    company_id               VARCHAR(50)  NOT NULL,
    company_name             VARCHAR(255),
    enabled                  BOOLEAN      NOT NULL DEFAULT true,
    access_token             TEXT         NOT NULL,
    refresh_token            TEXT         NOT NULL,
    token_type               VARCHAR(20)  NOT NULL DEFAULT 'Bearer',
    expires_at               TIMESTAMPTZ  NOT NULL,
    refresh_token_expires_at TIMESTAMPTZ  NOT NULL,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_oauth_tokens_provider_company UNIQUE (provider, company_id)
);

COMMENT ON TABLE  oauth_tokens IS 'OAuth 2.0 tokens for external accounting integrations';
COMMENT ON COLUMN oauth_tokens.provider   IS 'Provider identifier (quickbooks, priority, ...)';
COMMENT ON COLUMN oauth_tokens.company_id IS 'Provider-specific company/realm identifier';
COMMENT ON COLUMN oauth_tokens.enabled    IS 'When false: excluded from aggregation and token refresh is paused';

COMMIT;
