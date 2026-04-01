import { encrypt, decrypt } from '../../quickbooks/tokenCrypto';
import { randomBytes } from 'crypto';

const TEST_KEY = randomBytes(32).toString('hex');
const OTHER_KEY = randomBytes(32).toString('hex');

describe('tokenCrypto', () => {
  describe('roundtrip', () => {
    test('decrypts to the original plaintext', () => {
      const plaintext = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.access_token_payload';
      expect(decrypt(encrypt(plaintext, TEST_KEY), TEST_KEY)).toBe(plaintext);
    });

    test('handles empty string', () => {
      expect(decrypt(encrypt('', TEST_KEY), TEST_KEY)).toBe('');
    });

    test('handles unicode / multibyte characters', () => {
      const plaintext = '日本語テスト \u{1F512} émoji';
      expect(decrypt(encrypt(plaintext, TEST_KEY), TEST_KEY)).toBe(plaintext);
    });

    test('handles a long token (> 1 KB)', () => {
      const plaintext = randomBytes(1024).toString('base64');
      expect(decrypt(encrypt(plaintext, TEST_KEY), TEST_KEY)).toBe(plaintext);
    });
  });

  describe('encrypt', () => {
    test('produces a base64 string', () => {
      const result = encrypt('hello', TEST_KEY);
      expect(() => Buffer.from(result, 'base64')).not.toThrow();
      expect(Buffer.from(result, 'base64').toString('base64')).toBe(result);
    });

    test('produces different ciphertext for the same plaintext (random IV)', () => {
      const ct1 = encrypt('same-plaintext', TEST_KEY);
      const ct2 = encrypt('same-plaintext', TEST_KEY);
      expect(ct1).not.toBe(ct2);
    });

    test('output length accounts for IV (12 bytes) + auth tag (16 bytes) + ciphertext', () => {
      const plaintext = 'hello';
      const raw = Buffer.from(encrypt(plaintext, TEST_KEY), 'base64');
      // iv(12) + tag(16) + plaintext bytes(5) = 33
      expect(raw.length).toBe(12 + 16 + Buffer.byteLength(plaintext, 'utf8'));
    });
  });

  describe('decrypt', () => {
    test('throws with a wrong key', () => {
      const ciphertext = encrypt('secret', TEST_KEY);
      expect(() => decrypt(ciphertext, OTHER_KEY)).toThrow();
    });

    test('throws when ciphertext is truncated', () => {
      const ciphertext = encrypt('secret', TEST_KEY);
      const truncated = Buffer.from(ciphertext, 'base64').subarray(0, 10).toString('base64');
      expect(() => decrypt(truncated, TEST_KEY)).toThrow();
    });

    test('throws when auth tag is tampered with', () => {
      const raw = Buffer.from(encrypt('secret', TEST_KEY), 'base64');
      // Flip a bit in the auth tag region (bytes 12–27)
      raw[12] ^= 0xff;
      expect(() => decrypt(raw.toString('base64'), TEST_KEY)).toThrow();
    });

    test('throws when ciphertext body is tampered with', () => {
      const raw = Buffer.from(encrypt('secret', TEST_KEY), 'base64');
      // Flip last byte (ciphertext body)
      raw[raw.length - 1] ^= 0xff;
      expect(() => decrypt(raw.toString('base64'), TEST_KEY)).toThrow();
    });
  });
});
