import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, GraduationCap, Search } from 'lucide-react';
import { SocraticMode } from './SocraticMode';
import { TeachBackMode } from './TeachBackMode';
import { MisconceptionHunt } from './MisconceptionHunt';

const SUBJECTS = [
  'Mathematics','English','Arabic','Science','Physics','Chemistry','Biology',
  'History','Geography','Computer Science','Religious Studies','Art',
];

type Mode = 'socratic' | 'teach_back' | 'misconception_hunt';

export function LearningModesHub() {
  const [subject, setSubject] = useState<string>('Mathematics');
  const [topic, setTopic] = useState<string>('');
  const [activeMode, setActiveMode] = useState<Mode | null>(null);

  if (activeMode === 'socratic') {
    return <SocraticMode subject={subject} topic={topic} onExit={() => setActiveMode(null)} />;
  }
  if (activeMode === 'teach_back') {
    return <TeachBackMode subject={subject} topic={topic} onExit={() => setActiveMode(null)} />;
  }
  if (activeMode === 'misconception_hunt') {
    return <MisconceptionHunt subject={subject} topic={topic} onExit={() => setActiveMode(null)} />;
  }

  const canStart = subject && topic.trim().length >= 2;

  const modes: { id: Mode; title: string; desc: string; icon: typeof Brain }[] = [
    { id: 'socratic', title: 'Socratic Mode', desc: 'AI asks 5 deepening questions. You reason out loud — no answers given.', icon: Brain },
    { id: 'teach_back', title: 'Teach-Back', desc: 'Explain the topic in 2-4 paragraphs. Graded on clarity, accuracy, completeness, examples.', icon: GraduationCap },
    { id: 'misconception_hunt', title: 'Misconception Hunt', desc: '5 statements — some subtly wrong. Mark True/False and explain why.', icon: Search },
  ];

  return (
    <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pb-24">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Choose subject and topic</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lm-subject">Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger id="lm-subject"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lm-topic">Topic</Label>
              <Input id="lm-topic" value={topic} onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Photosynthesis, Quadratic equations" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {modes.map(m => {
          const Icon = m.icon;
          return (
            <Card key={m.id} className="bg-card border-border flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="w-5 h-5" /> {m.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 justify-between gap-3">
                <p className="text-sm text-muted-foreground">{m.desc}</p>
                <Button
                  onClick={() => setActiveMode(m.id)}
                  disabled={!canStart}
                  size="sm"
                  className="w-full"
                >
                  Start {m.title}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!canStart && (
        <p className="text-xs text-muted-foreground">Enter a topic above to begin a session.</p>
      )}
    </div>
  );
}
