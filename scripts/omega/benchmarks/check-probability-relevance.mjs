/** Development-only exact-execution stress check. No inference, official tasks,
 * relaxed resource limits, network requests or authority promotion. Run from repo root. */
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {lowerFiniteProbability,finiteProbabilityDiagnostic} from "../../../src/lib/codelab/research/finiteProbabilityCompiler.ts";
import {BoundedReasoningSession} from "../../../src/lib/codelab/research/boundedReasoningWorkbench.ts";
let seed=0x6c892a13; const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%n;};
const cases=[],rejected={};let executionFailures=0;const statuses={};
for(let t=0;t<600;t++){
 const n=1+rnd(8),constants=[{id:"zero",value:"0"},{id:"one",value:"1"},...Array.from({length:10},(_,i)=>({id:"p"+i,value:rnd(11)+"/10"}))];
 const variables=Array.from({length:n},(_,i)=>{const parents=Array.from({length:i},(_,j)=>"V"+j).filter(()=>rnd(3)===0).slice(0,3);
 return{id:"V"+i,parents,probabilityTrue:Array.from({length:2**parents.length},()=>constants[rnd(constants.length)].id)};});
 const pick=()=>variables.filter(()=>rnd(4)===0).map(v=>({variable:v.id,value:!!rnd(2)}));
 const queries=Array.from({length:1+rnd(3)},(_,i)=>({id:"q"+i,event:[{variable:"V"+rnd(n),value:!!rnd(2)}],given:pick(),interventions:pick()}));
 const outputs=Array.from({length:1+rnd(3)},(_,i)=>{const left=queries[rnd(queries.length)].id;return{label:"o"+i,op:i%2?"SUB":"IDENTITY",left,right:i%2?queries[rnd(queries.length)].id:left};});
 const problem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants},model={schemaVersion:3,semantics:"MARKOVIAN_BINARY_DAG",variables,queries,outputs};
 try{lowerFiniteProbability(problem,model);}catch(e){const reason=finiteProbabilityDiagnostic(e);rejected[reason??"UNEXPECTED"]=(rejected[reason??"UNEXPECTED"]??0)+1;continue;}
 const session=BoundedReasoningSession.create(problem,{maxWorkUnits:100000,maxElapsedMs:2000,maxRequests:1,expiresAtEpochMs:Date.now()+10000});
 try{const r=session.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:session.problemDigest,program:model});
 statuses[r.status]=(statuses[r.status]??0)+1;if(!["CONSTRUCTED","INSUFFICIENT_EVIDENCE"].includes(r.status))executionFailures++;
 cases.push({problem,model,status:r.status,outputs:r.payload?.outputs});}finally{session.revoke();}
}
const p=process.env.OMEGA_PYTHON??(process.platform==="win32"?"C:/Users/loka3/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe":"python3"),oracles=[];
for(let i=0;i<cases.length;i+=250)oracles.push(JSON.parse(execFileSync(p,["-B",fileURLToPath(new URL("./check-finite-probability.py",import.meta.url))],{input:JSON.stringify(cases.slice(i,i+250)),encoding:"utf8",timeout:30000,maxBuffer:1024*1024})));
console.log(JSON.stringify({seed:"0x6c892a13",attempted:600,accepted:cases.length,rejected,statuses,executionFailures,oracles,scope:"DEVELOPMENT_DIFFERENTIAL_CHECK_NOT_COGNITIVE_GAIN"}));
if(executionFailures||oracles.some(o=>!o.agreement)||rejected.UNEXPECTED)process.exitCode=1;
