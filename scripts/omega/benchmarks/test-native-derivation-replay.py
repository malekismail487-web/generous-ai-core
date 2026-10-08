"""Independent direct-semantic and hostile-input checks; no model/benchmark data."""
import copy
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("replay", pathlib.Path(__file__).with_name("replay-native-derivations.py"))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


def seal(capsule):
    capsule["problemDigest"] = checker.digest(capsule["problem"])
    capsule["programDigest"] = checker.digest(capsule["program"])
    capsule["capsuleDigest"] = checker.digest({k: v for k, v in capsule.items() if k != "capsuleDigest"})
    return capsule


def fixture():
    return seal({"schemaVersion": 1, "kind": "PUBLIC_NATIVE_DERIVATION_REPLAY",
                 "problem": {"kind": "EXACT_QUANTITATIVE_DERIVATION", "constants": [
                     {"id": "zero", "value": "0"}, {"id": "a", "value": "2"}, {"id": "b", "value": "3"}]},
                 "program": {"schemaVersion": 2, "initialState": [{"slot": "r0", "source": "a"}, {"slot": "r1", "source": "b"}],
                             "cycles": [{"iterations": 1, "phases": [{"expressions": [
                                 {"id": "e0", "op": "ADD", "left": "r0", "right": "r1"}],
                                 "updates": [{"slot": "r0", "source": "r1"}, {"slot": "r1", "source": "e0"}]}]}],
                             "outputs": [{"label": "x", "source": "r0"}, {"label": "y", "source": "r1"}]},
                 "executedProgramDigest": "a"*64, "analysisDigest": "b"*64, "loweringVersion": "nyx-equation-lowering/1",
                 "observedOutputs": [{"label": "x", "value": "3"}, {"label": "y", "value": "5"}],
                 "scope": "SYNTHETIC_DEVELOPMENT_TOOL_ACTION_NOT_PRIVATE_REASONING_OR_MODEL_VALIDITY",
                 "grantsAuthority": False, "mathematicalModelIndependentlyVerified": False})


class ReplayTests(unittest.TestCase):
    def test_simultaneous_updates_do_not_use_a_new_state_value(self):
        self.assertEqual(checker.replay(fixture())["state"], "EXECUTION_AGREEMENT_NOT_MODEL_VALIDITY")

    def test_execution_disagreement_is_not_laundered_through_a_valid_hash(self):
        capsule = fixture()
        capsule["observedOutputs"][1]["value"] = "6"
        self.assertEqual(checker.replay(seal(capsule))["state"], "EXECUTION_DISAGREEMENT")

    def test_input_and_authority_rejections(self):
        for field, value in [("schemaVersion", True), ("schemaVersion", 2), ("grantsAuthority", True),
                             ("mathematicalModelIndependentlyVerified", True), ("scope", "PRODUCTION"),
                             ("capsuleDigest", "0"*64), ("observedOutputs", [])]:
            capsule = fixture()
            capsule[field] = value
            if field != "capsuleDigest":
                seal(capsule)
            with self.subTest(field=field, value=value):
                self.assertEqual(checker.replay(capsule)["state"], "INSUFFICIENT_EVIDENCE")
        capsule = fixture()
        capsule["answer"] = "not permitted"
        self.assertEqual(checker.replay(seal(capsule))["state"], "INSUFFICIENT_EVIDENCE")

    def test_forward_bindings_duplicate_updates_and_unsupported_ops_fail(self):
        for mutate in [lambda p: p["cycles"][0].update(iterations=1025),
                       lambda p: p["cycles"][0].update(iterations=True),
                       lambda p: p["cycles"][0]["phases"][0]["expressions"][0].update(left="e1"),
                       lambda p: p["cycles"][0]["phases"][0]["expressions"][0].update(op="SHELL"),
                       lambda p: p["cycles"][0]["phases"][0]["updates"].append({"slot": "r0", "source": "a"}),
                       lambda p: p["initialState"].append({"slot": "a", "source": "a"})]:
            capsule = fixture()
            mutate(capsule["program"])
            self.assertEqual(checker.replay(seal(capsule))["state"], "INSUFFICIENT_EVIDENCE")

    def test_domain_and_resource_failure_do_not_claim_a_disagreement(self):
        self.assertEqual(checker.replay(fixture(), max_work=1)["reason"], "REPLAY_RESOURCE_BOUND")
        capsule = fixture()
        capsule["program"]["cycles"][0]["phases"][0]["expressions"][0].update(op="DIV", right="zero")
        self.assertEqual(checker.replay(seal(capsule))["reason"], "REPLAY_ARITHMETIC_DOMAIN")

    def test_noncanonical_or_oversized_outputs_are_not_mislabeled_as_numerical_disagreement(self):
        for value in ["6/2", "-0", "00", "1/0", "1"+"0"*1400]:
            capsule = fixture()
            capsule["observedOutputs"][0]["value"] = value
            self.assertEqual(checker.replay(seal(capsule))["state"], "INSUFFICIENT_EVIDENCE")

    def test_missing_and_unexpected_data_is_rejected_without_interpreting_code(self):
        for malformed in [None, {}, [], "__import__('os')", {**fixture(), "shell": "never executed"}]:
            self.assertEqual(checker.replay(malformed)["state"], "INSUFFICIENT_EVIDENCE")
        with self.assertRaises(checker.Rejected):
            checker.unique_object([("same", 1), ("same", 2)])

    def test_no_hidden_oracle_is_needed_and_success_does_not_verify_a_theory(self):
        result = checker.replay(copy.deepcopy(fixture()))
        self.assertFalse(result["grantsAuthority"])
        self.assertEqual(result["outputsCompared"], 2)
        self.assertNotIn("answer", result)
        self.assertIn("NOT_MODEL_VALIDITY", result["state"])

    def test_report_mode_preserves_missing_capture_and_nonexecution(self):
        capsule = fixture()
        report = {"identity": "NYX-COMPUTATION-TRANSFER-001", "officialBenchmark": False,
                  "sourceUnchanged": True, "gpqaQuestionsOrAnswersLoaded": False, "rawPrivateReasoningStored": False,
                  "productionAuthority": False, "selectedTaskArms": 4, "attempted": 3, "rows": [
                      {"programDigest": capsule["programDigest"], "nativeReplay": capsule, "computedModelCorrect": False},
                      {"nativeReplay": None, "computedModelCorrect": False},
                      {"nativeReplay": None, "computedModelCorrect": None}]}
        capsules, coverage = checker.report_capsules(report)
        self.assertEqual(len(capsules), 1)
        self.assertEqual(coverage, {"missingConstructedReplays": 1, "unconstructedRows": 1,
                                    "selectedTaskArms": 4, "attemptedTaskArms": 3, "unexecutedTaskArms": 1})
        report["rows"][0]["programDigest"] = "0"*64
        with self.assertRaises(checker.Rejected):
            checker.report_capsules(report)
        report["identity"] = "NYX-GPQA-EXPOSED-FAILURE-RECOVERY-001"
        with self.assertRaises(checker.Rejected):
            checker.report_capsules(report)


if __name__ == "__main__":
    unittest.main()
