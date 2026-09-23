export function driveErrorMessage(errJson: { error?: unknown } | null | undefined, fallback = "Google Drive action failed."): string {
  const err = errJson?.error;
  if (err === "not_connected") return "Connect Google Drive first from the Storage page.";
  if (err === "Unauthorized") return "Google Drive connection expired. Reconnect on the Storage page.";
  if (typeof err === "string" && err) return err;
  return fallback;
}