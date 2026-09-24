import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import {
  createNyxLocalRuntime,
  type NyxLocalRuntime,
  type NyxLocalRuntimeRequest,
} from "./nyxLocalRuntime";
import type { NyxDesktopApproval } from "./nyxScopedComputerHost";
import { nyxContainsSecretLike } from "./nyxChatProtocol";

interface PendingApproval {
  readonly id: string;
  readonly action: NyxDesktopApproval;
  readonly finish: (accepted: boolean) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

export class NyxLocalApprovalBroker {
  #pending: PendingApproval | null = null;

  request(action: NyxDesktopApproval): Promise<boolean> {
    if (this.#pending || nyxContainsSecretLike(JSON.stringify(action)))
      return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const id = randomBytes(16).toString("hex");
      const finish = (accepted: boolean): void => {
        if (this.#pending?.id !== id) return;
        clearTimeout(this.#pending.timeout);
        this.#pending = null;
        resolve(accepted);
      };
      const timeout = setTimeout(() => finish(false), 30_000);
      this.#pending = { id, action, finish, timeout };
    });
  }

  get pending(): {
    readonly id: string;
    readonly action: NyxDesktopApproval;
  } | null {
    return this.#pending
      ? { id: this.#pending.id, action: this.#pending.action }
      : null;
  }

  decide(id: string, accepted: boolean): boolean {
    if (!this.#pending || this.#pending.id !== id) return false;
    this.#pending.finish(accepted);
    return true;
  }

  close(): void {
    this.#pending?.finish(false);
  }
}

export interface NyxLocalWebConsoleConfig {
  readonly assetRoot: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly defaultRepository: string;
  readonly createRuntime?: typeof createNyxLocalRuntime;
}

interface ApiError {
  readonly error: string;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((item, index) => item === expected[index])
  );
}

function parseSetup(value: unknown): NyxLocalRuntimeRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    !exactKeys(data, [
      "repository",
      "scopes",
      "editablePath",
      "verifierPath",
      "terminalCheckPaths",
      "desktopPid",
    ]) ||
    typeof data.repository !== "string" ||
    !data.repository ||
    data.repository.length > 500 ||
    !Array.isArray(data.scopes) ||
    data.scopes.length > 8 ||
    data.scopes.some((scope) => typeof scope !== "string") ||
    !Array.isArray(data.terminalCheckPaths) ||
    data.terminalCheckPaths.length > 8 ||
    data.terminalCheckPaths.some((path) => typeof path !== "string") ||
    (data.editablePath !== null && typeof data.editablePath !== "string") ||
    (data.verifierPath !== null && typeof data.verifierPath !== "string") ||
    (data.desktopPid !== null &&
      (!Number.isSafeInteger(data.desktopPid) || Number(data.desktopPid) < 1))
  )
    return null;
  return {
    repository: data.repository,
    scopes: data.scopes as string[],
    editablePath: data.editablePath as string | null,
    verifierPath: data.verifierPath as string | null,
    terminalCheckPaths: data.terminalCheckPaths as string[],
    desktopPid: data.desktopPid as number | null,
  };
}

async function bodyJson(req: IncomingMessage): Promise<unknown> {
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json")
    throw new Error("json_content_type_required");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > 16_384) throw new Error("request_body_too_large");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export class NyxLocalWebConsole {
  readonly #config: NyxLocalWebConsoleConfig;
  readonly #token = randomBytes(32).toString("base64url");
  readonly #approvals = new NyxLocalApprovalBroker();
  #server: Server | null = null;
  #runtime: NyxLocalRuntime | null = null;
  #origin: string | null = null;
  #busy = false;
  #turns = 0;
  #capacityState: string | null = null;

  constructor(config: NyxLocalWebConsoleConfig) {
    this.#config = config;
  }

  get url(): string | null {
    return this.#origin ? `${this.#origin}/#session=${this.#token}` : null;
  }

  async start(): Promise<string> {
    if (this.#server) throw new Error("nyx_web_console_already_started");
    const server = createServer((req, res) => {
      void this.#handle(req, res);
    });
    server.requestTimeout = 330_000;
    server.headersTimeout = 30_000;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
    } catch (error) {
      server.close();
      throw error;
    }
    const address = server.address() as AddressInfo;
    this.#origin = `http://127.0.0.1:${address.port}`;
    this.#server = server;
    return this.url!;
  }

  async close(): Promise<{
    readonly cleaned: boolean;
    readonly quarantinePath: string | null;
  }> {
    this.#approvals.close();
    const server = this.#server;
    this.#server = null;
    this.#origin = null;
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    const runtime = this.#runtime;
    this.#runtime = null;
    return runtime ? runtime.close() : { cleaned: true, quarantinePath: null };
  }

  #headers(res: ServerResponse, contentType: string): void {
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  }

  #json(res: ServerResponse, status: number, value: unknown): void {
    this.#headers(res, "application/json; charset=utf-8");
    res.writeHead(status);
    res.end(JSON.stringify(value));
  }

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", this.#origin ?? "http://127.0.0.1");
      if (!this.#origin || req.headers.host !== new URL(this.#origin).host) {
        this.#json(res, 403, { error: "host_boundary_rejected" });
        return;
      }
      if (
        req.method === "GET" &&
        ["/", "/ui.css", "/ui.js", "/logo.svg"].includes(url.pathname)
      ) {
        const name =
          url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const kind = name.endsWith(".html")
          ? "text/html"
          : name.endsWith(".css")
            ? "text/css"
            : name.endsWith(".svg")
              ? "image/svg+xml"
              : "text/javascript";
        const content = await readFile(join(this.#config.assetRoot, name));
        this.#headers(res, `${kind}; charset=utf-8`);
        res.writeHead(200);
        res.end(content);
        return;
      }
      if (!url.pathname.startsWith("/api/")) {
        this.#json(res, 404, { error: "not_found" });
        return;
      }
      if (req.headers["x-nyx-session"] !== this.#token) {
        this.#json(res, 403, { error: "session_token_required" });
        return;
      }
      if (req.method === "POST" && req.headers.origin !== this.#origin) {
        this.#json(res, 403, { error: "origin_boundary_rejected" });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        this.#json(res, 200, {
          configured: Boolean(this.#runtime),
          busy: this.#busy,
          turns: this.#turns,
          capacityState: this.#capacityState,
          modelCredentialAvailable: Boolean(
            this.#config.environment.NVIDIA_API_KEY?.trim(),
          ),
          defaultRepository: this.#config.defaultRepository,
          runtime: this.#runtime?.status ?? null,
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/approval") {
        this.#json(res, 200, { pending: this.#approvals.pending });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/configure") {
        if (this.#runtime || this.#busy) {
          this.#json(res, 409, { error: "session_already_configured" });
          return;
        }
        const parsed = parseSetup(await bodyJson(req));
        if (!parsed) {
          this.#json(res, 400, { error: "invalid_authority_configuration" });
          return;
        }
        this.#busy = true;
        try {
          this.#runtime = await (
            this.#config.createRuntime ?? createNyxLocalRuntime
          )(parsed, {
            environment: this.#config.environment,
            approveDesktopAction: (action) => this.#approvals.request(action),
            onCapacityProgress: (progress) => {
              this.#capacityState = progress.state;
            },
          });
        } finally {
          this.#busy = false;
        }
        this.#json(res, 200, {
          configured: true,
          runtime: this.#runtime.status,
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/turn") {
        if (!this.#runtime) {
          this.#json(res, 409, { error: "session_not_configured" });
          return;
        }
        if (this.#busy || this.#turns >= 30) {
          this.#json(res, 409, {
            error: this.#busy
              ? "turn_already_active"
              : "session_turn_limit_reached",
          });
          return;
        }
        const value = await bodyJson(req);
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          !exactKeys(value as Record<string, unknown>, ["message"]) ||
          typeof (value as { message?: unknown }).message !== "string"
        ) {
          this.#json(res, 400, { error: "invalid_chat_message" });
          return;
        }
        this.#busy = true;
        this.#turns += 1;
        try {
          const result = await this.#runtime.session.turn(
            (value as { message: string }).message,
          );
          this.#json(res, 200, result);
        } finally {
          this.#busy = false;
        }
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/approval") {
        const value = await bodyJson(req);
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          !exactKeys(value as Record<string, unknown>, ["id", "approved"]) ||
          typeof (value as { id?: unknown }).id !== "string" ||
          typeof (value as { approved?: unknown }).approved !== "boolean"
        ) {
          this.#json(res, 400, { error: "invalid_approval_decision" });
          return;
        }
        const accepted = this.#approvals.decide(
          (value as { id: string }).id,
          (value as { approved: boolean }).approved,
        );
        this.#json(res, accepted ? 200 : 409, { accepted });
        return;
      }
      this.#json(res, 404, { error: "not_found" });
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const reason =
        error instanceof Error ? error.message : "unexpected_failure";
      const publicReason = nyxContainsSecretLike(reason)
        ? "sensitive_error_withheld"
        : reason.slice(0, 300);
      this.#json(res, 400, { error: publicReason } satisfies ApiError);
    }
  }
}
