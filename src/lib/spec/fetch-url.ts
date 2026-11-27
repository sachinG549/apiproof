import { lookup } from "dns/promises";
import net from "net";
import { UserError } from "@/lib/errors";
import { getConfig } from "@/lib/config";

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata.internal"]);

export function ipIsPrivate(ip: string): boolean {
  const mapped = ip.toLowerCase().startsWith("::ffff:") ? ip.slice(7) : ip;
  if (net.isIP(mapped) === 4) {
    const [a, b] = mapped.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a === 255) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) return true;
    return false;
  }
  return true;
}

export function hostIsBlocked(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (net.isIP(host) && ipIsPrivate(host)) return true;
  return false;
}

export async function assertPublicHttpUrl(
  raw: string,
  resolveHost: (host: string) => Promise<string[]> = defaultResolve,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UserError("That spec URL is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UserError("Spec URLs must start with http:// or https://.");
  }
  if (url.username || url.password) throw new UserError("Spec URLs cannot include a username or password.");
  if (hostIsBlocked(url.hostname)) {
    throw new UserError("That URL points at a private or local address, so APIProof will not fetch it.");
  }
  let addresses: string[] = [];
  try {
    addresses = await resolveHost(url.hostname);
  } catch {
    throw new UserError("Could not resolve that host.");
  }
  if (!addresses.length || addresses.some((address) => ipIsPrivate(address))) {
    throw new UserError("That URL resolves to a private or local address, so APIProof will not fetch it.");
  }
  return url;
}

async function defaultResolve(host: string): Promise<string[]> {
  if (net.isIP(host)) return [host];
  const records = await lookup(host, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export async function fetchPublicSpec(raw: string): Promise<string> {
  const maxBytes = getConfig().maxSpecBytes;
  let current = raw;
  for (let hop = 0; hop < 3; hop += 1) {
    const url = await assertPublicHttpUrl(current);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: "application/json, application/yaml, text/yaml, text/plain, */*",
        "user-agent": "APIProofSpecFetch/1.0",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new UserError("The spec URL redirected without a location.");
      current = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new UserError(`The spec URL returned HTTP ${response.status}.`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > maxBytes) throw new UserError(`That spec is larger than the ${formatBytes(maxBytes)} limit.`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) {
      throw new UserError(`That spec is larger than the ${formatBytes(maxBytes)} limit.`);
    }
    return new TextDecoder().decode(bytes);
  }
  throw new UserError("That spec URL redirected too many times.");
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}
