import { describe, it, expect } from "vitest";
import { buildAuthClient } from "../src/auth.js";

// Regression tests for a real production failure (2026-09-01): the server used
// to rebuild a bare `new google.auth.OAuth2()` and only setCredentials() on it.
// That works exactly as long as the stored access token is fresh (~1h after
// `npm run auth`), then every call dies with `invalid_request` — without the
// client id/secret the client cannot refresh the token. The runtime client must
// be built from the same OAuth keys the auth flow used.

const keys = {
  installed: {
    client_id: "id-123.apps.googleusercontent.com",
    client_secret: "secret-456",
  },
};

describe("buildAuthClient", () => {
  it("hands the keyfile's client id and secret to the OAuth2 client so token refresh can work", () => {
    const auth = buildAuthClient(keys, { refresh_token: "rt-789" });
    expect(auth._clientId).toBe("id-123.apps.googleusercontent.com");
    expect(auth._clientSecret).toBe("secret-456");
  });

  it("carries the stored credentials (refresh token) onto the client", () => {
    const auth = buildAuthClient(keys, { refresh_token: "rt-789", access_token: "at-000" });
    expect(auth.credentials.refresh_token).toBe("rt-789");
    expect(auth.credentials.access_token).toBe("at-000");
  });

  it("throws a clear error when the keyfile has no usable client, rather than failing later with an opaque Google error", () => {
    expect(() => buildAuthClient({}, { refresh_token: "rt" })).toThrow(/client_id/);
  });
});
