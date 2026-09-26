import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Trash2, Calendar, FileText, Upload, Sparkles } from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';
import { parseWeeklyPlanProposal, type WeeklyPlanProposal } from '../../../supabase/functions/_shared/weeklyPlanAI';

const GRADE_LEVELS = [
  'All Grades', 'KG1', 'KG2', 'KG3',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

interface WeeklyPlan {
  id: string;
  title: string;
  grade_level: string;
  week_start: string;
  plan_type: string;
  content_json: Record<string, string[]> | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
}

export function WeeklyPlanBuilder() {
  const { profile, school } = useRoleGuard();
  const { toast } = useToast();

  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [gradeLevel, setGradeLevel] = useState('All Grades');
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [planType, setPlanType] = useState<'manual' | 'file'>('manual');
  const [dayActivities, setDayActivities] = useState<Record<string, string[]>>(
    Object.fromEntries(DAYS.map(d => [d, ['']]))
  );
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [proposal, setProposal] = useState<{ draft: WeeklyPlanProposal; context: string } | null>(null);
  const planContext = JSON.stringify({ title: title.trim(), gradeLevel, weekStart });

  const suggestActivities = async () => {
    if (drafting || creating || planType !== 'manual' || title.trim().length < 3) return;
    const context = planContext;
    setDrafting(true);
    setProposal(null);
    try {
      const { data, error } = await supabase.functions.invoke('weekly-plan-draft', {
        body: { title: title.trim(), gradeLevel, weekStart },
      });
      if (error || data?.reviewRequired !== true || !Array.isArray(data.catalogSubjects)
        || !data.catalogSubjects.every((subject: unknown) => typeof subject === 'string')) {
        throw new Error('The school-scoped proposal was unavailable.');
      }
      const draft = parseWeeklyPlanProposal(data.draft, data.catalogSubjects);
      if (!draft) throw new Error('The proposal did not pass validation.');
      setProposal({ draft, context });
    } catch (error) {
      toast({ variant: 'destructive', title: 'AI proposal unavailable',
        description: error instanceof Error ? error.message : 'Try again later.' });
    } finally { setDrafting(false); }
  };

  const useProposal = () => {
    if (!proposal || proposal.context !== planContext || planType !== 'manual') return;
    const hasCurrentText = Object.values(dayActivities).some(activities => activities.some(activity => activity.trim()));
    if (hasCurrentText && !window.confirm('Replace your current weekly activities with this editable proposal?')) return;
    setDayActivities(Object.fromEntries(DAYS.map(day => [day,
      proposal.draft[day as keyof WeeklyPlanProposal].map(item => `${item.subject}: ${item.activity}`)])));
    setProposal(null);
  };

  const fetchPlans = useCallback(async () => {
    if (!school) return;
    setLoading(true);
    const { data } = await supabase
      .from('weekly_plans')
      .select('*')
      .eq('school_id', school.id)
      .order('week_start', { ascending: false });
    setPlans((data || []) as unknown as WeeklyPlan[]);
    setLoading(false);
  }, [school]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const addActivity = (day: string) => {
    setDayActivities(prev => ({
      ...prev,
      [day]: [...(prev[day] || []), '']
    }));
  };

  const removeActivity = (day: string, index: number) => {
    setDayActivities(prev => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index)
    }));
  };

  const updateActivity = (day: string, index: number, value: string) => {
    setDayActivities(prev => ({
      ...prev,
      [day]: prev[day].map((a, i) => i === index ? value : a)
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !school) return;

    setUploading(true);
    const filePath = `weekly-plans/${school.id}/${Date.now()}_${file.name}`;

    const { data, error } = await supabase.storage
      .from('course-materials')
      .upload(filePath, file);

    if (error) {
      toast({ variant: 'destructive', title: 'Upload failed', description: error.message });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('course-materials').getPublicUrl(filePath);
    setFileUrl(urlData.publicUrl);
    setFileName(file.name);
    setUploading(false);
  };

  const handleCreate = async () => {
    if (drafting) return;
    if (!school || !profile || !title.trim()) {
      toast({ variant: 'destructive', title: 'Please fill in the title' });
      return;
    }

    if (planType === 'file' && !fileUrl) {
      toast({ variant: 'destructive', title: 'Please upload a file' });
      return;
    }

    setCreating(true);

    // Clean up empty activities
    const cleanedActivities = Object.fromEntries(
      Object.entries(dayActivities).map(([day, activities]) => [
        day,
        activities.filter(a => a.trim() !== '')
      ])
    );

    const { error } = await supabase.from('weekly_plans').insert({
      school_id: school.id,
      created_by: profile.id,
      title: title.trim(),
      grade_level: gradeLevel,
      week_start: weekStart,
      plan_type: planType,
      content_json: planType === 'manual' ? cleanedActivities : null,
      file_url: planType === 'file' ? fileUrl : null,
      file_name: planType === 'file' ? fileName : null,
    });

    if (error) {
      toast({ variant: 'destructive', title: 'Error creating plan', description: error.message });
    } else {
      toast({ title: 'Weekly plan created!' });
      setTitle('');
      setDayActivities(Object.fromEntries(DAYS.map(d => [d, ['']])));
      setFileUrl('');
      setFileName('');
      fetchPlans();
    }

    setCreating(false);
  };

  const deletePlan = async (id: string) => {
    const { error } = await supabase.from('weekly_plans').delete().eq('id', id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting plan' });
    } else {
      toast({ title: 'Plan deleted' });
      fetchPlans();
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Calendar className="w-5 h-5" /> Weekly Plans
      </h2>

      {/* Create new plan */}
      <div className="liquid-glass rounded-xl p-5 space-y-4">
        <h3 className="font-semibold">Create New Weekly Plan</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Week Plan Title" disabled={drafting} />
          </div>
          <div className="space-y-2">
            <Label>Grade Level</Label>
            <Select value={gradeLevel} onValueChange={setGradeLevel} disabled={drafting}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRADE_LEVELS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Week Starting</Label>
            <Input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} disabled={drafting} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Plan Type</Label>
          <Tabs value={planType} onValueChange={v => setPlanType(v as 'manual' | 'file')}>
            <TabsList className="grid grid-cols-2 w-full max-w-xs">
              <TabsTrigger value="manual" disabled={drafting}>Manual Builder</TabsTrigger>
              <TabsTrigger value="file" disabled={drafting}>Upload File</TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="space-y-4 mt-4">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => void suggestActivities()}
                  disabled={drafting || creating || title.trim().length < 3}>
                  {drafting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {drafting ? 'Preparing proposal…' : 'Suggest school-grounded weekly activities'}
                </Button>
                <p className="text-xs text-muted-foreground">Your title, grade, week and this school’s subject names go to the AI gateway. Do not put personal details in the title. No learner records are read. AI cannot publish; review each activity before applying or publishing.</p>
                {proposal && <div className="space-y-2 rounded-md border p-3 text-sm">
                  <strong>AI proposal — not applied or published</strong>
                  {DAYS.map(day => <div key={day}><span className="font-medium">{day}:</span>
                    <ul className="list-disc ps-5">{proposal.draft[day as keyof WeeklyPlanProposal].map((item, index) =>
                      <li key={index}>{item.subject}: {item.activity}</li>)}</ul></div>)}
                  {proposal.context !== planContext && <p role="alert" className="text-destructive">Plan details changed. Request a fresh proposal.</p>}
                  <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={useProposal}
                    disabled={proposal.context !== planContext}>Use as editable draft</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setProposal(null)}>Dismiss</Button></div>
                </div>}
              </div>
              {DAYS.map(day => (
                <div key={day} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold">{day}</Label>
                    <Button variant="ghost" size="sm" onClick={() => addActivity(day)}>
                      <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  </div>
                  {(dayActivities[day] || []).map((activity, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={activity}
                        onChange={e => updateActivity(day, idx, e.target.value)}
                        placeholder={`Activity ${idx + 1}`}
                        className="flex-1"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeActivity(day, idx)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="file" className="mt-4">
              <div className="liquid-glass rounded-xl p-6 text-center">
                {fileName ? (
                  <div className="flex items-center gap-2 justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                    <span className="text-sm">{fileName}</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-3">Upload a PDF, Word, or image file</p>
                  </>
                )}
                <label className="cursor-pointer">
                  <span className="text-primary text-sm hover:underline">
                    {uploading ? 'Uploading...' : fileName ? 'Change file' : 'Choose file'}
                  </span>
                  <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
                </label>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <Button onClick={handleCreate} disabled={creating || drafting || !title.trim()}>
          {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Publish Weekly Plan
        </Button>
      </div>

      {/* Existing plans */}
      <div className="space-y-3">
        <h3 className="font-semibold">Published Plans</h3>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No weekly plans created yet</p>
        ) : (
          plans.map(plan => (
            <div key={plan.id} className="liquid-glass rounded-xl p-4 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm">{plan.title}</h4>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(plan.week_start), 'MMM d, yyyy')} • {plan.grade_level} • {plan.plan_type}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => deletePlan(plan.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
