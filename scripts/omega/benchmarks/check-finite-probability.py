"""Independent E3 Fraction oracle for synthetic finite-model compiler tests.

Reads public development models only. No inference, benchmark data, filesystem
lookup, production compiler, register allocation or native interpreter import.
Enumerates the full joint directly; intervention replaces the child's factor.
"""
import itertools
import json
import sys
from fractions import Fraction


def expected(problem, model):
    assert 1 <= len(problem["constants"]) <= 32
    assert 1 <= len(model["variables"]) <= 8 and 1 <= len(model["queries"]) <= 4
    assert all(len(node["parents"]) <= 3 and len(node["probabilityTrue"]) <= 8 for node in model["variables"])
    constants = {item["id"]: Fraction(item["value"]) for item in problem["constants"]}
    variables = model["variables"]
    names = [node["id"] for node in variables]
    values = {}
    for query in model["queries"]:
        evidence = {item["variable"]: item["value"] for item in query["given"]}
        do = {item["variable"]: item["value"] for item in query["interventions"]}
        event = {item["variable"]: item["value"] for item in query["event"]}
        joint = {}
        for bits in itertools.product([False, True], repeat=len(names)):
            world = dict(zip(names, bits))
            probability = Fraction(1)
            for node in variables:
                child = node["id"]
                if child in do:
                    probability *= int(world[child] == do[child])
                else:
                    # Deliberately different row construction and world order.
                    index = int("".join("1" if world[p] else "0" for p in node["parents"]) or "0", 2)
                    p = constants[node["probabilityTrue"][index]]
                    probability *= p if world[child] else 1 - p
            joint[bits] = probability
        admitted = [(dict(zip(names, bits)), p) for bits, p in joint.items()
                    if all(dict(zip(names, bits))[key] == val for key, val in evidence.items())]
        denominator = sum((p for _, p in admitted), Fraction(0))
        if not denominator:
            return None
        numerator = sum((p for world, p in admitted if all(world[k] == v for k, v in event.items())), Fraction(0))
        values[query["id"]] = numerator / denominator
    return [{"label": out["label"], "value": str(values[out["left"]] if out["op"] == "IDENTITY"
            else values[out["left"]] - values[out["right"]])} for out in model["outputs"]]


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--report":
        with open(sys.argv[2], "rb") as source:
            raw = source.read(2_000_001)
        report = json.loads(raw)
        cases = [row["probabilityReplay"] for row in report["rows"] if row.get("probabilityReplay") is not None]
    elif len(sys.argv) == 1:
        raw = sys.stdin.buffer.read(2_000_001)
        cases = json.loads(raw)
    else:
        raise ValueError("unsupported_arguments")
    if len(raw) > 2_000_000:
        raise ValueError("input_bound")
    if not isinstance(cases, list) or not 1 <= len(cases) <= 500:
        raise ValueError("population_bound")
    checked = 0
    for case in cases:
        outputs = expected(case["problem"], case["model"])
        if outputs is None:
            assert case["status"] == "INSUFFICIENT_EVIDENCE", "undefined_conditional_accepted"
        else:
            assert case["status"] == "CONSTRUCTED" and case["outputs"] == outputs, "execution_disagreement"
        checked += 1
    print(json.dumps({"cases": checked, "agreement": True,
                      "scope": "E3_SEPARATE_LANGUAGE_NOT_INDEPENDENT_REPLICATION"}))


if __name__ == "__main__":
    main()
