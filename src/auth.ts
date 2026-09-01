import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

/** Shape of the Google Cloud OAuth client keyfile (oauth-keys.json). Desktop
 *  app clients use "installed"; "web" is accepted for completeness since the
 *  file format is Google's, not ours. */
export interface OAuthKeyfile {
  installed?: { client_id?: string; client_secret?: string };
  web?: { client_id?: string; client_secret?: string };
}

/**
 * Build the runtime OAuth2 client from the same keyfile the auth flow used.
 * The client id/secret must be present at runtime, not just during `auth`: a
 * bare OAuth2 client carrying only stored tokens works until the access token
 * expires (~1h), then every refresh attempt fails with `invalid_request`.
 */
export function buildAuthClient(oauthKeys: OAuthKeyfile, credentials: Record<string, unknown>): OAuth2Client {
  const keys = oauthKeys.installed ?? oauthKeys.web;
  if (!keys?.client_id || !keys.client_secret) {
    throw new Error(
      'OAuth client file is missing client_id/client_secret (expected an "installed" Desktop app client). Re-download it from Google Cloud Console.',
    );
  }
  const auth = new google.auth.OAuth2(keys.client_id, keys.client_secret);
  auth.setCredentials(credentials);
  return auth;
}
