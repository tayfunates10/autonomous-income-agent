const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
];

function isPrivateIpv4(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) && PRIVATE_V4.some((pattern) => pattern.test(hostname));
}

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
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error("Loopback, link-local, and private-network integration targets are denied.");
  }

  return url;
}

export function sameOrigin(a: string | URL, b: string | URL): boolean {
  return new URL(a).origin.toLowerCase() === new URL(b).origin.toLowerCase();
}
