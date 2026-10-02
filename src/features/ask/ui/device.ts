/** Random device token for anonymous visitors (SPEC §2): only its sha256 is ever stored server-side. */
export function getDeviceToken(): string | undefined {
  try {
    let tok = localStorage.getItem("device_token");
    if (!tok) {
      tok = crypto.randomUUID();
      localStorage.setItem("device_token", tok);
    }
    return tok;
  } catch {
    return undefined;
  }
}
