import { Request, Response } from 'express';
import { hasAnyRole, isEmailOwnerOrHasAnyRole, getTokenEmail } from '../../api/permissions';

function makeReq(content?: { email?: string; roles?: string[] }): Request {
  if (!content) return {} as unknown as Request;
  return {
    kauth: {
      grant: {
        access_token: {
          content: {
            email: content.email,
            sub: 'user-123',
            realm_access: { roles: content.roles ?? [] },
          },
        },
      },
    },
  } as unknown as Request;
}

function makeRes(): { res: Response; statusCode: () => number } {
  let code = 200;
  const end = jest.fn();
  const status = jest.fn().mockImplementation((s: number) => {
    code = s;
    return { end };
  });
  return {
    res: { status } as unknown as Response,
    statusCode: () => code,
  };
}

describe('hasAnyRole', () => {
  test('returns false and sends 403 when no token', () => {
    const req = makeReq();
    const { res, statusCode } = makeRes();
    expect(hasAnyRole(req, res, 'vh_admin')).toBe(false);
    expect(statusCode()).toBe(403);
  });

  test('returns false and sends 403 when token has no matching role', () => {
    const req = makeReq({ roles: ['some_other_role'] });
    const { res, statusCode } = makeRes();
    expect(hasAnyRole(req, res, 'vh_admin')).toBe(false);
    expect(statusCode()).toBe(403);
  });

  test('returns true when token has matching role', () => {
    const req = makeReq({ roles: ['vh_admin'] });
    const { res } = makeRes();
    expect(hasAnyRole(req, res, 'vh_admin')).toBe(true);
  });

  test('returns true when any of multiple accepted roles matches', () => {
    const req = makeReq({ roles: ['vh_root'] });
    const { res } = makeRes();
    expect(hasAnyRole(req, res, 'vh_admin', 'vh_root')).toBe(true);
  });
});

describe('isEmailOwnerOrHasAnyRole', () => {
  test('returns false and sends 403 when no token', () => {
    const req = makeReq();
    const { res, statusCode } = makeRes();
    expect(isEmailOwnerOrHasAnyRole(req, res, 'owner@test.com', 'vh_admin')).toBe(false);
    expect(statusCode()).toBe(403);
  });

  test('returns true when email matches (owner), regardless of roles', () => {
    const req = makeReq({ email: 'owner@test.com', roles: [] });
    const { res } = makeRes();
    expect(isEmailOwnerOrHasAnyRole(req, res, 'owner@test.com', 'vh_admin')).toBe(true);
  });

  test('returns true when email does not match but user has admin role', () => {
    const req = makeReq({ email: 'other@test.com', roles: ['vh_admin'] });
    const { res } = makeRes();
    expect(isEmailOwnerOrHasAnyRole(req, res, 'owner@test.com', 'vh_admin')).toBe(true);
  });

  test('returns false and sends 403 when email does not match and has no role', () => {
    const req = makeReq({ email: 'other@test.com', roles: [] });
    const { res, statusCode } = makeRes();
    expect(isEmailOwnerOrHasAnyRole(req, res, 'owner@test.com', 'vh_admin')).toBe(false);
    expect(statusCode()).toBe(403);
  });
});

describe('getTokenEmail', () => {
  test('returns email from token content', () => {
    const req = makeReq({ email: 'user@test.com' });
    expect(getTokenEmail(req)).toBe('user@test.com');
  });

  test('returns undefined when no token', () => {
    const req = makeReq();
    expect(getTokenEmail(req)).toBeUndefined();
  });
});
