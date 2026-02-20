import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAdaptiveLevel } from '@/hooks/useAdaptiveLevel';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { supabase } from '@/integrations/supabase/client';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { TypingIndicator } from '@/components/TypingIndicator';
import { Brain, Sparkles, TrendingUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Msg = { id: string; role: 'user' | 'assistant'; content: string };

const THINKING_STYLES = [
  { id: 'visual', label: '🎨 Visual', desc: 'I learn best with diagrams and images' },
  { id: 'logical', label: '🧮 Logical', desc: 'I like step-by-step reasoning' },
  { id: 'verbal', label: '📝 Verbal', desc: 'I prefer reading and writing' },
  { id: 'practical', label: '🔧 Practical', desc: 'I learn by doing examples' },
];

export function StudyBuddy() {
  const { user } = useAuth();
  const { currentLevel, profiles, getLevelPrompt } = useAdaptiveLevel();
  const { t, language } = useThemeLanguage();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingStyle, setThinkingStyle] = useState<string | null>(null);
  const [showStylePicker, setShowStylePicker] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build a rich system prompt from the student's learning data
  const buildSystemPrompt = useCallback(() => {
    const levelPrompt = getLevelPrompt();
    
    const subjectBreakdown = profiles.length > 0
      ? profiles.map(p => 
          `- ${p.subject}: ${p.difficulty_level} level (${p.recent_accuracy}% accuracy, ${p.total_questions_answered} questions answered)`
        ).join('\n')
      : 'No learning data yet.';

    const styleInstructions = thinkingStyle
      ? {
          visual: 'Use visual descriptions, diagrams (ASCII art), tables, and spatial metaphors. Organize information visually.',
          logical: 'Use numbered steps, logical chains, cause-effect reasoning, and structured proofs. Be systematic.',
          verbal: 'Use rich explanations, storytelling, analogies, and narrative structure. Make it readable and engaging.',
          practical: 'Use concrete examples, hands-on exercises, real-world applications, and practice problems immediately.',
        }[thinkingStyle] || ''
      : '';

    const langInstruction = language === 'ar' 
      ? 'CRITICAL: You MUST respond entirely in Arabic. Use Arabic for all explanations. Keep LaTeX math notation in standard format.'
      : '';

    return `You are Study Buddy — a brilliant, adaptive AI tutor that personalizes learning to each student's unique thinking style and level.

${levelPrompt}

STUDENT'S LEARNING PROFILE:
${subjectBreakdown}

${styleInstructions ? `THINKING STYLE PREFERENCE: ${styleInstructions}` : ''}

YOUR APPROACH:
1. ADAPT your explanations to match the student's proven level per subject
2. When they struggle (low accuracy subjects), break concepts down further
3. When they excel (high accuracy), challenge them with deeper insights
4. Reference their past performance naturally: "Since you're strong in X, let's connect this to..."
5. Teach them HOW to think, not just WHAT to think — explain your reasoning process
6. Ask probing questions that develop critical thinking
7. Celebrate progress and gently address weak areas
8. If they ask about a weak subject, use their strong subject as a bridge

${langInstruction}

Be warm, encouraging, and intellectually stimulating. You're not just answering questions — you're developing a thinker.`;
  }, [getLevelPrompt, profiles, thinkingStyle, language]);

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
                if (last?.role === 'assistant') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { id: assistantId, role: 'assistant', content: assistantContent }];
              });
            }
          } catch { /* partial json */ }
        }
      }
    } catch (e) {
      console.error('Study Buddy error:', e);
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        content: t('Sorry, I had trouble connecting. Please try again!', 'عذرًا، واجهت مشكلة في الاتصال. حاول مرة أخرى!'),
      }]);
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full pt-14">
      <main className="flex-1 overflow-y-auto pb-36">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {/* Study Buddy Header */}
          {messages.length === 0 && (
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

              {/* Thinking Style Picker */}
              {showStylePicker && (
                <div className="mt-6 space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t('How do you like to learn?', 'كيف تحب أن تتعلم؟')}
                  </p>
                  <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
                    {THINKING_STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setThinkingStyle(style.id)}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all text-sm",
                          thinkingStyle === style.id
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border/50 hover:border-primary/40"
                        )}
                      >
                        <span className="font-medium">{style.label}</span>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{style.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Prompts */}
              <div className="mt-6 space-y-2 max-w-md mx-auto">
                <p className="text-xs text-muted-foreground">{t('Try asking:', 'جرب أن تسأل:')}</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    t("Help me understand fractions", "ساعدني في فهم الكسور"),
                    t("Why do we need algebra?", "لماذا نحتاج الجبر؟"),
                    t("Explain photosynthesis", "اشرح التمثيل الضوئي"),
                    t("What are my weak subjects?", "ما هي المواد الضعيفة لدي؟"),
                  ].map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(prompt)}
                      className="px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50 text-xs hover:border-primary/40 transition-all"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.length > 0 && (
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
