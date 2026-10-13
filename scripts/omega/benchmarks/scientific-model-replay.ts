import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { theoryDigest } from "../../../src/lib/codelab/research/theoryContracts";
import type { ScientificDerivationVerifier, IndependentScientificDerivation } from "../../../src/lib/codelab/research/scientificModelGeneration";

/** Fixed developer verifier, not a model shell/tool. Reuse the independent
 * original-source parser and Fraction interpreter; do not inherit native votes.
 */
export function scientificModelReplay(python="python",timeoutMs=5000):ScientificDerivationVerifier{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error("scientific_replay_timeout_invalid");
  return(task,draft,predictions)=>{
    const input={task,draft,predictions},r=spawnSync(python,["-B",resolve("scripts/omega/benchmarks/replay-polynomial-identities.py"),"--verify-model"],
      {input:JSON.stringify(input),encoding:"utf8",timeout:timeoutMs,maxBuffer:262144,windowsHide:true});
    let decision:IndependentScientificDerivation["decision"]="INSUFFICIENT_EVIDENCE";
    try{
      if(r.error||r.status!==0)throw Error("unavailable");
      const result=JSON.parse(r.stdout);
      if(!result||typeof result!=="object"||Array.isArray(result)||Object.keys(result).sort().join("|")!=="checkedPoints|cpuMs|decision|elapsedMs|schemaVersion|scope"
        ||result.schemaVersion!==1||!["AGREES","DISAGREES"].includes(result.decision)||result.checkedPoints!==predictions.length
        ||result.scope!=="POINT_DERIVATIONS_NOT_CAUSAL_TRUTH"||![result.elapsedMs,result.cpuMs].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0))throw Error("contract");
      decision=result.decision;
    }catch{/* Unsupported replay is unknown, never a model reasoning failure. */}
    return{decision,verificationDigest:theoryDigest({inputDigest:theoryDigest(input),decision,verifier:"independent-original-rational-model-replay/1"})};
  };
}
