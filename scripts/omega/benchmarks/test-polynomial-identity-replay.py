"""Planted invalid cases validate the independent verifier itself, offline."""
import importlib.util
from pathlib import Path
from copy import deepcopy

spec = importlib.util.spec_from_file_location("replay", Path(__file__).with_name("replay-polynomial-identities.py"))
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)
task = {"schemaVersion": 1, "objective": "Identity under rational variables", "variables": ["x"],
        "constants": [{"id": "zero", "value": "0"}], "outputLabels": ["p"],
        "obligations": [{"obligationId": "identity", "dependsOn": [], "substitutions": [],
                         "identity": {"schemaVersion": 5, "definitions": [], "outputs": [
                             {"label": "lhs", "expression": "p"}, {"label": "rhs", "expression": "x"}]}}]}
candidate = {"schemaVersion": 5, "definitions": [], "outputs": [{"label": "p", "expression": "x"}]}
capsule = {"task": task, "originalCandidate": candidate,
           "candidate": replay.compile_form(candidate, ["x", "zero"], "zero"),
           "goals": [{"id": "identity", "substitutions": [], "identity": replay.compile_form(task["obligations"][0]["identity"], ["x", "zero", "p"], "zero")}],
           "primary": [{"id": "identity", "state": "PROVED_IDENTITY", "counterexample": None}]}
assert replay.check(capsule)[0][0]["state"] == "PROVED_IDENTITY"
rejected = 0


def reject(value):
    global rejected
    try:
        replay.check(value)
    except (replay.Boundary, SyntaxError, ValueError, TypeError):
        rejected += 1
    else:
        raise AssertionError("planted invalid capsule accepted")


wrong_statement = deepcopy(capsule)
wrong_statement["goals"][0]["identity"]["outputs"][1]["source"] = "p"
reject(wrong_statement)
wrong_source = deepcopy(capsule)
wrong_source["originalCandidate"]["outputs"][0]["expression"] = "x+x"
reject(wrong_source)
host_code = deepcopy(capsule)
host_code["originalCandidate"]["outputs"][0]["expression"] = "__import__('os')"
reject(host_code)
missing = deepcopy(capsule)
missing["goals"] = []
reject(missing)
wrong_ce = deepcopy(capsule)
wrong_ce["primary"][0]["counterexample"] = {"assignment": {"x": "0"}, "lhs": "1", "rhs": "0"}
reject(wrong_ce)
literal = deepcopy(capsule)
literal["originalCandidate"]["outputs"][0]["expression"] = "123"
reject(literal)
assert replay.compile_form({"schemaVersion": 5, "definitions": [], "outputs": [{"label": "p", "expression": "True+class"}]}, ["True", "class", "zero"], "zero")["expressions"][0] == {"op": "ADD", "left": "True", "right": "class"}
try:
    replay.compile_form({"schemaVersion": 5, "definitions": [], "outputs": [{"label": "p", "expression": "True"}]}, ["zero"], "zero")
except replay.Boundary:
    rejected += 1
else:
    raise AssertionError("unbound Python boolean became an invented constant")
print(f"POLYNOMIAL_REPLAY_DETECTOR_VALIDATION passed={rejected + 2} failed=0")
model_capsule={"task":{"schemaVersion":1,"objective":{},"variables":["x"],"constants":[{"id":"zero","value":"0"}],
    "observations":[{"pointId":"P","inputs":[{"id":"x","value":"2"}]}],"experiments":[]},
    "draft":{"schemaVersion":1,"parameters":[],"program":{"schemaVersion":5,"definitions":[],"outputs":[{"label":"response","expression":"x*x"}]},"assumptions":[],"uncertainties":[]},
    "predictions":[{"pointId":"P","inputs":[{"id":"x","value":"2"}],"value":"4"}]}
assert replay.check_model(model_capsule)==(True,1)
wrong=deepcopy(model_capsule);wrong["predictions"][0]["value"]="5"
assert replay.check_model(wrong)==(False,1)
for corrupt in ["input", "source", "duplicate", "executable"]:
    wrong=deepcopy(model_capsule)
    if corrupt=="input": wrong["predictions"][0]["inputs"][0]["value"]="99"
    if corrupt=="source": wrong["draft"]["program"]["outputs"][0]["expression"]="True"
    if corrupt=="duplicate": wrong["draft"]["parameters"]=[{"id":"x","value":"1"}]
    if corrupt=="executable": wrong["draft"]["program"]["outputs"][0]["expression"]="__import__('os')"
    try: replay.check_model(wrong)
    except (replay.Boundary,SyntaxError,ValueError,TypeError): pass
    else: raise AssertionError("planted corrupt scientific prediction accepted")
print("SCIENTIFIC_MODEL_REPLAY_DETECTOR_VALIDATION passed=6 failed=0")
