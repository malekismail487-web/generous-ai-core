import { NyxNemotronEngineeringCognition, type NyxRepairCognitionEvidence }
  from "../../../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { NvidiaNimProvider } from "../../../src/lib/codelab/model/nvidiaNimProvider";
import type { RepresentationTask } from "./sourceRepresentationTasks";

export interface ConditionalRepairTask extends RepresentationTask { readonly suppliedCandidate: string }

// New synthetic development fixtures, frozen before inference. These deliberately
// supply the algorithm: the experiment measures conditional quality repair, NOT
// discovery, first-attempt engineering, or an official benchmark score.
export const CONDITIONAL_REFACTOR_REPAIR_TASKS: readonly ConditionalRepairTask[] = [
  {id:"BATCH-ENERGY-BILL",tier:"DEVELOPMENT",domain:"ORDERED_UNIT_AND_TARIFF_COMPOSITION",
    objective:"Implement transform(input) for {watts,minutes,count,lossPercent,rate,credit}. Inputs are finite nonnegative numbers; count is an integer and lossPercent is at most 100. Multiply watts by minutes, convert watt-minutes to kWh by dividing by 60000, multiply by count, add the percentage loss, multiply by rate, subtract credit without clamping or rounding. Preserve input and ESM export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    suppliedCandidate:'export function transform(input) {\n  const work = input.watts * input.minutes;\n  const converted = work / 60000;\n  const batch = converted * input.count;\n  const adjusted = batch * (1 + input.lossPercent / 100);\n  const charged = adjusted * input.rate;\n  const result = charged - input.credit;\n  return result + 0;\n}\n',
    publicCases:[{input:{watts:1000,minutes:60,count:2,lossPercent:0,rate:3,credit:1},expected:5},
      {input:{watts:500,minutes:120,count:3,lossPercent:100,rate:2,credit:0},expected:12}],
    privateCases:[{input:{watts:0,minutes:99,count:7,lossPercent:50,rate:4,credit:3},expected:-3},
      {input:{watts:300,minutes:100,count:2,lossPercent:0,rate:0.5,credit:0},expected:0.5},
      {input:{watts:600,minutes:100,count:0,lossPercent:100,rate:2,credit:4},expected:-4},
      {input:{watts:1500,minutes:40,count:4,lossPercent:25,rate:2,credit:0.5},expected:9.5}]},
  {id:"SIGNED-TEXT-BUCKET",tier:"DEVELOPMENT",domain:"TEXT_AND_SIGNED_MODULAR_ARITHMETIC",
    objective:"Implement transform(input) for {text,offset,modulus,bias}. text is a string; offset and bias are bounded integers; modulus is a strictly positive integer. Trim text using String.trim, take its JavaScript UTF-16 length, add offset, normalize modulo modulus into [0,modulus), then add bias. Preserve input and ESM export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    suppliedCandidate:'export function transform(input) {\n  const trimmed = input.text.trim();\n  const size = trimmed.length;\n  const shifted = size + input.offset;\n  const remainder = shifted % input.modulus;\n  const positive = remainder + input.modulus;\n  const bucket = positive % input.modulus;\n  return bucket + input.bias;\n}\n',
    publicCases:[{input:{text:"  bird  ",offset:1,modulus:3,bias:10},expected:12},
      {input:{text:"x",offset:-5,modulus:3,bias:0},expected:2}],
    privateCases:[{input:{text:" \t ",offset:-8,modulus:5,bias:2},expected:4},
      {input:{text:"🦋",offset:0,modulus:9,bias:-1},expected:1},
      {input:{text:"é",offset:-2,modulus:7,bias:4},expected:4},
      {input:{text:"ab",offset:-100,modulus:1,bias:-7},expected:-7}]},
  {id:"HORNER-RESIDUAL",tier:"VALIDATION",domain:"POLYNOMIAL_ITERATION_AND_RESIDUAL",
    objective:"Implement transform(input) for {coefficients,x,target,scale}. coefficients is a nonempty array of bounded finite numbers ordered from highest to lowest degree. Evaluate the polynomial at x by Horner iteration left to right without rounding. Subtract target and multiply by scale, then return Math.round(value*1000)/1000. x, target and scale are bounded finite numbers, possibly negative. Preserve input and ESM export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    suppliedCandidate:'export function transform(input) {\n  let value = 0;\n  for (const coefficient of input.coefficients) {\n    const product = value * input.x;\n    value = product + coefficient;\n  }\n  const residual = value - input.target;\n  const scaled = residual * input.scale;\n  const shifted = scaled * 1000;\n  const rounded = Math.round(shifted);\n  return rounded / 1000;\n}\n',
    publicCases:[{input:{coefficients:[2,3,4],x:2,target:1,scale:2},expected:34},
      {input:{coefficients:[5],x:8,target:6,scale:0.5},expected:-0.5}],
    privateCases:[{input:{coefficients:[1,-2,1],x:1,target:0,scale:9},expected:0},
      {input:{coefficients:[1,0,-4],x:-3,target:1,scale:-2},expected:-8},
      {input:{coefficients:[0.5,0.25],x:0.5,target:0,scale:0.25},expected:0.125},
      {input:{coefficients:[3,-1,2,7],x:0,target:2,scale:3},expected:15}]},
  {id:"SATURATING-RECURRENCE",tier:"VALIDATION",domain:"STATEFUL_SIGNAL_RECURRENCE",
    objective:"Implement transform(input) for {values,initial,alpha,low,high}. values is a finite numeric array, alpha is in [0,1], and low<=high. Process values in order: proposed = alpha*next + (1-alpha)*state; set state to proposed clamped to [low,high]. After all values, return state without rounding. Empty values returns initial unchanged, even outside the clamp. Preserve input and ESM export. No imports, filesystem, processes or network. Only src/transform.mjs may change.",
    suppliedCandidate:'export function transform(input) {\n  let state = input.initial;\n  for (const next of input.values) {\n    const observed = input.alpha * next;\n    const retained = (1 - input.alpha) * state;\n    const proposed = observed + retained;\n    const upperBounded = Math.min(input.high, proposed);\n    const lowerBounded = Math.max(input.low, upperBounded);\n    state = lowerBounded;\n  }\n  return state;\n}\n',
    publicCases:[{input:{values:[4,8],initial:0,alpha:0.5,low:0,high:10},expected:5},
      {input:{values:[],initial:99,alpha:1,low:0,high:1},expected:99}],
    privateCases:[{input:{values:[100,-100,5],initial:0,alpha:1,low:-3,high:3},expected:3},
      {input:{values:[100,100],initial:20,alpha:0,low:-1,high:5},expected:5},
      {input:{values:[-4,-8],initial:0,alpha:0.5,low:-10,high:10},expected:-5},
      {input:{values:[8,0,8],initial:0,alpha:0.5,low:0,high:3},expected:3}]},
];

/** Development-only composition, not a new executor or cognitive engine.
 * The supplied first candidate is parsed by existing cognition in TEST_DOUBLE_ONLY
 * mode and applied/verified/admitted by the unchanged R3 loop. Only subsequent
 * requests reach live cognition. The E3 fixture receipt is kept separate from
 * live usage, never labeled E4 and never erased from the candidate genealogy.
 */
export function suppliedCandidateThenLive(live: NyxNemotronEngineeringCognition, source: string) {
  if (typeof source !== "string" || Buffer.byteLength(source) > 12000) throw Error("conditional_seed_bound");
  const fixtureEvidence: NyxRepairCognitionEvidence[] = [];
  const fixture = NyxNemotronEngineeringCognition.create({cognitionId:"SUPPLIED_DEVELOPMENT_CANDIDATE_NOT_MODEL_GENERATED",
    provider:NvidiaNimProvider.create({providerId:"SUPPLIED_DEVELOPMENT_CANDIDATE",model:"nvidia/nemotron-3-super-120b-a12b",
      authorityMode:"TEST_DOUBLE_ONLY",credentialSource:{sourceIdentity:"explicit-nonsecret-fixture",read:()=>"nonsecret-test-material"},
      maxPromptBytes:64000,maxOutputTokens:8192,timeoutMs:1000,
      transport:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({decision:"PROPOSE_EDIT",
        diagnosis:"The evaluator supplies this candidate to measure conditional quality repair.",
        causalHypothesis:"The supplied algorithm implements the objective but may exceed unchanged structural limits.",
        invariant:"Preserve the specified behavior and input.",expectedResult:"The public cases pass.",
        evidenceRefs:["OBJECTIVE","FILE:src/examples.mjs"],counterexamples:["Boundary and empty-input cases"],
        changes:[{target:"src/transform.mjs",replacement:{lines:source.split("\n"),lineEnding:"LF"}}]})},finish_reason:"stop"}],
        usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0}}),{status:200})}),
    maxPromptBytes:48000,maxOutputTokens:8192,sourceRepresentation:"LINES",intentCompilationMode:"SAFE_CANONICALIZATION",
    comparisonReasoningControl:"SUPER_HOSTED_NATIVE",comparisonInferencePolicy:"CONSTRAINED_JSON"});
  let supplied = false;
  const cognition = new Proxy(live, {get(target,key) {
    if (key !== "proposeRepair") { const value=Reflect.get(target,key,target); return typeof value==="function"?value.bind(target):value; }
    return async (...args: Parameters<NyxNemotronEngineeringCognition["proposeRepair"]>) => {
      if (supplied) return live.proposeRepair(...args);
      supplied = true;
      const request=args[0];
      if (request.priorHypotheses.length || request.priorCognitionFailures.length || request.candidateQualityFeedback
        || request.allowedMutationPaths.length!==1 || request.allowedMutationPaths[0]!=="src/transform.mjs")
        throw Error("conditional_seed_initial_scope");
      const result=await fixture.proposeRepair(...args);
      if(result.evidence.evidenceClass!=="E3")throw Error("conditional_seed_not_e3");
      fixtureEvidence.push(result.evidence);
      return result;
    };
  }});
  return {cognition,fixtureEvidence};
}
