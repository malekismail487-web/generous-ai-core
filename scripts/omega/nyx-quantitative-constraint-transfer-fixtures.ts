import { QUANTITATIVE_EPOCH, verifyQuantitativeCertificate, type QuantitativeTask } from "./nyx-quantitative-transfer-fixtures";
import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import type { QuantitativeNecessaryCondition } from "../../src/lib/codelab/research/quantitativeConstraintFeedback";

export const CONSTRAINT_TRANSFER_EPOCH=Object.freeze({...QUANTITATIVE_EPOCH,version:7,chunkId:"NYX-QUANTITY-COUNTEREXAMPLE-TRANSFER-001",
  maxWallClockMs:2400000,hypothesis:"Objective-derived exact counterexamples improve mathematical model repair under unchanged call limits.",
  supportCriterion:"More independently accepted fresh tasks, or equal acceptance with fewer reported tokens/calls, without an oracle change; replicate before promotion.",
  falsificationCriterion:"No acceptance or repair-efficiency advantage, or misleading/inconsistent constraint diagnostics.",
  population:"FOUR_FRESH_DOMAIN_TASKS_PAIRED_SAME_NYX_NATIVE_WORKBENCH_DIFFERENT_FEEDBACK_ONLY",
  competingExplanation:"Provider variability or extra prompt tokens, rather than useful constraint interpretation.",
  confidenceRequirement:"Four tasks are descriptive only; controls receive identical objectives and authoritative acceptance predicates.",
  planCoverage:{...QUANTITATIVE_EPOCH.planCoverage,direct:["GENERATOR_REQUIRES_DETECTOR","COUNTEREXAMPLES_RETURN_TO_COGNITION",
    "PUBLIC_REQUIREMENTS_NOT_HIDDEN_SOLUTIONS","VERIFIED_CAPABILITY_PER_COMPUTE"],deferred:["FULL_CEGIS_COMPLETENESS","OPEN_ENDED_PROOF","DEVICE_INTEGRATION"]}});
export interface ConstraintTransferTask extends QuantitativeTask { readonly publicConditions:readonly QuantitativeNecessaryCondition[] }
const condition=(id:string,terms:readonly {label:string;coefficient:string}[],relation:QuantitativeNecessaryCondition["relation"],bound:string):QuantitativeNecessaryCondition=>({
  id,requirementRef:`public-objective:${id}`,terms,relation,bound});
const unit=(label:string)=>[condition(`${label}-nonnegative`,[{label,coefficient:"1"}],"GTE","0"),
  condition(`${label}-at-most-one`,[{label,coefficient:"1"}],"LTE","1")];
const nonnegative=(labels:readonly string[])=>labels.map(label=>condition(`${label}-nonnegative`,[{label,coefficient:"1"}],"GTE","0"));
const problem=(values:Readonly<Record<string,string>>)=>({kind:"EXACT_QUANTITATIVE_DERIVATION" as const,
  constants:Object.entries({zero:"0",one:"1",...values}).map(([id,value])=>({id,value}))});
const tasks:ConstraintTransferTask[]=[
  {taskId:"CONSTRAINT-SENSOR",objective:"A manufactured part has a latent defect with probability prior. Two binary sensors are conditionally independent GIVEN the defect state. "
    +"Given defect, each sensor is positive with probability sensitivityA and sensitivityB respectively. Given NO defect, their positive probabilities are falseA and falseB. "
    +"Both sensors are observed positive. Report the exact posterior probability of a defect as posterior. This is a synthetic probability exercise, not empirical sensor validation.",
    problem:problem({prior:"3/250",sensitivityA:"91/100",sensitivityB:"93/100",falseA:"7/100",falseB:"4/100"}),outputLabels:["posterior"],publicConditions:unit("posterior")},
  {taskId:"CONSTRAINT-THREE-COLOR",objective:"Uniformly select draw DISTINCT objects without replacement from a bag with red red, blue blue, and green green objects. "
    +"Report the exact probability that the sample contains exactly wanted red objects AND at least one blue object. Green counts are unrestricted. "
    +"The sample space includes all THREE colors; no approximation or replacement. Output probability.",
    problem:problem({red:"19",blue:"17",green:"23",draw:"9",wanted:"3"}),outputLabels:["probability"],publicConditions:unit("probability")},
  {taskId:"CONSTRAINT-ENERGY",objective:"Two stores initially contain x0 and y0 energy units; dissipated=0. In EACH of 17 synchronous cycles, "
    +"new x=(1-transfer-loss)*old x + transfer*old y; new y=transfer*old x + (1-transfer-loss)*old y; "
    +"new dissipated=old dissipated + loss*(old x+old y). Report exact final x,y,dissipated. All updates use old state. "
    +"The initial total energy is exactly 7, and dissipation is accounted for, not destroyed from the ledger.",
    problem:problem({x0:"31/7",y0:"18/7",transfer:"3/11",loss:"1/37"}),outputLabels:["x","y","dissipated"],
    publicConditions:[...nonnegative(["x","y","dissipated"]),condition("energy-conserved",["x","y","dissipated"].map(label=>({label,coefficient:"1"})),"EQ","7")]},
  {taskId:"CONSTRAINT-CAPITAL",objective:"A fictional ledger starts capital=principal, paid=0, earned=0. For EACH of 17 periods: "
    +"(1) interest=rate*current capital; (2) add interest to capital AND cumulative earned; (3) withdraw min(capital,withdrawal); "
    +"(4) subtract that withdrawal from capital and add it to cumulative paid. No other flows. Report exact final capital,paid,earned. "
    +"This is a mathematical ledger, not financial advice. Conservation requires capital+paid-earned=principal.",
    problem:problem({principal:"23/5",rate:"7/113",withdrawal:"7/9"}),outputLabels:["capital","paid","earned"],
    publicConditions:[...nonnegative(["capital","paid","earned"]),condition("ledger-conserved",[{label:"capital",coefficient:"1"},
      {label:"paid",coefficient:"1"},{label:"earned",coefficient:"-1"}],"EQ","23/5")]},
];
// BOTH arms see precisely the same public requirements BEFORE proposing candidates.
export const CONSTRAINT_TRANSFER_TASKS:readonly ConstraintTransferTask[]=immutableTheoryValue(tasks.map(t=>({...t,
  objective:`${t.objective} Public necessary conditions (passing these does NOT establish correctness): ${JSON.stringify(t.publicConditions)}`})));
export const CONSTRAINT_TRANSFER_CORPUS_DIGEST=theoryDigest(CONSTRAINT_TRANSFER_TASKS);

// Independent domain calculations. No interpreter, equation compiler, or diagnostic arithmetic.
type Q=readonly [bigint,bigint];
const q=(n:bigint,d=1n):Q=>{if(d===0n)throw Error("oracle_zero_denominator");if(d<0n){n=-n;d=-d;}
  let a=n<0n?-n:n,b=d;while(b){const r=a%b;a=b;b=r;}return [n/a,d/a];};
const add=(a:Q,b:Q)=>q(a[0]*b[1]+b[0]*a[1],a[1]*b[1]);
const mul=(a:Q,b:Q)=>q(a[0]*b[0],a[1]*b[1]);
const sub=(a:Q,b:Q)=>add(a,[-b[0],b[1]]);
const div=(a:Q,b:Q)=>q(a[0]*b[1],a[1]*b[0]);
const power=(a:Q,n:number)=>q(a[0]**BigInt(n),a[1]**BigInt(n));
const parse=(v:string):Q=>{const [n,d="1"]=v.split("/");return q(BigInt(n),BigInt(d));};
const show=(v:Q)=>v[1]===1n?String(v[0]):`${v[0]}/${v[1]}`;
function pascalChoose(n:number,k:number):bigint {
  if(k<0||k>n)return 0n;const row=Array<bigint>(k+1).fill(0n);row[0]=1n;
  for(let i=1;i<=n;i++)for(let j=Math.min(i,k);j>0;j--)row[j]+=row[j-1];return row[k];
}
export function constraintExpectedQuantities(task:ConstraintTransferTask) {
  const c=Object.fromEntries(task.problem.constants.map(v=>[v.id,parse(v.value)]));let result:Record<string,Q>;
  if(task.taskId==="CONSTRAINT-SENSOR") {
    let defectPositive=q(0n),allPositive=q(0n);
    // Enumerate latent state and observation patterns, rather than using model-authored equations.
    for(const defect of [false,true])for(const a of [false,true])for(const b of [false,true]) {
      const pa=defect?c.sensitivityA:c.falseA,pb=defect?c.sensitivityB:c.falseB;
      const weight=mul(defect?c.prior:sub(q(1n),c.prior),mul(a?pa:sub(q(1n),pa),b?pb:sub(q(1n),pb)));
      if(a&&b){allPositive=add(allPositive,weight);if(defect)defectPositive=add(defectPositive,weight);}
    }
    result={posterior:div(defectPositive,allPositive)};
  } else if(task.taskId==="CONSTRAINT-THREE-COLOR") {
    const r=Number(c.red[0]),b=Number(c.blue[0]),g=Number(c.green[0]),d=Number(c.draw[0]),w=Number(c.wanted[0]);
    let favorable=0n;for(let blue=1;blue<=d-w;blue++)favorable+=pascalChoose(r,w)*pascalChoose(b,blue)*pascalChoose(g,d-w-blue);
    result={probability:q(favorable,pascalChoose(r+b+g,d))};
  } else if(task.taskId==="CONSTRAINT-ENERGY") {
    const initialTotal=add(c.x0,c.y0);const total=mul(initialTotal,power(sub(q(1n),c.loss),17));
    const difference=mul(sub(c.x0,c.y0),power(sub(sub(q(1n),c.loss),mul(q(2n),c.transfer)),17));
    result={x:div(add(total,difference),q(2n)),y:div(sub(total,difference),q(2n)),dissipated:sub(initialTotal,total)};
  } else if(task.taskId==="CONSTRAINT-CAPITAL") {
    let capital=c.principal,paid=q(0n),earned=q(0n);
    for(let i=0;i<17;i++){const interest=mul(c.rate,capital);earned=add(earned,interest);const available=add(capital,interest);
      const take=available[0]*c.withdrawal[1]<c.withdrawal[0]*available[1]?available:c.withdrawal;
      capital=sub(available,take);paid=add(paid,take);}
    result={capital,paid,earned};
  } else throw Error("unknown_constraint_transfer_task");
  return task.outputLabels.map(label=>({label,value:show(result[label])}));
}
export function verifyConstraintTransferSubmission(task:ConstraintTransferTask,certificate:unknown) {
  if(!CONSTRAINT_TRANSFER_TASKS.some(t=>theoryDigest(t)===theoryDigest(task)))throw Error("unfrozen_constraint_transfer_task");
  return verifyQuantitativeCertificate(task,certificate,()=>constraintExpectedQuantities(task));
}
