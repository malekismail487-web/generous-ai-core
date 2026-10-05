"""Tests use the actual pinned Harbor SDK; Docker/model I/O alone is doubled.

Passing these tests is interface evidence, never an official benchmark score.
"""

import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID

from harbor.agents.base import BaseAgent
from harbor.agents.factory import AgentFactory
from harbor.environments.docker.docker import DockerEnvironment
from harbor.models.agent.context import AgentContext

from scripts.omega.benchmarks.nyx_harbor_agent import (
    HARBOR_PIN,
    NyxHarborAgent,
    _bounded_output,
)

CID = "a" * 64
CANDIDATE = "d" * 40
CONTEXT_ID = UUID("12345678-1234-5678-1234-567812345678")
IDENTITY = "NYX-HARBOR-EXISTING-SUBSTRATE-CANDIDATE-001"


class FakeProcess:
    def __init__(self, output: bytes, code: int = 0, stall: bool = False):
        self.returncode = None
        self.code = code
        self.killed = False
        self.payload = bytearray()
        self.stdout = asyncio.StreamReader()
        if not stall:
            self.stdout.feed_data(output)
            self.stdout.feed_eof()
        self.stdin = SimpleNamespace(write=self.payload.extend, drain=AsyncMock(), close=lambda: None)

    def kill(self):
        self.killed = True
        self.returncode = -9

    async def wait(self):
        if self.returncode is None:
            self.returncode = self.code
        return self.returncode


def inspection(running=True):
    return [{"Id": CID, "Image": "sha256:" + "b" * 64, "State": {"Running": running},
             "Config": {"Labels": {"org.lumina.nyx.isolated-owner": "c" * 32}}}]


def receipt(**changes):
    return {"identity": IDENTITY, "taskSuccessClaimed": False, "candidate": CANDIDATE,
            "taskIdentity": "HARBOR-" + CONTEXT_ID.hex, "leaseRevoked": True,
            "sourceRepositoryUnchanged": True, "officialVerification": "NOT_EXECUTED_BY_AGENT",
            "outcome": "REPLIED", "inputTokens": None, "outputTokens": None, **changes}


class ActualHarborInterfaceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="nyx-harbor-interface-")
        self.addCleanup(self.directory.cleanup)
        self.agent = NyxHarborAgent(logs_dir=Path(self.directory.name))
        self.agent.context_id = CONTEXT_ID
        self.environment = object.__new__(DockerEnvironment)
        self.environment._run_docker_compose_command = AsyncMock(
            return_value=SimpleNamespace(stdout=CID + "\n", return_code=0))

    async def test_real_base_factory_and_pin(self):
        instance = AgentFactory.create_agent_from_import_path(
            "scripts.omega.benchmarks.nyx_harbor_agent:NyxHarborAgent", logs_dir=Path(self.directory.name))
        self.assertIsInstance(instance, BaseAgent)
        with patch.dict(os.environ, {"OMEGA_ALLOW_NYX_HARBOR_BRIDGE": "1"}):
            await instance.setup(self.environment)  # Real read-only git pin check, no model or Docker request.
        self.assertEqual(instance.name(), "nyx-omega-existing-substrate")
        self.assertFalse(instance.capabilities.resume)

    async def test_unknown_options_fail_closed(self):
        with self.assertRaises(ValueError):
            NyxHarborAgent(logs_dir=Path(self.directory.name), allow_host_shell=True)
        with self.assertRaises(ValueError):
            NyxHarborAgent(logs_dir=Path(self.directory.name), max_model_calls=999)

    async def test_setup_denies_unsupported_authority(self):
        for kwargs in ({"extra_env": {"UNAUTHORIZED": "value"}}, {"skills_dir": "/other"},
                       {"load_trajectory": "/other"}, {"model_name": "different-model"}):
            with self.subTest(kwargs=kwargs), patch.dict(os.environ, {"OMEGA_ALLOW_NYX_HARBOR_BRIDGE": "1"}):
                agent = NyxHarborAgent(logs_dir=Path(self.directory.name), **kwargs)
                with self.assertRaises(RuntimeError):
                    await agent.setup(self.environment)
        with patch.dict(os.environ, {"OMEGA_ALLOW_NYX_HARBOR_BRIDGE": "0"}):
            with self.assertRaisesRegex(RuntimeError, "not_authorized"):
                await self.agent.setup(self.environment)
        with self.assertRaisesRegex(RuntimeError, "supported_local_docker"):
            await self.agent.setup(object())

    async def run_doubled(self, body, node_stall=False, cancel=False, cleanup_running=False):
        processes = [FakeProcess(json.dumps(inspection()).encode()),
                     FakeProcess(json.dumps(body).encode(), stall=node_stall),
                     FakeProcess(CID.encode()), FakeProcess(json.dumps(inspection(cleanup_running)).encode())]
        invoked = []

        async def create(*argv, **kwargs):
            invoked.append((argv, kwargs))
            return processes[len(invoked) - 1]

        with patch.object(self.agent, "setup", new=AsyncMock()), \
                patch.dict(os.environ, {"GITHUB_SHA": CANDIDATE, "NVIDIA_API_KEY": "synthetic-test-only-value", "UNAUTHORIZED": "forbidden"}), \
                patch("scripts.omega.benchmarks.nyx_harbor_agent.asyncio.create_subprocess_exec", side_effect=create), \
                patch("scripts.omega.benchmarks.nyx_harbor_agent.shutil.which", return_value="/trusted/node"):
            context = AgentContext()
            task = asyncio.create_task(self.agent.run("A fresh bounded objective Ω", self.environment, context))
            if cancel:
                for _ in range(100):
                    if len(invoked) >= 2:
                        break
                    await asyncio.sleep(0)
                task.cancel()
            try:
                await task
            except BaseException as error:
                return context, processes, invoked, error
            return context, processes, invoked, None

    async def test_exact_bridge_unknown_usage_and_independent_grading(self):
        context, processes, calls, error = await self.run_doubled(receipt())
        self.assertIsNone(error)
        self.assertEqual(len(calls), 2)
        self.assertIsNone(context.n_input_tokens)
        self.assertIsNone(context.n_output_tokens)
        self.assertEqual(context.metadata["harborPin"], HARBOR_PIN)
        self.assertIs(context.metadata["nyx"]["taskSuccessClaimed"], False)
        self.assertIn("nyx-harbor-entrypoint.ts", calls[1][0][-1])
        self.assertEqual(calls[0][0], ("docker", "inspect", "--type", "container", CID))
        self.assertNotIn("NVIDIA_API_KEY", calls[0][1]["env"])
        self.assertNotIn("UNAUTHORIZED", calls[1][1]["env"])
        self.assertNotIn("synthetic-test-only-value", processes[1].payload.decode())
        self.assertEqual(json.loads(processes[1].payload)["containerId"], CID)
        self.assertEqual(self.environment._run_docker_compose_command.call_args.args[0], ["ps", "--quiet", "--no-trunc", "main"])
        self.assertTrue((Path(self.directory.name) / "nyx-sanitized-evidence.json").is_file())

    async def test_failed_boundaries_stop_exact_container(self):
        for body in (receipt(candidate="e" * 40), receipt(leaseRevoked=False), receipt(sourceRepositoryUnchanged=False),
                     receipt(taskSuccessClaimed=True), receipt(inputTokens=True), receipt(outcome="INVENTED"),
                     receipt(outcome="BLOCKED", reason="nyx_container_profile_rejected", unsafe_payload="must-not-persist")):
            with self.subTest(body=body):
                context, _, calls, error = await self.run_doubled(body)
                self.assertIsInstance(error, RuntimeError)
                self.assertEqual(calls[2][0], ("docker", "kill", CID))
                self.assertEqual(calls[3][0], ("docker", "inspect", "--type", "container", CID))
                self.assertNotIn("must-not-persist", json.dumps(context.model_dump()))

    async def test_cancelled_client_also_terminates_guest(self):
        _, processes, calls, error = await self.run_doubled(receipt(), node_stall=True, cancel=True)
        self.assertIsInstance(error, asyncio.CancelledError)
        self.assertTrue(processes[1].killed)
        self.assertEqual(calls[2][0], ("docker", "kill", CID))

    async def test_cleanup_is_observed_not_assumed(self):
        _, _, _, error = await self.run_doubled(receipt(leaseRevoked=False), cleanup_running=True)
        self.assertIsInstance(error, RuntimeError)
        self.assertEqual(str(error), "nyx_harbor_emergency_termination_unconfirmed")

    async def test_large_instruction_not_silently_truncated(self):
        with patch.object(self.agent, "setup", new=AsyncMock()):
            with self.assertRaisesRegex(RuntimeError, "outside_existing_chat_bounds"):
                await self.agent.run("x" * 8001, self.environment, AgentContext())
        self.environment._run_docker_compose_command.assert_not_awaited()

    async def test_host_output_limit_and_timeout_kill_child(self):
        oversized = FakeProcess(b"x" * 4097)
        with self.assertRaisesRegex(RuntimeError, "host_output_oversized"):
            await _bounded_output(oversized, 4096, 1)
        self.assertTrue(oversized.killed)
        stalled = FakeProcess(b"", stall=True)
        with self.assertRaises(TimeoutError):
            await _bounded_output(stalled, 4096, 0.01)
        self.assertTrue(stalled.killed)


if __name__ == "__main__":
    unittest.main()
