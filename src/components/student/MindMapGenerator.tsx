import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { useAdaptiveLevel } from '@/hooks/useAdaptiveLevel';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Brain, Loader2, RefreshCw, ZoomIn, ZoomOut, Clock, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { MathRenderer } from '@/components/MathRenderer';
import { streamChat, Message } from '@/lib/chat';
import { useLearningStyle } from '@/hooks/useLearningStyle';
import { mergeImagesIntoContent, urlsToInlineImages } from '@/lib/imageInsertion';

interface MindMapNode {
  label: string;
  children?: MindMapNode[];
  expanded?: boolean;
  terminal?: boolean;
}

interface MindMapData {
  center: string;
  branches: MindMapNode[];
}

interface SavedMindMap {
  id: string;
  topic: string;
  mind_map_data: MindMapData;
  created_at: string;
}

function sanitizeMindMapNode(node: MindMapNode | null | undefined): MindMapNode | null {
  const label = node?.label?.trim();
  if (!label) return null;

  const children = (node.children || [])
    .map((child) => sanitizeMindMapNode(child))
    .filter((child): child is MindMapNode => Boolean(child));

  return {
    ...node,
    label,
    children: children.length ? children : undefined,
  };
}

function sanitizeMindMapData(data: MindMapData): MindMapData {
  return {
    center: data.center?.trim() || '',
    branches: (data.branches || [])
      .map((branch) => sanitizeMindMapNode(branch))
      .filter((branch): branch is MindMapNode => Boolean(branch)),
  };
}

// ─── Recursive node helpers ──────────────────────────────────────────────────

function getNodeByPath(data: MindMapData, path: number[]): MindMapNode | null {
  if (path.length === 0) return null;
  let node: MindMapNode | undefined = data.branches[path[0]];
  for (let i = 1; i < path.length; i++) {
    if (!node?.children) return null;
    node = node.children[path[i]];
  }
  return node || null;
}

function updateNodeByPath(data: MindMapData, path: number[], updater: (node: MindMapNode) => MindMapNode): MindMapData {
  if (path.length === 0) return data;

  const cloneNode = (n: MindMapNode): MindMapNode => ({
    ...n,
    children: n.children ? n.children.map(c => ({ ...c })) : undefined,
  });

  const newData: MindMapData = { center: data.center, branches: data.branches.map(b => cloneNode(b)) };
  let current: MindMapNode = newData.branches[path[0]];
  const parents: { node: MindMapNode; childIdx: number }[] = [];

  for (let i = 1; i < path.length; i++) {
    if (!current.children) return data;
    parents.push({ node: current, childIdx: path[i] });
    current = current.children[path[i]];
  }

  const updated = updater(current);

  if (parents.length === 0) {
    newData.branches[path[0]] = updated;
  } else {
    const last = parents[parents.length - 1];
    last.node.children![last.childIdx] = updated;
  }

  return newData;
}

// ─── JSON extraction ───────────────────────────────────────────────────────────

function extractJsonFromResponse(response: string): unknown {
  let cleaned = response
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  let braceDepth = 0;
  let bracketDepth = 0;
  let jsonStart = -1;
  let jsonEnd = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escaped) { escaped = false; continue; }
    if (inString && char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (jsonStart === -1 && (char === '{' || char === '[')) jsonStart = i;
    if (char === '{') braceDepth++;
    else if (char === '}') braceDepth--;
    else if (char === '[') bracketDepth++;
    else if (char === ']') bracketDepth--;
    if (jsonStart !== -1 && braceDepth === 0 && bracketDepth === 0) { jsonEnd = i; break; }
  }

  if (jsonStart === -1) throw new Error('No JSON object found');
  cleaned = cleaned.substring(jsonStart, jsonEnd === -1 ? cleaned.length : jsonEnd + 1);
  cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').replace(/[\x00-\x1F\x7F]/g, '');

  if (jsonEnd === -1 || braceDepth !== 0 || bracketDepth !== 0) {
    const ob = (cleaned.match(/{/g) || []).length;
    const cb = (cleaned.match(/}/g) || []).length;
    const oB = (cleaned.match(/\[/g) || []).length;
    const cB = (cleaned.match(/\]/g) || []).length;
    for (let i = 0; i < ob - cb; i++) cleaned += '}';
    for (let i = 0; i < oB - cB; i++) cleaned += ']';
  }

  return JSON.parse(cleaned);
}

async function readChatStream(response: Response): Promise<string> {
  if (!response.body) throw new Error('No response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = '';
  let fullContent = '';
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') { streamDone = true; break; }
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (delta) fullContent += delta;
      } catch {
        textBuffer = line + '\n' + textBuffer;
        break;
      }
    }
  }

  if (textBuffer.trim()) {
    for (let raw of textBuffer.split('\n')) {
      if (!raw) continue;
      if (raw.endsWith('\r')) raw = raw.slice(0, -1);
      if (raw.startsWith(':') || raw.trim() === '') continue;
      if (!raw.startsWith('data: ')) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (delta) fullContent += delta;
      } catch { /* ignore */ }
    }
  }
  return fullContent.trim();
}

// ─── Colors ────────────────────────────────────────────────────────────────────

const BRANCH_COLORS = [
  'hsl(220, 70%, 55%)',
  'hsl(160, 60%, 45%)',
  'hsl(35, 80%, 50%)',
  'hsl(280, 60%, 55%)',
  'hsl(10, 70%, 55%)',
  'hsl(190, 60%, 45%)',
  'hsl(330, 60%, 55%)',
  'hsl(48, 86%, 52%)',
];

// ─── Multi-line SVG text helper ────────────────────────────────────────────────

function SvgLabel({ x, y, text, maxChars, fontSize, fill, fontWeight }: {
  x: number; y: number; text: string; maxChars: number; fontSize: number; fill: string; fontWeight: string;
}) {
  const cleanedText = text.trim().replace(/\s+/g, ' ');

  if (cleanedText.length <= maxChars) {
    return (
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fill={fill} fontSize={fontSize} fontWeight={fontWeight} className="pointer-events-none">
        {cleanedText}
      </text>
    );
  }

  // Word wrap into lines
  const words = cleanedText.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  if (lines.length > 3) {
    lines.splice(2);
    lines[1] = lines[1].slice(0, maxChars - 1) + '…';
  }

  const lineHeight = fontSize * 1.3;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;

  return (
    <text textAnchor="middle" fill={fill} fontSize={fontSize} fontWeight={fontWeight} className="pointer-events-none">
      {lines.map((line, i) => (
        <tspan key={i} x={x} y={startY + i * lineHeight} dominantBaseline="middle">
          {line}
        </tspan>
      ))}
    </text>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function MindMapGenerator() {
  const { user } = useAuth();
  const { t, language } = useThemeLanguage();
  const { currentLevel } = useAdaptiveLevel();
  const { getLearningStylePrompt } = useLearningStyle();
  const [topic, setTopic] = useState('');
  const [mindMap, setMindMap] = useState<MindMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandingNode, setExpandingNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  // Animation state
  const [animated, setAnimated] = useState(false);
  const animationFrameRef = useRef<number | null>(null);

  // Dual-tap state — use path as string key for comparison
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickRef = useRef<{ pathKey: string; time: number } | null>(null);

  // Lecture panel
  const [lectureOpen, setLectureOpen] = useState(false);
  const [lectureLabel, setLectureLabel] = useState('');
  const [lectureContent, setLectureContent] = useState('');
  const [lectureLoading, setLectureLoading] = useState(false);
  const [lectureImages, setLectureImages] = useState<string[]>([]);

  // History
  const [history, setHistory] = useState<SavedMindMap[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ─── Load history on mount ──────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    supabase
      .from('mind_map_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setHistory(data as unknown as SavedMindMap[]);
      });
  }, [user]);

  // ─── Trigger animation after mind map loads ─────────────────────────────────

  useEffect(() => {
    if (mindMap) {
      setAnimated(false);
      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = requestAnimationFrame(() => {
          setAnimated(true);
        });
      });
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [mindMap]);

  // ─── Save mind map to DB ────────────────────────────────────────────────────

  const saveMindMap = useCallback(async (data: MindMapData, topicText: string) => {
    if (!user) return;
    const { data: saved, error } = await supabase
      .from('mind_map_history')
      .insert({ user_id: user.id, topic: topicText, mind_map_data: data as any })
      .select()
      .single();
    if (saved && !error) {
      setHistory(prev => [saved as unknown as SavedMindMap, ...prev]);
    }
  }, [user]);

  // ─── Delete history item ────────────────────────────────────────────────────

  const deleteHistoryItem = useCallback(async (id: string) => {
    await supabase.from('mind_map_history').delete().eq('id', id);
    setHistory(prev => prev.filter(h => h.id !== id));
  }, []);

  // ─── Generate mind map ──────────────────────────────────────────────────────

  const generateMindMap = useCallback(async (inputTopic?: string) => {
    const t_topic = inputTopic || topic.trim();
    if (!t_topic || !user) return;

    setLoading(true);
    setMindMap(null);
    setAnimated(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const systemPrompt = `You are an educational mind map generator. Given a topic, return ONLY valid JSON (no markdown, no backticks) in this exact format:
{
  "center": "Main Topic",
  "branches": [
    {
      "label": "Subtopic 1",
      "children": [
        { "label": "Detail A" },
        { "label": "Detail B" }
      ]
    }
  ]
}

Generate 4-6 main branches with 2-4 children each. Keep labels concise (2-5 words). Make it educational and comprehensive for a ${currentLevel} level student.
${language === 'ar' ? 'Generate all labels in Arabic.' : ''}
CRITICAL: Return ONLY the raw JSON object. Do NOT wrap it in markdown code fences. Do NOT add any explanatory text before or after.`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `Create a mind map about: ${t_topic}` }],
            systemPrompt,
            language,
          }),
        }
      );

      if (!response.ok || !response.body) throw new Error('Failed');
      const fullContent = await readChatStream(response);
      const mapData = sanitizeMindMapData(extractJsonFromResponse(fullContent) as MindMapData);
      if (!mapData.center || mapData.branches.length === 0) throw new Error('Invalid format');

      setMindMap(mapData);
      saveMindMap(mapData, t_topic);
    } catch (e) {
      console.error('Mind map generation error:', e);
      toast.error(t('Failed to generate mind map. Try again!', 'فشل في إنشاء الخريطة الذهنية. حاول مرة أخرى!'));
    }

    setLoading(false);
  }, [topic, user, currentLevel, language, t, saveMindMap]);

  // ─── Expand node by path (double tap) ───────────────────────────────────────

  const expandNodeByPath = useCallback(async (path: number[]) => {
    if (!mindMap || !user) return;

    const target = getNodeByPath(mindMap, path);
    if (!target) return;

    // If already marked terminal, show message immediately
    if (target.terminal) {
      toast.info(t('End of node', 'نهاية العقدة'));
      return;
    }

    setExpandingNode(target.label);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const systemPrompt = `You are expanding a mind map node. Given a subtopic of "${mindMap.center}", return ONLY valid JSON with new child nodes.
If the topic "${target.label}" is already very specific and atomic with nothing meaningful to break down further, return: { "children": [] }
Otherwise return 3-4 new child nodes: { "children": [{ "label": "Detail 1" }, { "label": "Detail 2" }, { "label": "Detail 3" }] }
Keep labels concise (2-5 words). ${language === 'ar' ? 'Use Arabic.' : ''}
CRITICAL: Return ONLY the raw JSON object. No markdown, no code fences, no explanation.`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `Expand the subtopic: "${target.label}" (part of ${mindMap.center})` }],
            systemPrompt,
            language,
          }),
        }
      );

      if (!response.ok || !response.body) throw new Error('Failed');
      const fullContent = await readChatStream(response);
      const newChildren = extractJsonFromResponse(fullContent) as { children: MindMapNode[] };
      const validChildren = (newChildren.children || [])
        .map((child) => sanitizeMindMapNode(child))
        .filter((child): child is MindMapNode => Boolean(child));

      // Filter out duplicates by label
      const existingLabels = new Set((target.children || []).map(c => c.label.toLowerCase()));
      const uniqueNew = validChildren.filter(c => !existingLabels.has(c.label.toLowerCase()));

      if (uniqueNew.length === 0) {
        // Terminal node — nothing new to add
        setMindMap(prev => {
          if (!prev) return prev;
          return updateNodeByPath(prev, path, (node) => ({ ...node, terminal: true, expanded: true }));
        });
        toast.info(t('End of node', 'نهاية العقدة'));
      } else {
        setMindMap(prev => {
          if (!prev) return prev;
          return updateNodeByPath(prev, path, (node) => ({
            ...node,
            children: [...(node.children || []), ...uniqueNew],
            expanded: true,
          }));
        });
      }
    } catch (e) {
      console.error('Node expansion error:', e);
      toast.error(t('Failed to expand node', 'فشل في توسيع العقدة'));
    }
    setExpandingNode(null);
  }, [mindMap, user, language, t]);

  // ─── Generate lecture (single tap) ──────────────────────────────────────────

  const generateLecture = useCallback(async (label: string) => {
    setLectureLabel(label);
    setLectureContent('');
    setLectureImages([]);
    setLectureOpen(true);
    setLectureLoading(true);

    const centerTopic = mindMap?.center || '';
    const isArabic = language === 'ar';

    const prompt = isArabic
      ? `أنت معلم متخصص. الطالب يريد تعلم عن "${label}" كجزء من موضوع "${centerTopic}".

اجعل الشرح متوازنًا — 5-8 صفحات مع أمثلة ورسوم بيانية.

قم بإنشاء درس شامل يتضمن:
1. شرح واضح للتعريفات أولاً
2. شرح خطوة بخطوة للمفاهيم
3. أمثلة مناسبة للطالب
4. الأخطاء الشائعة التي يجب تجنبها
5. ملخص قصير للمراجعة

استخدم رموز الأقسام مع الإيموجي (📌، 🧠، 📊، ✅، ⚠️، 📝، 💡).
مهم: ضع بالضبط 5 علامات للصور [IMAGE_PLACEHOLDER_1] إلى [IMAGE_PLACEHOLDER_5] في الأماكن المناسبة.
اكتب الدرس بالكامل باللغة العربية فقط.`
      : `You are teaching about "${label}" as part of the broader topic "${centerTopic}".

Generate DETAILED content — 12-18 pages of rich educational material.

Include ALL of these:
1. Introduction & Context — What, why, historical background
2. Definitions — Every term with 3-5 sentence definitions
3. Core Concepts Deep Dive — Each concept gets its own subsection
4. Visual Representations — AT LEAST 3 ASCII diagrams using box-drawing characters (┌─┐│└─┘→←↑↓▼)
5. Formulas & Rules — Every formula with step-by-step breakdown
6. Worked Examples — 3-5 per concept at varying difficulty
7. Common Misconceptions — 5-8 errors with wrong vs right comparison
8. Real-World Applications — 3-5 practical applications
9. Self-Assessment — 5-8 practice questions with answers
10. Summary — Section recap, key takeaways, study checklist

IMPORTANT FORMATTING:
- Use emoji section headers (📌, 🧠, 📊, ✅, ⚠️, 📝, 💡, ⚡)
- **Bold** all key terms on first mention
- Use tables for comparisons
- Create ASCII diagrams or visual representations
- Include "💡 Pro Tip" boxes
- For math: use LaTeX \\( expression \\) or $$expression$$
- Place exactly 5 image markers [IMAGE_PLACEHOLDER_1] through [IMAGE_PLACEHOLDER_5] at the most relevant points.`;

    const messages: Message[] = [{ id: '1', role: 'user', content: prompt }];
    let response = '';

    try {
      await streamChat({
        messages,
        adaptiveLevel: currentLevel,
        learningStyle: getLearningStylePrompt(),
        onDelta: (chunk) => {
          response += chunk;
          setLectureContent(response);
        },
        onDone: async () => {
          setLectureLoading(false);
          fetchLectureImages(label, centerTopic);
        },
        onError: (error) => {
          setLectureLoading(false);
          toast.error(error.message);
        },
      });
    } catch {
      setLectureLoading(false);
    }
  }, [mindMap, language, currentLevel, getLearningStylePrompt]);

  // ─── Fetch lecture images (Wikipedia + AI diagrams) ─────────────────────────

  const fetchLectureImages = useCallback(async (label: string, centerTopic: string) => {
    const allImages: string[] = [];
    try {
      const fillerWords = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'is', 'are', 'and', 'to', 'for']);
      const coreWords = label.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !fillerWords.has(w));
      const searchTerms = [`${label} ${centerTopic}`, label];
      const seenUrls = new Set<string>();

      for (const term of searchTerms) {
        if (allImages.length >= 2) break;
        const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrlimit=8&prop=pageimages&piprop=thumbnail&pithumbsize=600&format=json&origin=*`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const pages = data.query?.pages;
        if (!pages) continue;
        for (const page of Object.values(pages).sort((a: any, b: any) => (a.index || 0) - (b.index || 0)) as any[]) {
          if (allImages.length >= 2) break;
          const thumb = page.thumbnail?.source;
          if (!thumb || seenUrls.has(thumb) || thumb.endsWith('.svg')) continue;
          if (page.thumbnail?.width < 150) continue;
          const titleLower = (page.title || '').toLowerCase();
          if (coreWords.some(w => titleLower.includes(w))) {
            seenUrls.add(thumb);
            allImages.push(thumb);
          }
        }
      }
    } catch { /* ignore */ }

    // AI diagrams
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-diagram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ subject: centerTopic, topic: label, grade: 'General', count: 3 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.images?.length) allImages.push(...data.images);
      }
    } catch { /* ignore */ }

    if (allImages.length > 0) setLectureImages(allImages);
  }, []);

  // ─── Unified tap handler using onPointerUp ─────────────────────────────────

  const handleNodeTap = useCallback((path: number[], label: string) => {
    const now = Date.now();
    const pathKey = path.join(',');
    const last = lastClickRef.current;

    // Check for double-tap on same node within 400ms
    if (last && now - last.time < 400 && last.pathKey === pathKey) {
      // Double tap → expand
      lastClickRef.current = null;
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      expandNodeByPath(path);
    } else {
      // First tap — record and wait
      lastClickRef.current = { pathKey, time: now };
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        lastClickRef.current = null;
        // Single tap → lecture
        if (label) generateLecture(label);
      }, 450);
    }
  }, [expandNodeByPath, generateLecture]);

  // Center node tap — only lecture, no expansion
  const handleCenterTap = useCallback((label: string) => {
    generateLecture(label);
  }, [generateLecture]);

  // ─── Load from history ──────────────────────────────────────────────────────

  const loadFromHistory = useCallback((item: SavedMindMap) => {
    setMindMap(sanitizeMindMapData(item.mind_map_data));
    setTopic(item.topic);
    setHistoryOpen(false);
  }, []);

  // ─── SVG layout calculations ───────────────────────────────────────────────

  const viewBoxSize = 1100;
  const cx = viewBoxSize / 2;
  const cy = viewBoxSize / 2;

  const renderMindMapSVG = () => {
    if (!mindMap) return null;

    const branches = mindMap.branches;
    const branchCount = branches.length;
    const elements: JSX.Element[] = [];
    const branchR = Math.max(160, Math.min(280, 1100 / (branchCount + 2)));
    const centerColor = BRANCH_COLORS[0];

    // Center node
    elements.push(
      <g key="center" className="cursor-pointer" onPointerUp={() => handleCenterTap(mindMap.center)}>
        <circle cx={cx} cy={cy} r={50}
          fill={centerColor} opacity={0.9}
          style={{
            transform: animated ? 'scale(1)' : 'scale(0)',
            transformOrigin: `${cx}px ${cy}px`,
            transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
        <SvgLabel x={cx} y={cy} text={mindMap.center} maxChars={20} fontSize={12} fill="white" fontWeight="bold" />
      </g>
    );

    // Recursive renderer for nodes at any depth
    const renderNode = (
      node: MindMapNode,
      path: number[],
      parentX: number, parentY: number,
      nodeX: number, nodeY: number,
      color: string, delay: number, radius: number,
      maxChars: number, fontSize: number
    ) => {
      const pathKey = path.join('-');
      const isExpanding = expandingNode === node.label;

      // Line from parent to this node
      elements.push(
        <line key={`line-${pathKey}`}
          x1={animated ? parentX : cx} y1={animated ? parentY : cy}
          x2={animated ? nodeX : cx} y2={animated ? nodeY : cy}
          stroke={color} strokeWidth={Math.max(1, 2.5 - path.length * 0.5)} opacity={Math.max(0.2, 0.6 - path.length * 0.1)}
          style={{ transition: `all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s` }}
        />
      );

      // Node circle + label
      elements.push(
        <g key={`node-${pathKey}`} className="cursor-pointer"
          onPointerUp={(e) => { e.stopPropagation(); handleNodeTap(path, node.label); }}
        >
          <circle
            cx={animated ? nodeX : cx} cy={animated ? nodeY : cy} r={radius}
            fill={color} opacity={Math.max(0.4, 0.85 - path.length * 0.15)}
            className="hover:opacity-100"
            style={{ transition: `all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s` }}
          />
          {isExpanding && (
            <circle cx={nodeX} cy={nodeY} r={radius + 4} fill="none" stroke={color} strokeWidth={1.5}
              className="animate-ping" opacity={0.3} />
          )}
          {animated && <SvgLabel x={nodeX} y={nodeY} text={node.label} maxChars={maxChars} fontSize={fontSize} fill="white" fontWeight="600" />}
        </g>
      );

      // Render children recursively
      const children = node.children || [];
      if (children.length > 0) {
        const parentAngle = Math.atan2(nodeY - parentX === cx ? cy : parentY, nodeX - (parentX === cx ? cx : parentX));
        const baseAngle = Math.atan2(nodeY - parentY, nodeX - parentX) * (180 / Math.PI);
        const childAngleSpread = Math.max(20, 45 / Math.max(children.length, 1));
        const childR = Math.max(40, radius * 2.2);
        const childRadius = Math.max(14, radius * 0.7);
        const childFontSize = Math.max(5.5, fontSize * 0.85);
        const childMaxChars = Math.max(10, maxChars - 2);

        children.forEach((child, ci) => {
          const childBaseAngle = baseAngle - (childAngleSpread * (children.length - 1)) / 2;
          const childAngle = childBaseAngle + ci * childAngleSpread;
          const childRad = (childAngle * Math.PI) / 180;
          const childNodeX = nodeX + childR * Math.cos(childRad);
          const childNodeY = nodeY + childR * Math.sin(childRad);
          const childDelay = delay + 0.12 + ci * 0.04;

          renderNode(
            child, [...path, ci],
            nodeX, nodeY, childNodeX, childNodeY,
            color, childDelay, childRadius,
            childMaxChars, childFontSize
          );
        });
      }
    };

    branches.forEach((branch, bi) => {
      const angle = (bi / branchCount) * 360 - 90;
      const rad = (angle * Math.PI) / 180;
      const bx = cx + branchR * Math.cos(rad);
      const by = cy + branchR * Math.sin(rad);
      const color = BRANCH_COLORS[(bi + 1) % BRANCH_COLORS.length];
      const delay = bi * 0.08;

      renderNode(branch, [bi], cx, cy, bx, by, color, delay, 36, 18, 10);
    });

    return elements;
  };

  return (
    <div className="flex flex-col h-full pt-14 pb-20">
      <div className="px-4 pt-4 pb-2">
        {/* Input form */}
        <div className="flex gap-2 mb-3">
          <Input
            placeholder={t('Enter a topic (e.g., Photosynthesis)', 'أدخل موضوعاً (مثل: التمثيل الضوئي)')}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generateMindMap()}
            disabled={loading}
            className="flex-1"
          />
          <Button onClick={() => generateMindMap()} disabled={loading || !topic.trim()} size="sm">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
          </Button>
          {/* History button */}
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="px-2">
            <Clock size={16} />
          </Button>
        </div>

        {/* Quick topics */}
        {!mindMap && !loading && (
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              t('Photosynthesis', 'التمثيل الضوئي'),
              t('World War II', 'الحرب العالمية الثانية'),
              t('Solar System', 'النظام الشمسي'),
              t('Algebra', 'الجبر'),
            ].map((q, i) => (
              <button
                key={i}
                onClick={() => { setTopic(q); generateMindMap(q); }}
                className="px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50 text-xs hover:border-primary/40 transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t('Generating mind map...', 'جارٍ إنشاء الخريطة الذهنية...')}</p>
          </div>
        </div>
      )}

      {/* Mind Map SVG */}
      {mindMap && !loading && (
        <div className="flex-1 relative overflow-hidden">
          {/* Zoom controls */}
          <div className="absolute top-2 right-4 z-10 flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))}>
              <ZoomIn size={14} />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))}>
              <ZoomOut size={14} />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => generateMindMap()}>
              <RefreshCw size={14} />
            </Button>
          </div>

          <div
            className="w-full h-full overflow-auto flex items-center justify-center"
            style={{ minHeight: '400px', touchAction: 'manipulation' }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
              className="transition-transform duration-300"
              style={{
                width: `${viewBoxSize * zoom}px`,
                height: `${viewBoxSize * zoom}px`,
                maxWidth: 'none',
                touchAction: 'manipulation',
              }}
            >
              {renderMindMapSVG()}
            </svg>
          </div>

          <p className="text-center text-[10px] text-muted-foreground mt-2 px-4">
            {t('Tap to learn · Double-tap to expand', 'اضغط للتعلم · اضغط مرتين للتوسيع')}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!mindMap && !loading && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Brain className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">{t('AI Mind Maps', 'خرائط ذهنية بالذكاء الاصطناعي')}</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {t(
                'Enter any topic and watch AI generate an interactive mind map you can explore and expand.',
                'أدخل أي موضوع وشاهد الذكاء الاصطناعي ينشئ خريطة ذهنية تفاعلية يمكنك استكشافها وتوسيعها.'
              )}
            </p>
            {history.length > 0 && (
              <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => setHistoryOpen(true)}>
                <Clock size={14} />
                {t('View History', 'عرض السجل')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ─── Lecture Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={lectureOpen} onOpenChange={setLectureOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="sticky top-0 bg-background/95 backdrop-blur z-10 pb-3 border-b border-border/50">
            <SheetTitle className="text-lg flex items-center gap-2">
              <Brain size={18} className="text-primary" />
              {lectureLabel}
            </SheetTitle>
          </SheetHeader>

          <div className="pt-4 pb-8 px-1">
            {lectureLoading && !lectureContent && (
              <div className="flex items-center gap-2 justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  {t('Generating lecture...', 'جارٍ إنشاء الدرس...')}
                </span>
              </div>
            )}

            {lectureContent && (
              <div className="prose prose-sm max-w-none">
                <MathRenderer
                  content={lectureImages.length > 0
                    ? mergeImagesIntoContent(lectureContent, urlsToInlineImages(lectureImages, lectureLabel))
                    : lectureContent
                  }
                  className="whitespace-pre-wrap text-sm leading-relaxed"
                />
              </div>
            )}

            {lectureLoading && lectureContent && (
              <div className="flex items-center gap-2 mt-4 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">{t('Still writing...', 'ما زال يكتب...')}</span>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── History Sheet ────────────────────────────────────────────────── */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="bottom" className="h-[60vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="pb-3 border-b border-border/50">
            <SheetTitle className="flex items-center gap-2">
              <Clock size={18} className="text-primary" />
              {t('Mind Map History', 'سجل الخرائط الذهنية')}
            </SheetTitle>
          </SheetHeader>

          <div className="pt-4 space-y-2">
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('No saved mind maps yet', 'لا توجد خرائط ذهنية محفوظة بعد')}
              </p>
            )}
            {history.map(item => (
              <div key={item.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/30 hover:bg-secondary/50 transition-all"
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => loadFromHistory(item)}
                >
                  <p className="font-medium text-sm">{item.topic}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </button>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.id); }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
