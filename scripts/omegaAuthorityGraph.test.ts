import { OMEGA_AUTHORITY_GRAPH_001, analyzeAuthorityClosure, validateAuthorityGraph, type AuthorityGraph } from "../src/lib/codelab/assurance/authorityGraph";
let passed=0; let failed=0; const failures:string[]=[]; function assert(v:unknown,l:string):void{if(v)passed+=1;else{failed+=1;failures.push(l);console.error(`  x ${l}`)}}
assert(validateAuthorityGraph(OMEGA_AUTHORITY_GRAPH_001).length === 0, "institutional authority graph is structurally valid");
const r1 = analyzeAuthorityClosure(OMEGA_AUTHORITY_GRAPH_001, ["READ_REPOSITORY"]);
assert(r1.decision === "ACCEPT" && r1.effectiveAuthorities.join() === "READ_REPOSITORY", "R1 closes only to explicitly granted read authority");
const future = analyzeAuthorityClosure(OMEGA_AUTHORITY_GRAPH_001, ["READ_REPOSITORY","PROVISION_SANDBOX","TERMINATE_SANDBOX"], ["R2_A_AUTHORIZATION"]);
assert(future.decision === "ACCEPT" && !future.effectiveAuthorities.includes("WRITE_SANDBOX_CONTENT"), "provisioning does not imply content writing");
assert(future.boundaries.length === 2 && future.expiries.length === 2, "future R2-A authorities retain ownership and lifetime boundaries");
assert(analyzeAuthorityClosure(OMEGA_AUTHORITY_GRAPH_001, ["PROVISION_SANDBOX"]).decision === "REJECT", "missing R2-A authorization rejects provisioning closure");
assert(analyzeAuthorityClosure(OMEGA_AUTHORITY_GRAPH_001, ["PROVISION_SANDBOX","WRITE_REPOSITORY"], ["R2_A_AUTHORIZATION"]).decision === "REJECT", "forbidden authority in closure rejects composition");
const implying: AuthorityGraph = { ...OMEGA_AUTHORITY_GRAPH_001, edges: [...OMEGA_AUTHORITY_GRAPH_001.edges, { from:"PROVISION_SANDBOX", relation:"IMPLIES", to:"WRITE_SANDBOX_CONTENT" }] };
assert(analyzeAuthorityClosure(implying, ["PROVISION_SANDBOX"], ["R2_A_AUTHORIZATION"]).effectiveAuthorities.includes("WRITE_SANDBOX_CONTENT"), "only an explicit implication can expand effective authority");
const malformed: AuthorityGraph = { ...OMEGA_AUTHORITY_GRAPH_001, edges: [...OMEGA_AUTHORITY_GRAPH_001.edges, { from:"MISSING", relation:"IMPLIES", to:"SHELL" }] };
assert(analyzeAuthorityClosure(malformed, ["READ_REPOSITORY"]).decision === "INSUFFICIENT_EVIDENCE", "malformed authority graph cannot support closure assurance");
assert(!future.grantsAuthority, "closure analysis never grants authority");
console.log(`Omega authority graph tests - passed: ${passed}, failed: ${failed}`); if(failed){for(const f of failures)console.error(`  - ${f}`);process.exit(1)}
