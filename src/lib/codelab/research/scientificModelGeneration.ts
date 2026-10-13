import { BoundedReasoningSession, snapshotBoundedReasoningData } from "./boundedReasoningWorkbench";
import { canonicalRationalLiteral, validQuantitativeProblem } from "./exactQuantitativeDerivation";
import { compileAlgebraicExpressionGraph, algebraicEmissionDiagnostic, type QuantitativeAlgebraicForm } from "./quantitativeAlgebraicCompiler";
import { ResearchEvidenceGraph } from "./researchEvidenceGraph";
import { validResearchObjective, researchObjectiveDigest, type ResearchPartyObjective, type TheoryContribution } from "./researchPartyContracts";
import { immutableTheoryValue, theoryDigest } from "./theoryContracts";
import type { RationalResearchReadout } from "./omegaResearchExperimentRunner";

export const SCIENTIFIC_MODEL_POLICY=/* @__PURE__ */ Object.freeze({version:"nyx-generated-scientific-model/1",maxModels:8,maxVariables:3,
  maxParameters:16,maxObservations:12,maxExperiments:16,maxRequests:8,responseLabel:"response",
  operations:["ADD","SUB","MUL","DIV"],scope:"DETERMINISTIC_RATIONAL_POINT_PREDICTIONS_NOT_CAUSAL_TRUTH",
  scientificModelValidity:"NOT_ESTABLISHED_BY_DERIVATION_OR_TRAINING_FIT",grantsAuthority:false});
type Input=Readonly<{id:string;value:string}>;
export interface ScientificModelDraft {
  readonly schemaVersion:1;readonly parameters:readonly Input[];readonly program:QuantitativeAlgebraicForm;
  readonly assumptions:readonly string[];readonly uncertainties:readonly string[];
}
export interface ScientificModelTask {
  readonly schemaVersion:1;
  readonly objective:Omit<ResearchPartyObjective,"mechanismCatalog"|"experimentCatalog">;
  readonly variables:readonly string[];readonly constants:readonly Input[];
  readonly observations:readonly {readonly pointId:string;readonly inputs:readonly Input[];readonly output:string;readonly evidenceRef:string}[];
  readonly experiments:readonly (Omit<ResearchPartyObjective["experimentCatalog"][number],"possibleOutcomes"> & {readonly inputs:readonly Input[]})[];
}
export interface ScientificModelLimits {readonly maxRequests:number;readonly maxWorkUnits:number;readonly maxNativeElapsedMs:number;readonly expiresAtEpochMs:number}
export interface ScientificModelRef {readonly modelId:string;readonly taskDigest:string;readonly programDigest:string;readonly grantsAuthority:false}
export interface ScientificPrediction {readonly pointId:string;readonly inputs:readonly Input[];readonly value:string}
export interface IndependentScientificDerivation {readonly decision:"AGREES"|"DISAGREES"|"INSUFFICIENT_EVIDENCE";readonly verificationDigest:string}
export type ScientificDerivationVerifier=(task:ScientificModelTask,draft:ScientificModelDraft,predictions:readonly ScientificPrediction[])=>IndependentScientificDerivation;
interface Artifact {readonly ref:ScientificModelRef;readonly draft:ScientificModelDraft;readonly predictions:readonly ScientificPrediction[];
  readonly independentVerificationDigest:string;readonly observedAtEpochMs:number}
export type ScientificModelProposalResult={readonly state:"ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH";readonly model:ScientificModelRef;readonly resultDigest:string}
  |{readonly state:"REJECTED"|"INSUFFICIENT_EVIDENCE";readonly reason:string;readonly contradictedObservationIds:readonly string[];readonly resultDigest:string};
const keys=(v:unknown,n:readonly string[]):boolean=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join("|")===[...n].sort().join("|");
const id=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(v);
const texts=(v:unknown):v is string[]=>Array.isArray(v)&&v.length>=1&&v.length<=5&&new Set(v).size===v.length
  &&v.every(s=>typeof s==="string"&&s.trim().length>0&&s.length<=160&&!s.includes("\0"));
const digest=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);

/** One process-local proposal domain. Actual reasoning is supplied by existing
 * NYX cognition; this class owns data/computation/admission, not another model.
 * No filesystem, shell, network, production or physical execution lives here.
 */
export class ScientificModelSession {
  readonly task:ScientificModelTask;readonly taskDigest:string;
  readonly #limits:ScientificModelLimits;readonly #now:()=>number;
  readonly #owned=new Map<ScientificModelRef,Artifact>();readonly #programs=new Set<string>();readonly #refutedDerivations=new Set<string>();
  #requests=0;#units=0;#nativeElapsedMs=0;#nativeRequests=0;#lastTime:number;#unavailable=false;#busy=false;
  private constructor(task:ScientificModelTask,limits:ScientificModelLimits,now:()=>number,createdAt:number){
    this.task=task;this.taskDigest=theoryDigest(task);this.#limits=limits;this.#now=now;this.#lastTime=createdAt;this.#available();
  }
  static create(task:ScientificModelTask,limits:ScientificModelLimits,now=Date.now):ScientificModelSession{
    const t=snapshotBoundedReasoningData(task),l=snapshotBoundedReasoningData(limits),at=now();
    if(!keys(l,["maxRequests","maxWorkUnits","maxNativeElapsedMs","expiresAtEpochMs"])
      ||!Number.isSafeInteger(l.maxRequests)||l.maxRequests<1||l.maxRequests>8
      ||!Number.isSafeInteger(l.maxWorkUnits)||l.maxWorkUnits<1||l.maxWorkUnits>1000000
      ||!Number.isSafeInteger(l.maxNativeElapsedMs)||l.maxNativeElapsedMs<1||l.maxNativeElapsedMs>10000
      ||!Number.isSafeInteger(l.expiresAtEpochMs)||!Number.isSafeInteger(at)||at<0||l.expiresAtEpochMs<=at
      ||l.expiresAtEpochMs>at+3600000)throw Error("scientific_model_limits_invalid");
    if(!keys(t,["schemaVersion","objective","variables","constants","observations","experiments"])||t.schemaVersion!==1
      ||!Array.isArray(t.variables)||t.variables.length<1||t.variables.length>3||!t.variables.every(id)||new Set(t.variables).size!==t.variables.length
      ||!Array.isArray(t.constants)||t.constants.length<1||t.constants.length>12
      ||!validQuantitativeProblem({kind:"EXACT_QUANTITATIVE_DERIVATION",constants:t.constants})
      ||t.constants.some(c=>t.variables.includes(c.id)||["MIN","MAX","BINOMIAL"].includes(c.id))
      ||!Array.isArray(t.observations)||t.observations.length<1||t.observations.length>12
      ||!Array.isArray(t.experiments)||t.experiments.length<1||t.experiments.length>16
      ||!keys(t.objective,["schemaVersion","researchId","objective","domain","candidateBinding","scope","admittedEvidence","successCriteria","expiryEpochMs"])
      ||t.objective.domain!=="SCIENCE"||l.expiresAtEpochMs>t.objective.expiryEpochMs)throw Error("scientific_model_task_invalid");
    const pointIds=new Set<string>();
    const validInputs=(inputs:readonly Input[])=>Array.isArray(inputs)&&inputs.length===t.variables.length
      &&inputs.every(i=>keys(i,["id","value"])&&t.variables.includes(i.id))&&new Set(inputs.map(i=>i.id)).size===inputs.length
      &&validQuantitativeProblem({kind:"EXACT_QUANTITATIVE_DERIVATION",constants:inputs});
    for(const o of t.observations){
      if(!keys(o,["pointId","inputs","output","evidenceRef"])||!id(o.pointId)||pointIds.has(o.pointId)||!validInputs(o.inputs))throw Error("scientific_observation_invalid");
      canonicalRationalLiteral(o.output);pointIds.add(o.pointId);
      const e=t.objective.admittedEvidence.find(e=>e.evidenceId===o.evidenceRef);
      if(!e||!["E3","E4"].includes(e.evidenceClass)||e.kind!=="OBSERVATION"||e.observedAtEpochMs>at
        ||e.contentDigest!==theoryDigest({pointId:o.pointId,inputs:o.inputs,output:o.output}))throw Error("scientific_observation_provenance_invalid");
    }
    for(const e of t.experiments){if(!keys(e,["experimentId","toolId","question","inputs","costUnits","authority","scope","mutatesCandidate"])
      ||!id(e.experimentId)||pointIds.has(e.experimentId)||!validInputs(e.inputs))throw Error("scientific_experiment_invalid");pointIds.add(e.experimentId);}
    const template={...t.objective,mechanismCatalog:[{mechanismId:"VALIDATION_ONLY_A",description:"Not a model supplied to NYX"},{mechanismId:"VALIDATION_ONLY_B",description:"Not a model supplied to NYX"}],
      experimentCatalog:t.experiments.map(({inputs:_inputs,...e})=>({...e,possibleOutcomes:["VALIDATION_A","VALIDATION_B"]}))};
    if(!validResearchObjective(template,at))throw Error("scientific_objective_contract_invalid");
    const s=new ScientificModelSession(t,l,now,at);
    // Setup and representation normalization are charged, not free hidden work.
    for(const c of [...t.constants,...t.observations.flatMap(o=>o.inputs),...t.experiments.flatMap(e=>e.inputs)])s.#canonical(c.value);
    for(const o of t.observations)s.#canonical(o.output);
    return s;
  }
  #available(){const at=this.#now();if(!Number.isSafeInteger(at)||at<this.#lastTime||at>=this.#limits.expiresAtEpochMs)this.#unavailable=true;
    this.#lastTime=at;if(this.#unavailable)throw Error("scientific_model_session_unavailable");return at;}
  #tick(){this.#available();if(this.#units>=this.#limits.maxWorkUnits)throw Error("scientific_model_work_budget");this.#units++;}
  #canonical(s:string){return canonicalRationalLiteral(s,()=>this.#tick());}
  revoke(){this.#unavailable=true;}
  get expiresAtEpochMs(){return this.#limits.expiresAtEpochMs;}
  usage(){return Object.freeze({requests:this.#requests,remainingRequests:Math.max(0,this.#limits.maxRequests-this.#requests),workUnits:this.#units,nativeRequests:this.#nativeRequests,nativeElapsedMs:this.#nativeElapsedMs,models:this.#owned.size});}
  inspect(model:ScientificModelRef){this.#available();const a=this.#owned.get(model);if(!a)throw Error("scientific_model_foreign_reference");return a;}
  propose(request:unknown,verify:ScientificDerivationVerifier):ScientificModelProposalResult{
    this.#available();if(this.#busy)throw Error("scientific_model_reentrant_request");
    if(this.#requests>=this.#limits.maxRequests)throw Error("scientific_model_request_budget");
    this.#requests++;this.#busy=true;
    const reject=(reason:string,state:"REJECTED"|"INSUFFICIENT_EVIDENCE"="REJECTED",contradictedObservationIds:readonly string[]=[]):ScientificModelProposalResult=>{
      const r={state,reason,contradictedObservationIds};return immutableTheoryValue({...r,resultDigest:theoryDigest({task:this.taskDigest,request:this.#requests,...r})});};
    try{
      const r=snapshotBoundedReasoningData(request) as Record<string,unknown>;
      if(!keys(r,["schemaVersion","operation","taskDigest","draft"])||r.schemaVersion!==1||r.operation!=="PROPOSE_SCIENTIFIC_MODEL"
        ||r.taskDigest!==this.taskDigest||typeof verify!=="function")return reject("PROPOSAL_CONTRACT");
      const d=r.draft as ScientificModelDraft;
      if(!keys(d,["schemaVersion","parameters","program","assumptions","uncertainties"])||d.schemaVersion!==1||!texts(d.assumptions)||!texts(d.uncertainties)
        ||!Array.isArray(d.parameters)||d.parameters.length>16||d.parameters.some(p=>!keys(p,["id","value"])||!id(p.id)
          ||[...this.task.variables,...this.task.constants.map(c=>c.id),"response","MIN","MAX","BINOMIAL"].includes(p.id))
        ||new Set(d.parameters.map(p=>p.id)).size!==d.parameters.length)return reject("DRAFT_CONTRACT");
      if(d.parameters.length&&!validQuantitativeProblem({kind:"EXACT_QUANTITATIVE_DERIVATION",constants:d.parameters}))return reject("PARAMETER_LITERAL_BOUND");
      const draft=snapshotBoundedReasoningData({...d,parameters:d.parameters.map(p=>({...p,value:this.#canonical(p.value)}))});
      const constants=[...this.task.constants,...draft.parameters];
      if(!validQuantitativeProblem({kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[...constants,...this.task.observations[0].inputs]}))return reject("CONSTANT_BINDING");
      const graph=compileAlgebraicExpressionGraph([...this.task.variables,...constants.map(c=>c.id)],constants.find(c=>this.#canonical(c.value)==="0")?.id,draft.program,()=>this.#tick());
      if(graph.outputs.length!==1||graph.outputs[0].label!=="response"||graph.expressions.some(e=>!SCIENTIFIC_MODEL_POLICY.operations.includes(e.op)))return reject("MODEL_OPERATION_OR_OUTPUT_NOT_SUPPORTED","INSUFFICIENT_EVIDENCE");
      const programDigest=theoryDigest({parameters:draft.parameters,program:draft.program});
      if(this.#programs.has(programDigest))return reject("DUPLICATE_MODEL_ARTIFACT");
      if(this.#refutedDerivations.has(programDigest))return reject("CRITICAL_INDEPENDENT_DERIVATION_CONFLICT");
      const predictions:ScientificPrediction[]=[];
      for(const point of [...this.task.observations.map(o=>({pointId:o.pointId,inputs:o.inputs})),...this.task.experiments.map(e=>({pointId:e.experimentId,inputs:e.inputs}))]){
        this.#tick();if(this.#nativeElapsedMs>=this.#limits.maxNativeElapsedMs)return reject("NATIVE_TIME_BUDGET","INSUFFICIENT_EVIDENCE");
        const pointSession=BoundedReasoningSession.create({kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[...constants,...point.inputs]},
          {maxRequests:1,maxWorkUnits:Math.max(1,this.#limits.maxWorkUnits-this.#units),maxElapsedMs:this.#limits.maxNativeElapsedMs-this.#nativeElapsedMs,
            expiresAtEpochMs:this.#limits.expiresAtEpochMs},()=>this.#available(),{expressionGraphs:false,algebraicForms:true});
        let result:ReturnType<BoundedReasoningSession["analyze"]>;
        try{this.#nativeRequests++;result=pointSession.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:pointSession.problemDigest,program:draft.program});}
        finally{const used=pointSession.usage();this.#units+=used.workUnits;this.#nativeElapsedMs+=used.elapsedMs;pointSession.revoke();}
        if(result.status!=="CONSTRUCTED")return reject("NATIVE_"+result.status,"INSUFFICIENT_EVIDENCE");
        const outputs=result.payload?.outputs as {label:string;value:string}[];
        if(!Array.isArray(outputs)||outputs.length!==1||outputs[0].label!=="response")return reject("NATIVE_PREDICTION_CONTRACT","INSUFFICIENT_EVIDENCE");
        predictions.push({pointId:point.pointId,inputs:point.inputs,value:outputs[0].value});
      }
      let independent:IndependentScientificDerivation;
      try{independent=snapshotBoundedReasoningData(verify(this.task,draft,immutableTheoryValue(predictions)));}
      catch{return reject("INDEPENDENT_VERIFIER_FAILURE","INSUFFICIENT_EVIDENCE");}
      this.#available();
      if(!keys(independent,["decision","verificationDigest"])||!["AGREES","DISAGREES","INSUFFICIENT_EVIDENCE"].includes(independent.decision)||!digest(independent.verificationDigest))
        return reject("INDEPENDENT_VERIFIER_CONTRACT","INSUFFICIENT_EVIDENCE");
      if(independent.decision==="DISAGREES"){this.#refutedDerivations.add(programDigest);return reject("INDEPENDENT_DERIVATION_DISAGREEMENT");}
      if(independent.decision!=="AGREES")return reject("INDEPENDENT_DERIVATION_INSUFFICIENT","INSUFFICIENT_EVIDENCE");
      const contradicted=this.task.observations.filter(o=>predictions.find(p=>p.pointId===o.pointId)!.value!==this.#canonical(o.output)).map(o=>o.pointId);
      if(contradicted.length)return reject("REFUTED_BY_ADMITTED_OBSERVATION","REJECTED",contradicted);
      const ref=Object.freeze({modelId:"MODEL-"+programDigest,taskDigest:this.taskDigest,programDigest,grantsAuthority:false as const});
      const artifact=Object.freeze({ref,draft,predictions:immutableTheoryValue(predictions),independentVerificationDigest:independent.verificationDigest,observedAtEpochMs:this.#available()});
      this.#owned.set(ref,artifact);this.#programs.add(programDigest);
      // Keep the exact owned reference: cloning it would erase object custody.
      return Object.freeze({state:"ADMITTED_PREDICTIONS_NOT_SCIENTIFIC_TRUTH",model:ref,resultDigest:theoryDigest({task:this.taskDigest,programDigest,independent:independent.verificationDigest})});
    }catch(error){
      if(String(error).includes("session_unavailable"))throw error;
      const diagnostic=algebraicEmissionDiagnostic(error);
      if(diagnostic)return reject("ALGEBRAIC_"+diagnostic.category);
      return reject(String(error).includes("budget")?"RESOURCE_BUDGET":"IR_OR_DRAFT_REJECTION",String(error).includes("budget")?"INSUFFICIENT_EVIDENCE":"REJECTED");
    }finally{this.#busy=false;}
  }

  /** Register generated, derivation-checked models BEFORE creating the existing
   * immutable research objective. Existing catalog checks are not bypassed.
   * Forecast labels are host-owned and have an explicit outside-family outcome.
   */
  bridge(models:readonly ScientificModelRef[],origin:{evidenceIdentity:string;provenanceRoot:string}){
    this.#available();if(!Array.isArray(models)||models.length<2||models.length>8||new Set(models).size!==models.length)throw Error("scientific_competing_models_required");
    const artifacts=models.map(m=>this.inspect(m)),readouts:Record<string,RationalResearchReadout>={};
    const experimentCatalog=this.task.experiments.map(({inputs:_inputs,...e})=>{
      const values=[...new Set(artifacts.map(a=>a.predictions.find(p=>p.pointId===e.experimentId)!.value))];
      const matching=values.map((value,i)=>({value,outcome:`PREDICTION_${i}`}));
      readouts[e.experimentId]={kind:"RATIONAL_SCALAR",label:"response",pointId:e.experimentId,inputs:this.task.experiments.find(p=>p.experimentId===e.experimentId)!.inputs,
        matching,otherOutcome:"OUTSIDE_ALL_CURRENT_PREDICTIONS"};
      return{...e,possibleOutcomes:[...matching.map(p=>p.outcome),"OUTSIDE_ALL_CURRENT_PREDICTIONS"]};
    });
    const objective:ResearchPartyObjective=immutableTheoryValue({...this.task.objective,experimentCatalog,
      mechanismCatalog:artifacts.map(a=>({mechanismId:a.ref.modelId,description:`Generated arithmetic model ${a.ref.programDigest}. `+a.draft.assumptions.join("; ")}))});
    if(!validResearchObjective(objective,this.#available()))throw Error("generated_research_objective_invalid");
    const graph=new ResearchEvidenceGraph(objective,this.#available()),contributions:TheoryContribution[]=[];
    for(const [index,a] of artifacts.entries()){
      const intent={schemaVersion:1 as const,decision:"PROPOSE_HYPOTHESIS" as const,thesis:"Generated executable mathematical model; point forecasts are independently replayed, causal truth is not established.",
        mechanismId:a.ref.modelId,causalMechanism:`Inspectable arithmetic artifact ${a.ref.programDigest}, not an independently established scientific law.`,
        evidenceRefs:[...new Set(this.task.observations.map(o=>o.evidenceRef))].slice(0,20),assumptions:a.draft.assumptions,uncertainties:a.draft.uncertainties,
        forecasts:this.task.experiments.map(e=>({experimentId:e.experimentId,expectedOutcome:readouts[e.experimentId].matching.find(m=>m.value===a.predictions.find(p=>p.pointId===e.experimentId)!.value)!.outcome,
          rationale:"Derived before observing this experiment by bounded native computation and independent original-source replay."})),
        counterexamples:[],requestedExperimentIds:this.task.experiments.map(e=>e.experimentId),revisionOfTheoryId:null,modelEstimate:null};
      const contributionId=`GENERATED-${a.ref.programDigest}`,theoryId=`THEORY-${a.ref.programDigest}`,guardianId=`GUARDIAN-${a.ref.programDigest}`,role="INVESTIGATOR" as const;
      const modelEvidence={evidenceId:`${origin.evidenceIdentity}:${index}`,evidenceClass:"E1" as const,kind:"MODEL_CONTRIBUTION" as const,
        summary:"NYX-authored arithmetic model hypothesis, not truth evidence.",contentDigest:theoryDigest(intent),provenanceRoot:origin.provenanceRoot,
        freshnessDependencies:[`CANDIDATE:${objective.candidateBinding}`],observedAtEpochMs:a.observedAtEpochMs,candidateBinding:objective.candidateBinding,grantsAuthority:false as const};
      const fields={contributionId,theoryId,guardianId,role,objectiveDigest:researchObjectiveDigest(objective),intent,committedAtEpochMs:this.#available()};
      const contribution=immutableTheoryValue({...fields,modelEvidence,contributionDigest:theoryDigest({...fields,modelEvidenceId:modelEvidence.evidenceId}),grantsAuthority:false as const});
      graph.commitContribution(contribution);contributions.push(contribution);
    }
    return Object.freeze({objective,graph,readouts:immutableTheoryValue(readouts),contributions:immutableTheoryValue(contributions),
      scientificTruthEstablished:false as const,authorityGranted:false as const});
  }
}
