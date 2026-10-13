import type { SemanticPolynomialTask, PolynomialObligation } from "../../src/lib/codelab/research/semanticPolynomialProof";
import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

export const SEMANTIC_PROOF_EPOCH = immutableTheoryValue({version:"nyx-semantic-construction-transfer/1",
  model:"nvidia/nemotron-3-super-120b-a12b",arms:["SERIAL_TOOL_REPAIR","OBLIGATION_GUIDED_REPAIR"],
  changedVariable:"OWNED_OBLIGATION_PACKET_AND_DEPENDENCY_GUIDANCE_ONLY",
  maxCallsPerStage:2,maxHttpAttemptsPerStage:2,maxLogicalCalls:16,maxHttpAttemptsPerEpoch:16,
  maxOutputTokensPerCall:8192,reasoningControl:"SUPER_HOSTED_NATIVE",reasoningBudgetTokens:2048,
  maxStageMs:180000,maxEpochMs:1800000,maxToolRequestsPerStage:2,maxToolWorkUnitsPerStage:100000,maxToolElapsedMsPerStage:2000,
  independentVerifierTimeoutMs:5000,realizedTokenMatchTolerance:0.05,
  support:"MORE_ACCEPTED_FRESH_CONSTRUCTIONS_WITHOUT_CASE_REGRESSION_OR_MORE_REALIZED_MODEL_COMPUTE_REPLICATE_BEFORE_PROMOTION",
  scope:"FOUR_NEW_FORMAL_CONSTRUCTION_FAMILIES_NOT_OFFICIAL_BENCHMARK_OR_ORIGINAL_DISCOVERY",
  baseline:"SAME_NYX_COGNITION_AND_NEW_NATIVE_PRIMITIVE_WITH_SERIAL_FEEDBACK_NOT_NEMOTRON_UNTOOLED",
  evaluator:"INDEPENDENT_ORIGINAL_PARSE_DEGREE_BOUNDS_AND_EXACT_TENSOR_GRID",
  frozenBeforeFirstLiveRun:true,defaultUltraChanged:false,authorityIncrease:false});
type Sub = PolynomialObligation["substitutions"][number];
const sub=(id:string,sourceOutput:string,bindings:Record<string,string>):Sub=>({id,sourceOutput,bindings:Object.entries(bindings).map(([variable,expression])=>({variable,expression}))});
const obligation=(obligationId:string,lhs:string,rhs:string,substitutions:readonly Sub[]=[],dependsOn:readonly string[]=[]):PolynomialObligation=>({obligationId,dependsOn,substitutions,
  identity:{schemaVersion:5,definitions:[],outputs:[{label:"lhs",expression:lhs},{label:"rhs",expression:rhs}]}});
const constants=(values:Record<string,string>)=>Object.entries(values).map(([id,value])=>({id,value}));
export const SEMANTIC_PROOF_CASES = immutableTheoryValue([
  {taskId:"SEM-POLYNOMIAL-INVERSE",family:"TRIANGULAR_AUTOMORPHISM_INVERSION",task:{schemaVersion:1,variables:["x","y"],constants:constants({zero:"0",one:"1"}),outputLabels:["f","g"],
    objective:"Find polynomial f(x,y),g(x,y) giving the inverse of the map X=x+y*y, Y=y+x+y*y. Both compositions f(X,Y)=x and g(X,Y)=y must hold for every rational x,y. Do not propose the forward map as the inverse.",
    obligations:[obligation("inverseX","restoreX","x",[sub("restoreX","f",{x:"x+y*y",y:"y+x+y*y"})]),
      obligation("inverseY","restoreY","y",[sub("restoreY","g",{x:"x+y*y",y:"y+x+y*y"})],["inverseX"])]} satisfies SemanticPolynomialTask},
  {taskId:"SEM-ORBIT-INVARIANT",family:"DYNAMICAL_POLYNOMIAL_INVARIANT",task:{schemaVersion:1,variables:["x","y"],constants:constants({zero:"0",one:"1",three:"3",four:"4",five:"5"}),outputLabels:["h"],
    objective:"Construct a polynomial h invariant under X=(three*x-four*y)/five, Y=(four*x+three*y)/five. Require h(0,0)=0, h(1,0)=1 and h(0,1)=1. All identities apply over rational inputs; a constant invariant does not satisfy the normalizations.",
    obligations:[obligation("orbit","rotated","h",[sub("rotated","h",{x:"(three*x-four*y)/five",y:"(four*x+three*y)/five"})]),
      obligation("origin","atOrigin","zero",[sub("atOrigin","h",{x:"zero",y:"zero"})],["orbit"]),
      obligation("basisX","atX","one",[sub("atX","h",{x:"one",y:"zero"})],["orbit"]),
      obligation("basisY","atY","one",[sub("atY","h",{x:"zero",y:"one"})],["orbit"])]} satisfies SemanticPolynomialTask},
  {taskId:"SEM-COCYCLE",family:"NORMALIZED_POLYNOMIAL_COCYCLE",task:{schemaVersion:1,variables:["x","y","z"],constants:constants({zero:"0",one:"1",two:"2"}),outputLabels:["p"],
    objective:"Construct p(x,y,z) independent of z satisfying p(x,y)+p(x+y,z)=p(y,z)+p(x,y+z), p(0,y)=0 and p(1,1)=2. Independence of z is explicitly required by p(x,y,z+1)=p(x,y,z); the other identities use simultaneous substitutions, not sequential updates.",
    obligations:[obligation("independentZ","shiftZ","p",[sub("shiftZ","p",{z:"z+one"})]),
      obligation("cocycle","p+sumFirst","second+sumSecond",[sub("sumFirst","p",{x:"x+y",y:"z"}),sub("second","p",{x:"y",y:"z"}),sub("sumSecond","p",{y:"y+z"})],["independentZ"]),
      obligation("zeroArgument","atZero","zero",[sub("atZero","p",{x:"zero"})],["cocycle"]),
      obligation("normalization","atOne","two",[sub("atOne","p",{x:"one",y:"one"})],["cocycle"])]} satisfies SemanticPolynomialTask},
  {taskId:"SEM-NORM-COMPOSITION",family:"ANCHORED_NORM_COMPOSITION",task:{schemaVersion:1,variables:["x","y"],constants:constants({zero:"0",one:"1",a:"7/13",b:"-11/17"}),outputLabels:["u","v"],
    objective:"Construct u(x,y),v(x,y) with u*u+v*v=(x*x+y*y)*(a*a+b*b), u(1,0)=a, v(1,0)=b, u(0,1)=-b and v(0,1)=a. The identity must hold for all rational x,y and every calibration condition is mandatory.",
    obligations:[obligation("norm","u*u+v*v","(x*x+y*y)*(a*a+b*b)"),
      obligation("uFirst","U10","a",[sub("U10","u",{x:"one",y:"zero"})],["norm"]),
      obligation("vFirst","V10","b",[sub("V10","v",{x:"one",y:"zero"})],["norm"]),
      obligation("uSecond","U01","zero-b",[sub("U01","u",{x:"zero",y:"one"})],["norm"]),
      obligation("vSecond","V01","a",[sub("V01","v",{x:"zero",y:"one"})],["norm"])]} satisfies SemanticPolynomialTask},
]);
export const SEMANTIC_PROOF_CORPUS_DIGEST = theoryDigest(SEMANTIC_PROOF_CASES);
