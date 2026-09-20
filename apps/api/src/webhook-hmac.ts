import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify GitHub's x-hub-signature-256 (HMAC-SHA256 of the raw body).
 * Rejects missing/malformed headers; mere presence of the header is not enough.
 */
export function verifyGitHubWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  const header = signatureHeader.trim();
  if (!header.toLowerCase().startsWith("sha256=")) return false;
  const providedHex = header.slice("sha256=".length).trim();
  if (!/^[0-9a-f]+$/i.test(providedHex)) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(providedHex, "hex");
    const b = Buffer.from(expectedHex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function signGitHubWebhookBody(rawBody: Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}
