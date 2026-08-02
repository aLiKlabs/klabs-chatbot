import { describe, expect, it } from "vitest";
import { extractPage, isPrivateAddress, normalizeCrawlUrl } from "@/lib/crawling";

describe("website crawler security and extraction", () => {
  it("accepts only ordinary HTTP(S) URLs without credentials or custom ports", () => {
    expect(normalizeCrawlUrl("example.com/about#team").toString()).toBe("https://example.com/about");
    expect(() => normalizeCrawlUrl("file:///etc/passwd")).toThrow(/HTTP/);
    expect(() => normalizeCrawlUrl("https://user:pass@example.com")).toThrow(/credentials/);
    expect(() => normalizeCrawlUrl("https://example.com:8080")).toThrow(/ports/);
  });

  it.each([
    "127.0.0.1", "10.0.0.4", "169.254.169.254", "172.16.5.2", "192.168.1.1",
    "::1", "fc00::1", "fe80::1", "2001:db8::1",
  ])("blocks private or reserved address %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("extracts main content and same-host links while removing navigation and scripts", () => {
    const result = extractPage(`
      <html><head><title>K-Labs Services</title><script>secret()</script></head><body>
      <nav>Menu that should disappear</nav>
      <main><h1>Digital products</h1><p>We build accessible websites and useful applications for growing teams.</p></main>
      <a href="/about">About</a><a href="https://other.test/page">Other</a><a href="/logo.png">Logo</a>
      </body></html>
    `, new URL("https://klabs.co/services"));
    expect(result.title).toBe("K-Labs Services");
    expect(result.text).toContain("Digital products");
    expect(result.text).not.toContain("secret");
    expect(result.links).toEqual(["https://klabs.co/about"]);
  });
});
