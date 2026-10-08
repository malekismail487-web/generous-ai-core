import { immutableTheoryValue, theoryDigest } from "../../../src/lib/codelab/research/theoryContracts";
import type { QuantitativeProblem } from "../../../src/lib/codelab/research/exactQuantitativeDerivation";

/** Fresh development/transfer objectives. No GPQA questions, answers, failure indices or
 * provider traces are imported. This tests finite numerical modeling, not scientific knowledge. */
export type ComputationStage = "DEVELOPMENT" | "TRANSFER" | "DIAGNOSTIC";
export type ComputationDomain = "LATENT_BAYES" | "SELECTED_INTERVENTION" | "COUPLED_STATE" | "CONDITIONAL_SAMPLING";
export interface ComputationTask {
  readonly taskId:string; readonly stage:ComputationStage; readonly domain:ComputationDomain;
  readonly replicate:number; readonly question:string; readonly problem:QuantitativeProblem;
  readonly answer:string; readonly expectedQuantity:string;
}
type Q=readonly [bigint,bigint];
function q(n:bigint,d=1n):Q {if(d===0n)throw Error("oracle_zero_denominator");if(d<0n){n=-n;d=-d;}
  let a=n<0n?-n:n,b=d;while(b){[a,b]=[b,a%b];}return [n/a,d/a];}
const add=(a:Q,b:Q)=>q(a[0]*b[1]+b[0]*a[1],a[1]*b[1]);
const mul=(a:Q,b:Q)=>q(a[0]*b[0],a[1]*b[1]);
const neg=(a:Q):Q=>[-a[0],a[1]];
const sub=(a:Q,b:Q)=>add(a,neg(b));
const div=(a:Q,b:Q)=>q(a[0]*b[1],a[1]*b[0]);
const parse=(s:string):Q=>{const [n,d="1"]=s.split("/");return q(BigInt(n),BigInt(d));};
const show=(a:Q)=>a[1]===1n?String(a[0]):`${a[0]}/${a[1]}`;
const one=q(1n),zero=q(0n);
function choose(n:bigint,k:bigint){let r=1n;for(let i=1n;i<=k;i++)r=r*(n-i+1n)/i;return r;}

export function computationExpected(domain:ComputationDomain,problem:QuantitativeProblem):string {
  const c=Object.fromEntries(problem.constants.map(x=>[x.id,parse(x.value)]));let result:Q;
  if(domain==="LATENT_BAYES"){
    const weights=[mul(c.pr,c.hD),mul(c.pr,sub(one,c.hD)),mul(sub(one,c.pr),c.hN),mul(sub(one,c.pr),sub(one,c.hN))];
    const suffix=["DH","DL","NH","NL"];
    const joint=weights.map((w,i)=>mul(mul(mul(w,c[`a${suffix[i]}`]),sub(one,c[`b${suffix[i]}`])),c[`s${suffix[i]}`]));
    result=div(add(joint[0],joint[1]),joint.reduce(add,zero));
  }else if(domain==="SELECTED_INTERVENTION"){
    const intervention=(t:number)=>{
      const yH=add(mul(c[`m${t}H`],c.yH1),mul(sub(one,c[`m${t}H`]),c.yH0));
      const yL=add(mul(c[`m${t}L`],c.yL1),mul(sub(one,c[`m${t}L`]),c.yL0));
      const y=add(mul(c.u,yH),mul(sub(one,c.u),yL));
      return div(mul(y,c.sy),add(mul(y,c.sy),mul(sub(one,y),c.sn)));
    };
    result=sub(intervention(1),intervention(0));
  }else if(domain==="COUPLED_STATE"){
    // Independent host oracle uses augmented matrix exponentiation, not the native phase IR.
    type M=bigint[][];const multiply=(a:M,b:M):M=>a.map(row=>b[0].map((_,j)=>row.reduce((n,x,k)=>n+x*b[k][j],0n)));
    let base:M=[[c.a[0],1n,0n,c.p[0]],[1n,c.b[0],0n,0n],[c.a[0]-1n,1n-c.b[0],1n,c.p[0]],[0n,0n,0n,1n]];
    let power:M=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>BigInt(i===j)));
    for(let n=Number(c.cycles[0]);n>0;n=Math.floor(n/2)){if(n%2)power=multiply(power,base);base=multiply(base,base);}
    const initial=[c.x0[0],c.y0[0],0n,1n];result=q(power[2].reduce((n,x,i)=>n+x*initial[i],0n));
  }else if(domain==="CONDITIONAL_SAMPLING"){
    result=q(choose(c.red[0],2n)*choose(c.blue[0],c.draw[0]-3n),choose(c.red[0]+c.blue[0],c.draw[0]-1n));
  }else throw Error("unknown_computation_domain");
  return show(result);
}

function task(stage:ComputationStage,domain:ComputationDomain,replicate:number,values:Record<string,string>,objective:string):ComputationTask {
  const problem:QuantitativeProblem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants:Object.entries({zero:"0",one:"1",two:"2",...values}).map(([id,value])=>({id,value}))};
  const expected=computationExpected(domain,problem),answerValue=parse(expected);
  const options=[expected,show(add(answerValue,q(1n,997n))),show(sub(answerValue,q(1n,991n))),show(mul(answerValue,q(2n)))];
  if(new Set(options).size!==4)throw Error("computation_options_collide");
  const rotation=(replicate+domain.length)%4;
  const ordered=options.slice(rotation).concat(options.slice(0,rotation));
  return immutableTheoryValue({taskId:`COMPUTE-${stage}-${domain}-${replicate}`,stage,domain,replicate,problem,
    question:objective+" Propose a native derivation with output label quantity, then return exactly 'The answer is: ' followed by the option index 1, 2, 3 or 4. "
      +"The independently graded final choice is not certified by arithmetic execution.\n"+ordered.map((v,i)=>`${i+1}. ${v}`).join("\n"),
    answer:String(ordered.indexOf(expected)+1),expectedQuantity:expected});
}
export function computationTasks(stage:ComputationStage):readonly ComputationTask[]{
  if(!["DEVELOPMENT","TRANSFER","DIAGNOSTIC"].includes(stage))throw Error("computation_stage_invalid");
  const all:ComputationTask[]=[];
  for(const k of stage==="DEVELOPMENT"?[0]:stage==="DIAGNOSTIC"?[3]:[1,2]){
    all.push(task(stage,"LATENT_BAYES",k,{pr:`${11+k}/100`,hD:"7/10",hN:"2/5",
      aDH:"19/20",aDL:"4/5",aNH:"3/10",aNL:"1/20",bDH:"4/5",bDL:"3/5",bNH:"2/5",bNL:"1/10",
      sDH:"3/4",sDL:"2/5",sNH:"1/2",sNL:"1/4"},
      "D is a hidden defect; H is a latent high-noise condition. Named constants specify P(D)=pr, P(H|D)=hD and P(H|not D)=hN. "
      +"aDH,aDL,aNH,aNL give P(A positive) in states (D,H),(D,not H),(not D,H),(not D,not H); b* give P(B positive), and s* give P(selected). "
      +"A,B,selection are mutually independent only conditional on BOTH D and H. Observe A positive, B NEGATIVE and selected. What is exact P(D|these observations)?"));
    all.push(task(stage,"SELECTED_INTERVENTION",k,{u:`${3+k}/10`,m0H:"1/5",m0L:"1/10",m1H:"4/5",m1L:"2/5",
      yH1:"9/10",yH0:"2/5",yL1:"3/5",yL0:"1/20",sy:"4/5",sn:"1/5"},
      "U is binary with P(U=high)=u. Under intervention do(T=t), m0H,m0L,m1H,m1L specify P(M=1|T=t,U). "
      +"Outcome Y has no direct T dependence: yH1,yH0,yL1,yL0 specify P(Y=1|U,M). Reporting S depends only on Y: P(S=1|Y=1)=sy, P(S=1|Y=0)=sn. "
      +"Independent exogenous noise is assumed. Compute P(Y=1|do(T=1),S=1)-P(Y=1|do(T=0),S=1), conditioning separately in the two intervention worlds."));
    all.push(task(stage,"COUPLED_STATE",k,{x0:String(7+k),y0:String(11+2*k),a:"2",b:"3",p:String(5+k),cycles:String(9+k)},
      "A discrete two-channel system starts x=x0,y=y0,total=0. For each of cycles cycles, update x and y SIMULTANEOUSLY from the old state: "
      +"new x=a*old x+old y+p; new y=old x+b*old y. After BOTH updates, total increases by new x-new y. "
      +"What is the exact final total? Updating y from the new x or accumulating the old-state difference is incorrect."));
    all.push(task(stage,"CONDITIONAL_SAMPLING",k,{red:String(13+k),blue:String(19+k),green:String(11+k),draw:String(7+k)},
      "Sample draw distinct objects uniformly without replacement from red red, blue blue and green green objects. "
      +"Given that EXACTLY ONE sampled object is green, what is the exact probability that EXACTLY TWO sampled objects are red? "
      +"Condition on the green count; this is not independent sampling with replacement."));
  }
  return immutableTheoryValue(all);
}
export const COMPUTATION_TRANSFER_POLICY=Object.freeze({version:1,maxCallsPerArm:2,maxOutputTokens:8192,maxTaskMs:180000,
  maxWorkUnits:100000,maxToolMs:2000,model:"nvidia/nemotron-3-super-120b-a12b",maxHttpAttemptsPerPair:6,
  purpose:"SHARED_PUBLIC_DERIVATION_EXECUTION_ABLATION_NOT_GPQA_OR_MODEL_TRAINING",matchedModelComputeTolerance:0.1,
  corpusDigest:theoryDigest([...computationTasks("DEVELOPMENT"),...computationTasks("TRANSFER")])});
