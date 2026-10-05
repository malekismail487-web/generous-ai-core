"""Harbor external agent: shared NYX cognition and Omega lease, not a second model agent.

The current private-offline container profile is not automatically relaxed for task images.
An incompatible official environment is explicitly blocked, never replaced with an easier fixture.
"""

import asyncio
import inspect
import json
import os
import re
import shutil
import time
from pathlib import Path

from harbor.agents.base import BaseAgent
from harbor.agents.options import AgentOptions
from harbor.environments.docker.docker import DockerEnvironment
from harbor.models.agent.context import AgentContext

HARBOR_PIN = "fd1521a1da6250d9ed8fc7505caa0b7a72f36c4b"


async def _bounded_output(process, limit: int, timeout: float, payload: bytes | None = None) -> bytes:
    """Bound host output while reading, not after an unbounded communicate allocation."""
    output = bytearray()
    try:
        async with asyncio.timeout(timeout):
            if payload is not None:
                process.stdin.write(payload)
                await process.stdin.drain()
                process.stdin.close()
            while chunk := await process.stdout.read(4096):
                if len(output) + len(chunk) > limit:
                    raise RuntimeError("nyx_harbor_host_output_oversized")
                output.extend(chunk)
            await process.wait()
            return bytes(output)
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()


def _docker_environment() -> dict[str, str]:
    return {"PATH": os.environ.get("PATH", ""), "DOCKER_CONFIG": "/nonexistent-nyx-docker-config"}


async def _terminate_owned_task(container_id: str) -> None:
    """A crashed/cancelled host bridge must not leave its exact task container executing."""
    if not re.fullmatch(r"[a-f0-9]{64}", container_id):
        raise RuntimeError("nyx_harbor_cleanup_identity_invalid")
    process = await asyncio.create_subprocess_exec("docker", "kill", container_id,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, env=_docker_environment())
    await _bounded_output(process, 4096, 10)
    # A kill response is not proof; inspect the same immutable identity afterward.
    observed = await asyncio.create_subprocess_exec("docker", "inspect", "--type", "container", container_id,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, env=_docker_environment())
    records = json.loads(await _bounded_output(observed, 64000, 10))
    if observed.returncode != 0 or not isinstance(records, list) or len(records) != 1 \
            or records[0].get("Id") != container_id or records[0].get("State", {}).get("Running") is not False:
        raise RuntimeError("nyx_harbor_emergency_termination_unconfirmed")


class NyxHarborAgent(BaseAgent):
    options_model = AgentOptions  # Unknown kwargs must not silently add authority or alter frozen budgets.
    @staticmethod
    def name() -> str:
        return "nyx-omega-existing-substrate"

    def version(self) -> str:
        return "1.0.0"

    async def setup(self, environment) -> None:
        if not isinstance(environment, DockerEnvironment):
            raise RuntimeError("nyx_harbor_requires_supported_local_docker_environment")
        if os.environ.get("OMEGA_ALLOW_NYX_HARBOR_BRIDGE") != "1":
            raise RuntimeError("nyx_harbor_bridge_not_authorized")
        if self.mcp_servers or self.skills_dir or self.load_trajectory or self.extra_env:
            raise RuntimeError("nyx_harbor_additional_authority_not_supported")
        if self.model_name not in (None, "nvidia/nemotron-3-ultra-550b-a55b"):
            raise RuntimeError("nyx_harbor_model_does_not_match_frozen_substrate")
        source_root = Path(inspect.getfile(BaseAgent)).resolve().parents[3]
        pinned = await asyncio.create_subprocess_exec("git", "-C", str(source_root), "rev-parse", "HEAD",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            env={"PATH": os.environ.get("PATH", ""), **({"SYSTEMROOT": os.environ["SYSTEMROOT"]} if "SYSTEMROOT" in os.environ else {})})
        output = await _bounded_output(pinned, 128, 5)
        if pinned.returncode != 0 or output.decode().strip() != HARBOR_PIN:
            raise RuntimeError("nyx_harbor_upstream_pin_not_verified")

    async def run(self, instruction: str, environment, context: AgentContext) -> None:
        await self.setup(environment)
        if not isinstance(instruction, str) or not instruction.strip() or len(instruction) > 8000:
            raise RuntimeError("nyx_harbor_instruction_outside_existing_chat_bounds")
        # Query the harness's exact main service; no task/model text supplies host commands or Docker options.
        selected = await environment._run_docker_compose_command(["ps", "--quiet", "--no-trunc", "main"])
        container_id = (selected.stdout or "").strip()
        if selected.return_code != 0 or not re.fullmatch(r"[a-f0-9]{64}", container_id):
            raise RuntimeError("nyx_harbor_container_selection_not_unique")
        process = await asyncio.create_subprocess_exec(
            "docker", "inspect", "--type", "container", container_id,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            env=_docker_environment(),
        )
        try:
            inspected = await _bounded_output(process, 64000, 10)
        except TimeoutError:
            raise RuntimeError("nyx_harbor_inspection_timeout") from None
        if process.returncode != 0 or len(inspected) > 64000:
            raise RuntimeError("nyx_harbor_inspection_failed")
        records = json.loads(inspected)
        if not isinstance(records, list) or len(records) != 1 or not isinstance(records[0], dict):
            raise RuntimeError("nyx_harbor_inspection_not_unique")
        profile = records[0]
        config = profile.get("Config")
        labels = config.get("Labels") if isinstance(config, dict) else None
        image = profile.get("Image")
        owner = labels.get("org.lumina.nyx.isolated-owner") if isinstance(labels, dict) else None
        if profile.get("Id") != container_id or not isinstance(image, str) or not isinstance(owner, str) \
                or not re.fullmatch(r"sha256:[a-f0-9]{64}", image) or not re.fullmatch(r"[a-f0-9]{32}", owner):
            raise RuntimeError("nyx_harbor_task_profile_not_independently_authorized")
        candidate = os.environ.get("GITHUB_SHA", "")
        if not re.fullmatch(r"[a-f0-9]{40}", candidate):
            raise RuntimeError("nyx_harbor_exact_candidate_missing")
        task_identity = f"HARBOR-{self.context_id.hex}" if self.context_id else f"HARBOR-{int(time.time_ns())}"
        started = int(time.time() * 1000)
        request = {"schemaVersion": 1, "candidate": candidate, "taskIdentity": task_identity,
                   "instruction": instruction, "containerId": container_id, "imageId": image, "owner": owner,
                   "issuedAtEpochMs": started, "expiresAtEpochMs": started + 300000}
        repository = Path(__file__).resolve().parents[3]
        node = shutil.which("node")
        if not node:
            raise RuntimeError("nyx_harbor_node_runtime_unavailable")
        # Provider credentials remain in the trusted host process; never injected into the task container or stdin request.
        host_env = {key: os.environ[key] for key in ("PATH", "NVIDIA_API_KEY", "OMEGA_ALLOW_NVIDIA_NETWORK",
                    "OMEGA_ALLOW_NYX_HARBOR_BRIDGE", "GITHUB_SHA") if key in os.environ}
        child = await asyncio.create_subprocess_exec(node, "--experimental-strip-types", "--import",
            "./scripts/w0rs/register-typescript-loader.mjs", "scripts/omega/nyx-harbor-entrypoint.ts",
            cwd=repository, env=host_env, stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        try:
            output = await _bounded_output(child, 2000000, 310, json.dumps(request).encode())
            receipt = json.loads(output)
            if not isinstance(receipt, dict) or receipt.get("identity") != "NYX-HARBOR-EXISTING-SUBSTRATE-CANDIDATE-001" \
                    or receipt.get("taskSuccessClaimed") is not False:
                raise RuntimeError("nyx_harbor_receipt_identity_invalid")
            if receipt.get("outcome") == "BLOCKED":
                reason = receipt.get("reason", "harbor_bridge_blocked")
                if not isinstance(reason, str) or not re.fullmatch(r"[a-z_]{1,120}", reason):
                    reason = "harbor_bridge_blocked"
                # Persist only the bounded reason, not an untrusted failure payload.
                context.metadata = {"nyx": {"outcome": "BLOCKED", "reason": reason}, "harborPin": HARBOR_PIN}
                raise RuntimeError(reason)
            if child.returncode != 0 or receipt.get("candidate") != candidate or receipt.get("taskIdentity") != task_identity \
                    or receipt.get("leaseRevoked") is not True or receipt.get("sourceRepositoryUnchanged") is not True \
                    or receipt.get("officialVerification") != "NOT_EXECUTED_BY_AGENT" \
                    or receipt.get("outcome") not in ("REPLIED", "REJECTED", "MODEL_FAILURE", "BUDGET_EXHAUSTED"):
                raise RuntimeError("nyx_harbor_receipt_not_bound_or_revoked")
            for field in ("inputTokens", "outputTokens"):
                value = receipt.get(field)
                if value is not None and (type(value) is not int or value < 0):
                    raise RuntimeError("nyx_harbor_compute_receipt_invalid")
        except BaseException:
            # Killing the Node client alone cannot revoke a guest process already launched via Docker.
            # This exact container was selected by the harness and had its independent owner identity checked.
            await asyncio.shield(_terminate_owned_task(container_id))
            raise
        context.n_input_tokens = receipt["inputTokens"]
        context.n_output_tokens = receipt["outputTokens"]
        context.metadata = {"nyx": receipt, "harborPin": HARBOR_PIN}
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        (self.logs_dir / "nyx-sanitized-evidence.json").write_text(json.dumps(receipt, indent=2) + "\n")
        # No verifier invocation or reward claim here. Harbor performs official grading after this method returns.
