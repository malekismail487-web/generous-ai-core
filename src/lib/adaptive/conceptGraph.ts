/**
 * conceptGraph.ts — Concept Dependency Graph & Curriculum Position Tracker
 * ========================================================================
 * 
 * Maps the relationships between concepts within and across subjects,
 * creating a graph of prerequisites and dependencies. This enables:
 * 
 * 1. PREREQUISITE CHECKING — Before teaching X, ensure Y is understood
 * 2. CURRICULUM POSITIONING — Where is the student in the learning path
 * 3. CONCEPT BRIDGING — Connect new concepts to known ones
 * 4. GAP ROOT CAUSE — Trace knowledge gaps to their prerequisite source
 * 
 * The graph is built from a combination of:
 * - Hardcoded curriculum structure (common educational progressions)
 * - Dynamic data from student performance (detected gaps and mastery)
 * 
 * Structure:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                   CONCEPT GRAPH                              │
 * │                                                               │
 * │  Addition ──→ Multiplication ──→ Algebra ──→ Calculus         │
 * │       └──→ Subtraction ──→ Division ──┘                       │
 * │                                                               │
 * │  Atoms ──→ Molecules ──→ Chemical Reactions ──→ Equilibrium   │
 * │       └──→ Periodic Table ──┘                                 │
 * └─────────────────────────────────────────────────────────────┘
 */

// ============================================================================
//  TYPES
// ============================================================================

export interface ConceptNode {
  id: string;
  name: string;
  subject: string;
  /** Prerequisites that should be mastered before this concept */
  prerequisites: string[];
  /** What this concept enables (reverse dependencies) */
  enables: string[];
  /** Student's mastery of this concept (0-100, null if not assessed) */
  mastery: number | null;
  /** Difficulty tier within the subject */
  tier: 1 | 2 | 3 | 4 | 5; // 1 = foundational, 5 = advanced
}

export interface ConceptGraphAnalysis {
  /** Total concepts tracked */
  totalConcepts: number;
  /** Concepts mastered (> 80% accuracy) */
  masteredConcepts: number;
  /** Concepts in progress (40-80%) */
  inProgressConcepts: number;
  /** Concepts not yet covered */
  uncoveredConcepts: number;
  /** Concepts with missing prerequisites */
  conceptsWithGaps: Array<{
    concept: string;
    missingPrerequisites: string[];
    subject: string;
  }>;
  /** Suggested next concepts to learn (based on readiness) */
  readyToLearn: Array<{
    concept: string;
    subject: string;
    reason: string;
  }>;
  /** Current curriculum position per subject */
  curriculumPosition: Record<string, {
    currentTier: number;
    totalTiers: number;
    completionPercentage: number;
    nextMilestone: string;
  }>;
}

// ============================================================================
//  CURRICULUM STRUCTURES
// ============================================================================

/**
 * Predefined curriculum concept graphs for common subjects.
 * Each entry maps concept → prerequisites.
 * 
 * This is a simplified model; a production system would load these
 * from a database per grade level and curriculum standard.
 */
const CURRICULUM_GRAPHS: Record<string, Array<{
  concept: string;
  prerequisites: string[];
  tier: 1 | 2 | 3 | 4 | 5;
}>> = {
  math: [
    { concept: 'counting', prerequisites: [], tier: 1 },
    { concept: 'addition', prerequisites: ['counting'], tier: 1 },
    { concept: 'subtraction', prerequisites: ['counting'], tier: 1 },
    { concept: 'multiplication', prerequisites: ['addition'], tier: 1 },
    { concept: 'division', prerequisites: ['multiplication', 'subtraction'], tier: 1 },
    { concept: 'fractions', prerequisites: ['division'], tier: 2 },
    { concept: 'decimals', prerequisites: ['fractions'], tier: 2 },
    { concept: 'percentages', prerequisites: ['fractions', 'decimals'], tier: 2 },
    { concept: 'ratios', prerequisites: ['fractions'], tier: 2 },
    { concept: 'integers', prerequisites: ['subtraction'], tier: 2 },
    { concept: 'order of operations', prerequisites: ['addition', 'multiplication'], tier: 2 },
    { concept: 'variables', prerequisites: ['order of operations'], tier: 3 },
    { concept: 'linear equations', prerequisites: ['variables', 'integers'], tier: 3 },
    { concept: 'inequalities', prerequisites: ['linear equations'], tier: 3 },
    { concept: 'exponents', prerequisites: ['multiplication'], tier: 3 },
    { concept: 'polynomials', prerequisites: ['variables', 'exponents'], tier: 3 },
    { concept: 'factoring', prerequisites: ['polynomials'], tier: 3 },
    { concept: 'quadratic equations', prerequisites: ['factoring', 'linear equations'], tier: 4 },
    { concept: 'functions', prerequisites: ['variables', 'linear equations'], tier: 4 },
    { concept: 'graphing', prerequisites: ['functions', 'linear equations'], tier: 4 },
    { concept: 'systems of equations', prerequisites: ['linear equations'], tier: 4 },
    { concept: 'trigonometry', prerequisites: ['ratios', 'functions'], tier: 4 },
    { concept: 'logarithms', prerequisites: ['exponents', 'functions'], tier: 4 },
    { concept: 'sequences and series', prerequisites: ['functions', 'exponents'], tier: 4 },
    { concept: 'limits', prerequisites: ['functions', 'graphing'], tier: 5 },
    { concept: 'derivatives', prerequisites: ['limits', 'polynomials'], tier: 5 },
    { concept: 'integrals', prerequisites: ['derivatives'], tier: 5 },
    { concept: 'differential equations', prerequisites: ['derivatives', 'integrals'], tier: 5 },
  ],
  physics: [
    { concept: 'measurement and units', prerequisites: [], tier: 1 },
    { concept: 'motion', prerequisites: ['measurement and units'], tier: 1 },
    { concept: 'speed and velocity', prerequisites: ['motion'], tier: 1 },
    { concept: 'acceleration', prerequisites: ['speed and velocity'], tier: 2 },
    { concept: 'forces', prerequisites: ['acceleration'], tier: 2 },
    { concept: 'newton\'s laws', prerequisites: ['forces'], tier: 2 },
    { concept: 'friction', prerequisites: ['forces'], tier: 2 },
    { concept: 'gravity', prerequisites: ['newton\'s laws'], tier: 2 },
    { concept: 'work and energy', prerequisites: ['forces'], tier: 3 },
    { concept: 'momentum', prerequisites: ['forces', 'acceleration'], tier: 3 },
    { concept: 'circular motion', prerequisites: ['acceleration', 'forces'], tier: 3 },
    { concept: 'waves', prerequisites: ['motion'], tier: 3 },
    { concept: 'sound', prerequisites: ['waves'], tier: 3 },
    { concept: 'light', prerequisites: ['waves'], tier: 3 },
    { concept: 'electricity', prerequisites: ['forces'], tier: 4 },
    { concept: 'circuits', prerequisites: ['electricity'], tier: 4 },
    { concept: 'magnetism', prerequisites: ['electricity'], tier: 4 },
    { concept: 'electromagnetic induction', prerequisites: ['magnetism', 'circuits'], tier: 5 },
    { concept: 'thermodynamics', prerequisites: ['work and energy'], tier: 4 },
    { concept: 'nuclear physics', prerequisites: ['electricity'], tier: 5 },
  ],
  chemistry: [
    { concept: 'matter and its properties', prerequisites: [], tier: 1 },
    { concept: 'atomic structure', prerequisites: ['matter and its properties'], tier: 1 },
    { concept: 'periodic table', prerequisites: ['atomic structure'], tier: 1 },
    { concept: 'electron configuration', prerequisites: ['atomic structure'], tier: 2 },
    { concept: 'chemical bonding', prerequisites: ['electron configuration', 'periodic table'], tier: 2 },
    { concept: 'ionic bonds', prerequisites: ['chemical bonding'], tier: 2 },
    { concept: 'covalent bonds', prerequisites: ['chemical bonding'], tier: 2 },
    { concept: 'chemical formulas', prerequisites: ['chemical bonding'], tier: 2 },
    { concept: 'chemical reactions', prerequisites: ['chemical formulas'], tier: 3 },
    { concept: 'balancing equations', prerequisites: ['chemical reactions'], tier: 3 },
    { concept: 'moles', prerequisites: ['chemical formulas'], tier: 3 },
    { concept: 'stoichiometry', prerequisites: ['balancing equations', 'moles'], tier: 3 },
    { concept: 'states of matter', prerequisites: ['matter and its properties'], tier: 2 },
    { concept: 'gas laws', prerequisites: ['states of matter', 'moles'], tier: 3 },
    { concept: 'solutions', prerequisites: ['chemical reactions'], tier: 3 },
    { concept: 'acids and bases', prerequisites: ['solutions', 'chemical reactions'], tier: 4 },
    { concept: 'redox reactions', prerequisites: ['chemical reactions', 'electron configuration'], tier: 4 },
    { concept: 'thermochemistry', prerequisites: ['chemical reactions', 'stoichiometry'], tier: 4 },
    { concept: 'equilibrium', prerequisites: ['chemical reactions', 'stoichiometry'], tier: 4 },
    { concept: 'organic chemistry', prerequisites: ['covalent bonds', 'chemical formulas'], tier: 5 },
  ],
  biology: [
    { concept: 'characteristics of life', prerequisites: [], tier: 1 },
    { concept: 'cell theory', prerequisites: ['characteristics of life'], tier: 1 },
    { concept: 'cell structure', prerequisites: ['cell theory'], tier: 1 },
    { concept: 'cell membrane', prerequisites: ['cell structure'], tier: 2 },
    { concept: 'organelles', prerequisites: ['cell structure'], tier: 2 },
    { concept: 'cell division (mitosis)', prerequisites: ['cell structure'], tier: 2 },
    { concept: 'dna structure', prerequisites: ['cell structure'], tier: 2 },
    { concept: 'dna replication', prerequisites: ['dna structure'], tier: 3 },
    { concept: 'protein synthesis', prerequisites: ['dna structure'], tier: 3 },
    { concept: 'genetics (mendelian)', prerequisites: ['cell division (mitosis)', 'dna structure'], tier: 3 },
    { concept: 'meiosis', prerequisites: ['cell division (mitosis)'], tier: 3 },
    { concept: 'inheritance patterns', prerequisites: ['genetics (mendelian)', 'meiosis'], tier: 3 },
    { concept: 'evolution', prerequisites: ['genetics (mendelian)'], tier: 4 },
    { concept: 'natural selection', prerequisites: ['evolution'], tier: 4 },
    { concept: 'photosynthesis', prerequisites: ['organelles'], tier: 3 },
    { concept: 'cellular respiration', prerequisites: ['organelles'], tier: 3 },
    { concept: 'ecology basics', prerequisites: ['characteristics of life'], tier: 2 },
    { concept: 'ecosystems', prerequisites: ['ecology basics', 'photosynthesis'], tier: 3 },
    { concept: 'human body systems', prerequisites: ['cell structure'], tier: 3 },
    { concept: 'molecular biology', prerequisites: ['protein synthesis', 'dna replication'], tier: 5 },
  ],
};

// ============================================================================
//  GRAPH BUILDING & ANALYSIS
// ============================================================================

/**
 * Build a concept graph for a subject, enriched with student mastery data.
 */
function buildConceptGraph(
  subject: string,
  masteryData: Map<string, number>,
): Map<string, ConceptNode> {
  const graph = new Map<string, ConceptNode>();
  const curriculum = CURRICULUM_GRAPHS[subject.toLowerCase()];
  
  if (!curriculum) return graph;

  // Build nodes
  for (const entry of curriculum) {
    const id = `${subject}:${entry.concept}`;
    graph.set(id, {
      id,
      name: entry.concept,
      subject: subject.toLowerCase(),
      prerequisites: entry.prerequisites.map(p => `${subject}:${p}`),
      enables: [],
      mastery: masteryData.get(entry.concept.toLowerCase()) ?? null,
      tier: entry.tier,
    });
  }

  // Build reverse dependencies (enables)
  for (const [, node] of graph) {
    for (const prereqId of node.prerequisites) {
      const prereq = graph.get(prereqId);
      if (prereq) {
        prereq.enables.push(node.id);
      }
    }
  }

  return graph;
}

/**
 * Analyze the concept graph to identify gaps, readiness, and position.
 */
export function analyzeConceptGraph(
  subjectPerformances: Array<{
    subject: string;
    accuracy: number;
    strongTopics: string[];
    weakTopics: string[];
  }>,
  knowledgeGaps: Array<{ subject: string; topic: string }>,
): ConceptGraphAnalysis {
  // Build mastery data from performance
  const masteryBySubject: Record<string, Map<string, number>> = {};
  
  for (const perf of subjectPerformances) {
    const subj = perf.subject.toLowerCase();
    if (!masteryBySubject[subj]) masteryBySubject[subj] = new Map();
    
    // Map strong/weak topics to mastery scores
    for (const topic of perf.strongTopics) {
      masteryBySubject[subj].set(topic.toLowerCase(), 85);
    }
    for (const topic of perf.weakTopics) {
      masteryBySubject[subj].set(topic.toLowerCase(), 30);
    }
  }

  // Mark knowledge gaps as low mastery
  for (const gap of knowledgeGaps) {
    const subj = gap.subject.toLowerCase();
    if (!masteryBySubject[subj]) masteryBySubject[subj] = new Map();
    masteryBySubject[subj].set(gap.topic.toLowerCase(), 15);
  }

  let totalConcepts = 0;
  let masteredConcepts = 0;
  let inProgressConcepts = 0;
  let uncoveredConcepts = 0;
  const conceptsWithGaps: ConceptGraphAnalysis['conceptsWithGaps'] = [];
  const readyToLearn: ConceptGraphAnalysis['readyToLearn'] = [];
  const curriculumPosition: ConceptGraphAnalysis['curriculumPosition'] = {};

  for (const subject of Object.keys(CURRICULUM_GRAPHS)) {
    const mastery = masteryBySubject[subject] || new Map();
    const graph = buildConceptGraph(subject, mastery);
    
    let subjectMastered = 0;
    let subjectTotal = 0;
    let highestMasteredTier = 0;
    const totalTiers = Math.max(...Array.from(graph.values()).map(n => n.tier));

    for (const [, node] of graph) {
      totalConcepts++;
      subjectTotal++;

      if (node.mastery !== null && node.mastery >= 80) {
        masteredConcepts++;
        subjectMastered++;
        if (node.tier > highestMasteredTier) highestMasteredTier = node.tier;
      } else if (node.mastery !== null && node.mastery >= 40) {
        inProgressConcepts++;
      } else {
        uncoveredConcepts++;
      }

      // Check for missing prerequisites
      if (node.mastery !== null && node.mastery < 50) {
        const missingPrereqs = node.prerequisites
          .map(pid => graph.get(pid))
          .filter(p => p && (p.mastery === null || p.mastery < 60))
          .map(p => p!.name);
        
        if (missingPrereqs.length > 0) {
          conceptsWithGaps.push({
            concept: node.name,
            missingPrerequisites: missingPrereqs,
            subject,
          });
        }
      }

      // Check if ready to learn (all prerequisites mastered, concept not yet mastered)
      if (node.mastery === null || node.mastery < 60) {
        const allPrereqsMet = node.prerequisites.every(pid => {
          const prereq = graph.get(pid);
          return prereq && prereq.mastery !== null && prereq.mastery >= 60;
        });
        
        if (allPrereqsMet && node.prerequisites.length > 0) {
          readyToLearn.push({
            concept: node.name,
            subject,
            reason: `All prerequisites mastered: ${node.prerequisites.map(p => graph.get(p)?.name).filter(Boolean).join(', ')}`,
          });
        }
      }
    }

    if (subjectTotal > 0) {
      const nextTier = highestMasteredTier + 1;
      const nextConcepts = Array.from(graph.values())
        .filter(n => n.tier === nextTier && (n.mastery === null || n.mastery < 60));
      
      curriculumPosition[subject] = {
        currentTier: highestMasteredTier,
        totalTiers,
        completionPercentage: Math.round((subjectMastered / subjectTotal) * 100),
        nextMilestone: nextConcepts[0]?.name || 'All concepts covered!',
      };
    }
  }

  return {
    totalConcepts,
    masteredConcepts,
    inProgressConcepts,
    uncoveredConcepts,
    conceptsWithGaps: conceptsWithGaps.slice(0, 10),
    readyToLearn: readyToLearn.slice(0, 8),
    curriculumPosition,
  };
}

/**
 * Generate a concept graph context string for AI prompt injection.
 */
export function getConceptGraphContextPrompt(
  analysis: ConceptGraphAnalysis,
  subject?: string,
): string {
  if (analysis.totalConcepts === 0) return '';

  const sections: string[] = [];
  sections.push(`## CURRICULUM KNOWLEDGE MAP`);
  sections.push(`- ${analysis.masteredConcepts}/${analysis.totalConcepts} concepts mastered | ${analysis.inProgressConcepts} in progress | ${analysis.uncoveredConcepts} not yet covered`);

  // Subject-specific position
  if (subject) {
    const pos = analysis.curriculumPosition[subject.toLowerCase()];
    if (pos) {
      sections.push(`- ${subject}: Tier ${pos.currentTier}/${pos.totalTiers} | ${pos.completionPercentage}% complete | Next: "${pos.nextMilestone}"`);
    }
  } else {
    for (const [subj, pos] of Object.entries(analysis.curriculumPosition)) {
      sections.push(`- ${subj}: Tier ${pos.currentTier}/${pos.totalTiers} (${pos.completionPercentage}%)`);
    }
  }

  // Prerequisite gaps
  if (analysis.conceptsWithGaps.length > 0) {
    const relevantGaps = subject 
      ? analysis.conceptsWithGaps.filter(g => g.subject === subject.toLowerCase())
      : analysis.conceptsWithGaps;
    
    if (relevantGaps.length > 0) {
      sections.push(`\nPREREQUISITE GAPS (root causes of difficulty):`);
      for (const gap of relevantGaps.slice(0, 4)) {
        sections.push(`- "${gap.concept}" struggles because prerequisites are weak: ${gap.missingPrerequisites.join(', ')}`);
        sections.push(`  → TEACH the prerequisite(s) BEFORE advancing. Don't skip foundations.`);
      }
    }
  }

  // Ready to learn
  if (analysis.readyToLearn.length > 0) {
    const relevantReady = subject 
      ? analysis.readyToLearn.filter(r => r.subject === subject.toLowerCase())
      : analysis.readyToLearn;
    
    if (relevantReady.length > 0) {
      sections.push(`\nREADY TO LEARN NEXT (prerequisites met):`);
      for (const r of relevantReady.slice(0, 3)) {
        sections.push(`- "${r.concept}" (${r.subject}) — ${r.reason}`);
      }
    }
  }

  return sections.join('\n');
}
