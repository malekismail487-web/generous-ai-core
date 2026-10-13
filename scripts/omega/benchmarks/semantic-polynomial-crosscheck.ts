import { SemanticPolynomialSession, type SemanticPolynomialTask } from "../../../src/lib/codelab/research/semanticPolynomialProof";
import { compileAlgebraicExpressionGraph, type QuantitativeAlgebraicForm } from "../../../src/lib/codelab/research/quantitativeAlgebraicCompiler";

/** Trusted development fixtures only: no model calls or benchmark answers.
 * Replay receives original arithmetic graphs, not the TS normal form/cache.
 */
function capsule(task:SemanticPolynomialTask,candidate:QuantitativeAlgebraicForm) {
  const session=SemanticPolynomialSession.create(task,{maxRequests:1,maxWorkUnits:100000,maxElapsedMs:2000,expiresAtEpochMs:Date.now()+60000});
  const result=session.analyze({schemaVersion:1,operation:"CHECK_POLYNOMIAL_CANDIDATE",problemDigest:session.problemDigest,parentResultDigest:null,program:candidate});
  session.revoke();if(!("observations"in result))throw Error("polynomial_replay_fixture_insufficient");
  const names=[...task.variables,...task.constants.map(c=>c.id)],zero=task.constants.find(c=>/^-?0(?:\/[1-9][0-9]*)?$/.test(c.value))?.id;
  return{fixtureVersion:"polynomial-development-replay/2",task,originalCandidate:candidate,candidate:compileAlgebraicExpressionGraph(names,zero,candidate),
    goals:task.obligations.map(o=>({id:o.obligationId,substitutions:o.substitutions.map(s=>({id:s.id,sourceOutput:s.sourceOutput,
      bindings:compileAlgebraicExpressionGraph(names,zero,{schemaVersion:5,definitions:[],outputs:s.bindings.map(b=>({label:b.variable,expression:b.expression}))})})),
      identity:compileAlgebraicExpressionGraph([...names,...task.outputLabels,...o.substitutions.map(s=>s.id)],zero,o.identity)})),
    primary:result.observations.map(o=>({id:o.obligationId,state:o.state,counterexample:o.counterexample}))};
}
export function polynomialReplayFixtures() {
  const basic=Array.from({length:61},(_,at)=>[false,true].map(wrong=>{
    const constants=[{id:"zero",value:"0"},{id:"four",value:"4"},{id:"a",value:`${at-31}/${at%5+1}`},{id:"b",value:`${at%13+1}/7`}];
    const objective=at%2?"Construct a polarized quadratic difference over rational variables.":"Construct an expanded bilinear product over rational variables.";
    const task:SemanticPolynomialTask={schemaVersion:1,objective,variables:["x","y"],constants,outputLabels:["p"],obligations:[{
      obligationId:"construction",dependsOn:[],substitutions:[],identity:{schemaVersion:5,definitions:[],outputs:[
        {label:"lhs",expression:"p"},{label:"rhs",expression:at%2?"a*x*y+b":"(a*x+b)*(a*y-b)"}]} }]};
    const candidate:QuantitativeAlgebraicForm={schemaVersion:5,definitions:[],outputs:[{label:"p",expression:
      (at%2?"a*((x+y)*(x+y)-(x-y)*(x-y))/four+b":"a*a*x*y-a*b*x+a*b*y-b*b")+(wrong?"+x-y":"")}]};
    return capsule(task,candidate);
  })).flat();
  const symmetric:SemanticPolynomialTask={schemaVersion:1,objective:"Construct an antisymmetric polynomial under simultaneous variable exchange.",
    variables:["x","y"],constants:[{id:"zero",value:"0"}],outputLabels:["p"],obligations:[{obligationId:"exchange",dependsOn:[],
      substitutions:[{id:"swapped",sourceOutput:"p",bindings:[{variable:"x",expression:"y"},{variable:"y",expression:"x"}]}],
      identity:{schemaVersion:5,definitions:[],outputs:[{label:"lhs",expression:"p+swapped"},{label:"rhs",expression:"zero"}]}}]};
  const discrete:SemanticPolynomialTask={schemaVersion:1,objective:"Construct a discrete antiderivative of a quadratic with zero initial value.",variables:["x"],
    constants:[{id:"zero",value:"0"},{id:"one",value:"1"},{id:"two",value:"2"},{id:"six",value:"6"}],outputLabels:["p"],obligations:[
      {obligationId:"difference",dependsOn:[],substitutions:[{id:"next",sourceOutput:"p",bindings:[{variable:"x",expression:"x+one"}]}],
        identity:{schemaVersion:5,definitions:[],outputs:[{label:"lhs",expression:"next-p"},{label:"rhs",expression:"x*x"}]}},
      {obligationId:"origin",dependsOn:["difference"],substitutions:[{id:"initial",sourceOutput:"p",bindings:[{variable:"x",expression:"zero"}]}],
        identity:{schemaVersion:5,definitions:[],outputs:[{label:"lhs",expression:"initial"},{label:"rhs",expression:"zero"}]}}]};
  const candidate=(expression:string):QuantitativeAlgebraicForm=>({schemaVersion:5,definitions:[],outputs:[{label:"p",expression}]});
  const keyword:SemanticPolynomialTask={schemaVersion:1,objective:"Formal symbols retain their original meaning even when their names are Python keywords.",
    variables:["class","True"],constants:[{id:"zero",value:"0"}],outputLabels:["p"],obligations:[{obligationId:"symbols",dependsOn:[],substitutions:[],
      identity:{schemaVersion:5,definitions:[],outputs:[{label:"lhs",expression:"p"},{label:"rhs",expression:"class-True"}]}}]};
  return [...basic,capsule(symmetric,candidate("x-y")),capsule(symmetric,candidate("x+y")),
    capsule(discrete,candidate("x*(x-one)*(two*x-one)/six")),capsule(discrete,candidate("x*x")),
    capsule(keyword,candidate("class-True")),capsule(keyword,candidate("class+True"))];
}
if(process.argv[1]?.replace(/\\/g,"/").endsWith("/semantic-polynomial-crosscheck.ts"))process.stdout.write(JSON.stringify(polynomialReplayFixtures()));
