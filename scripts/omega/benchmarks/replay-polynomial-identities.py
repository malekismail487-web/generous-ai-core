"""Independent exact grid proof for degree-bounded rational polynomial graphs.

Unlike the TS sparse normalizer, this verifier propagates degree UPPER BOUNDS
and evaluates the original graphs with Fraction on a complete tensor grid.
Degree <= d_i plus exact agreement at d_i+1 distinct points per variable proves
identity by repeated univariate interpolation. Guessed bounds, random samples
or floating point do NOT support that conclusion. Model code is never executed.
See Sage's polynomial interpolation documentation (including its bound warning):
https://doc.sagemath.org/html/en/reference/polynomial_rings/sage/rings/polynomial/multi_polynomial_ring_base.html#sage.rings.polynomial.multi_polynomial_ring_base.MPolynomialRing_base.interpolation
"""
from fractions import Fraction
from itertools import product
import ast
import json
import re
import sys
import time


class Boundary(Exception):
    pass


def compile_form(form, names, zero):
    """Independent syntax/statement-fidelity check; NEVER Python eval/exec."""
    if set(form) != {"schemaVersion", "definitions", "outputs"} or form["schemaVersion"] != 5:
        raise Boundary("original_form_contract")
    if len(form["definitions"]) > 32 or not 1 <= len(form["outputs"]) <= 16:
        raise Boundary("original_form_bound")
    environment = {name: name for name in names}
    nodes, declared, total_chars = [], set(names), 0
    source_aliases, alias_sources = {}, {}

    def name_ok(s):
        return isinstance(s, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,47}", s)

    def node(n, depth=0):
        # A flat chain has a deep Python AST but does not consume the frontend's
        # parenthesis/unary nesting budget. Graph operations remain bounded 64.
        if depth > 96:
            raise Boundary("syntax_depth")
        if isinstance(n, ast.Name) and n.id in alias_sources and alias_sources[n.id] in environment:
            return environment[alias_sources[n.id]]
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.UAdd):
            return node(n.operand, depth + 1)
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub) and zero in environment:
            left, right, op = zero, node(n.operand, depth + 1), "SUB"
        elif isinstance(n, ast.BinOp) and type(n.op) in (ast.Add, ast.Sub, ast.Mult, ast.Div):
            left, right = node(n.left, depth + 1), node(n.right, depth + 1)
            op = {ast.Add: "ADD", ast.Sub: "SUB", ast.Mult: "MUL", ast.Div: "DIV"}[type(n.op)]
        else:
            raise Boundary("unsupported_original_syntax")
        if len(nodes) >= 64:
            raise Boundary("original_operation_bound")
        nodes.append({"op": op, "left": left, "right": right})
        return len(nodes) - 1

    def expression(s):
        nonlocal total_chars
        if not isinstance(s, str) or not 1 <= len(s) <= 512 or not s.isascii() or re.search(r"[^A-Za-z0-9_+*/(), \t\r\n-]", s):
            raise Boundary("original_expression_bound")
        nesting = 0
        for char in s:
            if char == "(":
                nesting += 1
                if nesting > 16:
                    raise Boundary("syntax_parenthesis_bound")
            elif char == ")":
                nesting -= 1
                if nesting < 0:
                    raise Boundary("syntax_parenthesis_mismatch")
        if nesting:
            raise Boundary("syntax_parenthesis_mismatch")
        total_chars += len(s)
        if total_chars > 4096:
            raise Boundary("original_total_bound")
        # The original DSL permits names such as True/class/lambda. They are
        # formal symbols, NOT Python constants/keywords. Lexically alias names
        # before AST parsing and resolve only to the explicitly bound originals.
        def alias(match):
            original = match.group(0)
            if not name_ok(original):
                raise Boundary("original_identifier_bound")
            if original not in source_aliases:
                safe = f"_symbol_{len(source_aliases)}"
                source_aliases[original], alias_sources[safe] = safe, original
            return source_aliases[original]
        text = re.sub(r"[A-Za-z][A-Za-z0-9_]*", alias, " ".join(s.split()))
        return node(ast.parse(text, mode="eval").body)

    for d in form["definitions"]:
        if set(d) != {"id", "expression"} or not name_ok(d["id"]) or d["id"] in declared or d["id"] in ("MIN", "MAX", "BINOMIAL"):
            raise Boundary("original_definition_contract")
        value = expression(d["expression"])
        declared.add(d["id"])
        environment[d["id"]] = value
    outputs = []
    for o in form["outputs"]:
        if set(o) != {"label", "expression"} or not name_ok(o["label"]) or o["label"] in {v["label"] for v in outputs}:
            raise Boundary("original_output_contract")
        outputs.append({"label": o["label"], "source": expression(o["expression"])})
    return {"schemaVersion": 4, "expressions": nodes, "outputs": outputs}


def graph(g, env, degree_mode=False):
    if set(g) != {"schemaVersion", "expressions", "outputs"} or g["schemaVersion"] != 4 or len(g["expressions"]) > 64:
        raise Boundary("graph_contract")
    nodes = []

    def source(s):
        if type(s) is int and 0 <= s < len(nodes):
            return nodes[s]
        if isinstance(s, str) and s in env:
            return env[s]
        raise Boundary("unbound_source")

    for e in g["expressions"]:
        if set(e) != {"op", "left", "right"}:
            raise Boundary("operation_contract")
        a, b = source(e["left"]), source(e["right"])
        if degree_mode:
            if e["op"] in ("ADD", "SUB"):
                v = tuple(max(x, y) for x, y in zip(a, b))
            elif e["op"] == "MUL":
                v = tuple(x + y for x, y in zip(a, b))
            elif e["op"] == "DIV" and not any(b):
                v = a
            else:
                raise Boundary("unsupported_degree_proof")
            if any(d > 8 for d in v):
                raise Boundary("degree_upper_bound")
        else:
            if e["op"] == "ADD":
                v = a + b
            elif e["op"] == "SUB":
                v = a - b
            elif e["op"] == "MUL":
                v = a * b
            elif e["op"] == "DIV" and b:
                v = a / b
            else:
                raise Boundary("unsupported_or_zero_division")
            if v.numerator.bit_length() > 4096 or v.denominator.bit_length() > 4096:
                raise Boundary("coefficient_bound")
        nodes.append(v)
    if len(g["outputs"]) > 16 or len({o["label"] for o in g["outputs"]}) != len(g["outputs"]):
        raise Boundary("output_contract")
    return {o["label"]: source(o["source"]) for o in g["outputs"]}


def check(capsule):
    task = capsule["task"]
    variables = task["variables"]
    if set(task) != {"schemaVersion", "objective", "variables", "constants", "outputLabels", "obligations"} or task["schemaVersion"] != 1:
        raise Boundary("original_task_contract")
    if not 1 <= len(variables) <= 3 or not 1 <= len(task["obligations"]) <= 12 or not 1 <= len(task["constants"]) <= 32:
        raise Boundary("task_bound")
    for c in task["constants"]:
        if set(c) != {"id", "value"} or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,47}", c["id"]) or not re.fullmatch(r"-?(?:0|[1-9][0-9]{0,127})(?:/[1-9][0-9]{0,127})?", c["value"]):
            raise Boundary("original_constant_contract")
    if len({c["id"] for c in task["constants"]}) != len(task["constants"]):
        raise Boundary("original_constant_collision")
    n = len(variables)
    constants = {c["id"]: Fraction(c["value"]) for c in task["constants"]}
    names = variables + list(constants)
    if len(set(names + task["outputLabels"])) != len(names + task["outputLabels"]):
        raise Boundary("original_symbol_collision")
    zero = next((k for k, value in constants.items() if value == 0), None)
    if compile_form(capsule["originalCandidate"], names, zero) != capsule["candidate"]:
        raise Boundary("candidate_source_graph_disagreement")
    if len(capsule["goals"]) != len(task["obligations"]):
        raise Boundary("original_obligation_coverage")
    for goal, original in zip(capsule["goals"], task["obligations"]):
        if goal["id"] != original["obligationId"] or len(goal["substitutions"]) != len(original["substitutions"]):
            raise Boundary("original_obligation_identity")
        for sub, old in zip(goal["substitutions"], original["substitutions"]):
            form = {"schemaVersion": 5, "definitions": [], "outputs": [{"label": b["variable"], "expression": b["expression"]} for b in old["bindings"]]}
            if sub["id"] != old["id"] or sub["sourceOutput"] != old["sourceOutput"] or sub["bindings"] != compile_form(form, names, zero):
                raise Boundary("original_substitution_identity")
        if goal["identity"] != compile_form(original["identity"], names + task["outputLabels"] + [s["id"] for s in original["substitutions"]], zero):
            raise Boundary("immutable_statement_graph_disagreement")
    degrees = {k: (0,) * n for k in constants}
    degrees.update({v: tuple(int(i == j) for i in range(n)) for j, v in enumerate(variables)})
    candidate_degrees = graph(capsule["candidate"], degrees, True)
    if set(candidate_degrees) != set(task["outputLabels"]):
        raise Boundary("candidate_output_contract")
    observations, evaluated_points = [], 0
    for goal in capsule["goals"]:
        scope_degrees = {**degrees, **candidate_degrees}
        for sub in goal["substitutions"]:
            replacement_degrees = graph(sub["bindings"], degrees, True)
            base = candidate_degrees[sub["sourceOutput"]]
            scope_degrees[sub["id"]] = tuple(sum(base[j] * replacement_degrees.get(v, degrees[v])[i]
                                                    for j, v in enumerate(variables)) for i in range(n))
        outputs = graph(goal["identity"], scope_degrees, True)
        if set(outputs) != {"lhs", "rhs"}:
            raise Boundary("identity_output_contract")
        bounds = tuple(max(a, b) for a, b in zip(outputs["lhs"], outputs["rhs"]))
        if any(d > 8 for d in bounds):
            raise Boundary("degree_upper_bound")
        state = "PROVED_IDENTITY"
        for point in product(*(range(d + 1) for d in bounds)):
            evaluated_points += 1
            env = {**constants, **dict(zip(variables, map(Fraction, point)))}
            candidate = graph(capsule["candidate"], env)
            scope = {**env, **candidate}
            for sub in goal["substitutions"]:
                replacements = graph(sub["bindings"], env)
                shifted = graph(capsule["candidate"], {**env, **replacements})
                scope[sub["id"]] = shifted[sub["sourceOutput"]]
            values = graph(goal["identity"], scope)
            if values["lhs"] != values["rhs"]:
                state = "REFUTED_IDENTITY"
                break
        observations.append({"id": goal["id"], "state": state})
        claim = next((p for p in capsule["primary"] if p["id"] == goal["id"]), None)
        if claim is None:
            raise Boundary("primary_obligation_coverage")
        ce = claim.get("counterexample")
        if ce is not None:
            if set(ce["assignment"]) != set(variables):
                raise Boundary("counterexample_variable_binding")
            points = {v: Fraction(ce["assignment"][v]) for v in variables}
            if any(value.denominator != 1 or not 0 <= value <= 8 for value in points.values()):
                raise Boundary("counterexample_domain_bound")
            env = {**constants, **points}
            scope = {**env, **graph(capsule["candidate"], env)}
            for sub in goal["substitutions"]:
                scope[sub["id"]] = graph(capsule["candidate"], {**env, **graph(sub["bindings"], env)})[sub["sourceOutput"]]
            values = graph(goal["identity"], scope)
            if values["lhs"] == values["rhs"] or str(values["lhs"]) != ce["lhs"] or str(values["rhs"]) != ce["rhs"]:
                raise Boundary("counterexample_replay_disagreement")
    return observations, evaluated_points


def check_model(capsule):
    """Independent point predictions, NEVER a universal or causal proof."""
    if set(capsule) != {"task", "draft", "predictions"}:
        raise Boundary("scientific_capsule_contract")
    task, draft, predictions = capsule["task"], capsule["draft"], capsule["predictions"]
    if set(task) != {"schemaVersion", "objective", "variables", "constants", "observations", "experiments"} or task["schemaVersion"] != 1:
        raise Boundary("scientific_task_contract")
    if set(draft) != {"schemaVersion", "parameters", "program", "assumptions", "uncertainties"} or draft["schemaVersion"] != 1:
        raise Boundary("scientific_draft_contract")
    variables, constants = task["variables"], task["constants"] + draft["parameters"]
    if not 1 <= len(variables) <= 3 or len(constants) + len(variables) > 32 or any(not isinstance(v, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,47}", v) for v in variables):
        raise Boundary("scientific_namespace_bound")
    def literal(value):
        if not isinstance(value, str) or not re.fullmatch(r"-?(?:0|[1-9][0-9]{0,127})(?:/[1-9][0-9]{0,127})?", value):
            raise Boundary("scientific_literal_bound")
        return Fraction(value)
    if any(set(c) != {"id", "value"} or not isinstance(c["id"], str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,47}", c["id"]) for c in constants):
        raise Boundary("scientific_constant_contract")
    original_names = variables + [c["id"] for c in constants]
    if len(set(original_names)) != len(original_names):
        raise Boundary("scientific_namespace_collision")
    env = {c["id"]: literal(c["value"]) for c in constants}
    zero = next((k for k, value in env.items() if value == 0), None)
    program = compile_form(draft["program"], original_names, zero)
    if [o["label"] for o in program["outputs"]] != ["response"]:
        raise Boundary("scientific_output_contract")
    points = [(o["pointId"], o["inputs"]) for o in task["observations"]] + [(e["experimentId"], e["inputs"]) for e in task["experiments"]]
    if not 1 <= len(points) <= 28 or len(predictions) != len(points):
        raise Boundary("scientific_point_coverage")
    agrees = True
    for prediction, (point_id, inputs) in zip(predictions, points):
        if set(prediction) != {"pointId", "inputs", "value"} or prediction["pointId"] != point_id or prediction["inputs"] != inputs:
            raise Boundary("scientific_point_identity")
        if len(inputs) != len(variables) or any(set(i) != {"id", "value"} for i in inputs) or {i["id"] for i in inputs} != set(variables):
            raise Boundary("scientific_input_bindings")
        measured = graph(program, {**env, **{i["id"]: literal(i["value"]) for i in inputs}})["response"]
        value = prediction["value"]
        if not isinstance(value, str) or len(value) > 2500 or not re.fullmatch(r"-?[0-9]+(?:/[1-9][0-9]*)?", value):
            raise Boundary("scientific_claim_bound")
        claim = Fraction(value)
        if claim.numerator.bit_length() > 4096 or claim.denominator.bit_length() > 4096:
            raise Boundary("scientific_claim_bits")
        agrees = agrees and measured == claim
    return agrees, len(points)


def main():
    data = sys.stdin.buffer.read(2_000_001)
    if len(data) > 2_000_000:
        raise Boundary("input_bytes")
    capsules = json.loads(data)
    if sys.argv[1:] == ["--verify-model"]:
        start, cpu = time.perf_counter(), time.process_time()
        agrees, points = check_model(capsules)
        print(json.dumps({"schemaVersion": 1, "decision": "AGREES" if agrees else "DISAGREES", "checkedPoints": points,
            "elapsedMs": (time.perf_counter() - start) * 1000, "cpuMs": (time.process_time() - cpu) * 1000,
            "scope": "POINT_DERIVATIONS_NOT_CAUSAL_TRUTH"}))
        return
    if sys.argv[1:] == ["--verify-one"]:
        if not isinstance(capsules, dict):
            raise Boundary("single_candidate_contract")
        start, cpu = time.perf_counter(), time.process_time()
        observations, points = check(capsules)
        print(json.dumps({"schemaVersion": 1, "accepted": all(o["state"] == "PROVED_IDENTITY" for o in observations),
            "observations": observations, "exactGridPoints": points,
            "elapsedMs": (time.perf_counter() - start) * 1000,
            "cpuMs": (time.process_time() - cpu) * 1000,
            "method": "INDEPENDENT_ORIGINAL_PARSE_DEGREE_BOUNDS_EXACT_GRID"}))
        return
    if sys.argv[1:]:
        raise Boundary("unknown_verifier_mode")
    if not isinstance(capsules, list) or not 1 <= len(capsules) <= 128:
        raise Boundary("population_bound")
    total_points, proved, refuted = 0, 0, 0
    for capsule in capsules:
        results, points = check(capsule)
        total_points += points
        expected = [{"id": o["id"], "state": o["state"]} for o in capsule["primary"]]
        if results != expected:
            raise Boundary("independent_checker_disagreement")
        proved += sum(o["state"] == "PROVED_IDENTITY" for o in results)
        refuted += sum(o["state"] == "REFUTED_IDENTITY" for o in results)
    versions = {c.get("fixtureVersion", "UNSPECIFIED") for c in capsules}
    if len(versions) != 1:
        raise Boundary("fixture_genealogy_disagreement")
    print("POLYNOMIAL_INDEPENDENT_REPLAY " + json.dumps({"fixtureVersion": next(iter(versions)), "capsules": len(capsules), "proved": proved,
        "refuted": refuted, "exact_grid_points": total_points, "mismatches": 0,
        "method": "INDEPENDENT_DEGREE_BOUNDS_AND_EXACT_TENSOR_GRID_NOT_RANDOM_SAMPLING",
        "model_calls": 0, "cognitive_gain_claim": False}))


if __name__ == "__main__":
    try:
        main()
    except (Boundary, ValueError, KeyError, TypeError, ZeroDivisionError, SyntaxError, RecursionError):
        print("POLYNOMIAL_INDEPENDENT_REPLAY_FAILED", file=sys.stderr)
        sys.exit(1)
