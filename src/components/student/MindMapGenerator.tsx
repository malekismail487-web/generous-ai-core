import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { useAdaptiveLevel } from '@/hooks/useAdaptiveLevel';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Brain, Loader2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';

interface MindMapNode {
  label: string;
  children?: MindMapNode[];
  expanded?: boolean;
}

interface MindMapData {
  center: string;
  branches: MindMapNode[];
}

function extractJsonFromResponse(response: string): unknown {
  let cleaned = response
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  let braceDepth = 0;
  let jsonStart = -1;
  let jsonEnd = -1;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '{') {
      if (braceDepth === 0) jsonStart = i;
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
      if (braceDepth === 0 && jsonStart !== -1) {
        jsonEnd = i;
        break;
      }
    }
  }

  if (jsonStart === -1 || jsonEnd === -1) {
    // Try repair if unbalanced
    if (jsonStart !== -1 && jsonEnd === -1) {
      let repaired = cleaned.substring(jsonStart);
      const open = (repaired.match(/{/g) || []).length;
      const close = (repaired.match(/}/g) || []).length;
      for (let i = 0; i < open - close; i++) repaired += '}';
      const openB = (repaired.match(/\[/g) || []).length;
      const closeB = (repaired.match(/\]/g) || []).length;
      for (let i = 0; i < openB - closeB; i++) repaired += ']';
      cleaned = repaired;
    } else {
      throw new Error('No JSON object found in response');
    }
  } else {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    cleaned = cleaned
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/[\x00-\x1F\x7F]/g, '');
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${e}`);
    }
  }
}

// Branch colors using HSL with design tokens
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

export function MindMapGenerator() {
  const { user } = useAuth();
  const { t, language } = useThemeLanguage();
  const { currentLevel } = useAdaptiveLevel();
  const [topic, setTopic] = useState('');
  const [mindMap, setMindMap] = useState<MindMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandingNode, setExpandingNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const generateMindMap = useCallback(async (inputTopic?: string) => {
    const t_topic = inputTopic || topic.trim();
    if (!t_topic || !user) return;

    setLoading(true);
    setMindMap(null);

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
    },
    {
      "label": "Subtopic 2",
      "children": [
        { "label": "Detail C" },
        { "label": "Detail D" }
      ]
    }
  ]
}

Generate 4-6 main branches with 2-4 children each. Keep labels concise (2-5 words). Make it educational and comprehensive for a ${currentLevel} level student.
${language === 'ar' ? 'Generate all labels in Arabic.' : ''}
CRITICAL: Return ONLY the raw JSON object. Do NOT wrap it in markdown code fences. Do NOT add any explanatory text before or after. Just the JSON.`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `Create a mind map about: ${t_topic}` }],
            systemPrompt,
            language,
          }),
        }
      );

      if (!response.ok || !response.body) throw new Error('Failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) fullContent += delta;
          } catch { /* partial */ }
        }
      }

      // Extract JSON from response
      const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const mapData: MindMapData = JSON.parse(jsonMatch[0]);
      if (!mapData.center || !mapData.branches) throw new Error('Invalid format');

      setMindMap(mapData);
    } catch (e) {
      console.error('Mind map generation error:', e);
      toast.error(t('Failed to generate mind map. Try again!', 'فشل في إنشاء الخريطة الذهنية. حاول مرة أخرى!'));
    }

    setLoading(false);
  }, [topic, user, currentLevel, language, t]);

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
Keep labels concise (2-5 words). ${language === 'ar' ? 'Use Arabic.' : ''}`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `Expand the subtopic: "${targetLabel}" (part of ${mindMap.center})` }],
            systemPrompt,
            language,
          }),
        }
      );

      if (!response.ok || !response.body) throw new Error('Failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) fullContent += delta;
          } catch { /* partial */ }
        }
      }

      const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');

      const newChildren: { children: MindMapNode[] } = JSON.parse(jsonMatch[0]);

      setMindMap(prev => {
        if (!prev) return prev;
        const updated = { ...prev, branches: [...prev.branches] };

        if (childIdx !== undefined) {
          const branch = { ...updated.branches[branchIdx] };
          const children = [...(branch.children || [])];
          children[childIdx] = {
            ...children[childIdx],
            children: newChildren.children,
            expanded: true,
          };
          branch.children = children;
          updated.branches[branchIdx] = branch;
        } else {
          const branch = { ...updated.branches[branchIdx] };
          const existingChildren = branch.children || [];
          branch.children = [...existingChildren, ...newChildren.children];
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

  // SVG dimensions
  const viewBoxSize = 600;
  const cx = viewBoxSize / 2;
  const cy = viewBoxSize / 2;

  const renderMindMapSVG = () => {
    if (!mindMap) return null;

    const branches = mindMap.branches;
    const branchCount = branches.length;
    const elements: JSX.Element[] = [];

    // Center node
    elements.push(
      <g key="center" className="cursor-pointer">
        <circle cx={cx} cy={cy} r={45} fill="hsl(var(--primary))" opacity={0.9} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="hsl(var(--primary-foreground))" fontSize={12} fontWeight="bold" className="pointer-events-none">
          {mindMap.center.length > 18 ? mindMap.center.slice(0, 18) + '…' : mindMap.center}
        </text>
      </g>
    );

    branches.forEach((branch, bi) => {
      const angle = (bi / branchCount) * 360 - 90;
      const rad = (angle * Math.PI) / 180;
      const branchR = 140;
      const bx = cx + branchR * Math.cos(rad);
      const by = cy + branchR * Math.sin(rad);
      const color = BRANCH_COLORS[bi % BRANCH_COLORS.length];

      // Line from center to branch
      elements.push(
        <line key={`line-${bi}`} x1={cx} y1={cy} x2={bx} y2={by}
          stroke={color} strokeWidth={2.5} opacity={0.6}
          className="transition-all duration-500"
        />
      );

      // Branch node
      const isExpanding = expandingNode === branch.label;
      elements.push(
        <g key={`branch-${bi}`} className="cursor-pointer" onClick={() => !branch.expanded && expandNode(bi)}>
          <circle cx={bx} cy={by} r={32} fill={color} opacity={0.85}
            className="transition-all duration-300 hover:opacity-100"
          />
          {isExpanding && (
            <circle cx={bx} cy={by} r={36} fill="none" stroke={color} strokeWidth={2}
              className="animate-ping" opacity={0.4}
            />
          )}
          <text x={bx} y={by} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={9} fontWeight="600" className="pointer-events-none">
            {branch.label.length > 14 ? branch.label.slice(0, 14) + '…' : branch.label}
          </text>
        </g>
      );

      // Children
      const children = branch.children || [];
      children.forEach((child, ci) => {
        const childAngleSpread = 40;
        const childBaseAngle = angle - (childAngleSpread * (children.length - 1)) / 2;
        const childAngle = childBaseAngle + ci * childAngleSpread;
        const childRad = (childAngle * Math.PI) / 180;
        const childR = 70;
        const childX = bx + childR * Math.cos(childRad);
        const childY = by + childR * Math.sin(childRad);

        elements.push(
          <line key={`cline-${bi}-${ci}`} x1={bx} y1={by} x2={childX} y2={childY}
            stroke={color} strokeWidth={1.5} opacity={0.35}
            className="transition-all duration-500"
          />
        );

        const isChildExpanding = expandingNode === child.label;
        elements.push(
          <g key={`child-${bi}-${ci}`} className="cursor-pointer"
            onClick={() => !child.expanded && expandNode(bi, ci)}
          >
            <circle cx={childX} cy={childY} r={22} fill={color} opacity={0.6}
              className="transition-all duration-300 hover:opacity-85"
            />
            {isChildExpanding && (
              <circle cx={childX} cy={childY} r={26} fill="none" stroke={color} strokeWidth={1.5}
                className="animate-ping" opacity={0.3}
              />
            )}
            <text x={childX} y={childY} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={7} fontWeight="500" className="pointer-events-none">
              {child.label.length > 12 ? child.label.slice(0, 12) + '…' : child.label}
            </text>
          </g>
        );

        // Grandchildren (from expansion)
        if (child.children) {
          child.children.forEach((gc, gi) => {
            const gcAngleSpread = 25;
            const gcBaseAngle = childAngle - (gcAngleSpread * (child.children!.length - 1)) / 2;
            const gcAngle = gcBaseAngle + gi * gcAngleSpread;
            const gcRad = (gcAngle * Math.PI) / 180;
            const gcR = 45;
            const gcX = childX + gcR * Math.cos(gcRad);
            const gcY = childY + gcR * Math.sin(gcRad);

            elements.push(
              <line key={`gcline-${bi}-${ci}-${gi}`} x1={childX} y1={childY} x2={gcX} y2={gcY}
                stroke={color} strokeWidth={1} opacity={0.25}
              />
            );
            elements.push(
              <g key={`gc-${bi}-${ci}-${gi}`}>
                <circle cx={gcX} cy={gcY} r={16} fill={color} opacity={0.4} />
                <text x={gcX} y={gcY} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={6} className="pointer-events-none">
                  {gc.label.length > 10 ? gc.label.slice(0, 10) + '…' : gc.label}
                </text>
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
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(z + 0.2, 2))}>
              <ZoomIn size={14} />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))}>
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
            {t('Tap any node to expand it with more details', 'اضغط على أي عقدة لتوسيعها بمزيد من التفاصيل')}
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
          </div>
        </div>
      )}
    </div>
  );
}
