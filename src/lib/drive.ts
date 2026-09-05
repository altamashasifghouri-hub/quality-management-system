import { createPrivateKey, sign } from "node:crypto";

export function driveCreds(): { clientEmail: string; privateKey: string; tokenUri: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
      tokenUri: parsed.token_uri || "https://oauth2.googleapis.com/token",
    };
  } catch {
    return null;
  }
}

export function driveFolderId(kind: string = "plan") {
  if (kind === "report") return process.env.GOOGLE_DRIVE_REPORT_FOLDER_ID || "";
  return process.env.GOOGLE_DRIVE_PLAN_FOLDER_ID || "";
}

function base64Url(input: Buffer) {
  return input.toString("base64url");
}

export function driveJwt(): string | null {
  const creds = driveCreds();
  if (!creds) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64Url(
    Buffer.from(
      JSON.stringify({
        iss: creds.clientEmail,
        scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly",
        aud: creds.tokenUri,
        iat: now,
        exp: now + 3600,
      })
    )
  );
  const unsigned = `${header}.${claims}`;
  const key = createPrivateKey(creds.privateKey);
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), key);
  return `${unsigned}.${base64Url(signature)}`;
}

export async function driveAccessToken(): Promise<string> {
  const creds = driveCreds();
  const jwt = driveJwt();
  if (!creds || !jwt) throw new Error("Google Drive is not configured.");
  const res = await fetch(creds.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Drive auth failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

export async function driveApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await driveAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Drive API failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}