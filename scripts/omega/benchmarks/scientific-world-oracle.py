"""Author-owned held-out numerical oracle, separate from cognition/simulator.
Not proof of novelty, causal identifiability or physical observation.
"""
import importlib.util
from pathlib import Path
from fractions import Fraction
import json
import sys
import time

spec=importlib.util.spec_from_file_location("replay",Path(__file__).with_name("replay-polynomial-identities.py"))
replay=importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)

def world(h,point):
    x,y=map(Fraction,point)
    a,b,c=(Fraction(h[k]) for k in ("a","b","c"))
    if h["kind"]=="TRANSPORT": return a*x/(b+x)+c*y
    if h["kind"]=="POTENTIAL": return a*(x-y)**2+b*(x+y)+c
    if h["kind"]=="TRANSITION": return (a*x+b*y)/(1+c*x*x)
    if h["kind"]=="BILINEAR": return a*x*y+b*x+c*y+Fraction(h["d"])
    if h["kind"]=="INVERSE_CHANNELS": return a/x+b/y+c/(x*y)
    if h["kind"]=="MIXED_CUBIC": return a*x*x*x+b*x*y*y+c*y+Fraction(h["d"])
    if h["kind"]=="CROSS_RATIO": return (a*x*y+b*(x+y)+c)/(1+Fraction(h["d"])*x*y)
    raise ValueError("unknown_world")

def main():
    data=sys.stdin.buffer.read(200001)
    if len(data)>200000: raise ValueError("input_limit")
    capsule=json.loads(data)
    w=capsule["world"]
    start,cpu=time.perf_counter(),time.process_time()
    if capsule["operation"]=="CALIBRATION":
        print(json.dumps({"calibration":[str(world(w["hidden"],p)) for p in w["calibration"]],
            "elapsedMs":(time.perf_counter()-start)*1000,"cpuMs":(time.process_time()-cpu)*1000}))
        return
    if capsule["operation"]!="GRADE" or set(capsule)!={"operation","world","task","draft"}: raise ValueError("oracle_contract")
    task,draft=capsule["task"],capsule["draft"]
    constants=task["constants"]+draft["parameters"]
    names=task["variables"]+[c["id"] for c in constants]
    if len(set(names))!=len(names):raise ValueError("namespace")
    env={c["id"]:Fraction(c["value"]) for c in constants}
    zero=next((k for k,v in env.items() if v==0),None)
    graph=replay.compile_form(draft["program"],names,zero)
    points=w["calibration"]+w["probes"]+w["heldout"]
    correct,undefined,resource_blocked=0,0,0
    for point in points:
        expected=world(w["hidden"],point)
        try:
            values=replay.graph(graph,{**env,**dict(zip(task["variables"],map(Fraction,point)))})
        except replay.Boundary as error:
            if str(error)=="unsupported_or_zero_division": undefined+=1
            elif str(error)=="coefficient_bound": resource_blocked+=1
            else: raise
            continue
        correct+=values.get("response")==expected
    print(json.dumps({"accepted":correct==len(points),"points":len(points),"matched":correct,
        "undefinedPoints":undefined,"resourceBlockedPoints":resource_blocked,
        "elapsedMs":(time.perf_counter()-start)*1000,"cpuMs":(time.process_time()-cpu)*1000,"scope":"HELDOUT_PREDICTION_NOT_ORIGINAL_DISCOVERY"}))

if __name__=="__main__":
    try:main()
    except (ValueError,KeyError,TypeError,ZeroDivisionError,SyntaxError,replay.Boundary):
        print("SCIENTIFIC_ORACLE_UNAVAILABLE",file=sys.stderr)
        sys.exit(1)
