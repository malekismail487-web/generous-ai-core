/**
 * conceptInference.ts — map a question to a curriculum concept ID.
 *
 * Per-concept theta needs every graded answer tagged with a concept. Rather
 * than requiring every caller (assignments, exams, probes, practice) to pass
 * a concept manually, we infer it from the question text by keyword-matching
 * against the curriculum graphs defined in `conceptGraph.ts`.
 *
 * Concept IDs are stable strings of the form `"<subject>:<concept>"` — the
 * exact same shape used by the conceptGraph module, so downstream analytics
 * can join cleanly.
 *
 * Inference is intentionally conservative: if nothing matches confidently,
 * we return `null` and the engine falls back to subject-level theta only.
 * That's safer than mis-tagging — a wrong concept poisons that concept's
 * estimate for many answers to come.
 */

// Mirror of the concept lists in conceptGraph.ts. Kept in sync manually
// because importing the full graph here would create a heavier dep cycle
// for a hot path. If you add a concept to CURRICULUM_GRAPHS, add its
// keywords here too.
const CONCEPT_KEYWORDS: Record<string, Record<string, string[]>> = {
  math: {
    counting: ["count", "how many"],
    addition: ["add", "sum", "plus", "+"],
    subtraction: ["subtract", "minus", "difference", "-"],
    multiplication: ["multiply", "product", "times", "×", "x ="],
    division: ["divide", "quotient", "÷"],
    fractions: ["fraction", "numerator", "denominator", "/"],
    decimals: ["decimal", "tenth", "hundredth"],
    percentages: ["percent", "%", "percentage"],
    ratios: ["ratio", "proportion"],
    integers: ["integer", "negative number", "positive number"],
    "order of operations": ["pemdas", "bodmas", "order of operations"],
    variables: ["variable", "let x", "let y", "unknown"],
    "linear equations": ["linear equation", "solve for x", "y = mx", "slope"],
    inequalities: ["inequality", "≤", "≥", "less than or equal"],
    exponents: ["exponent", "power of", "squared", "cubed", "^"],
    polynomials: ["polynomial", "binomial", "trinomial"],
    factoring: ["factor", "factorise", "factorize"],
    "quadratic equations": ["quadratic", "parabola", "ax^2"],
    functions: ["f(x)", "function", "domain", "range"],
    graphing: ["graph", "plot", "axis", "coordinate"],
    "systems of equations": ["system of equations", "simultaneous"],
    trigonometry: ["sin", "cos", "tan", "trigonometr", "triangle"],
    logarithms: ["logarithm", "log(", "ln(", "log_"],
    "sequences and series": ["sequence", "series", "arithmetic progression", "geometric progression"],
    limits: ["limit", "lim ", "approaches"],
    derivatives: ["derivative", "differentiate", "d/dx", "f'(x)"],
    integrals: ["integral", "integrate", "∫", "antiderivative"],
    "differential equations": ["differential equation", "dy/dx ="],
  },
  physics: {
    "measurement and units": ["si unit", "metre", "meter", "kilogram", "measurement"],
    motion: ["distance", "displacement", "motion"],
    "speed and velocity": ["speed", "velocity", "m/s"],
    acceleration: ["acceleration", "m/s^2", "deceleration"],
    forces: ["force", "newton", "n =", "applied force"],
    "newton's laws": ["newton's law", "first law", "second law", "third law"],
    friction: ["friction", "coefficient of friction"],
    gravity: ["gravity", "gravitational", "9.8", "9.81", "free fall"],
    "work and energy": ["work done", "kinetic energy", "potential energy", "joule"],
    momentum: ["momentum", "impulse"],
    "circular motion": ["circular motion", "centripetal", "orbit"],
    waves: ["wave", "wavelength", "frequency", "amplitude"],
    sound: ["sound", "decibel", "pitch"],
    light: ["light", "reflection", "refraction", "lens", "mirror"],
    electricity: ["voltage", "current", "ohm", "resistor", "ampere"],
    circuits: ["circuit", "series circuit", "parallel circuit"],
    magnetism: ["magnet", "magnetic field", "tesla"],
    "electromagnetic induction": ["induction", "faraday", "emf"],
    thermodynamics: ["heat", "temperature", "entropy", "thermodynamic"],
    "nuclear physics": ["nucleus", "radioactive", "isotope", "fission", "fusion"],
  },
  chemistry: {
    "matter and its properties": ["matter", "property of matter"],
    "atomic structure": ["atom", "proton", "neutron", "electron shell"],
    "periodic table": ["periodic table", "group ", "period "],
    "electron configuration": ["electron configuration", "orbital", "1s2"],
    "chemical bonding": ["bond", "bonding"],
    "ionic bonds": ["ionic bond", "ionic compound", "cation", "anion"],
    "covalent bonds": ["covalent", "shared electron"],
    "chemical formulas": ["chemical formula", "h2o", "co2", "nacl"],
    "chemical reactions": ["chemical reaction", "reactant", "product of reaction"],
    "balancing equations": ["balance the equation", "balanced equation"],
    moles: ["mole ", "moles", "avogadro"],
    stoichiometry: ["stoichiometry", "limiting reagent"],
    "states of matter": ["solid", "liquid", "gas", "state of matter"],
    "gas laws": ["boyle", "charles' law", "ideal gas", "pv = nrt"],
    solutions: ["solute", "solvent", "concentration", "molarity"],
    "acids and bases": ["acid", "base", "ph ", "neutralis"],
    "redox reactions": ["redox", "oxidation", "reduction"],
    thermochemistry: ["enthalpy", "exothermic", "endothermic"],
    equilibrium: ["equilibrium", "le chatelier"],
    "organic chemistry": ["alkane", "alkene", "alcohol", "organic compound", "hydrocarbon"],
  },
  biology: {
    "characteristics of life": ["characteristics of life", "living thing"],
    "cell theory": ["cell theory"],
    "cell structure": ["cell structure", "nucleus", "cytoplasm"],
    "cell membrane": ["cell membrane", "plasma membrane", "phospholipid"],
    organelles: ["organelle", "mitochondri", "ribosome", "golgi"],
    "cell division (mitosis)": ["mitosis", "cell division"],
    "dna structure": ["dna", "double helix", "nucleotide"],
    "dna replication": ["dna replication", "helicase"],
    "protein synthesis": ["transcription", "translation", "mrna", "trna", "protein synthesis"],
    "genetics (mendelian)": ["mendel", "punnett", "allele", "genotype", "phenotype"],
    meiosis: ["meiosis", "gamete"],
    "inheritance patterns": ["inheritance", "dominant", "recessive"],
    evolution: ["evolution", "common ancestor"],
    "natural selection": ["natural selection", "fitness", "adaptation"],
    photosynthesis: ["photosynthesis", "chlorophyll"],
    "cellular respiration": ["cellular respiration", "atp", "krebs", "glycolysis"],
    "ecology basics": ["ecology", "habitat", "niche"],
    ecosystems: ["ecosystem", "food chain", "food web"],
    "human body systems": ["digestive", "circulatory", "respiratory system", "nervous system"],
    "molecular biology": ["enzyme", "molecular biology"],
  },
};

const SUBJECT_ALIASES: Record<string, string> = {
  math: "math",
  mathematics: "math",
  maths: "math",
  algebra: "math",
  calculus: "math",
  geometry: "math",
  physics: "physics",
  chemistry: "chemistry",
  chem: "chemistry",
  biology: "biology",
  bio: "biology",
};

function normaliseSubject(subject: string): string | null {
  const key = subject.trim().toLowerCase();
  return SUBJECT_ALIASES[key] ?? (CONCEPT_KEYWORDS[key] ? key : null);
}

export interface ConceptWeight {
  conceptId: string;
  weight: number;     // 0..1, weights in a distribution sum to 1
  rawScore: number;   // unnormalised keyword score, useful for debugging / gating
}

/**
 * Soft concept distribution (top-K). Real questions are multi-skill; a single
 * label throws away information and lets one mistake poison the wrong concept
 * estimate. We return the top-K matching concepts with normalised weights so
 * the IRT update can credit each one proportionally.
 *
 * Returns `[]` when nothing matches above the noise floor — caller should
 * fall back to subject-level theta only.
 */
export function inferConceptDistribution(
  subject: string,
  questionText: string,
  topK = 2,
): ConceptWeight[] {
  const subj = normaliseSubject(subject);
  if (!subj) return [];
  const concepts = CONCEPT_KEYWORDS[subj];
  if (!concepts) return [];

  const text = questionText.toLowerCase();
  const scored: { conceptId: string; rawScore: number }[] = [];

  for (const [concept, keywords] of Object.entries(concepts)) {
    let score = 0;
    for (const kw of keywords) {
      if (kw.length < 2) continue;
      if (text.includes(kw)) score += kw.length * kw.length;
    }
    if (text.includes(concept)) score += concept.length * concept.length * 1.5;
    if (score >= 9) {
      scored.push({ conceptId: `${subj}:${concept}`, rawScore: score });
    }
  }

  if (!scored.length) return [];
  scored.sort((a, b) => b.rawScore - a.rawScore);
  const top = scored.slice(0, Math.max(1, topK));
  const sum = top.reduce((s, c) => s + c.rawScore, 0);
  return top.map((c) => ({
    conceptId: c.conceptId,
    rawScore: c.rawScore,
    weight: Number((c.rawScore / sum).toFixed(3)),
  }));
}

/**
 * Backwards-compatible single-concept inference. Returns the dominant concept
 * from the distribution, or null if no concept matches.
 */
export function inferConceptId(
  subject: string,
  questionText: string,
): string | null {
  const dist = inferConceptDistribution(subject, questionText, 1);
  return dist[0]?.conceptId ?? null;
}

/** Human-readable concept name from an id like "math:linear equations". */
export function conceptIdToName(conceptId: string): string {
  const idx = conceptId.indexOf(":");
  return idx === -1 ? conceptId : conceptId.slice(idx + 1);
}
