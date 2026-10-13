import {createHash} from "node:crypto";
import {cp,mkdir,mkdtemp,readFile,realpath,readdir,lstat,rm,rmdir,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {ReadOnlyRepositoryExecutor} from "../../src/lib/codelab/executor/readOnlyExecutor";
import {R2AIsolatedSandboxLifecycle,type R2AIsolatedLifecycleConfig} from "../../src/lib/codelab/executor/r2SandboxLifecycle";
import {R3ADisposablePatchApplicator} from "../../src/lib/codelab/executor/r3DisposablePatchApplication";
import {R3BControlledEngineeringExecutor} from "../../src/lib/codelab/executor/r3ControlledEngineeringExecution";
import type {R2GPatchProposal} from "../../src/lib/codelab/executor/r2PatchProposal";
import {OmegaResearchExperimentRunner,type RationalResearchReadout} from "../../src/lib/codelab/research/omegaResearchExperimentRunner";
import type {ResearchPartyObjective} from "../../src/lib/codelab/research/researchPartyContracts";
import {SCIENCE_SIMULATOR_SOURCE,scienceInputs,type ScienceWorld} from "./nyx-scientific-world-fixtures";
import {theoryDigest} from "../../src/lib/codelab/research/theoryContracts";
const hash=(s:string|Buffer)=>createHash("sha256").update(s).digest("hex");
const canonical=(v:unknown):string=>Array.isArray(v)?"["+v.map(canonical).join(",")+"]":v&&typeof v==="object"?"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical((v as Record<string,unknown>)[k])).join(",")+"}":JSON.stringify(v);

/** Evaluation fixture setup, not another sandbox/executor. Reuse the existing
 * R1, R2A, reviewed R3A clone and single-use R3B machinery. No candidate program
 * is written as executable code; only the fixed author simulator is executed.
 */
export async function prepareScientificRig(world:Pick<ScienceWorld,"taskId"|"probes"> & {readonly hidden:unknown},candidate:string,identity:string,expires:number,
  simulatorSource=SCIENCE_SIMULATOR_SOURCE){
  // Developer-owned fixture source, never a model tool argument. The existing
  // R3B registration still pins the complete fixed entrypoint's content hash.
  if(typeof simulatorSource!=="string"||simulatorSource.length<1||simulatorSource.length>20000)throw Error("science_simulator_fixture_bound");
  const began=Date.now(),parent=await mkdtemp(join(tmpdir(),"nyx-science-rig-")),sourceRoot=join(parent,"source"),sandboxRoot=join(parent,"sandboxes");
  await mkdir(join(sourceRoot,"src"),{recursive:true});await mkdir(join(sourceRoot,"tools"));await mkdir(sandboxRoot);
  const probes=Object.fromEntries(world.probes.map((p,i)=>[`MEASURE-${world.taskId}-${i}`,{pointId:`Probe${i}`,inputs:scienceInputs(p),point:p}]));
  const source=simulatorSource+`\nconst hidden=${JSON.stringify(world.hidden)},probes=${JSON.stringify(probes)};\nconst p=probes[process.argv[2]];if(!p)throw Error("unknown_probe");console.log(JSON.stringify({schemaVersion:1,pointId:p.pointId,inputs:p.inputs,label:"response",value:show(calculate(hidden,p.point))}));\n`;
  await writeFile(join(sourceRoot,"src","marker.txt"),"baseline");await writeFile(join(sourceRoot,"tools","measure.mjs"),source);
  const root=await realpath(sourceRoot),approved=await realpath(sandboxRoot),issuer="OMEGA-ISOLATED-SCIENCE-EVALUATION";
  const r1=await ReadOnlyRepositoryExecutor.create({executorId:identity+"-R1",tokenId:identity+"-R1-TOKEN",repositoryRoot:root,resourceScopes:["."],
    issuedAtEpochMs:began-1000,expiresAtEpochMs:expires,constraints:{maxFileBytes:100000,maxDirectoryEntries:100,allowedExtensions:[".txt",".mjs"]},issuer,auditIdentity:identity+"-R1-AUDIT"});
  const capability={capabilityId:identity+"-R2A-CAP",issuer,auditIdentity:identity+"-R2A-AUDIT",issuedAtEpochMs:began-1000,expiresAtEpochMs:expires};
  const config:R2AIsolatedLifecycleConfig={executorId:identity+"-R2A",candidateCommit:candidate,capabilityVersion:"r2-a/1",evaluatorVersion:"scientific-rig/1",
    environmentIdentity:`github-${process.platform}-${process.arch}`,authorityMode:"ISOLATED_CANDIDATE_NOT_GRANTED",repositoryRoot:root,approvedSandboxRoot:approved,capability};
  const lifecycle=await R2AIsolatedSandboxLifecycle.create(config,began),requestId=identity+"-PROVISION";
  const provided=await lifecycle.provision({schemaVersion:1,requestId,capabilityId:capability.capabilityId,authority:"PROVISION_SANDBOX",requestedPath:"lab",
    repositoryRoot:root,approvedSandboxRoot:approved,issuedAtEpochMs:began,expiresAtEpochMs:expires,issuer,auditIdentity:capability.auditIdentity,
    candidateBinding:{commit:candidate,capabilityVersion:config.capabilityVersion,schemaVersion:1,evaluatorVersion:config.evaluatorVersion,environmentIdentity:config.environmentIdentity}},began);
  if(!provided.sandbox)throw Error("science_rig_provision_failed");
  const sandbox=provided.sandbox,clone=join(sandbox.canonicalPath,"repository-copy");await cp(root,clone,{recursive:true,errorOnExist:true,force:false});
  const changes=[{kind:"MODIFY" as const,relativePath:"src/marker.txt",expectedBaseHash:hash("baseline"),proposedContentHash:hash("candidate"),proposedContent:"candidate",
    baselineEvidenceId:identity+"-BASE",baselineObservationId:identity+"-BASE-OBS",sandboxArtifactId:identity+"-MARKER"}];
  const base={schemaVersion:1 as const,proposalId:identity+"-PROPOSAL",requestId:identity+"-PATCH-REQUEST",repositoryRoot:root,baseCandidateCommit:candidate,changes,applyAuthorized:false as const,rollbackRequiredBeforeApply:true as const};
  const proposal:R2GPatchProposal={...base,proposalDigest:hash(canonical(base))};
  const applyCap={...capability,capabilityId:identity+"-R3A-CAP",auditIdentity:identity+"-R3A-AUDIT"};
  const applicator=await R3ADisposablePatchApplicator.create({executorId:identity+"-R3A",candidateCommit:candidate,evaluatorVersion:"scientific-rig/1",environmentIdentity:config.environmentIdentity,
    authorityMode:"ISOLATED_CANDIDATE_NOT_GRANTED",sourceRepositoryRoot:root,sourceRepositoryExecutor:r1,disposableRepositoryRoot:clone,sandbox,lifecycle,proposal,capability:applyCap,
    allowedExtensions:[".txt"],maxChanges:1,maxPatchBytes:4096});
  const application=await applicator.apply({schemaVersion:1,requestId:identity+"-APPLY",applicationId:identity+"-APPLICATION",proposalId:proposal.proposalId,proposalDigest:proposal.proposalDigest,
    disposableRepositoryId:applicator.disposableRepositoryId(),sandboxId:sandbox.sandboxId,capabilityId:applyCap.capabilityId,authority:"APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY",issuer,auditIdentity:applyCap.auditIdentity,observedAtEpochMs:Date.now()});
  if(application.decision!=="APPLIED")throw Error("science_rig_clone_apply_failed");
  const executors=new Map<string,{executor:R3BControlledEngineeringExecutor;capabilityId:string;auditIdentity:string}>();
  for(const [i,toolId]of Object.keys(probes).entries()){
    const capabilityId=identity+"-R3B-CAP-"+i,auditIdentity=identity+"-R3B-AUDIT-"+i;
    const executor=await R3BControlledEngineeringExecutor.create({executorId:identity+"-R3B-"+i,candidateCommit:candidate,evaluatorVersion:"scientific-rig/1",environmentIdentity:config.environmentIdentity,
      authorityMode:"ISOLATED_CANDIDATE_NOT_GRANTED",disposableRepositoryRoot:clone,disposableRepositoryId:application.disposableRepositoryId,applicator,appliedCandidate:application,
      capability:{...capability,capabilityId,auditIdentity},tools:[{toolId,toolKind:"TEST",toolVersion:"scientific-simulator/1",entrypoint:"tools/measure.mjs",
        expectedEntrypointSha256:hash(source),arguments:[toolId],workingDirectory:".",timeoutMs:5000,maxOutputBytes:4096,allowedMutationPrefixes:[],allowChildProcesses:false}],
      maxRepositoryFiles:100,maxRepositoryBytes:500000,maxTimeoutMs:5000,maxOutputBytes:4096});executors.set(toolId,{executor,capabilityId,auditIdentity});
  }
  let closed=false;
  async function sourceUnchanged(){return await readFile(join(root,"src","marker.txt"),"utf8")==="baseline"&&await readFile(join(root,"tools","measure.mjs"),"utf8")===source;}
  return{simulatorSourceDigest:theoryDigest(source),
    runner:(objective:ResearchPartyObjective,readouts:Record<string,RationalResearchReadout>)=>OmegaResearchExperimentRunner.create(objective.experimentCatalog.map((e,i)=>{
      const bound=executors.get(e.toolId);if(!bound)throw Error("science_tool_not_registered");
      return{experimentId:e.experimentId,verification:{toolId:e.toolId,executor:bound.executor,request:{schemaVersion:1,requestId:identity+"-MEASURE-"+i,executionId:identity+"-EXECUTE-"+i,
        authority:"RUN_AUTHORIZED_ENGINEERING_TOOL",toolId:e.toolId,disposableRepositoryId:application.disposableRepositoryId,applicationId:application.applicationId,proposalDigest:application.proposalDigest,
        capabilityId:bound.capabilityId,issuer,auditIdentity:bound.auditIdentity,environmentIdentity:config.environmentIdentity,observedAtEpochMs:Date.now()}},outcomeByOutputDigest:{},rationalReadout:readouts[e.experimentId]};})),
    sourceUnchanged,
    cleanup:async()=>{
      if(closed)throw Error("science_rig_cleanup_replay");closed=true;
      if(!await sourceUnchanged())throw Error("science_fixture_source_mutated");
      // Inspect the exact owned tree, refuse links, and validate every target
      // within this newly allocated temporary domain before recursive cleanup.
      const canonicalParent=await realpath(parent);if(resolve(parent)!==canonicalParent)throw Error("science_rig_parent_alias");
      async function inspect(path:string):Promise<void>{const p=resolve(path);if(!p.startsWith(canonicalParent+sep))throw Error("science_cleanup_scope");const stat=await lstat(p);
        if(stat.isSymbolicLink())throw Error("science_cleanup_link");if(stat.isDirectory())for(const name of await readdir(p))await inspect(join(p,name));}
      await inspect(clone);await rm(clone,{recursive:true});
      const terminated=await lifecycle.terminate({schemaVersion:1,requestId,capabilityId:capability.capabilityId,authority:"TERMINATE_SANDBOX",issuer,auditIdentity:capability.auditIdentity,observedAtEpochMs:Date.now()});
      if(terminated.decision!=="TERMINATED")throw Error("science_sandbox_cleanup_not_verified");
      await inspect(root);await inspect(approved);await rm(root,{recursive:true});await rm(approved,{recursive:true});
      if((await readdir(parent)).length!==0)throw Error("science_temp_cleanup_not_empty");await rmdir(parent);return{sourceUnchanged:true,sandboxCleanupVerified:true,temporaryFixtureRemoved:true};
    }};
}
