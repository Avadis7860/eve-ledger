import { timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import type { AppConfig } from "../config/env.js";
import type { RefreshTokenVault } from "./refresh-token-vault.js";
import type { EveSsoClient } from "./eve-sso-client.js";

const execFileAsync = promisify(execFile);
const CALLBACK_PATH = "/auth/callback";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

type VerifiedClaims = {
  characterId: string;
  characterName: string;
  scopes: string[];
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function secureResponse(
  response: ServerResponse,
  status: number,
  html: string,
): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EVE Ledger authorization</title><style>body{font:16px system-ui,sans-serif;max-width:36rem;margin:12vh auto;padding:0 1.5rem;color:#20242a}main{border:1px solid #d8dde3;border-radius:12px;padding:2rem}h1{font-size:1.35rem}p{line-height:1.5;color:#505963}</style></head><body><main>${html}</main></body></html>`,
  );
}

export function validateLoopbackRedirectUri(redirectUri: string): URL {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    throw new Error("ESI_REDIRECT_URI must be a valid URL");
  }

  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== CALLBACK_PATH ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "ESI_REDIRECT_URI must be a fixed loopback URL such as http://127.0.0.1:3000/auth/callback",
    );
  }

  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("ESI_REDIRECT_URI contains an invalid local port");
  }
  return url;
}

function stateMatches(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export async function completeOAuthCallback(
  parameters: URLSearchParams,
  expectedState: string,
  codeVerifier: string,
  sso: Pick<EveSsoClient, "exchangeAuthorizationCode">,
  vault: Pick<RefreshTokenVault, "write">,
): Promise<VerifiedClaims> {
  const states = parameters.getAll("state");
  if (states.length !== 1 || !stateMatches(states[0] ?? null, expectedState)) {
    throw new Error("EVE SSO callback state validation failed");
  }

  if (parameters.has("error")) {
    throw new Error("EVE SSO authorization was denied or cancelled");
  }

  const codes = parameters.getAll("code");
  if (codes.length !== 1 || !codes[0]) {
    throw new Error("EVE SSO callback did not contain exactly one code");
  }

  const token = await sso.exchangeAuthorizationCode(codes[0], codeVerifier);
  if (!token.refreshToken) {
    throw new Error("EVE SSO did not provide a refresh token");
  }

  // The refresh token is persisted only after the access-token JWT is verified.
  await vault.write(token.refreshToken);
  return {
    characterId: token.characterId,
    characterName: token.characterName,
    scopes: token.scopes,
  };
}

async function openBrowser(url: string): Promise<void> {
  if (process.platform === "win32") {
    await execFileAsync("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
      windowsHide: true,
    });
    return;
  }
  if (process.platform === "darwin") {
    await execFileAsync("open", [url]);
    return;
  }
  await execFileAsync("xdg-open", [url]);
}

export async function authorizeWithLocalCallback(
  config: Pick<AppConfig, "redirectUri">,
  sso: Pick<
    EveSsoClient,
    "createAuthorizationRequest" | "exchangeAuthorizationCode"
  >,
  vault: Pick<RefreshTokenVault, "write">,
  options: {
    timeoutMs?: number;
    browser?: (url: string) => Promise<void>;
  } = {},
): Promise<VerifiedClaims> {
  const redirect = validateLoopbackRedirectUri(config.redirectUri);
  const authorization = await sso.createAuthorizationRequest();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const launchBrowser = options.browser ?? openBrowser;

  return await new Promise<VerifiedClaims>((resolve, reject) => {
    let settled = false;
    const server = createServer((request, response) => {
      void (async () => {
        if (request.socket.remoteAddress !== "127.0.0.1") {
          secureResponse(
            response,
            403,
            "<h1>Local callback rejected</h1><p>This callback is available only on this computer.</p>",
          );
          return;
        }

        if (request.method !== "GET" || !request.url) {
          secureResponse(
            response,
            405,
            "<h1>Invalid callback</h1><p>Use the callback opened by EVE SSO.</p>",
          );
          return;
        }

        let callbackUrl: URL;
        try {
          callbackUrl = new URL(request.url, config.redirectUri);
        } catch {
          secureResponse(
            response,
            400,
            "<h1>Invalid callback</h1><p>The callback URL could not be parsed.</p>",
          );
          return;
        }

        if (
          callbackUrl.pathname !== redirect.pathname ||
          callbackUrl.origin !== redirect.origin
        ) {
          secureResponse(response, 404, "<h1>Not found</h1>");
          return;
        }

        if (
          !stateMatches(
            callbackUrl.searchParams.get("state"),
            authorization.state,
          ) ||
          callbackUrl.searchParams.getAll("state").length !== 1
        ) {
          secureResponse(
            response,
            400,
            "<h1>Authorization not accepted</h1><p>The security state did not match. Return to the EVE Ledger terminal and retry the login.</p>",
          );
          return;
        }

        try {
          const claims = await completeOAuthCallback(
            callbackUrl.searchParams,
            authorization.state,
            authorization.codeVerifier,
            sso,
            vault,
          );
          secureResponse(
            response,
            200,
            `<h1>Authorization complete</h1><p>EVE Ledger is authorized for <strong>${escapeHtml(claims.characterName)}</strong>.</p><p>You can close this tab and return to the terminal.</p>`,
          );
          finish(undefined, claims);
        } catch {
          secureResponse(
            response,
            400,
            "<h1>Authorization failed</h1><p>The EVE SSO response could not be verified or saved. Return to the terminal for details and try again.</p>",
          );
          finish(new Error("EVE SSO callback exchange or verification failed"));
        }
      })();
    });

    const finish = (error?: Error, claims?: VerifiedClaims) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (server.listening) server.close();
      if (error) reject(error);
      else if (claims) resolve(claims);
      else reject(new Error("EVE SSO authorization ended without a result"));
    };

    const timeout = setTimeout(() => {
      finish(new Error("EVE SSO authorization timed out after five minutes"));
    }, timeoutMs);
    timeout.unref();

    server.once("error", (error) => {
      finish(
        new Error(
          error.message.includes("EADDRINUSE")
            ? `The local OAuth callback port ${redirect.port} is already in use`
            : "The local OAuth callback server could not start",
        ),
      );
    });

    server.listen(Number(redirect.port), "127.0.0.1", () => {
      const address = server.address() as AddressInfo | null;
      if (!address || address.address !== "127.0.0.1") {
        finish(new Error("The OAuth callback server did not bind to loopback"));
        return;
      }

      void launchBrowser(authorization.url).catch(() => {
        process.stderr.write(
          "Could not open the browser automatically. Open this EVE SSO URL manually:\n" +
            authorization.url +
            "\n",
        );
      });
    });
  });
}
