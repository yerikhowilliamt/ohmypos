import { createHmac, timingSafeEqual } from 'crypto';

const HMAC_ALGORITHM = 'sha256';

/** `<deviceId>.<hex hmac of deviceId>` — the value stored in the ohmypos_device cookie. */
export function signDeviceCookie(deviceId: string, secret: string): string {
  const hmac = createHmac(HMAC_ALGORITHM, secret)
    .update(deviceId)
    .digest('hex');
  return `${deviceId}.${hmac}`;
}

/** The deviceId if the signature is valid, otherwise null. Timing-safe. */
export function verifyDeviceCookie(
  cookieValue: string,
  secret: string,
): string | null {
  const separatorIndex = cookieValue.indexOf('.');
  if (separatorIndex === -1) {
    return null;
  }

  const deviceId = cookieValue.slice(0, separatorIndex);
  const providedHmac = cookieValue.slice(separatorIndex + 1);
  const expectedHmac = createHmac(HMAC_ALGORITHM, secret)
    .update(deviceId)
    .digest('hex');

  const providedBuffer = Buffer.from(providedHmac);
  const expectedBuffer = Buffer.from(expectedHmac);
  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  return deviceId;
}
