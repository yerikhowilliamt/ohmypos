import { signDeviceCookie, verifyDeviceCookie } from './device-cookie.util';

describe('device-cookie.util', () => {
  const secret = 'test-secret';

  it('round-trips a signed cookie back to its deviceId', () => {
    const signed = signDeviceCookie('device-123', secret);
    expect(verifyDeviceCookie(signed, secret)).toBe('device-123');
  });

  it('rejects a cookie signed with a different secret', () => {
    const signed = signDeviceCookie('device-123', 'other-secret');
    expect(verifyDeviceCookie(signed, secret)).toBeNull();
  });

  it('rejects a tampered deviceId with an otherwise-valid-looking hmac', () => {
    const signed = signDeviceCookie('device-123', secret);
    const [, hmac] = signed.split('.');
    expect(verifyDeviceCookie(`device-999.${hmac}`, secret)).toBeNull();
  });

  it('rejects a value with no separator', () => {
    expect(verifyDeviceCookie('not-a-valid-cookie', secret)).toBeNull();
  });
});
