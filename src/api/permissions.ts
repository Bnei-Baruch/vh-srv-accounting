import { Request, Response } from 'express';

interface TokenContent {
  email?: string;
  sub?: string;
  realm_access?: { roles?: string[] };
}

function getTokenContent(req: Request): TokenContent | null {
  const grant = req.kauth?.grant;
  if (!grant?.access_token) return null;
  // keycloak-connect Token interface doesn't expose 'content' in its typings
  // but the runtime object does have it — cast via unknown
  return (grant.access_token as unknown as { content: TokenContent }).content;
}

export function hasAnyRole(req: Request, res: Response, ...roles: string[]): boolean {
  const content = getTokenContent(req);
  if (!content) {
    res.status(403).end();
    return false;
  }

  const realmRoles = content.realm_access?.roles ?? [];
  const has = roles.some((r) => realmRoles.includes(r));
  if (!has) {
    res.status(403).end();
    return false;
  }

  return true;
}

export function isEmailOwnerOrHasAnyRole(
  req: Request,
  res: Response,
  email: string,
  ...roles: string[]
): boolean {
  const content = getTokenContent(req);
  if (!content) {
    res.status(403).end();
    return false;
  }

  const realmRoles = content.realm_access?.roles ?? [];
  const isOwner = content.email === email;
  const isAdmin = roles.some((r) => realmRoles.includes(r));

  if (!isOwner && !isAdmin) {
    res.status(403).end();
    return false;
  }

  return true;
}

export function getTokenEmail(req: Request): string | undefined {
  return (getTokenContent(req) as TokenContent | null)?.email;
}
