"""Read JSON fixtures from stdin; independently cross-check exact quantities without native IR."""
import json
import math
import sys
from fractions import Fraction as F

tasks = json.load(sys.stdin)
counts = {stage: sum(t['stage'] == stage for t in tasks) for stage in ('DEVELOPMENT', 'TRANSFER', 'DIAGNOSTIC', 'BOUNDS_DIAGNOSTIC')}
assert tuple(counts.values()) in ((4, 8, 0, 0), (0, 0, 4, 0), (4, 8, 4, 0), (0, 0, 0, 4), (4, 8, 4, 4))
assert len({t['taskId'] for t in tasks}) == len(tasks) == sum(counts.values())
for task in tasks:
    c = {x['id']: F(x['value']) for x in task['problem']['constants']}
    domain = task['domain']
    if domain == 'LATENT_BAYES':
        # Full joint table over D,H,A,B,S rather than the TypeScript selected-observation shortcut.
        selected = []
        for d in (0, 1):
            for h in (0, 1):
                suffix = ('D' if d else 'N') + ('H' if h else 'L')
                hd = c['hD'] if d else c['hN']
                for a in (0, 1):
                    for b in (0, 1):
                        for s in (0, 1):
                            weight = c['pr'] if d else 1-c['pr']
                            weight *= hd if h else 1-hd
                            for observed, variable in [(a, 'a'), (b, 'b'), (s, 's')]:
                                p = c[variable+suffix]
                                weight *= p if observed else 1-p
                            if a == 1 and b == 0 and s == 1:
                                selected.append((d, weight))
        expected = sum(w for d, w in selected if d) / sum(w for _, w in selected)
    elif domain == 'SELECTED_INTERVENTION':
        observed = []
        for t in (0, 1):
            numerator = denominator = F(0)
            for u in ('H', 'L'):
                pu = c['u'] if u == 'H' else 1-c['u']
                pm = c[f'm{t}{u}']
                for m in (0, 1):
                    for y in (0, 1):
                        py = c[f'y{u}{m}']
                        ps = c['sy'] if y else c['sn']
                        w = pu * (pm if m else 1-pm) * (py if y else 1-py) * ps
                        denominator += w
                        numerator += w*y
            observed.append(numerator/denominator)
        expected = observed[1]-observed[0]
    elif domain == 'COUPLED_STATE':
        x, y, total = c['x0'], c['y0'], F(0)
        for _ in range(int(c['cycles'])):
            x, y = c['a']*x+y+c['p'], x+c['b']*y
            total += x-y
        expected = total
    elif domain == 'CONDITIONAL_SAMPLING':
        r, b, g, n = [int(c[k]) for k in ('red', 'blue', 'green', 'draw')]
        joint = F(math.comb(r, 2)*math.comb(b, n-3)*g, math.comb(r+b+g, n))
        condition = F(g*math.comb(r+b, n-1), math.comb(r+b+g, n))
        expected = joint/condition
    else:
        raise ValueError('unknown domain')
    assert F(task['expectedQuantity']) == expected
    assert task['question'].splitlines()[int(task['answer'])] == f"{task['answer']}. {expected}"
print(f'COMPUTATION_ORACLES_CROSSCHECKED tasks={len(tasks)} native_IR_used=false model_code_executed=false')
