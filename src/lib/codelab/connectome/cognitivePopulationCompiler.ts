import {
  DIGITAL_NEURON_AUTHORITY,
  connectomeDigest,
  connectomeId,
  connectomeKeys,
  immutableConnectomeValue,
  safeInteger,
  validNeuronGenome,
  validPopulationGenome,
  validPopulationLimits,
  validPopulationPolicy,
  type CompiledPopulation,
  type DigitalNeuronGenome,
  type DigitalNeuronIdentity,
  type NeuronReplicationRequest,
  type NeuronSynapse,
  type PopulationBlueprint,
  type PopulationGenome,
  type SynapseProjectionRule,
} from "./digitalNeuronContracts";

interface MaterializedTemplate {
  readonly genome: DigitalNeuronGenome;
  readonly identities: readonly DigitalNeuronIdentity[];
}

function deterministicIndex(seed: string, modulus: number): number {
  if (modulus < 1) throw new Error("projection_target_population_empty");
  const digest = connectomeDigest(seed);
  return Number(BigInt(`0x${digest.slice(0, 13)}`) % BigInt(modulus));
}

function validReplication(replication: NeuronReplicationRequest, templateIds: ReadonlySet<string>): boolean {
  return Boolean(replication && connectomeKeys(replication,
    ["templateId", "count", "generation", "ordinalStride", "ordinalOffset"])
    && templateIds.has(replication.templateId)
    && safeInteger(replication.count, 1, 1_000_000) && safeInteger(replication.generation, 0, 1_000_000)
    && safeInteger(replication.ordinalStride, 1, Number.MAX_SAFE_INTEGER)
    && safeInteger(replication.ordinalOffset, 0, Number.MAX_SAFE_INTEGER));
}

function validProjection(rule: SynapseProjectionRule, templateIds: ReadonlySet<string>, maximumFanout: number): boolean {
  return Boolean(rule && connectomeKeys(rule, ["ruleId", "sourceTemplateId", "targetTemplateId", "targetCompartment",
    "signalKind", "relation", "weight", "delayCycles", "plastic", "fanout", "topology"])
    && connectomeId(rule.ruleId) && templateIds.has(rule.sourceTemplateId)
    && templateIds.has(rule.targetTemplateId)
    && ["SUPPORT", "CONTRADICTION", "CONTEXT", "NOVELTY", "UNCERTAINTY", "INHIBITION", "PREDICTION_ERROR"]
      .includes(rule.targetCompartment)
    && ["EVIDENCE", "EXCITATION", "INHIBITION", "CONTRADICTION", "UNCERTAINTY", "PREDICTION_ERROR", "REPLAY"]
      .includes(rule.signalKind)
    && ["SUPPORTS", "CONTRADICTS", "INHIBITS", "REFINES", "RECALLS", "PROPOSES"].includes(rule.relation)
    && typeof rule.weight === "number" && Number.isFinite(rule.weight) && rule.weight >= -16 && rule.weight <= 16
    && safeInteger(rule.delayCycles, 0, 1_000) && typeof rule.plastic === "boolean"
    && safeInteger(rule.fanout, 1, maximumFanout)
    && ["ONE_TO_ONE", "HASHED_SPARSE", "ALL_TO_ALL_BOUNDED", "RING"].includes(rule.topology));
}

function materializeTemplate(namespace: string, populationId: string, seed: string, capacity: bigint,
  genome: DigitalNeuronGenome, replication: NeuronReplicationRequest): MaterializedTemplate {
  const genomeDigest = connectomeDigest(genome);
  const identities: DigitalNeuronIdentity[] = [];
  for (let index = 0; index < replication.count; index += 1) {
    const ordinal = replication.ordinalOffset + index * replication.ordinalStride;
    if (!Number.isSafeInteger(ordinal) || BigInt(ordinal) >= capacity) throw new Error("neuron_address_capacity_exhausted");
    const neuronId = `${namespace}:neuron:${ordinal}`;
    const guardianId = `${namespace}:guardian:${ordinal}`;
    identities.push(immutableConnectomeValue({ neuronId, guardianId, populationId, ordinal,
      generation: replication.generation, genomeDigest,
      lineageDigest: connectomeDigest([populationId, seed, genome.templateId, ordinal, replication.generation]) }));
  }
  return { genome, identities: Object.freeze(identities) };
}

function targetsFor(sourceIndex: number, source: DigitalNeuronIdentity, targets: readonly DigitalNeuronIdentity[],
  rule: SynapseProjectionRule, seed: string): readonly DigitalNeuronIdentity[] {
  if (targets.length === 0) return [];
  const selected: DigitalNeuronIdentity[] = [];
  const seen = new Set<string>();
  const admit = (target: DigitalNeuronIdentity): void => {
    if (target.neuronId !== source.neuronId && !seen.has(target.neuronId)) {
      seen.add(target.neuronId);
      selected.push(target);
    }
  };
  switch (rule.topology) {
    case "ONE_TO_ONE":
      admit(targets[sourceIndex % targets.length]);
      break;
    case "RING": {
      const origin = targets.findIndex((target) => target.neuronId === source.neuronId);
      for (let offset = 1; offset <= rule.fanout; offset += 1) {
        admit(targets[((origin >= 0 ? origin : sourceIndex) + offset) % targets.length]);
      }
      break;
    }
    case "ALL_TO_ALL_BOUNDED":
      for (let offset = 0; offset < Math.min(rule.fanout, targets.length); offset += 1) {
        admit(targets[(sourceIndex + offset) % targets.length]);
      }
      break;
    case "HASHED_SPARSE":
      for (let offset = 0; offset < Math.min(rule.fanout, targets.length); offset += 1) {
        const start = deterministicIndex(`${seed}:${rule.ruleId}:${source.neuronId}:${offset}`, targets.length);
        for (let probe = 0; probe < targets.length && selected.length <= offset; probe += 1) {
          admit(targets[(start + probe) % targets.length]);
        }
      }
      break;
  }
  return Object.freeze(selected.slice(0, rule.fanout));
}

function compileProjection(rule: SynapseProjectionRule, source: MaterializedTemplate,
  target: MaterializedTemplate, seed: string): readonly NeuronSynapse[] {
  const synapses: NeuronSynapse[] = [];
  source.identities.forEach((sourceIdentity, sourceIndex) => {
    for (const targetIdentity of targetsFor(sourceIndex, sourceIdentity, target.identities, rule, seed)) {
      synapses.push(immutableConnectomeValue({
        synapseId: connectomeDigest([rule.ruleId, sourceIdentity.neuronId, targetIdentity.neuronId]),
        sourceId: sourceIdentity.neuronId, targetId: targetIdentity.neuronId,
        targetCompartment: rule.targetCompartment, signalKind: rule.signalKind,
        weight: rule.weight, delayCycles: rule.delayCycles, plastic: rule.plastic, relation: rule.relation,
      }));
    }
  });
  return Object.freeze(synapses);
}

function assertUniqueIdentities(identities: readonly DigitalNeuronIdentity[]): void {
  const ids = new Set<string>();
  const guardians = new Set<string>();
  const ordinals = new Set<number>();
  for (const identity of identities) {
    if (ids.has(identity.neuronId) || guardians.has(identity.guardianId) || ordinals.has(identity.ordinal)) {
      throw new Error("replicated_neuron_identity_collision");
    }
    ids.add(identity.neuronId);
    guardians.add(identity.guardianId);
    ordinals.add(identity.ordinal);
  }
}

function sortSynapses(synapses: readonly NeuronSynapse[], ordinalById: ReadonlyMap<string, number>): NeuronSynapse[] {
  return [...synapses].sort((left, right) => {
    const source = ordinalById.get(left.sourceId)! - ordinalById.get(right.sourceId)!;
    if (source !== 0) return source;
    const target = ordinalById.get(left.targetId)! - ordinalById.get(right.targetId)!;
    return target !== 0 ? target : left.synapseId.localeCompare(right.synapseId);
  });
}

function outgoingRanges(identities: readonly DigitalNeuronIdentity[], synapses: readonly NeuronSynapse[]):
readonly { readonly start: number; readonly end: number }[] {
  const first = new Map<string, number>();
  const end = new Map<string, number>();
  synapses.forEach((synapse, index) => {
    if (!first.has(synapse.sourceId)) first.set(synapse.sourceId, index);
    end.set(synapse.sourceId, index + 1);
  });
  return Object.freeze(identities.map((identity) => Object.freeze({
    start: first.get(identity.neuronId) ?? 0,
    end: end.get(identity.neuronId) ?? 0,
  })));
}

/**
 * Revalidates the compiler/runtime trust boundary. A CompiledPopulation is a
 * serializable artifact and must not become trusted merely because TypeScript
 * says it has the right shape.
 */
export function validCompiledPopulation(value: CompiledPopulation): boolean {
  try {
    if (!value || !connectomeKeys(value, ["populationId", "candidateBinding", "addressCapacity", "identities",
      "templateByOrdinal", "synapses", "limits", "policy", "authority", "populationDigest",
      "genomesByTemplate", "outgoingRanges"])
      || !connectomeId(value.populationId) || !/^[a-f0-9]{64}$/.test(value.populationDigest)
      || !/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(value.candidateBinding)
      || !/^[1-9][0-9]{0,29}$/.test(value.addressCapacity)
      || value.authority !== DIGITAL_NEURON_AUTHORITY || !validPopulationLimits(value.limits)
      || !validPopulationPolicy(value.policy) || !Array.isArray(value.identities)
      || !Array.isArray(value.templateByOrdinal) || !Array.isArray(value.synapses)
      || !Array.isArray(value.outgoingRanges)
      || value.identities.length < 1 || value.identities.length > value.limits.maximumMaterializedNeurons
      || value.templateByOrdinal.length !== value.identities.length
      || value.outgoingRanges.length !== value.identities.length
      || value.synapses.length > value.limits.maximumSynapses
      || !value.genomesByTemplate || typeof value.genomesByTemplate !== "object"
      || Array.isArray(value.genomesByTemplate)) return false;

    const templateKeys = Object.keys(value.genomesByTemplate);
    if (templateKeys.length < 1 || templateKeys.length > 1_024
      || !templateKeys.every((key) => connectomeId(key)
        && value.genomesByTemplate[key]?.templateId === key
        && validNeuronGenome(value.genomesByTemplate[key]))) return false;

    const capacity = BigInt(value.addressCapacity);
    const identityIds = new Set<string>();
    const guardianIds = new Set<string>();
    const ordinals = new Set<number>();
    let priorOrdinal = -1;
    for (let index = 0; index < value.identities.length; index += 1) {
      const identity = value.identities[index];
      const templateId = value.templateByOrdinal[index];
      const genome = value.genomesByTemplate[templateId];
      if (!identity || !connectomeKeys(identity, ["neuronId", "guardianId", "populationId", "ordinal",
        "generation", "genomeDigest", "lineageDigest"])
        || !connectomeId(identity.neuronId) || !connectomeId(identity.guardianId)
        || identity.populationId !== value.populationId || !safeInteger(identity.ordinal, 0, Number.MAX_SAFE_INTEGER)
        || identity.ordinal <= priorOrdinal || BigInt(identity.ordinal) >= capacity
        || !safeInteger(identity.generation, 0, 1_000_000) || !genome
        || identity.genomeDigest !== connectomeDigest(genome) || !/^[a-f0-9]{64}$/.test(identity.lineageDigest)
        || identityIds.has(identity.neuronId) || guardianIds.has(identity.guardianId)
        || ordinals.has(identity.ordinal)) return false;
      identityIds.add(identity.neuronId);
      guardianIds.add(identity.guardianId);
      ordinals.add(identity.ordinal);
      priorOrdinal = identity.ordinal;
    }

    const synapseIds = new Set<string>();
    for (const synapse of value.synapses) {
      if (!synapse || !connectomeKeys(synapse, ["synapseId", "sourceId", "targetId", "targetCompartment",
        "signalKind", "weight", "delayCycles", "plastic", "relation"])
        || !/^[a-f0-9]{64}$/.test(synapse.synapseId) || !identityIds.has(synapse.sourceId)
        || !identityIds.has(synapse.targetId)
        || !["SUPPORT", "CONTRADICTION", "CONTEXT", "NOVELTY", "UNCERTAINTY", "INHIBITION", "PREDICTION_ERROR"]
          .includes(synapse.targetCompartment)
        || !["EVIDENCE", "EXCITATION", "INHIBITION", "CONTRADICTION", "UNCERTAINTY", "PREDICTION_ERROR", "REPLAY"]
          .includes(synapse.signalKind)
        || typeof synapse.weight !== "number" || !Number.isFinite(synapse.weight)
        || synapse.weight < -16 || synapse.weight > 16 || !safeInteger(synapse.delayCycles, 0, 1_000)
        || typeof synapse.plastic !== "boolean"
        || !["SUPPORTS", "CONTRADICTS", "INHIBITS", "REFINES", "RECALLS", "PROPOSES"].includes(synapse.relation)
        || synapseIds.has(synapse.synapseId)) return false;
      synapseIds.add(synapse.synapseId);
    }

    const ordinalById = new Map(value.identities.map((identity, index) => [identity.neuronId, index]));
    const expectedSynapses = sortSynapses(value.synapses, ordinalById);
    if (expectedSynapses.some((synapse, index) => synapse.synapseId !== value.synapses[index].synapseId)) return false;
    const expectedRanges = outgoingRanges(value.identities, value.synapses);
    if (value.outgoingRanges.some((range, index) => !range
      || !connectomeKeys(range, ["start", "end"])
      || !safeInteger(range.start, 0, value.synapses.length)
      || !safeInteger(range.end, range.start, value.synapses.length)
      || range.start !== expectedRanges[index].start || range.end !== expectedRanges[index].end)) return false;

    const digestPayload = { populationId: value.populationId, candidateBinding: value.candidateBinding,
      addressCapacity: value.addressCapacity, identities: value.identities,
      templateByOrdinal: value.templateByOrdinal, synapses: value.synapses,
      limits: value.limits, policy: value.policy, authority: DIGITAL_NEURON_AUTHORITY };
    return value.populationDigest === connectomeDigest(digestPayload);
  } catch { return false; }
}

function validatedBlueprint(blueprint: PopulationBlueprint): PopulationGenome {
  if (!blueprint || !connectomeKeys(blueprint, ["genome", "replications", "projections"])
    || !validPopulationGenome(blueprint.genome)
    || !Array.isArray(blueprint.replications) || blueprint.replications.length < 1
    || !Array.isArray(blueprint.projections)) throw new Error("population_blueprint_invalid");
  const genome = blueprint.genome;
  const templateIds = new Set(genome.neuronTemplates.map((template) => template.templateId));
  if (!blueprint.replications.every((item) => validReplication(item, templateIds))
    || new Set(blueprint.replications.map((item) => item.templateId)).size !== blueprint.replications.length
    || !blueprint.projections.every((item) => validProjection(item, templateIds, genome.limits.maximumFanout))
    || new Set(blueprint.projections.map((item) => item.ruleId)).size !== blueprint.projections.length) {
    throw new Error("population_blueprint_invalid");
  }
  const requested = blueprint.replications.reduce((sum, item) => sum + item.count, 0);
  if (!Number.isSafeInteger(requested) || requested > genome.limits.maximumMaterializedNeurons) {
    throw new Error("population_resident_budget_exhausted");
  }
  const capacity = BigInt(genome.addressCapacity);
  for (const replication of blueprint.replications) {
    const lastOrdinal = BigInt(replication.ordinalOffset)
      + BigInt(replication.count - 1) * BigInt(replication.ordinalStride);
    if (lastOrdinal >= capacity || lastOrdinal > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("neuron_address_capacity_exhausted");
    }
  }
  return genome;
}

/**
 * Compiles a bounded resident population from a potentially enormous address
 * space. Compilation creates no model calls, tools, filesystem authority, or
 * autonomous background execution.
 */
export function compileCognitivePopulation(blueprint: PopulationBlueprint): CompiledPopulation {
  const genome = validatedBlueprint(blueprint);

  const capacity = BigInt(genome.addressCapacity);
  const genomesByTemplate = new Map(genome.neuronTemplates.map((template) => [template.templateId, template]));
  const populations = new Map<string, MaterializedTemplate>();
  for (const replication of blueprint.replications) {
    const template = genomesByTemplate.get(replication.templateId)!;
    populations.set(replication.templateId, materializeTemplate(genome.namespace, genome.populationId,
      genome.seed, capacity, template, replication));
  }
  const templateByIdentity = new Map<string, string>();
  for (const [templateId, population] of populations) {
    for (const identity of population.identities) templateByIdentity.set(identity.neuronId, templateId);
  }
  const identities = [...populations.values()].flatMap((population) => population.identities)
    .sort((left, right) => left.ordinal - right.ordinal);
  assertUniqueIdentities(identities);
  const identitySet = new Set(identities.map((identity) => identity.neuronId));

  const unsorted = blueprint.projections.flatMap((rule) => compileProjection(rule,
    populations.get(rule.sourceTemplateId)!, populations.get(rule.targetTemplateId)!, genome.seed));
  if (unsorted.length > genome.limits.maximumSynapses) throw new Error("population_synapse_budget_exhausted");
  const uniqueSynapses = new Set<string>();
  for (const synapse of unsorted) {
    if (!identitySet.has(synapse.sourceId) || !identitySet.has(synapse.targetId)
      || uniqueSynapses.has(synapse.synapseId)) throw new Error("population_synapse_invalid");
    uniqueSynapses.add(synapse.synapseId);
  }
  const ordinalById = new Map(identities.map((identity, index) => [identity.neuronId, index]));
  const synapses = sortSynapses(unsorted, ordinalById);
  const templateByOrdinal = identities.map((identity) => {
    const templateId = templateByIdentity.get(identity.neuronId);
    if (!templateId) throw new Error("population_template_binding_missing");
    return templateId;
  });
  const digestPayload = { populationId: genome.populationId, candidateBinding: genome.candidateBinding,
    addressCapacity: genome.addressCapacity, identities, templateByOrdinal, synapses,
    limits: genome.limits, policy: genome.policy, authority: DIGITAL_NEURON_AUTHORITY };
  return immutableConnectomeValue({ ...digestPayload, populationDigest: connectomeDigest(digestPayload),
    genomesByTemplate: Object.freeze(Object.fromEntries([...genomesByTemplate.entries()].map(([key, value]) =>
      [key, immutableConnectomeValue(value)]))), outgoingRanges: outgoingRanges(identities, synapses) });
}

export function estimatePopulationFootprint(blueprint: PopulationBlueprint): Readonly<{
  materializedNeurons: number;
  upperBoundSynapses: number;
  addressCapacity: string;
  materializationFraction: number;
  activeModelExecutions: 0;
  grantsAuthority: false;
}> {
  const genome = validatedBlueprint(blueprint);
  const materializedNeurons = blueprint.replications.reduce((sum, item) => sum + item.count, 0);
  const counts = new Map(blueprint.replications.map((item) => [item.templateId, item.count]));
  const upperBoundSynapses = blueprint.projections.reduce((sum, rule) =>
    sum + (counts.get(rule.sourceTemplateId) ?? 0) * rule.fanout, 0);
  const fraction = Number(BigInt(materializedNeurons) * 1_000_000_000n / BigInt(genome.addressCapacity)) / 1_000_000_000;
  return Object.freeze({ materializedNeurons, upperBoundSynapses, addressCapacity: genome.addressCapacity,
    materializationFraction: fraction, activeModelExecutions: 0, grantsAuthority: false });
}
