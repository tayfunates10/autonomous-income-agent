import { isPublicIpLiteral, normalizeIpLiteral } from "../security/network-address.js";

export function validatePublicHttpsUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Integration URL must be a valid absolute URL.");
  }

  if (url.protocol !== "https:") throw new Error("Only HTTPS integration URLs are allowed.");
  if (url.username || url.password) throw new Error("Credentials must never be embedded in integration URLs.");

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const normalizedHost = normalizeIpLiteral(hostname);
  const literalPublic = isPublicIpLiteral(normalizedHost);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    literalPublic === false
  ) {
    throw new Error("Loopback, link-local, private, reserved, and non-public integration targets are denied.");
  }

  return url;
}

export function sameOrigin(a: string | URL, b: string | URL): boolean {
  return new URL(a).origin.toLowerCase() === new URL(b).origin.toLowerCase();
}
