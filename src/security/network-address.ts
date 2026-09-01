import { isIP } from "node:net";

export interface NetworkAddress {
  address: string;
  family: 4 | 6;
}

function ipv4IsPublic(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a = -1, b = -1, c = -1] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

function ipv6IsPublic(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("::ffff:")) return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  if (/^fe[89ab]/.test(normalized)) return false;
  if (/^fe[c-f]/.test(normalized)) return false;
  if (normalized.startsWith("ff")) return false;
  if (normalized.startsWith("2001:db8:")) return false;
  if (normalized.startsWith("2002:")) return false;
  return true;
}

export function normalizeIpLiteral(hostname: string): string {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized.startsWith("[") && normalized.endsWith("]") ? normalized.slice(1, -1) : normalized;
}

export function isPublicNetworkAddress(address: NetworkAddress): boolean {
  const normalized = normalizeIpLiteral(address.address);
  const family = isIP(normalized);
  if (family !== address.family) return false;
  return family === 4 ? ipv4IsPublic(normalized) : ipv6IsPublic(normalized);
}

export function isPublicIpLiteral(hostname: string): boolean | undefined {
  const normalized = normalizeIpLiteral(hostname);
  const family = isIP(normalized);
  if (family === 0) return undefined;
  return isPublicNetworkAddress({ address: normalized, family: family as 4 | 6 });
}
