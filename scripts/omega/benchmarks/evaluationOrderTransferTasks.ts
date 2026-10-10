import type { RepresentationTask } from "./sourceRepresentationTasks";

export function evaluationOrderTransferConfiguration(variant: string) {
  if (!["GUARDED_V2_CONTROL", "EVALUATION_ORDER_PROPOSALS"].includes(variant)) throw Error("unknown_evaluation_order_arm");
  return { providerIntentShape: "DECISION_REQUIRED_FIELDS_AND_LENGTHS" as const,
    comparisonReasoningControl: "SUPER_HOSTED_NATIVE" as const, comparisonInferencePolicy: "CONSTRAINED_JSON" as const,
    qualityRepairGuidance: "STRUCTURE_SITES" as const, structuralBudgetGuidance: "PUBLIC_ORIGINAL_STATE" as const,
    localRefactorGuidance: variant === "GUARDED_V2_CONTROL" ? "GUARDED_PROPOSALS" as const : "EVALUATION_ORDER_PROPOSALS" as const };
}

export function evaluationOrderWireControlVerified(variant: string, controls: readonly {
  qualityRepairPhase?: boolean; localProposalsPresented?: boolean; localProposalCount?: number;
  localProposalVersion?: string | null;
}[]): boolean {
  evaluationOrderTransferConfiguration(variant);
  const version = variant === "GUARDED_V2_CONTROL" ? "nyx-local-refactor-proposals/2" : "nyx-local-refactor-proposals/3";
  return controls.length > 0 && controls.every(control => typeof control.qualityRepairPhase === "boolean"
    && Number.isSafeInteger(control.localProposalCount) && control.localProposalCount! >= 0
    && control.localProposalsPresented === (control.qualityRepairPhase && control.localProposalCount! > 0)
    && (control.localProposalsPresented ? control.localProposalVersion === version
      : control.localProposalCount === 0 && control.localProposalVersion === null));
}

// Freeze before first live inference. No seeds, implementation hints, exposed
// benchmark questions, task-specific proposer rules or evaluator feedback to NYX.
// Small transfer evidence is not a frontier benchmark or broad cognition claim.
export const EVALUATION_ORDER_TRANSFER_TASKS: readonly RepresentationTask[] = [
  {id:"QUOTE-DISCOUNT-TAX",tier:"DEVELOPMENT",domain:"ORDERED_DECIMAL_COMPOSITION",
    objective:"Implement transform(input) for {price,quantity,discountPercent,taxPercent,fee}. All inputs are finite nonnegative numbers, quantity is an integer at most 100, and discountPercent is between 0 and 100. First multiply price by quantity; apply the percentage discount to that subtotal; apply taxPercent to the discounted subtotal; add fee only after tax; finally return the resulting amount rounded by Math.round(amount*100)/100. Do not round intermediate steps. Preserve inputs and the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:{price:80,quantity:3,discountPercent:25,taxPercent:10,fee:5},expected:203},
      {input:{price:0,quantity:9,discountPercent:0,taxPercent:5,fee:2},expected:2}],
    privateCases:[{input:{price:12.5,quantity:4,discountPercent:10,taxPercent:20,fee:1.5},expected:55.5},
      {input:{price:99.95,quantity:2,discountPercent:0,taxPercent:0,fee:0},expected:199.9},
      {input:{price:200,quantity:0,discountPercent:50,taxPercent:15,fee:3},expected:3},
      {input:{price:50,quantity:1,discountPercent:100,taxPercent:80,fee:0},expected:0},
      {input:{price:7.77,quantity:3,discountPercent:5,taxPercent:10,fee:0.25},expected:24.61},
      {input:{price:1,quantity:1,discountPercent:0,taxPercent:2.5,fee:0},expected:1.02}]},
  {id:"QUADRATIC-DRAG-UNITS",tier:"DEVELOPMENT",domain:"PHYSICAL_UNIT_COMPOSITION",
    objective:"Implement transform(input) for {speedKmh,density,dragCoefficient,area}. All inputs are finite nonnegative numbers. Convert speedKmh to metres per second by dividing by 3.6; compute quadratic aerodynamic force in newtons as 0.5*density*speedMps*speedMps*dragCoefficient*area; return Math.round(force*1000)/1000. Inputs are bounded so every intermediate is finite. This is an idealized arithmetic model, not a physical simulation. Preserve inputs and the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:{speedKmh:36,density:1.2,dragCoefficient:0.5,area:2},expected:60},
      {input:{speedKmh:0,density:2,dragCoefficient:1,area:3},expected:0}],
    privateCases:[{input:{speedKmh:18,density:1.2,dragCoefficient:0.4,area:2},expected:12},
      {input:{speedKmh:72,density:1,dragCoefficient:0.25,area:4},expected:200},
      {input:{speedKmh:3.6,density:1.225,dragCoefficient:0.7,area:0.3},expected:0.129},
      {input:{speedKmh:54,density:0,dragCoefficient:4,area:8},expected:0},
      {input:{speedKmh:90,density:1.6,dragCoefficient:0.8,area:1.5},expected:600},
      {input:{speedKmh:10.8,density:2,dragCoefficient:0.5,area:1},expected:4.5}]},
  {id:"NOISY-CHANNEL-CAPACITY",tier:"VALIDATION",domain:"LOGARITHMIC_RATE_COMPOSITION",
    objective:"Implement transform(input) for {bandwidth,signal,noise,efficiency,overhead}. All numbers are finite; bandwidth and signal are nonnegative, noise is strictly positive, efficiency is between 0 and 1, and overhead is nonnegative. Compute bandwidth*log2(1+signal/noise) in bits per second, multiply by efficiency, subtract overhead, clamp the resulting usable rate at zero, then round with Math.round(rate*1000)/1000. Inputs are bounded so every intermediate is finite. Preserve inputs and the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:{bandwidth:100,signal:7,noise:1,efficiency:0.8,overhead:10},expected:230},
      {input:{bandwidth:5,signal:0,noise:2,efficiency:1,overhead:7},expected:0}],
    privateCases:[{input:{bandwidth:4,signal:15,noise:1,efficiency:0.5,overhead:1},expected:7},
      {input:{bandwidth:2.5,signal:3,noise:1,efficiency:1,overhead:0},expected:5},
      {input:{bandwidth:9,signal:1,noise:1,efficiency:0,overhead:0},expected:0},
      {input:{bandwidth:0,signal:31,noise:1,efficiency:1,overhead:0},expected:0},
      {input:{bandwidth:1,signal:1,noise:2,efficiency:1,overhead:0},expected:0.585},
      {input:{bandwidth:2,signal:3,noise:1,efficiency:0.25,overhead:2},expected:0}]},
  {id:"ROOT-MEAN-SQUARE",tier:"VALIDATION",domain:"NONLINEAR_STATISTICAL_AGGREGATION",
    objective:"Implement transform(input) for an array of at most 100 finite numbers of magnitude at most 1000. Return the root mean square: square each value, average those squares over the full number of entries, take the square root, and return Math.round(result*1000)/1000. Negative values and zeros count normally; empty input returns null. Preserve input and the ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.",
    publicCases:[{input:[3,4],expected:3.536},{input:[-5,5],expected:5}],
    privateCases:[{input:[],expected:null},{input:[0],expected:0},{input:[-7],expected:7},
      {input:[1,2,3],expected:2.16},{input:[0,0,9],expected:5.196},
      {input:[0.5,-0.5],expected:0.5},{input:[1000,-1000,1000,-1000],expected:1000}]},
];
