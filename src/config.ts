/**
 * Where OAuth credentials live — deliberately OUTSIDE this repo entirely (the
 * OS user-config dir, e.g. ~/.gtasks-mcp/ on this machine), not a gitignored
 * file inside the project. The reference this was adapted from stored both
 * files relative to the compiled entrypoint (`path.dirname(new
 * URL(import.meta.url).pathname)`) — that `.pathname` is POSIX-style even on
 * Windows (leading slash, e.g. "/C:/Users/..."), which is not a valid Windows
 * path and breaks fs calls there. Using the user's home directory sidesteps
 * that bug entirely, and makes a repo location irrelevant to where secrets
 * end up (install the package anywhere, credentials stay put) — accidental
 * commit becomes structurally impossible rather than merely gitignored.
 */
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".gtasks-mcp");

/** Google Cloud OAuth client (id + secret) — downloaded once by the user from
 *  Google Cloud Console (APIs & Services > Credentials > Desktop app), placed
 *  here manually before running `auth`. Never generated or written by this
 *  code. See README for the exact steps. */
export const oauthKeysPath = join(CONFIG_DIR, "oauth-keys.json");

/** The refresh/access token pair produced by the `auth` flow. Written by this
 *  code (authenticateAndSaveCredentials), read on every subsequent run. This
 *  file alone is enough to act on the user's Google Tasks — treat it like a
 *  password. */
export const credentialsPath = join(CONFIG_DIR, "credentials.json");

export { CONFIG_DIR };
