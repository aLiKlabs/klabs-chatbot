import { afterEach, describe, expect, it } from "vitest";
import { isAllowedAdministrator } from "@/lib/env";

const originalAllowlist = process.env.ADMIN_ALLOWED_EMAILS;

afterEach(() => {
  process.env.ADMIN_ALLOWED_EMAILS = originalAllowlist;
});

describe("administrator allowlist", () => {
  it("matches approved email addresses case-insensitively", () => {
    process.env.ADMIN_ALLOWED_EMAILS = "admin@klabs.co, owner@klabs.co";
    expect(isAllowedAdministrator("ADMIN@KLABS.CO")).toBe(true);
  });

  it("rejects missing and unapproved identities", () => {
    process.env.ADMIN_ALLOWED_EMAILS = "admin@klabs.co";
    expect(isAllowedAdministrator(undefined)).toBe(false);
    expect(isAllowedAdministrator("visitor@example.com")).toBe(false);
  });
});
