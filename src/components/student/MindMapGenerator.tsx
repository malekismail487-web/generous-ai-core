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
  'hsl(var(--primary))',
  'hsl(220, 70%, 55%)',
  'hsl(160, 60%, 45%)',
  'hsl(35, 80%, 50%)',
  'hsl(280, 60%, 55%)',
  'hsl(10, 70%, 55%)',
  'hsl(190, 60%, 45%)',
  'hsl(330, 60%, 55%)',
];

// ─── Multi-line SVG text helper ────────────────────────────────────────────────

function SvgLabel({ x, y, text, maxChars, fontSize, fill, fontWeight }: {
  x: number; y: number; text: string; maxChars: number; fontSize: number; fill: string; fontWeight: string;
}) {
  if (text.length <= maxChars) {
    return (
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fill={fill} fontSize={fontSize} fontWeight={fontWeight} className="pointer-events-none">
        {text}
      </text>
    );
  }
  // Word wrap into lines
  const words = text.split(' ');
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
    <text x={x} textAnchor="middle" fill={fill} fontSize={fontSize} fontWeight={fontWeight} className="pointer-events-none">
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? startY - y : lineHeight} dominantBaseline="central">
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

  // Dual-tap state
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const mapData = extractJsonFromResponse(fullContent) as MindMapData;
      if (!mapData.center || !mapData.branches) throw new Error('Invalid format');
      // Filter out branches/children with empty labels
      mapData.branches = mapData.branches
        .filter(b => b.label && b.label.trim())
        .map(b => ({
          ...b,
          children: (b.children || []).filter(c => c.label && c.label.trim()),
        }));

      setMindMap(mapData);
      saveMindMap(mapData, t_topic);
    } catch (e) {
      console.error('Mind map generation error:', e);
      toast.error(t('Failed to generate mind map. Try again!', 'فشل في إنشاء الخريطة الذهنية. حاول مرة أخرى!'));
    }

    setLoading(false);
  }, [topic, user, currentLevel, language, t, saveMindMap]);

  // ─── Expand node (double tap) ───────────────────────────────────────────────

  const expandNode = useCallback(async (branchIdx: number, childIdx?: number) => {
    if (!mindMap || !user) return;

    const targetLabel = childIdx !== undefined
      ? mindMap.branches[branchIdx]?.children?.[childIdx]?.label
      : mindMap.branches[branchIdx]?.label;

    if (!targetLabel) return;
    setExpandingNode(targetLabel);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const systemPrompt = `You are expanding a mind map node. Given a subtopic of "${mindMap.center}", return ONLY valid JSON with 3-4 new child nodes:
{ "children": [{ "label": "Detail 1" }, { "label": "Detail 2" }, { "label": "Detail 3" }] }
Keep labels concise (2-5 words). ${language === 'ar' ? 'Use Arabic.' : ''}
CRITICAL: Return ONLY the raw JSON object. No markdown, no code fences, no explanation.`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `Expand the subtopic: "${targetLabel}" (part of ${mindMap.center})` }],
            systemPrompt,
            language,
          }),
        }
      );

      if (!response.ok || !response.body) throw new Error('Failed');
      const fullContent = await readChatStream(response);
      const newChildren = extractJsonFromResponse(fullContent) as { children: MindMapNode[] };
      // Filter empty labels
      const validChildren = (newChildren.children || []).filter(c => c.label && c.label.trim());

      setMindMap(prev => {
        if (!prev) return prev;
        const updated = { ...prev, branches: [...prev.branches] };
        if (childIdx !== undefined) {
          const branch = { ...updated.branches[branchIdx] };
          const children = [...(branch.children || [])];
          children[childIdx] = { ...children[childIdx], children: validChildren, expanded: true };
          branch.children = children;
          updated.branches[branchIdx] = branch;
        } else {
          const branch = { ...updated.branches[branchIdx] };
          branch.children = [...(branch.children || []), ...validChildren];
          branch.expanded = true;
          updated.branches[branchIdx] = branch;
        }
        return updated;
      });
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
          // Fetch images
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

  // ─── Dual tap handler ──────────────────────────────────────────────────────

  const handleNodeClick = useCallback((branchIdx: number, childIdx?: number, label?: string) => {
    if (clickTimerRef.current) {
      // Double tap → expand
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      const target = childIdx !== undefined
        ? mindMap?.branches[branchIdx]?.children?.[childIdx]
        : mindMap?.branches[branchIdx];
      if (target && !target.expanded) {
        expandNode(branchIdx, childIdx);
      }
    } else {
      // Wait for potential second tap
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        // Single tap → lecture
        if (label) generateLecture(label);
      }, 300);
    }
  }, [mindMap, expandNode, generateLecture]);

  // ─── Load from history ──────────────────────────────────────────────────────

  const loadFromHistory = useCallback((item: SavedMindMap) => {
    setMindMap(item.mind_map_data);
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

    // Center node
    elements.push(
      <g key="center" className="cursor-pointer" onClick={() => generateLecture(mindMap.center)}>
        <circle cx={cx} cy={cy} r={50}
          fill="hsl(var(--primary))" opacity={0.9}
          style={{
            transform: animated ? 'scale(1)' : 'scale(0)',
            transformOrigin: `${cx}px ${cy}px`,
            transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
        <SvgLabel x={cx} y={cy} text={mindMap.center} maxChars={20} fontSize={12} fill="hsl(var(--primary-foreground))" fontWeight="bold" />
      </g>
    );

    branches.forEach((branch, bi) => {
      const angle = (bi / branchCount) * 360 - 90;
      const rad = (angle * Math.PI) / 180;
      const bx = cx + branchR * Math.cos(rad);
      const by = cy + branchR * Math.sin(rad);
      const color = BRANCH_COLORS[bi % BRANCH_COLORS.length];
      const delay = bi * 0.08;

      // Line center→branch
      elements.push(
        <line key={`line-${bi}`}
          x1={cx} y1={cy}
          x2={animated ? bx : cx} y2={animated ? by : cy}
          stroke={color} strokeWidth={2.5} opacity={0.6}
          style={{ transition: `all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s` }}
        />
      );

      // Branch node
      const isExpanding = expandingNode === branch.label;
      elements.push(
        <g key={`branch-${bi}`} className="cursor-pointer"
          onClick={() => handleNodeClick(bi, undefined, branch.label)}
        >
          <circle cx={animated ? bx : cx} cy={animated ? by : cy} r={36}
            fill={color} opacity={0.85}
            style={{
              transition: `all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s`,
            }}
            className="hover:opacity-100"
          />
          {isExpanding && (
            <circle cx={bx} cy={by} r={40} fill="none" stroke={color} strokeWidth={2}
              className="animate-ping" opacity={0.4} />
          )}
          {animated && <SvgLabel x={bx} y={by} text={branch.label} maxChars={18} fontSize={10} fill="white" fontWeight="600" />}
        </g>
      );

      // Children
      const children = branch.children || [];
      const childAngleSpread = Math.max(25, 50 / Math.max(children.length, 1));
      children.forEach((child, ci) => {
        const childBaseAngle = angle - (childAngleSpread * (children.length - 1)) / 2;
        const childAngle = childBaseAngle + ci * childAngleSpread;
        const childRad = (childAngle * Math.PI) / 180;
        const childR = 100;
        const childX = bx + childR * Math.cos(childRad);
        const childY = by + childR * Math.sin(childRad);
        const childDelay = delay + 0.15 + ci * 0.05;

        elements.push(
          <line key={`cline-${bi}-${ci}`}
            x1={animated ? bx : cx} y1={animated ? by : cy}
            x2={animated ? childX : cx} y2={animated ? childY : cy}
            stroke={color} strokeWidth={1.5} opacity={0.35}
            style={{ transition: `all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${childDelay}s` }}
          />
        );

        const isChildExpanding = expandingNode === child.label;
        elements.push(
          <g key={`child-${bi}-${ci}`} className="cursor-pointer"
            onClick={() => handleNodeClick(bi, ci, child.label)}
          >
            <circle
              cx={animated ? childX : cx} cy={animated ? childY : cy} r={26}
              fill={color} opacity={0.6}
              className="hover:opacity-85"
              style={{ transition: `all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${childDelay}s` }}
            />
            {isChildExpanding && (
              <circle cx={childX} cy={childY} r={30} fill="none" stroke={color} strokeWidth={1.5}
                className="animate-ping" opacity={0.3} />
            )}
            {animated && <SvgLabel x={childX} y={childY} text={child.label} maxChars={16} fontSize={8} fill="white" fontWeight="500" />}
          </g>
        );

        // Grandchildren
        if (child.children) {
          child.children.forEach((gc, gi) => {
            const gcAngleSpread = 25;
            const gcBaseAngle = childAngle - (gcAngleSpread * (child.children!.length - 1)) / 2;
            const gcAngle = gcBaseAngle + gi * gcAngleSpread;
            const gcRad = (gcAngle * Math.PI) / 180;
            const gcR = 50;
            const gcX = childX + gcR * Math.cos(gcRad);
            const gcY = childY + gcR * Math.sin(gcRad);
            const gcDelay = childDelay + 0.1 + gi * 0.04;

            elements.push(
              <line key={`gcline-${bi}-${ci}-${gi}`}
                x1={animated ? childX : cx} y1={animated ? childY : cy}
                x2={animated ? gcX : cx} y2={animated ? gcY : cy}
                stroke={color} strokeWidth={1} opacity={0.25}
                style={{ transition: `all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${gcDelay}s` }}
              />
            );
            elements.push(
              <g key={`gc-${bi}-${ci}-${gi}`} className="cursor-pointer"
                onClick={() => generateLecture(gc.label)}
              >
                <circle
                  cx={animated ? gcX : cx} cy={animated ? gcY : cy} r={18}
                  fill={color} opacity={0.4}
                  style={{ transition: `all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${gcDelay}s` }}
                />
                {animated && <SvgLabel x={gcX} y={gcY} text={gc.label} maxChars={12} fontSize={6.5} fill="white" fontWeight="500" />}
              </g>
            );
          });
        }
      });
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

          <div className="w-full h-full overflow-auto flex items-center justify-center" style={{ minHeight: '400px' }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
              className="transition-transform duration-300"
              style={{
                width: `${viewBoxSize * zoom}px`,
                height: `${viewBoxSize * zoom}px`,
                maxWidth: 'none',
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
