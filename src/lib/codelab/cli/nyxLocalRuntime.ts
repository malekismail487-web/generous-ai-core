import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { NyxChatSession } from "./nyxChatSession";
import { NyxIsolatedCandidateWriter } from "./nyxIsolatedCandidate";
import {
  NyxScopedComputerHost,
  nyxHostExecutableAliasPresent,
  type NyxDesktopApproval,
} from "./nyxScopedComputerHost";
import { nyxSafeRelativePath } from "./nyxChatProtocol";
import { ReadOnlyRepositoryExecutor } from "../executor/readOnlyExecutor";
import {
  NvidiaNimProvider,
  nvidiaNimCredentialFromEnvironment,
  type NvidiaNimCapacityProgress,
} from "../model/nvidiaNimProvider";

export interface NyxLocalRuntimeRequest {
  readonly repository: string;
  readonly scopes: readonly string[];
  readonly editablePath: string | null;
  readonly verifierPath: string | null;
  readonly terminalCheckPaths: readonly string[];
  readonly desktopPid: number | null;
}

export interface NyxLocalRuntimeOptions {
  readonly environment: NodeJS.ProcessEnv;
  readonly approveDesktopAction: (
    request: NyxDesktopApproval,
  ) => Promise<boolean>;
  readonly onCapacityProgress?: (progress: NvidiaNimCapacityProgress) => void;
}

export interface NyxLocalRuntimeStatus {
  readonly repository: string;
  readonly repositoryName: string;
  readonly scopes: readonly string[];
  readonly editablePath: string | null;
  readonly verifierPath: string | null;
  readonly terminalCheckPaths: readonly string[];
  readonly desktopPid: number | null;
  readonly desktopAvailable: boolean;
  readonly sourceRepositoryWritable: false;
  readonly generalShellAvailable: false;
  readonly generalNetworkAvailable: false;
  readonly productionAuthorityAvailable: false;
}

export interface NyxLocalRuntime {
  readonly session: NyxChatSession;
  readonly status: NyxLocalRuntimeStatus;
  close(): Promise<{
    readonly cleaned: boolean;
    readonly quarantinePath: string | null;
  }>;
}

function insideScope(path: string, scopes: readonly string[]): boolean {
  return scopes.some(
    (scope) => scope === "." || path === scope || path.startsWith(`${scope}/`),
  );
}

function winappExecutable(environment: NodeJS.ProcessEnv): string | null {
  if (process.platform !== "win32") return null;
  const alias = environment.LOCALAPPDATA
    ? join(environment.LOCALAPPDATA, "Microsoft", "WindowsApps", "winapp.exe")
    : null;
  if (alias && nyxHostExecutableAliasPresent(alias)) return alias;
  try {
    const selected = execFileSync("where.exe", ["winapp.exe"], {
      encoding: "utf8",
      timeout: 5_000,
    })
      .split(/\r?\n/)
      .find((path) => path.toLowerCase().endsWith("winapp.exe"));
    return selected && nyxHostExecutableAliasPresent(selected.trim())
      ? selected.trim()
      : null;
  } catch {
    return null;
  }
}

export async function createNyxLocalRuntime(
  request: NyxLocalRuntimeRequest,
  options: NyxLocalRuntimeOptions,
): Promise<NyxLocalRuntime> {
  if (options.environment.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
    throw new Error(
      "NVIDIA network consent missing; set OMEGA_ALLOW_NVIDIA_NETWORK=1 privately",
    );
  }
  if (!options.environment.NVIDIA_API_KEY?.trim()) {
    throw new Error(
      "NVIDIA_API_KEY unavailable; inject it privately, never into repository files",
    );
  }
  const repository = await realpath(resolve(request.repository));
  const editablePath = request.editablePath || null;
  const verifierPath = request.verifierPath || null;
  const scopes = request.scopes.length
    ? [...request.scopes]
    : [
        editablePath
          ? dirname(editablePath).replace(/\\/g, "/")
          : existsSync(join(repository, "src"))
            ? "src"
            : ".",
      ];
  if (
    scopes.some((scope) => scope !== "." && !nyxSafeRelativePath(scope)) ||
    new Set(scopes).size !== scopes.length ||
    (editablePath !== null &&
      (!nyxSafeRelativePath(editablePath) ||
        !insideScope(editablePath, scopes))) ||
    (verifierPath !== null &&
      (!nyxSafeRelativePath(verifierPath) || !verifierPath.endsWith(".mjs"))) ||
    request.terminalCheckPaths.some(
      (path) =>
        !nyxSafeRelativePath(path) ||
        !/\.(?:mjs|cjs|js)$/.test(path) ||
        !insideScope(path, scopes),
    ) ||
    new Set(request.terminalCheckPaths).size !==
      request.terminalCheckPaths.length ||
    (request.desktopPid !== null &&
      (!Number.isSafeInteger(request.desktopPid) || request.desktopPid < 1))
  ) {
    throw new Error(
      "NYX local authority request invalid or outside declared scope",
    );
  }
  const now = Date.now();
  const reader = await ReadOnlyRepositoryExecutor.create({
    executorId: `NYX-LOCAL-R1-${now}`,
    tokenId: `NYX-LOCAL-R1-TOKEN-${now}`,
    repositoryRoot: repository,
    resourceScopes: scopes,
    issuedAtEpochMs: now - 1_000,
    expiresAtEpochMs: now + 3_600_000,
    constraints: {
      maxFileBytes: 24_000,
      maxDirectoryEntries: 80,
      allowedExtensions: [
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".json",
        ".md",
        ".py",
        ".rs",
        ".go",
      ],
    },
    issuer: "NYX-LOCAL-USER",
    auditIdentity: `NYX-LOCAL-READ-${now}`,
  });
  let writer: NyxIsolatedCandidateWriter | null = null;
  try {
    if (editablePath) {
      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repository,
        encoding: "utf8",
        timeout: 5_000,
      }).trim();
      if (!/^[a-f0-9]{40}$/.test(head))
        throw new Error("Git HEAD cannot bind isolated candidate");
      writer = await NyxIsolatedCandidateWriter.create({
        sourceRoot: repository,
        editablePath,
        verifierPath,
        candidateCommit: head,
        maxCandidateBytes: 32_768,
        maxVerifierMs: 10_000,
      });
    }
    const winappPath =
      request.desktopPid === null
        ? null
        : winappExecutable(options.environment);
    if (request.desktopPid !== null && !winappPath)
      throw new Error(
        "Microsoft WinApp CLI unavailable for selected desktop PID",
      );
    const computer = NyxScopedComputerHost.create({
      reader,
      allowedCheckPaths: request.terminalCheckPaths,
      desktopPid: request.desktopPid,
      winappPath,
      approveDesktopAction: options.approveDesktopAction,
    });
    const provider = NvidiaNimProvider.create({
      providerId: "NYX-LOCAL-NEMOTRON",
      model:
        options.environment.NVIDIA_NIM_MODEL?.trim() ||
        "nvidia/nemotron-3-ultra-550b-a55b",
      authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM",
      credentialSource: nvidiaNimCredentialFromEnvironment(options.environment),
      maxPromptBytes: 64_000,
      maxOutputTokens: 4_096,
      timeoutMs: 90_000,
      onCapacityProgress: options.onCapacityProgress,
    });
    const session = NyxChatSession.create({
      sessionId: `NYX-LOCAL-${now}`,
      model: provider,
      reader,
      candidateWriter: writer,
      computerHost: computer,
      editablePaths: editablePath ? [editablePath] : [],
      maxModelCallsPerTurn: 7,
      maxCandidatesPerTurn: editablePath ? 2 : 0,
      maxTurnMs: 300_000,
      maxOutputTokens: 4_096,
    });
    let closed = false;
    return {
      session,
      status: {
        repository,
        repositoryName: basename(repository),
        scopes,
        editablePath,
        verifierPath,
        terminalCheckPaths: [...request.terminalCheckPaths],
        desktopPid: request.desktopPid,
        desktopAvailable: computer.desktopAvailable,
        sourceRepositoryWritable: false,
        generalShellAvailable: false,
        generalNetworkAvailable: false,
        productionAuthorityAvailable: false,
      },
      close: async () => {
        if (closed) return { cleaned: true, quarantinePath: null };
        closed = true;
        reader.terminate(Date.now(), "nyx_local_session_closed");
        const result = writer ? await writer.close() : null;
        return {
          cleaned: result?.decision !== "QUARANTINED",
          quarantinePath:
            result?.decision === "QUARANTINED" ? result.path : null,
        };
      },
    };
  } catch (error) {
    reader.terminate(Date.now(), "nyx_local_setup_failed");
    if (writer) await writer.close();
    throw error;
  }
}
