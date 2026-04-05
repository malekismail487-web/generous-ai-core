/**
 * crossDomainTransfer.ts — Cross-Domain Knowledge Transfer Engine
 * ================================================================
 * 
 * Maps skills, concepts, and error patterns across subjects.
 * When teaching a weak subject, leverages the student's strengths
 * in correlated subjects to create meaningful analogies and bridges.
 * 
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  SKILL TRANSFER GRAPH       │  ERROR TRANSFER DETECTOR          │
 * │  "Math → Physics"           │  "Fraction errors → likely        │
 * │  "English → History"        │   ratio errors in Chemistry"      │
 * ├─────────────────────────────┴──────────────────────────────────-┤
 * │  ACTIVE TRANSFER RECOMMENDER                                    │
 * │  "Use math analogies when teaching physics to this student"     │
 * └──────────────────────────────────────────────────────────────────┘
 */

// ============================================================================
//  TYPES
// ============================================================================

export interface SkillTransferLink {
  sourceSubject: string;
  targetSubject: string;
  sharedSkills: string[];
  /** Specific conceptual bridges */
  analogies: Array<{
    sourceConceptInSource: string;
    targetConceptInTarget: string;
    bridgeExplanation: string;
  }>;
  /** Error patterns that transfer */
  errorTransfers: Array<{
    sourceError: string;
    likelyTargetError: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

export interface CrossDomainRecommendation {
  /** Student's strongest correlated subject */
  leverageSubject: string;
  leverageAccuracy: number;
  /** Target weak subject being taught */
  targetSubject: string;
  targetAccuracy: number;
  /** Specific analogies to use */
  analogies: string[];
  /** Warnings about error transfer */
  errorWarnings: string[];
  /** Overall framing instruction */
  framingInstruction: string;
}

export interface CrossDomainGap {
  sourceSubject: string;
  sourceError: string;
  targetSubject: string;
  predictedError: string;
  severity: 'low' | 'medium' | 'high';
}

// ============================================================================
//  COMPREHENSIVE SKILL TRANSFER GRAPH
// ============================================================================

const TRANSFER_GRAPH: SkillTransferLink[] = [
  {
    sourceSubject: 'math',
    targetSubject: 'physics',
    sharedSkills: ['algebraic manipulation', 'proportional reasoning', 'graphing', 'unit conversion', 'problem decomposition'],
    analogies: [
      { sourceConceptInSource: 'linear equations', targetConceptInTarget: 'velocity-time relationships', bridgeExplanation: 'v = d/t is just y = mx + b where the slope is speed' },
      { sourceConceptInSource: 'quadratic equations', targetConceptInTarget: 'projectile motion', bridgeExplanation: 'The parabola you graph in math IS the path of a thrown ball' },
      { sourceConceptInSource: 'derivatives', targetConceptInTarget: 'instantaneous velocity', bridgeExplanation: 'The derivative gives rate of change — in physics, that\'s velocity from position' },
      { sourceConceptInSource: 'area under curve', targetConceptInTarget: 'work done by variable force', bridgeExplanation: 'Integration = area under curve = total work done' },
    ],
    errorTransfers: [
      { sourceError: 'sign errors in equations', likelyTargetError: 'direction errors in force diagrams', severity: 'high' },
      { sourceError: 'unit confusion', likelyTargetError: 'dimensional analysis mistakes', severity: 'high' },
      { sourceError: 'fraction manipulation errors', likelyTargetError: 'ratio and proportion errors in formulas', severity: 'medium' },
    ],
  },
  {
    sourceSubject: 'math',
    targetSubject: 'chemistry',
    sharedSkills: ['proportional reasoning', 'ratio calculations', 'scientific notation', 'logarithms'],
    analogies: [
      { sourceConceptInSource: 'ratios and proportions', targetConceptInTarget: 'stoichiometry', bridgeExplanation: 'Balancing chemical equations uses the same ratio skills as simplifying fractions' },
      { sourceConceptInSource: 'scientific notation', targetConceptInTarget: 'Avogadro\'s number', bridgeExplanation: 'Same notation, same rules — just with chemistry-sized numbers' },
      { sourceConceptInSource: 'logarithms', targetConceptInTarget: 'pH calculations', bridgeExplanation: 'pH = -log[H+] uses the exact same log rules from math class' },
    ],
    errorTransfers: [
      { sourceError: 'ratio/proportion confusion', likelyTargetError: 'stoichiometry mole ratio errors', severity: 'high' },
      { sourceError: 'exponent rule mistakes', likelyTargetError: 'scientific notation errors', severity: 'medium' },
    ],
  },
  {
    sourceSubject: 'math',
    targetSubject: 'economics',
    sharedSkills: ['graphing', 'slope interpretation', 'optimization', 'percentage calculations'],
    analogies: [
      { sourceConceptInSource: 'slope of a line', targetConceptInTarget: 'marginal cost/revenue', bridgeExplanation: 'The slope on a supply/demand curve IS the rate of change — same concept, economic context' },
      { sourceConceptInSource: 'optimization (max/min)', targetConceptInTarget: 'profit maximization', bridgeExplanation: 'Finding where derivative = 0 to maximize profit uses the same calculus technique' },
    ],
    errorTransfers: [
      { sourceError: 'graph reading errors', likelyTargetError: 'supply-demand curve misinterpretation', severity: 'medium' },
    ],
  },
  {
    sourceSubject: 'math',
    targetSubject: 'computer science',
    sharedSkills: ['logical reasoning', 'pattern recognition', 'algorithm design', 'binary/base conversion'],
    analogies: [
      { sourceConceptInSource: 'functions', targetConceptInTarget: 'programming functions', bridgeExplanation: 'f(x) = output is exactly what a function does in code: input → process → output' },
      { sourceConceptInSource: 'sets and logic', targetConceptInTarget: 'boolean algebra', bridgeExplanation: 'AND, OR, NOT in code follow the same truth tables as mathematical logic' },
    ],
    errorTransfers: [
      { sourceError: 'order of operations mistakes', likelyTargetError: 'operator precedence bugs in code', severity: 'medium' },
    ],
  },
  {
    sourceSubject: 'english',
    targetSubject: 'history',
    sharedSkills: ['reading comprehension', 'analytical writing', 'source evaluation', 'argument construction'],
    analogies: [
      { sourceConceptInSource: 'thesis statement', targetConceptInTarget: 'historical argument', bridgeExplanation: 'Writing a history essay uses the same thesis-evidence-conclusion structure as English essays' },
      { sourceConceptInSource: 'analyzing author\'s purpose', targetConceptInTarget: 'analyzing historical source bias', bridgeExplanation: 'Same skill — asking "Why did this person write this? What\'s their agenda?"' },
    ],
    errorTransfers: [
      { sourceError: 'weak thesis statements', likelyTargetError: 'unfocused historical arguments', severity: 'medium' },
      { sourceError: 'poor evidence integration', likelyTargetError: 'weak use of primary sources', severity: 'medium' },
    ],
  },
  {
    sourceSubject: 'english',
    targetSubject: 'arabic',
    sharedSkills: ['grammar analysis', 'reading comprehension', 'essay structure', 'literary analysis'],
    analogies: [
      { sourceConceptInSource: 'parts of speech', targetConceptInTarget: 'أقسام الكلام', bridgeExplanation: 'Nouns, verbs, and adjectives exist in both — Arabic just has different declension patterns' },
      { sourceConceptInSource: 'sentence structure', targetConceptInTarget: 'الجملة الفعلية والاسمية', bridgeExplanation: 'Both languages have sentence types — Arabic distinguishes verbal vs. nominal sentences' },
    ],
    errorTransfers: [],
  },
  {
    sourceSubject: 'biology',
    targetSubject: 'chemistry',
    sharedSkills: ['molecular thinking', 'systems understanding', 'classification', 'cause-effect analysis'],
    analogies: [
      { sourceConceptInSource: 'enzyme catalysis', targetConceptInTarget: 'chemical catalysts', bridgeExplanation: 'Enzymes ARE catalysts — they lower activation energy, same concept in biological context' },
      { sourceConceptInSource: 'cellular respiration', targetConceptInTarget: 'redox reactions', bridgeExplanation: 'Cellular respiration IS a series of redox reactions — electrons transfer just like in chemistry' },
      { sourceConceptInSource: 'DNA base pairing', targetConceptInTarget: 'hydrogen bonding', bridgeExplanation: 'A-T and G-C pair through hydrogen bonds — the same intermolecular force from chemistry' },
    ],
    errorTransfers: [
      { sourceError: 'confusion about organic molecules', likelyTargetError: 'organic chemistry nomenclature errors', severity: 'medium' },
    ],
  },
  {
    sourceSubject: 'physics',
    targetSubject: 'chemistry',
    sharedSkills: ['atomic model understanding', 'energy concepts', 'wave behavior'],
    analogies: [
      { sourceConceptInSource: 'electron orbitals (quantum)', targetConceptInTarget: 'electron configuration', bridgeExplanation: 'Same electrons, same orbitals — physics describes the math, chemistry uses it for bonding' },
      { sourceConceptInSource: 'electromagnetic spectrum', targetConceptInTarget: 'spectroscopy', bridgeExplanation: 'Spectroscopy uses the EM spectrum you learned in physics to identify chemical elements' },
    ],
    errorTransfers: [
      { sourceError: 'energy conservation confusion', likelyTargetError: 'thermochemistry sign errors', severity: 'medium' },
    ],
  },
  {
    sourceSubject: 'history',
    targetSubject: 'geography',
    sharedSkills: ['spatial reasoning', 'cause-effect chains', 'cultural understanding'],
    analogies: [
      { sourceConceptInSource: 'colonial boundaries', targetConceptInTarget: 'political geography', bridgeExplanation: 'Modern borders often follow colonial lines — history explains why the map looks this way' },
    ],
    errorTransfers: [],
  },
  {
    sourceSubject: 'physics',
    targetSubject: 'biology',
    sharedSkills: ['systems thinking', 'energy flow', 'measurement'],
    analogies: [
      { sourceConceptInSource: 'pressure and fluid dynamics', targetConceptInTarget: 'blood circulation', bridgeExplanation: 'Blood pressure follows the same fluid dynamics principles — P = F/A applies to arteries too' },
      { sourceConceptInSource: 'optics (lenses)', targetConceptInTarget: 'the eye and vision', bridgeExplanation: 'The eye IS an optical system — cornea and lens focus light just like convex lenses in physics' },
    ],
    errorTransfers: [],
  },
];

const STORAGE_KEY = 'lumina_cross_domain_gaps';

// ============================================================================
//  GAP STORAGE
// ============================================================================

function getStoredGaps(): CrossDomainGap[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function storeGaps(gaps: CrossDomainGap[]): void {
  try {
    if (gaps.length > 50) gaps.splice(0, gaps.length - 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gaps));
  } catch { /* ignore */ }
}

// ============================================================================
//  ERROR TRANSFER DETECTION
// ============================================================================

/**
 * When a student makes an error in one subject, check if that error pattern
 * likely transfers to other subjects. Creates cross-domain gaps.
 */
export function detectErrorTransfer(params: {
  subject: string;
  errorDescription: string;
  topic: string;
}): CrossDomainGap[] {
  const subjectLower = params.subject.toLowerCase();
  const newGaps: CrossDomainGap[] = [];
  const errorLower = params.errorDescription.toLowerCase();

  for (const link of TRANSFER_GRAPH) {
    const isSource = link.sourceSubject === subjectLower;
    const isTarget = link.targetSubject === subjectLower;
    if (!isSource && !isTarget) continue;

    const transfers = link.errorTransfers;
    for (const transfer of transfers) {
      const sourceErr = isSource ? transfer.sourceError : transfer.likelyTargetError;
      const targetErr = isSource ? transfer.likelyTargetError : transfer.sourceError;
      const targetSubj = isSource ? link.targetSubject : link.sourceSubject;

      // Check if the error description matches the source error pattern
      const sourceWords = sourceErr.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const matchCount = sourceWords.filter(w => errorLower.includes(w)).length;
      if (matchCount >= 2 || (sourceWords.length <= 2 && matchCount >= 1)) {
        newGaps.push({
          sourceSubject: subjectLower,
          sourceError: params.errorDescription,
          targetSubject: targetSubj,
          predictedError: targetErr,
          severity: transfer.severity,
        });
      }
    }
  }

  if (newGaps.length > 0) {
    const existing = getStoredGaps();
    // Deduplicate
    for (const gap of newGaps) {
      const isDupe = existing.some(
        e => e.sourceSubject === gap.sourceSubject &&
             e.targetSubject === gap.targetSubject &&
             e.predictedError === gap.predictedError
      );
      if (!isDupe) existing.push(gap);
    }
    storeGaps(existing);
  }

  return newGaps;
}

// ============================================================================
//  RECOMMENDATION ENGINE
// ============================================================================

/**
 * Generate cross-domain transfer recommendations for teaching a subject.
 */
export function getCrossDomainRecommendations(params: {
  targetSubject: string;
  subjectAccuracies: Record<string, number>; // subject → accuracy percentage
}): CrossDomainRecommendation[] {
  const targetLower = params.targetSubject.toLowerCase();
  const targetAccuracy = params.subjectAccuracies[targetLower] || 50;
  const recommendations: CrossDomainRecommendation[] = [];

  // Find all transfer links involving the target subject
  for (const link of TRANSFER_GRAPH) {
    const isTarget = link.targetSubject === targetLower;
    const isSource = link.sourceSubject === targetLower;
    if (!isTarget && !isSource) continue;

    const otherSubject = isTarget ? link.sourceSubject : link.targetSubject;
    const otherAccuracy = params.subjectAccuracies[otherSubject];
    
    if (otherAccuracy === undefined) continue;
    if (otherAccuracy <= targetAccuracy) continue; // only leverage stronger subjects

    const analogies = link.analogies.map(a => {
      const src = isTarget ? a.sourceConceptInSource : a.targetConceptInTarget;
      const tgt = isTarget ? a.targetConceptInTarget : a.sourceConceptInSource;
      return `Use "${src}" (${otherSubject}) to explain "${tgt}" (${targetLower}): ${a.bridgeExplanation}`;
    });

    const gaps = getStoredGaps().filter(g => g.targetSubject === targetLower);
    const errorWarnings = gaps.map(
      g => `⚠️ "${g.sourceError}" in ${g.sourceSubject} → likely "${g.predictedError}" in ${targetLower} [${g.severity}]`
    );

    // Add error transfer warnings from the link itself
    for (const et of link.errorTransfers) {
      if (isTarget) {
        errorWarnings.push(`Watch for: "${et.sourceError}" (${otherSubject}) may cause "${et.likelyTargetError}" (${targetLower})`);
      }
    }

    const strengthDiff = otherAccuracy - targetAccuracy;
    let framingInstruction = '';
    if (strengthDiff > 30) {
      framingInstruction = `Student excels at ${otherSubject} (${otherAccuracy}%) but struggles with ${targetLower} (${targetAccuracy}%). HEAVILY leverage ${otherSubject} concepts, vocabulary, and analogies when teaching ${targetLower}. Frame ${targetLower} concepts in ${otherSubject} terms.`;
    } else if (strengthDiff > 15) {
      framingInstruction = `Student is stronger in ${otherSubject} (${otherAccuracy}%) than ${targetLower} (${targetAccuracy}%). Use occasional ${otherSubject} analogies to bridge understanding.`;
    } else {
      framingInstruction = `Moderate correlation between ${otherSubject} and ${targetLower}. Use shared skill connections when naturally relevant.`;
    }

    recommendations.push({
      leverageSubject: otherSubject,
      leverageAccuracy: otherAccuracy,
      targetSubject: targetLower,
      targetAccuracy,
      analogies: analogies.slice(0, 3),
      errorWarnings: errorWarnings.slice(0, 3),
      framingInstruction,
    });
  }

  return recommendations.sort((a, b) => b.leverageAccuracy - a.leverageAccuracy);
}

// ============================================================================
//  CONTEXT GENERATION
// ============================================================================

/**
 * Generate cross-domain transfer context for AI prompt injection.
 */
export function getCrossDomainContextPrompt(params: {
  targetSubject: string;
  subjectAccuracies: Record<string, number>;
}): string {
  const recs = getCrossDomainRecommendations(params);
  if (recs.length === 0) return '';

  const sections: string[] = [];
  sections.push(`## CROSS-DOMAIN KNOWLEDGE TRANSFER`);

  for (const rec of recs.slice(0, 3)) {
    sections.push(`\n### ${rec.leverageSubject} (${rec.leverageAccuracy}%) → ${rec.targetSubject} (${rec.targetAccuracy}%)`);
    sections.push(rec.framingInstruction);

    if (rec.analogies.length > 0) {
      sections.push(`Bridge analogies:`);
      for (const a of rec.analogies) {
        sections.push(`- ${a}`);
      }
    }

    if (rec.errorWarnings.length > 0) {
      sections.push(`Error transfer warnings:`);
      for (const w of rec.errorWarnings) {
        sections.push(`- ${w}`);
      }
    }
  }

  return sections.join('\n');
}
