import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Brain, Trash2, AlertTriangle, CheckCircle2, XCircle, TrendingUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Memory {
  id: string;
  memory_type: string;
  content: string;
  subject: string | null;
  confidence: number;
  created_at: string;
}

interface KnowledgeGap {
  id: string;
  subject: string;
  topic: string;
  gap_description: string;
  severity: string;
  resolved: boolean;
  created_at: string;
}

export function LuminaMemoryViewer() {
  const { user } = useAuth();
  const { t } = useThemeLanguage();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'memories' | 'gaps'>('memories');

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [memRes, gapRes] = await Promise.all([
      supabase.from('student_memory').select('*').eq('user_id', user.id).order('confidence', { ascending: false }),
      supabase.from('knowledge_gaps').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    setMemories((memRes.data as Memory[]) || []);
    setGaps((gapRes.data as KnowledgeGap[]) || []);
    setLoading(false);
  };

  const deleteMemory = async (id: string) => {
    await supabase.from('student_memory').delete().eq('id', id);
    setMemories(prev => prev.filter(m => m.id !== id));
    toast.success(t('Memory deleted', 'تم حذف الذاكرة'));
  };

  const resolveGap = async (id: string) => {
    await supabase.from('knowledge_gaps').update({ resolved: true }).eq('id', id);
    setGaps(prev => prev.map(g => g.id === id ? { ...g, resolved: true } : g));
    toast.success(t('Gap marked as resolved', 'تم تحديد الفجوة كمحلولة'));
  };

  const typeIcons: Record<string, string> = {
    fact: '📋', preference: '💡', struggle: '😰', strength: '💪', personal: '🏠', personality: '🎭',
  };

  const severityColors: Record<string, string> = {
    critical: 'border-red-500/50 bg-red-500/10',
    moderate: 'border-yellow-500/50 bg-yellow-500/10',
    minor: 'border-blue-500/50 bg-blue-500/10',
  };

  if (loading) {
    return (
      <div className="glass-effect rounded-2xl p-5 mb-4 flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="glass-effect rounded-2xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Brain size={18} className="text-primary" />
        <h3 className="font-semibold">{t("Lumina's Brain", "دماغ لومينا")}</h3>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 p-1 bg-muted/50 rounded-xl">
        <button
          onClick={() => setActiveTab('memories')}
          className={cn(
            "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all",
            activeTab === 'memories' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
          )}
        >
          {t(`Memories (${memories.length})`, `ذكريات (${memories.length})`)}
        </button>
        <button
          onClick={() => setActiveTab('gaps')}
          className={cn(
            "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all",
            activeTab === 'gaps' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
          )}
        >
          {t(`Knowledge Gaps (${gaps.filter(g => !g.resolved).length})`, `فجوات (${gaps.filter(g => !g.resolved).length})`)}
        </button>
      </div>

      {activeTab === 'memories' && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {memories.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {t('No memories yet. Chat with Lumina to build your profile!', 'لا توجد ذكريات بعد. تحدث مع لومينا لبناء ملفك!')}
            </p>
          ) : (
            memories.map(mem => (
              <div key={mem.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/20 group">
                <span className="text-sm mt-0.5">{typeIcons[mem.memory_type] || '📝'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">{mem.content}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {mem.subject && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{mem.subject}</span>}
                    <span className="text-[10px] text-muted-foreground capitalize">{mem.memory_type}</span>
                    <div className="flex-1" />
                    <div className="h-1 w-8 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${mem.confidence * 100}%` }} />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => deleteMemory(mem.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'gaps' && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {gaps.filter(g => !g.resolved).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {t('No knowledge gaps detected! Great job! 🎉', 'لم يتم اكتشاف فجوات! عمل رائع! 🎉')}
            </p>
          ) : (
            gaps.filter(g => !g.resolved).map(gap => (
              <div key={gap.id} className={cn("flex items-start gap-2 p-2.5 rounded-xl border", severityColors[gap.severity])}>
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{gap.topic}</p>
                  <p className="text-[11px] text-muted-foreground">{gap.gap_description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{gap.subject}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium",
                      gap.severity === 'critical' ? 'bg-red-500/20 text-red-600' :
                      gap.severity === 'moderate' ? 'bg-yellow-500/20 text-yellow-600' :
                      'bg-blue-500/20 text-blue-600'
                    )}>{gap.severity}</span>
                  </div>
                </div>
                <button
                  onClick={() => resolveGap(gap.id)}
                  className="p-1 rounded hover:bg-green-500/10 text-muted-foreground hover:text-green-600 transition-all"
                  title={t('Mark as resolved', 'وضع علامة محلول')}
                >
                  <CheckCircle2 size={14} />
                </button>
              </div>
            ))
          )}

          {/* Resolved gaps (collapsed) */}
          {gaps.filter(g => g.resolved).length > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
                {t(`${gaps.filter(g => g.resolved).length} resolved gaps`, `${gaps.filter(g => g.resolved).length} فجوات محلولة`)}
              </summary>
              <div className="space-y-1 mt-2">
                {gaps.filter(g => g.resolved).map(gap => (
                  <div key={gap.id} className="flex items-center gap-2 p-2 rounded-lg bg-green-500/5 border border-green-500/20 opacity-60">
                    <CheckCircle2 size={12} className="text-green-500" />
                    <span className="text-[11px] text-muted-foreground line-through">{gap.topic} ({gap.subject})</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
