import "server-only";

// ── Server-only Configuration ──
// Values that must NEVER be exposed to the browser bundle.

if (!process.env.ADMIN_EMAIL) {
  throw new Error(
    "Missing required env var ADMIN_EMAIL. Set it in your .env file."
  );
}

export const ADMIN_EMAIL: string = process.env.ADMIN_EMAIL;
