// ============================================================================
//  infer-concept edge function  —  Adaptive Intelligence v2.1
// ----------------------------------------------------------------------------
//  Embedding-based concept inference. Called as a fallback when the
//  client-side keyword scorer is weak (no strong match, but text is rich
//  enough that there's probably *something* there). Uses Lovable AI Gateway
//  to embed the question, then cosine-similarity against concept centroids.
//
//  Concept centroids are kept inline (small — ~80 concepts × 1 short string)
//  and embedded lazily on first invocation, cached in memory per cold start.
// ----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Concept catalogue. The "description" is what gets embedded — a richer phrase
// than the bare id, so semantic matches like "find the slope of y = 3x + 2"
// land on "linear equations" without keyword overlap.
const CONCEPT_CATALOGUE: Record<string, Record<string, string>> = {
  math: {
    "linear equations": "solving linear equations, slope intercept form, y = mx + b",
    "quadratic equations": "quadratic equations, parabolas, ax^2 + bx + c",
    "fractions": "fractions, numerators, denominators, simplifying ratios",
    "percentages": "percentages, percent of a number, percentage change",
    "trigonometry": "trigonometry, sine cosine tangent, right triangles",
    "derivatives": "derivatives, differentiation, instantaneous rate of change",
    "integrals": "integrals, antiderivatives, area under a curve",
    "logarithms": "logarithms, log and ln, exponential inverses",
    "functions": "functions, domain range, function notation f of x",
    "graphing": "graphing functions, coordinate plane, plotting points",
    "factoring": "factoring polynomials, grouping, common factors",
    "systems of equations": "systems of equations, simultaneous equations, substitution and elimination",
    "exponents": "exponents, powers, exponential rules",
    "inequalities": "inequalities, greater than less than, solving inequalities",
    "sequences and series": "sequences and series, arithmetic and geometric progressions",
  },
  physics: {
    "forces": "forces, Newton's laws, free body diagrams",
    "motion": "motion, kinematics, position and velocity over time",
    "speed and velocity": "speed and velocity, distance over time, vectors",
    "acceleration": "acceleration, change in velocity, free fall",
    "work and energy": "work and energy, kinetic and potential energy, joules",
    "momentum": "momentum and impulse, conservation of momentum",
    "circuits": "electric circuits, voltage current resistance, Ohm's law",
    "waves": "waves, wavelength frequency amplitude, sound and light",
    "thermodynamics": "thermodynamics, heat transfer, entropy",
    "gravity": "gravity, gravitational force, orbital motion",
  },
  chemistry: {
    "atomic structure": "atomic structure, protons neutrons electrons, atomic number",
    "periodic table": "periodic table, groups and periods, element families",
    "chemical bonding": "chemical bonding, ionic and covalent bonds",
    "chemical reactions": "chemical reactions, reactants and products, balancing equations",
    "moles": "moles and stoichiometry, Avogadro's number, mole ratios",
    "acids and bases": "acids and bases, pH, neutralisation reactions",
    "gas laws": "gas laws, Boyle Charles ideal gas, PV = nRT",
    "organic chemistry": "organic chemistry, alkanes alkenes alcohols, hydrocarbons",
    "redox reactions": "redox reactions, oxidation and reduction, electron transfer",
  },
  biology: {
    "cell structure": "cell structure, organelles, plant vs animal cells",
    "dna structure": "DNA structure, double helix, nucleotides",
    "protein synthesis": "protein synthesis, transcription and translation, mRNA",
    "genetics (mendelian)": "Mendelian genetics, Punnett squares, dominant and recessive alleles",
    "evolution": "evolution, common ancestry, descent with modification",
    "natural selection": "natural selection, fitness, adaptation",
    "photosynthesis": "photosynthesis, chlorophyll, converting light to glucose",
    "cellular respiration": "cellular respiration, ATP, glycolysis Krebs cycle",
    "ecosystems": "ecosystems, food chains and webs, energy flow",
  },
};

// In-memory cache. Cold starts re-embed; warm calls are free.
let CENTROID_CACHE: Record<string, { conceptId: string; vec: number[] }[]> | null = null;
let EMBEDDING_INIT_IN_FLIGHT: Promise<void> | null = null;

const EMBEDDING_MODEL = "google/gemini-embedding-001";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/embeddings";

async function embed(input: string | string[]): Promise<number[][]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`embedding gateway ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  return (json.data as { embedding: number[] }[]).map((d) => d.embedding);
}

async function ensureCentroids(): Promise<void> {
  if (CENTROID_CACHE) return;
  if (EMBEDDING_INIT_IN_FLIGHT) return EMBEDDING_INIT_IN_FLIGHT;

  EMBEDDING_INIT_IN_FLIGHT = (async () => {
    const cache: Record<string, { conceptId: string; vec: number[] }[]> = {};
    for (const [subject, concepts] of Object.entries(CONCEPT_CATALOGUE)) {
      const ids = Object.keys(concepts);
      const descriptions = ids.map((id) => concepts[id]);
      const vecs = await embed(descriptions);
      cache[subject] = ids.map((id, i) => ({ conceptId: `${subject}:${id}`, vec: vecs[i] }));
    }
    CENTROID_CACHE = cache;
  })();

  try {
    await EMBEDDING_INIT_IN_FLIGHT;
  } finally {
    EMBEDDING_INIT_IN_FLIGHT = null;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth: require a logged-in user; this is not a public endpoint.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as { subject?: string; text?: string; topK?: number };
    const subject = (body.subject ?? "").toLowerCase().trim();
    const text = (body.text ?? "").trim();
    const topK = Math.min(Math.max(body.topK ?? 2, 1), 4);

    if (!subject || !text || !(subject in CONCEPT_CATALOGUE)) {
      return new Response(JSON.stringify({ distribution: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length < 12) {
      return new Response(JSON.stringify({ distribution: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await ensureCentroids();
    const centroids = CENTROID_CACHE![subject];
    if (!centroids?.length) {
      return new Response(JSON.stringify({ distribution: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [qVec] = await embed([text.slice(0, 1000)]);
    const scored = centroids
      .map((c) => ({ conceptId: c.conceptId, sim: cosine(qVec, c.vec) }))
      .sort((a, b) => b.sim - a.sim);

    // Floor: cosine < 0.55 isn't meaningfully related; drop it.
    const filtered = scored.filter((s) => s.sim >= 0.55).slice(0, topK);
    if (!filtered.length) {
      return new Response(JSON.stringify({ distribution: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sum = filtered.reduce((s, x) => s + x.sim, 0);
    const distribution = filtered.map((x) => ({
      conceptId: x.conceptId,
      weight: Number((x.sim / sum).toFixed(3)),
      similarity: Number(x.sim.toFixed(3)),
    }));

    return new Response(JSON.stringify({ distribution }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[infer-concept] error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unknown error", distribution: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
