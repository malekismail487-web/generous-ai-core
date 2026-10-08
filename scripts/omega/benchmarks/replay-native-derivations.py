"""Offline development verifier: interpret public phase equations directly using Fraction.

Never imports NYX lowering/execution code, runs model code, opens files, or consults
an answer oracle. Agreement validates execution of the supplied model, NOT whether
that model represents a question correctly. Content hashes are not authentication.
"""
import hashlib
import json
import re
import sys
import time
from fractions import Fraction


class Rejected(Exception):
    pass


def require(condition):
    if not condition:
        raise Rejected("REPLAY_INPUT_REJECTED")


def shape(value, fields):
    require(type(value) is dict and set(value) == set(fields.split()))


def array(value, maximum, minimum=0):
    require(type(value) is list and minimum <= len(value) <= maximum)
    return value


def integer(value, minimum, maximum):
    require(type(value) is int and minimum <= value <= maximum)


def identifier(value):
    return type(value) is str and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,47}", value) is not None


def digest(value):
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def rational(value, maximum=258, canonical=False):
    require(type(value) is str and len(value) <= maximum
            and re.fullmatch(r"-?(?:0|[1-9][0-9]*)(?:/[1-9][0-9]*)?", value))
    parsed = Fraction(value)
    require(abs(parsed.numerator).bit_length() <= 4096 and parsed.denominator.bit_length() <= 4096
            and (not canonical or str(parsed) == value))
    return parsed


def replay(capsule, max_work=100000, deadline=None):
    """A separately bounded test oracle, not a production reasoning capability."""
    work = 0
    deadline = time.monotonic()+5 if deadline is None else deadline

    def tick():
        nonlocal work
        work += 1
        if work > max_work or time.monotonic() >= deadline:
            raise Rejected("REPLAY_RESOURCE_BOUND")

    def fraction(n, d=1):
        if not d:
            raise Rejected("REPLAY_ARITHMETIC_DOMAIN")
        if abs(n).bit_length() > 4096 or abs(d).bit_length() > 4096:
            raise Rejected("REPLAY_INTEGER_BOUND")
        return Fraction(n, d)

    def operation(op, left, right):
        tick()
        a, b, c, d = left.numerator, left.denominator, right.numerator, right.denominator
        if op == "ADD":
            return fraction(a*d+c*b, b*d)
        if op == "SUB":
            return fraction(a*d-c*b, b*d)
        if op == "MUL":
            return fraction(a*c, b*d)
        if op == "DIV":
            return fraction(a*d, b*c)
        if op == "MIN":
            return min(left, right)
        if op == "MAX":
            return max(left, right)
        require(op == "BINOMIAL" and b == d == 1 and a >= 0 and c >= 0)
        if c > a:
            return Fraction(0)
        k = min(c, a-c)
        if k > 1024:
            raise Rejected("REPLAY_ARITHMETIC_DOMAIN")
        result = Fraction(1)
        for i in range(1, k+1):
            tick()
            result = fraction(result.numerator*(a-i+1), result.denominator*i)
        return result

    try:
        shape(capsule, "schemaVersion kind problem program problemDigest programDigest executedProgramDigest "
              "loweringVersion analysisDigest observedOutputs scope grantsAuthority "
              "mathematicalModelIndependentlyVerified capsuleDigest")
        require(len(json.dumps(capsule, separators=(",", ":")).encode("utf-8")) <= 50000)
        require(type(capsule["schemaVersion"]) is int and capsule["schemaVersion"] == 1
                and capsule["kind"] == "PUBLIC_NATIVE_DERIVATION_REPLAY"
                and capsule["loweringVersion"] == "nyx-equation-lowering/1"
                and capsule["scope"] == "SYNTHETIC_DEVELOPMENT_TOOL_ACTION_NOT_PRIVATE_REASONING_OR_MODEL_VALIDITY"
                and capsule["grantsAuthority"] is False
                and capsule["mathematicalModelIndependentlyVerified"] is False)
        for field in ("problemDigest", "programDigest", "executedProgramDigest", "analysisDigest", "capsuleDigest"):
            require(type(capsule[field]) is str and re.fullmatch(r"[0-9a-f]{64}", capsule[field]))
        require(capsule["capsuleDigest"] == digest({k: v for k, v in capsule.items() if k != "capsuleDigest"})
                and capsule["problemDigest"] == digest(capsule["problem"])
                and capsule["programDigest"] == digest(capsule["program"]))
        problem, program = capsule["problem"], capsule["program"]
        shape(problem, "kind constants")
        require(problem["kind"] == "EXACT_QUANTITATIVE_DERIVATION")
        constants = {}
        for item in array(problem["constants"], 32, 1):
            tick()
            shape(item, "id value")
            require(identifier(item["id"]) and item["id"] not in constants)
            require(re.fullmatch(r"-?(?:0|[1-9][0-9]{0,127})(?:/[1-9][0-9]{0,127})?", item["value"]))
            constants[item["id"]] = rational(item["value"])
        require(Fraction(0) in constants.values())
        # Contract names, not lowered scratch-register representation.
        state_names = [f"r{i}" for i in range(64) if f"r{i}" not in constants][:16]
        expression_names = {f"e{i}" for i in range(64) if f"e{i}" not in constants and f"e{i}" not in state_names}
        expression_names = set(sorted(expression_names, key=lambda x: int(x[1:]))[:16])
        state = dict.fromkeys(state_names, Fraction(0))
        shape(program, "schemaVersion initialState cycles outputs")
        require(type(program["schemaVersion"]) is int and program["schemaVersion"] == 2)
        initialized = set()
        for item in array(program["initialState"], 16):
            shape(item, "slot source")
            require(item["slot"] in state and item["slot"] not in initialized and item["source"] in constants)
            initialized.add(item["slot"])
            state[item["slot"]] = constants[item["source"]]
        static_steps = 0
        for cycle in array(program["cycles"], 16, 1):
            shape(cycle, "iterations phases")
            integer(cycle["iterations"], 1, 1024)
            phases = array(cycle["phases"], 8, 1)
            for phase in phases:
                shape(phase, "expressions updates")
                expressions, updates = array(phase["expressions"], 16), array(phase["updates"], 16, 1)
                names, targets, state_copies = set(constants) | set(state), set(), set()
                for expression in expressions:
                    shape(expression, "id op left right")
                    require(expression["id"] in expression_names and expression["id"] not in names
                            and expression["op"] in ("ADD", "SUB", "MUL", "DIV", "MIN", "MAX", "BINOMIAL")
                            and expression["left"] in names and expression["right"] in names)
                    names.add(expression["id"])
                for update in updates:
                    shape(update, "slot source")
                    require(update["slot"] in state and update["slot"] not in targets and update["source"] in names)
                    targets.add(update["slot"])
                    if update["source"] in state:
                        state_copies.add(update["source"])
                require(len(expressions)+len(state_copies) <= 16)
                static_steps += len(expressions)+len(state_copies)+len(updates)
            require(static_steps <= 64)
            for _ in range(cycle["iterations"]):
                for phase in phases:
                    tick()
                    values = {**constants, **state}
                    for expression in phase["expressions"]:
                        values[expression["id"]] = operation(expression["op"], values[expression["left"]], values[expression["right"]])
                    # Commit together. Direct interpretation has no lowering/scratch copies.
                    state.update({update["slot"]: values[update["source"]] for update in phase["updates"]})
        labels, expected = set(), []
        for output in array(program["outputs"], 16, 1):
            shape(output, "label source")
            require(identifier(output["label"]) and output["label"] not in labels
                    and output["source"] in constants.keys() | state.keys())
            labels.add(output["label"])
            value = (constants | state)[output["source"]]
            expected.append({"label": output["label"], "value": str(value)})
        observed = array(capsule["observedOutputs"], 16, 1)
        require(len(observed) == len(expected))
        for item, output in zip(observed, expected):
            shape(item, "label value")
            require(item["label"] == output["label"])
            rational(item["value"], 2500, canonical=True)
        return {"state": "EXECUTION_AGREEMENT_NOT_MODEL_VALIDITY" if observed == expected else "EXECUTION_DISAGREEMENT",
                "outputsCompared": len(expected), "workUnits": work, "grantsAuthority": False}
    except (Rejected, ValueError, TypeError, KeyError, OverflowError, RecursionError) as error:
        code = str(error) if isinstance(error, Rejected) else "REPLAY_INPUT_REJECTED"
        return {"state": "INSUFFICIENT_EVIDENCE", "reason": code, "outputsCompared": 0,
                "workUnits": work, "grantsAuthority": False}


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        require(key not in value)
        value[key] = item
    return value


def report_capsules(report):
    require(type(report) is dict and report.get("identity") == "NYX-COMPUTATION-TRANSFER-001"
            and report.get("officialBenchmark") is False and report.get("sourceUnchanged") is True
            and report.get("gpqaQuestionsOrAnswersLoaded") is False and report.get("rawPrivateReasoningStored") is False
            and report.get("productionAuthority") is False)
    rows = array(report.get("rows"), 200)
    integer(report.get("selectedTaskArms"), max(1, len(rows)), 200)
    integer(report.get("attempted"), len(rows), len(rows))
    capsules, missing, unconstructed = [], 0, 0
    for row in rows:
        require(type(row) is dict and "nativeReplay" in row and "computedModelCorrect" in row
                and (row["computedModelCorrect"] is None or type(row["computedModelCorrect"]) is bool))
        capsule = row.get("nativeReplay")
        if capsule is None:
            if row.get("computedModelCorrect") is not None:
                missing += 1
            else:
                unconstructed += 1
        else:
            require(type(capsule) is dict and type(row["computedModelCorrect"]) is bool
                    and capsule.get("programDigest") == row.get("programDigest"))
            capsules.append(capsule)
    return capsules, {"missingConstructedReplays": missing, "unconstructedRows": unconstructed,
                      "selectedTaskArms": report["selectedTaskArms"], "attemptedTaskArms": len(rows),
                      "unexecutedTaskArms": report["selectedTaskArms"]-len(rows)}


def main():
    try:
        raw = sys.stdin.buffer.read(10000001)
        require(len(raw) <= 10000000)
        data = json.loads(raw, object_pairs_hook=unique_object,
                          parse_constant=lambda _: (_ for _ in ()).throw(Rejected("REPLAY_INPUT_REJECTED")))
        require(sys.argv[1:] in ([], ["--report"]))
        if sys.argv[1:]:
            capsules, coverage = report_capsules(data)
        else:
            capsules, coverage = array(data, 200, 1), {}
        deadline = time.monotonic()+15
        rows = [replay(capsule, deadline=deadline) for capsule in capsules]
        passed = bool(rows) and not coverage.get("missingConstructedReplays", 0) and all(
            row["state"] == "EXECUTION_AGREEMENT_NOT_MODEL_VALIDITY" for row in rows)
        print(json.dumps({"identity": "NYX-NATIVE-DERIVATION-OFFLINE-REPLAY-001", "capsules": len(rows),
                          "outputsCompared": sum(row["outputsCompared"] for row in rows), "rows": rows, "coverage": coverage,
                          "allExecutionAgrees": passed, "mathematicalModelVerified": False,
                          "independence": "E3_SEPARATE_LANGUAGE_DIRECT_PHASE_INTERPRETATION_NOT_INDEPENDENT_REPLICATION",
                          "modelCalls": 0, "grantsAuthority": False}, separators=(",", ":")))
        return 0 if passed else 1
    except (Rejected, ValueError, TypeError, RecursionError):
        print('{"state":"INSUFFICIENT_EVIDENCE","reason":"REPLAY_INPUT_REJECTED","grantsAuthority":false}')
        return 1


if __name__ == "__main__":
    sys.exit(main())
