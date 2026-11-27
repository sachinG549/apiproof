import { describe, expect, it } from "vitest";
import { UserError } from "@/lib/errors";
import { assertPublicHttpUrl, hostIsBlocked, ipIsPrivate } from "@/lib/spec/fetch-url";

describe("spec URL guard", () => {
  it("blocks private and local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.4", "172.16.0.1", "169.254.169.254", "::1", "fd00::1"]) {
      expect(ipIsPrivate(ip), ip).toBe(true);
    }
    expect(ipIsPrivate("8.8.8.8")).toBe(false);
    expect(hostIsBlocked("localhost")).toBe(true);
    expect(hostIsBlocked("metadata.google.internal")).toBe(true);
  });

  it("rejects private resolutions and non-http URLs", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1/spec.json", async () => ["127.0.0.1"])).rejects.toBeInstanceOf(UserError);
    await expect(assertPublicHttpUrl("file:///etc/passwd", async () => [])).rejects.toThrow(/http/i);
    await expect(assertPublicHttpUrl("https://example.com/spec.json", async () => ["10.0.0.5"])).rejects.toThrow(/private/i);
    const url = await assertPublicHttpUrl("https://example.com/openapi.json", async () => ["93.184.216.34"]);
    expect(url.hostname).toBe("example.com");
  });
});
