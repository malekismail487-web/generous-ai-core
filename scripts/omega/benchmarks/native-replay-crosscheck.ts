import {BoundedReasoningSession} from "../../../src/lib/codelab/research/boundedReasoningWorkbench";
import {EXACT_DERIVATION_OPERATIONS,type QuantitativeProblem} from "../../../src/lib/codelab/research/exactQuantitativeDerivation";
import {equationNames,type QuantitativeEquations} from "../../../src/lib/codelab/research/quantitativeEquationCompiler";
import {theoryDigest} from "../../../src/lib/codelab/research/theoryContracts";
import {captureComputationReplay} from "../nyx-computation-transfer";

/** Compiler/executor fixtures, not model tasks or cognition evidence. The Python
 * verifier interprets phase semantics directly; it never sees lowered blocks. */
export function nativeReplayCrosscheckFixtures(count=200){
  if(!Number.isSafeInteger(count)||count<1||count>200)throw Error("replay_fixture_bound");
  return Array.from({length:count},(_,index)=>{
    const seed=index+1;
    const problem:QuantitativeProblem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[
      {id:"zero",value:"0"},{id:"one",value:"1"},{id:"x",value:`${seed%17-8}/${seed%5+1}`},
      {id:"y",value:`${seed%11+1}/${seed%3+1}`},{id:"bn",value:String(seed%7+10)},
      {id:"bk",value:String(seed%3+1)},
      ...(seed%2?[{id:"r0",value:"5"},{id:"e0",value:"7"},{id:"t0",value:"-3"}]:[])]};
    const {state:s,expressions:e}=equationNames(problem.constants.map(c=>c.id));
    const program:QuantitativeEquations={schemaVersion:2,initialState:[{slot:s[0],source:"x"},{slot:s[1],source:"y"}],
      cycles:[{iterations:seed%5+1,phases:[{
        expressions:EXACT_DERIVATION_OPERATIONS.map((op,i)=>({id:e[i],op,
          left:op==="BINOMIAL"?"bn":s[0],right:op==="BINOMIAL"?"bk":"y"})),
        updates:EXACT_DERIVATION_OPERATIONS.map((_,i)=>({slot:s[i+2],source:e[i]}))},
        {expressions:[{id:e[0],op:"ADD",left:s[0],right:s[1]}],
          updates:[{slot:s[0],source:s[1]},{slot:s[1],source:e[0]},{slot:s[9],source:s[0]}]}]},
        {iterations:2,phases:[{expressions:[],updates:[{slot:s[0],source:s[1]},{slot:s[1],source:s[0]}]}]}],
      outputs:[...EXACT_DERIVATION_OPERATIONS.map((_,i)=>({label:`output${i}`,source:s[i+2]})),
        {label:"currentX",source:s[0]},{label:"currentY",source:s[1]},{label:"previousX",source:s[9]}]};
    const session=BoundedReasoningSession.create(problem,{maxRequests:1,maxWorkUnits:100000,maxElapsedMs:2000,
      expiresAtEpochMs:Date.now()+10000});
    try{
      const proposal=JSON.stringify({kind:"DERIVE_QUANTITIES",problemDigest:theoryDigest(problem),program});
      const result=session.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:theoryDigest(problem),program});
      if(result.status!=="CONSTRUCTED")throw Error("replay_fixture_not_constructed");
      const capsule=captureComputationReplay(problem,proposal,JSON.stringify({omegaObservation:result.status,analysis:result}));
      if(capsule===null)throw Error("replay_fixture_not_captured");
      return capsule;
    }finally{session.revoke();}
  });
}
if(process.argv[1]?.replace(/\\/g,"/").endsWith("/native-replay-crosscheck.ts"))
  process.stdout.write(JSON.stringify(nativeReplayCrosscheckFixtures()));
