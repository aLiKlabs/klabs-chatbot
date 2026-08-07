type ApiPayload = Record<string, unknown> & { error?: string };

export async function readApiPayload<T extends ApiPayload>(response: Response): Promise<T> {
  const body = await response.text();
  let payload: ApiPayload = {};

  if (body) {
    try {
      payload = JSON.parse(body) as ApiPayload;
    } catch {
      if (response.redirected || response.status === 401 || response.url.includes("/login")) {
        throw new Error("Your administrator session expired. Refresh the page and sign in again.");
      }
      throw new Error("The server returned an invalid response. Please try again.");
    }
  }

  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : response.status === 401
          ? "Your administrator session expired. Refresh the page and sign in again."
          : "The request could not be completed.",
    );
  }

  return payload as T;
}
