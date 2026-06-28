import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildConceptKey, pickBinding, type BindingCandidate } from "./curriculumBinding.ts";

Deno.test("conceptKey prefers conceptId when present", () => {
  assertEquals(buildConceptKey({ schoolId:null, subject:"math", topic:"fractions", conceptId:"abc" }), "abc");
});

Deno.test("conceptKey falls back to subject::topic, lowercased and *-padded", () => {
  assertEquals(buildConceptKey({ schoolId:null, subject:"MATH", topic:"  " }), "math::*");
  assertEquals(buildConceptKey({ schoolId:null, subject:"Math", topic:"Fractions" }), "math::fractions");
});

const c = (s: string, o: string|null, str: number): BindingCandidate => ({
  standardId: "s-"+s, objectiveId: o ? "o-"+o : null,
  standardCode: s, objectiveCode: o, framework: "F",
  textbookReference: null, alignmentStrength: str, rationale: null,
});

Deno.test("pickBinding returns null on empty", () => {
  assertEquals(pickBinding([]), null);
});

Deno.test("pickBinding chooses highest alignment strength", () => {
  const picked = pickBinding([c("A","x",0.4), c("B","y",0.9), c("C","z",0.6)]);
  assertEquals(picked!.standardCode, "B");
});

Deno.test("pickBinding tie-breaks by standardCode then objectiveCode", () => {
  const picked = pickBinding([
    c("B","y",0.8), c("A","z",0.8), c("A","a",0.8),
  ]);
  assertEquals(picked!.standardCode, "A");
  assertEquals(picked!.objectiveCode, "a");
});

Deno.test("pickBinding is deterministic across permutations", () => {
  const set = [c("X","1",0.5), c("Y","2",0.7), c("Z","3",0.7), c("Y","1",0.7)];
  const a = pickBinding(set);
  const b = pickBinding([...set].reverse());
  assertEquals(a, b);
});
