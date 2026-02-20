import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAdaptiveLevel } from '@/hooks/useAdaptiveLevel';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { useConversations } from '@/hooks/useConversations';
import { supabase } from '@/integrations/supabase/client';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { TypingIndicator } from '@/components/TypingIndicator';
import { Brain, TrendingUp, History, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; images?: { src: string; alt?: string }[] };

const THINKING_STYLES = [
  {
    id: 'visual',
    label: '🎨 Visual',
    desc: 'Diagrams, images & visual links',
    systemExtra: `THINKING STYLE: VISUAL LEARNER
- Use ASCII art diagrams, tables, and spatial layouts to explain concepts visually
- Organize information visually with clear headers, bullet points, and structured layouts
- Describe what diagrams or images would look like in detail
- Use tables to compare and contrast concepts
- Structure your response with clear visual hierarchy using markdown headers and lists
- Real educational images will be automatically provided below your response — do NOT generate image URLs yourself`,
  },
  {
    id: 'logical',
    label: '🧮 Logical',
    desc: 'Step-by-step structured reasoning',
    systemExtra: `THINKING STYLE: LOGICAL/ANALYTICAL LEARNER
- Use numbered steps for EVERY explanation
- Show cause → effect chains explicitly
- Use "If...then..." reasoning patterns
- Include logical proofs and structured arguments
- Present information in systematic order: Definition → Properties → Examples → Applications
- Use flowcharts in text form: Step 1 → Step 2 → Step 3
- Always explain WHY each step follows from the previous one
- Include practice problems that test logical reasoning`,
  },
  {
    id: 'verbal',
    label: '📝 Verbal',
    desc: 'Rich explanations & storytelling',
    systemExtra: `THINKING STYLE: VERBAL/LINGUISTIC LEARNER
- Use rich, narrative explanations with storytelling
- Include analogies, metaphors, and real-world comparisons
- Tell the "story" behind concepts — who discovered it, why it matters
- Use mnemonics and memory tricks with words
- Explain concepts as if telling a fascinating story
- Include relevant quotes from scientists/thinkers
- Use word origins (etymology) to help remember terms
- Write engaging, readable paragraphs that flow naturally`,
  },
  {
    id: 'practical',
    label: '🔧 Practical',
    desc: 'Hands-on examples & exercises',
    systemExtra: `THINKING STYLE: KINESTHETIC/PRACTICAL LEARNER
- Start EVERY explanation with a concrete, real-world example
- Include hands-on exercises and "try this yourself" activities
- Connect every concept to something the student can DO or BUILD
- Provide practice problems immediately after explaining
- Use "experiment" framing: "Try this: take a piece of paper and..."
- Include real-world applications: "This is used in cooking when..."
- Give step-by-step DIY activities that demonstrate the concept
- Always end with a practical challenge or mini-project`,
  },
];

// Local storage key for Study Buddy conversation memory
const MEMORY_KEY = 'study-buddy-memory';
const STYLE_KEY = 'study-buddy-style';

interface ConversationMemory {
  messages: Msg[];
  thinkingStyle: string | null;
  lastUpdated: string;
}

function loadMemory(): ConversationMemory | null {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveMemory(messages: Msg[], thinkingStyle: string | null) {
  const memory: ConversationMemory = {
    messages: messages.slice(-50), // Keep last 50 messages
    thinkingStyle,
    lastUpdated: new Date().toISOString(),
  };
  localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
}

function loadSavedStyle(): string | null {
  return localStorage.getItem(STYLE_KEY);
}

function saveStyle(style: string) {
  localStorage.setItem(STYLE_KEY, style);
}

export function StudyBuddy() {
  const { user } = useAuth();
  const { currentLevel, profiles, getLevelPrompt } = useAdaptiveLevel();
  const { t, language } = useThemeLanguage();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingStyle, setThinkingStyle] = useState<string | null>(null);
  const [showStylePicker, setShowStylePicker] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch relevant educational images from Wikipedia using direct topic search
  const fetchWikipediaImages = useCallback(async (query: string): Promise<{ src: string; alt?: string }[]> => {
    try {
      const keywords = query.replace(/[?!.,]/g, '').trim();
      
      // Extract core topic words, removing filler words
      const fillerWords = new Set(['please', 'show', 'me', 'the', 'and', 'explain', 'it', 'to', 'bring', 'photos', 'for', 'about', 'tell', 'teach', 'help', 'understand', 'what', 'is', 'are', 'how', 'does', 'can', 'you', 'i', 'a', 'an', 'of', 'in', 'on', 'with']);
      const coreWords = keywords.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !fillerWords.has(w));
      const coreTopic = coreWords.join(' ') || keywords;

      // Search directly for the topic — no generic suffixes
      const searchVariants = [
        coreTopic,
        `${coreTopic} biology`,
        `${coreTopic} botany`,
      ];

      const irrelevantPatterns = /community|forum|software|band|album|film|movie|tv series|video game|disambiguation|logo|icon|screenshot|code|terminal|computer|programming|website|online|internet|chat|social media|CERN|particle|nuclear|energy source|power plant|electricity|debate|policy|politic/i;
      const imgs: { src: string; alt?: string }[] = [];
      const seenUrls = new Set<string>();

      for (const searchTerm of searchVariants) {
        if (imgs.length >= 3) break;
        const encoded = encodeURIComponent(searchTerm);
        const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encoded}&gsrlimit=10&prop=pageimages|description|categories&piprop=thumbnail&pithumbsize=600&format=json&origin=*`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const pages = data.query?.pages;
        if (!pages) continue;

        const sorted = Object.values(pages).sort((a: any, b: any) => (a.index || 0) - (b.index || 0));

        for (const page of sorted as any[]) {
          if (imgs.length >= 3) break;
          const thumb = page.thumbnail?.source;
          const title = page.title || '';
          const desc = page.description || '';
          if (!thumb || seenUrls.has(thumb)) continue;
          if (thumb.endsWith('.svg')) continue;
          if (page.thumbnail?.width < 150 || page.thumbnail?.height < 100) continue;
          if (irrelevantPatterns.test(title) || irrelevantPatterns.test(desc)) continue;
          // Every image must have keyword overlap with the core topic
          const titleLower = title.toLowerCase() + ' ' + desc.toLowerCase();
          const hasRelevance = coreWords.some(w => titleLower.includes(w));
          if (!hasRelevance) continue;
          
          seenUrls.add(thumb);
          imgs.push({ src: thumb, alt: title });
        }
      }
      return imgs;
    } catch {
      return [];
    }
  }, []);

  // Load saved memory and style on mount
  useEffect(() => {
    const savedStyle = loadSavedStyle();
    if (savedStyle) {
      setThinkingStyle(savedStyle);
    }
    const memory = loadMemory();
    if (memory && memory.messages.length > 0) {
      setMessages(memory.messages);
      setShowStylePicker(false);
      if (memory.thinkingStyle) {
        setThinkingStyle(memory.thinkingStyle);
      }
    }
  }, []);

  // Save memory whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveMemory(messages, thinkingStyle);
    }
  }, [messages, thinkingStyle]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle thinking style selection — actually starts a conversation
  const handleStyleSelect = (styleId: string) => {
    setThinkingStyle(styleId);
    saveStyle(styleId);
    const style = THINKING_STYLES.find(s => s.id === styleId);
    toast.success(t(
      `${style?.label} mode activated! Your AI tutor will now teach in this style.`,
      `تم تفعيل وضع ${style?.label}! سيقوم معلمك بالتدريس بهذا الأسلوب.`
    ));
    // Send an intro message from the AI
    const introMsg = t(
      `Great choice! I'll teach you using a **${style?.label.replace(/^..\s/, '')}** approach. ${
        styleId === 'visual' ? "I'll include images, diagrams, and visual links in every explanation." :
        styleId === 'logical' ? "I'll break everything down into clear, numbered logical steps." :
        styleId === 'verbal' ? "I'll use rich storytelling, analogies, and engaging narratives." :
        "I'll give you hands-on examples and practical exercises you can try right away."
      } Ask me anything!`,
      `اختيار رائع! سأعلمك باستخدام أسلوب **${style?.label.replace(/^..\s/, '')}**. اسألني أي شيء!`
    );
    setMessages([{ id: crypto.randomUUID(), role: 'assistant', content: introMsg }]);
    setShowStylePicker(false);
  };

  const handleClearMemory = () => {
    setMessages([]);
    localStorage.removeItem(MEMORY_KEY);
    setShowStylePicker(true);
    toast.success(t('Conversation cleared!', 'تم مسح المحادثة!'));
  };

  const buildSystemPrompt = useCallback(() => {
    const levelPrompt = getLevelPrompt();

    const subjectBreakdown = profiles.length > 0
      ? profiles.map(p =>
          `- ${p.subject}: ${p.difficulty_level} level (${p.recent_accuracy}% accuracy, ${p.total_questions_answered} questions answered)`
        ).join('\n')
      : 'No learning data yet.';

    const styleConfig = THINKING_STYLES.find(s => s.id === thinkingStyle);
    const styleInstructions = styleConfig?.systemExtra || '';

    const langInstruction = language === 'ar'
      ? 'CRITICAL: You MUST respond entirely in Arabic. Use Arabic for all explanations. Keep LaTeX math notation in standard format.'
      : '';

    // Build conversation memory summary from previous messages
    const memoryContext = messages.length > 0
      ? `\n\nCONVERSATION HISTORY CONTEXT:\nYou have been chatting with this student. Here are previous topics discussed: ${
          messages.filter(m => m.role === 'user').slice(-10).map(m => m.content).join('; ')
        }. Use this to provide continuity and reference past discussions naturally.`
      : '';

    return `You are Study Buddy — a brilliant, adaptive AI tutor that personalizes learning to each student's unique thinking style and level.

${levelPrompt}

STUDENT'S LEARNING PROFILE:
${subjectBreakdown}

${styleInstructions}

YOUR APPROACH:
1. ADAPT your explanations to match the student's proven level per subject
2. When they struggle (low accuracy subjects), break concepts down further
3. When they excel (high accuracy), challenge them with deeper insights
4. Reference their past performance naturally: "Since you're strong in X, let's connect this to..."
5. Teach them HOW to think, not just WHAT to think — explain your reasoning process
6. Ask probing questions that develop critical thinking
7. Celebrate progress and gently address weak areas
8. If they ask about a weak subject, use their strong subject as a bridge
9. REMEMBER past conversations — reference what you've discussed before
${memoryContext}

${langInstruction}

CRITICAL RULES:
- NEVER generate image URLs, image links, or markdown images (![alt](url)). Real educational images are automatically provided below your response.
- NEVER generate YouTube links or video URLs — they will be broken and lead to "page not found". Only mention video topics the student can search for themselves (e.g. "Search YouTube for 'photosynthesis animation'").
- NEVER include any URLs or links unless you are 100% certain they are real, permanent, and accessible. If unsure, do NOT include a link.
- When referencing external resources, say "Search for [topic] on [platform]" instead of providing a URL.

Be warm, encouraging, and intellectually stimulating. You're not just answering questions — you're developing a thinker.`;
  }, [getLevelPrompt, profiles, thinkingStyle, language, messages]);

  const sendMessage = async (content: string) => {
    if (!user) return;

    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setShowStylePicker(false);

    let assistantContent = '';
    const assistantId = crypto.randomUUID();

    try {
      const systemPrompt = buildSystemPrompt();
      const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            messages: allMessages,
            systemPrompt,
            language,
            adaptiveLevel: currentLevel,
          }),
        }
      );

      if (!response.ok || !response.body) throw new Error('Stream failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.id === assistantId) {
                  return prev.map((m) => m.id === assistantId ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { id: assistantId, role: 'assistant', content: assistantContent }];
              });
            }
          } catch { /* partial json */ }
        }
      }

      // After streaming is done, always fetch real images from Wikipedia
      if (assistantContent) {
        const searchQuery = content;
        const imgs = await fetchWikipediaImages(searchQuery);
        if (imgs.length > 0) {
          setMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, images: imgs } : m)
          );
        }
      }
    } catch (e) {
      console.error('Study Buddy error:', e);
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        content: t('Sorry, I had trouble connecting. Please check your API key in Profile settings and try again!', 'عذرًا، واجهت مشكلة في الاتصال. تحقق من مفتاح API في إعدادات الملف الشخصي وحاول مرة أخرى!'),
      }]);
    }

    setIsLoading(false);
  };

  const activeStyle = THINKING_STYLES.find(s => s.id === thinkingStyle);

  return (
    <div className="flex flex-col h-full pt-14">
      <main className="flex-1 overflow-y-auto pb-36">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {/* Study Buddy Header */}
          {messages.length === 0 && showStylePicker && (
            <div className="text-center py-6 animate-fade-in">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 mb-4 shadow-lg">
                <Brain className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">{t('Study Buddy', 'رفيق الدراسة')}</h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-1">
                {t(
                  'Your personal AI tutor that adapts to how YOU think and learn.',
                  'معلمك الذكي الشخصي الذي يتكيف مع طريقة تفكيرك وتعلمك.'
                )}
              </p>

              {/* Adaptive Level Badge */}
              <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <TrendingUp size={14} className="text-primary" />
                <span className="text-xs font-medium text-primary capitalize">
                  {t(`Level: ${currentLevel}`, `المستوى: ${currentLevel === 'beginner' ? 'مبتدئ' : currentLevel === 'intermediate' ? 'متوسط' : 'متقدم'}`)}
                </span>
              </div>

              {/* Thinking Style Picker — these buttons START the session */}
              <div className="mt-6 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">
                  {t('Choose your learning style to begin:', 'اختر أسلوب التعلم للبدء:')}
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
                  {THINKING_STYLES.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => handleStyleSelect(style.id)}
                      className={cn(
                        "p-3 rounded-xl border text-left transition-all text-sm hover:scale-[1.02] active:scale-95",
                        "border-border/50 hover:border-primary/60 hover:bg-primary/5 hover:shadow-md"
                      )}
                    >
                      <span className="font-medium">{style.label}</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{style.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Prompts */}
              <div className="mt-6 space-y-2 max-w-md mx-auto">
                <p className="text-xs text-muted-foreground">{t('Or just ask anything:', 'أو اسأل أي شيء:')}</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    t("Help me understand fractions", "ساعدني في فهم الكسور"),
                    t("Why do we need algebra?", "لماذا نحتاج الجبر؟"),
                    t("Explain photosynthesis", "اشرح التمثيل الضوئي"),
                    t("What are my weak subjects?", "ما هي المواد الضعيفة لدي؟"),
                  ].map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (!thinkingStyle) setThinkingStyle('logical');
                        sendMessage(prompt);
                      }}
                      className="px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50 text-xs hover:border-primary/40 transition-all"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Active session header with style badge + controls */}
          {messages.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  {activeStyle && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
                      {activeStyle.label} Mode
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground capitalize">
                    {t(`Level: ${currentLevel}`, `المستوى: ${currentLevel}`)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {/* Change style button */}
                  <button
                    onClick={() => {
                      setShowStylePicker(true);
                      setMessages([]);
                      localStorage.removeItem(MEMORY_KEY);
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                    title={t('Change learning style', 'تغيير أسلوب التعلم')}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  {/* Clear memory button */}
                  <button
                    onClick={handleClearMemory}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                    title={t('Clear conversation', 'مسح المحادثة')}
                  >
                    <History size={16} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="space-y-3">
                {messages.map((msg, idx) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    isStreaming={isLoading && msg.role === 'assistant' && idx === messages.length - 1}
                  />
                ))}
                {isLoading && messages[messages.length - 1]?.role === 'user' && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="fixed bottom-16 left-0 right-0 glass-effect-strong border-t border-border/30 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <ChatInput
            onSend={sendMessage}
            disabled={isLoading}
          />
        </div>
      </footer>
    </div>
  );
}
