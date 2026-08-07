import { describe, expect, it } from "vitest";
import { readApiPayload } from "@/lib/http/api-response";

describe("readApiPayload", () => {
  it("returns JSON payloads", async () => {
    const response = new Response(JSON.stringify({ pages: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(readApiPayload(response)).resolves.toEqual({ pages: [] });
  });

  it("turns HTML authentication responses into a useful error", async () => {
    const response = new Response("<!DOCTYPE html><title>Login</title>", {
      status: 401,
      headers: { "content-type": "text/html" },
    });

    await expect(readApiPayload(response)).rejects.toThrow("administrator session expired");
  });

  it("uses JSON API errors", async () => {
    const response = new Response(JSON.stringify({ error: "The document could not be stored." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });

    await expect(readApiPayload(response)).rejects.toThrow("The document could not be stored.");
  });
});
