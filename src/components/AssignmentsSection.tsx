import { useState } from 'react';
import { 
  ArrowLeft, Plus, Calendar, BookOpen, Check, Clock, 
  FileText, Send, Trash2, ChevronDown, ChevronUp 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAssignments, Assignment } from '@/hooks/useAssignments';
import { useUserRole } from '@/hooks/useUserRole';
import { BannerAd } from './BannerAd';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const subjects = [
  'Biology', 'Physics', 'Mathematics', 'Chemistry', 
  'English', 'Social Studies', 'Technology', 'Arabic'
];

const grades = [
  'KG1', 'KG2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9',
  'Grade 10', 'Grade 11', 'Grade 12'
];

type ViewState = 'list' | 'create' | 'detail' | 'submit';

export function AssignmentsSection() {
  const [viewState, setViewState] = useState<ViewState>('list');
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submissionContent, setSubmissionContent] = useState('');

  const {
    assignments,
    loading,
    createAssignment,
    submitAssignment,
    deleteAssignment,
    isSubmitted,
    getSubmission,
  } = useAssignments();
  
  const { isTeacher } = useUserRole();

  const handleCreateAssignment = async () => {
    if (!title.trim() || !subject || !gradeLevel) return;
    
    await createAssignment(
      title,
      description || null,
      subject,
      gradeLevel,
      dueDate || null
    );
    
    // Reset form
    setTitle('');
    setDescription('');
    setSubject('');
    setGradeLevel('');
    setDueDate('');
    setViewState('list');
  };

  const handleSubmitAssignment = async () => {
    if (!selectedAssignment || !submissionContent.trim()) return;
    
    await submitAssignment(selectedAssignment.id, submissionContent);
    setSubmissionContent('');
    setViewState('list');
  };

  const openAssignment = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    const submission = getSubmission(assignment.id);
    if (submission) {
      setSubmissionContent(submission.content || '');
    }
    setViewState('detail');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center pt-16 pb-20">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // CREATE VIEW (Teachers)
  if (viewState === 'create' && isTeacher) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setViewState('list')}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-2xl font-bold mb-2">Create Assignment</h1>
            <p className="text-muted-foreground text-sm">Fill in the details below</p>
          </div>

          <div className="glass-effect rounded-2xl p-5 space-y-4 animate-fade-in">
            <div>
              <label className="text-sm font-medium mb-1 block">Title *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Assignment title"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the assignment..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Subject *</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm"
                >
                  <option value="">Select subject</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Grade Level *</label>
                <select
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm"
                >
                  <option value="">Select grade</option>
                  {grades.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Due Date</label>
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <Button 
              onClick={handleCreateAssignment} 
              disabled={!title.trim() || !subject || !gradeLevel}
              className="w-full"
            >
              Create Assignment
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // DETAIL/SUBMIT VIEW
  if ((viewState === 'detail' || viewState === 'submit') && selectedAssignment) {
    const submission = getSubmission(selectedAssignment.id);
    const isPastDue = selectedAssignment.due_date && new Date(selectedAssignment.due_date) < new Date();

    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => {
              setSelectedAssignment(null);
              setSubmissionContent('');
              setViewState('list');
            }}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="glass-effect rounded-2xl p-5 mb-4 animate-fade-in">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-primary to-accent text-primary-foreground">
                <FileText size={20} />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold">{selectedAssignment.title}</h1>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span>{selectedAssignment.subject}</span>
                  <span>•</span>
                  <span>{selectedAssignment.grade_level}</span>
                </div>
              </div>
            </div>

            {selectedAssignment.description && (
              <p className="text-sm text-muted-foreground mb-4">
                {selectedAssignment.description}
              </p>
            )}

            {selectedAssignment.due_date && (
              <div className={cn(
                "flex items-center gap-2 text-sm",
                isPastDue ? "text-destructive" : "text-muted-foreground"
              )}>
                <Calendar size={14} />
                <span>Due: {format(new Date(selectedAssignment.due_date), 'PPp')}</span>
                {isPastDue && <span className="text-xs">(Past due)</span>}
              </div>
            )}
          </div>

          {/* Submission Status */}
          {submission ? (
            <div className="glass-effect rounded-2xl p-5 animate-fade-in">
              <div className="flex items-center gap-2 text-emerald-500 mb-3">
                <Check size={18} />
                <span className="font-medium">Submitted</span>
              </div>
              
              <div className="bg-secondary/30 rounded-xl p-4 mb-4">
                <p className="text-sm">{submission.content}</p>
              </div>

              {submission.grade && (
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">Grade:</span>
                    <span className="ml-2 font-bold text-primary">{submission.grade}</span>
                  </div>
                  {submission.feedback && (
                    <div>
                      <span className="text-xs text-muted-foreground">Feedback:</span>
                      <p className="text-sm mt-1">{submission.feedback}</p>
                    </div>
                  )}
                </div>
              )}

              {!submission.graded_at && !isPastDue && (
                <div className="mt-4">
                  <Textarea
                    value={submissionContent}
                    onChange={(e) => setSubmissionContent(e.target.value)}
                    placeholder="Update your submission..."
                    rows={4}
                    className="mb-3"
                  />
                  <Button onClick={handleSubmitAssignment} disabled={!submissionContent.trim()}>
                    Update Submission
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-effect rounded-2xl p-5 animate-fade-in">
              <h3 className="font-semibold mb-3">Your Submission</h3>
              <Textarea
                value={submissionContent}
                onChange={(e) => setSubmissionContent(e.target.value)}
                placeholder="Type your answer or submission here..."
                rows={6}
                className="mb-3"
              />
              <Button 
                onClick={handleSubmitAssignment} 
                disabled={!submissionContent.trim() || isPastDue}
                className="gap-2"
              >
                <Send size={16} />
                Submit Assignment
              </Button>
              {isPastDue && (
                <p className="text-xs text-destructive mt-2">
                  This assignment is past due and cannot be submitted.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Banner Ad */}
        <BannerAd location="assignments" className="mb-4" />

        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 glow-effect bg-gradient-to-br from-primary to-accent">
            <BookOpen className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">Assignments</h1>
          <p className="text-muted-foreground text-sm">
            {isTeacher ? 'Manage your assignments' : 'View and submit your assignments'}
          </p>
        </div>

        {/* Teacher: Create Button */}
        {isTeacher && (
          <Button 
            onClick={() => setViewState('create')} 
            className="w-full mb-4 gap-2"
          >
            <Plus size={18} />
            Create New Assignment
          </Button>
        )}

        {/* Assignments List */}
        <div className="space-y-3">
          {assignments.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-10 glass-effect rounded-2xl">
              No assignments yet
            </div>
          ) : (
            assignments.map((assignment) => {
              const submitted = isSubmitted(assignment.id);
              const isPastDue = assignment.due_date && new Date(assignment.due_date) < new Date();
              const isExpanded = expandedId === assignment.id;
              
              return (
                <div
                  key={assignment.id}
                  className="glass-effect rounded-xl overflow-hidden animate-fade-in"
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : assignment.id)}
                    className="w-full p-4 flex items-center gap-3 text-left"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center text-white",
                      submitted 
                        ? "bg-gradient-to-br from-emerald-500 to-teal-500"
                        : isPastDue
                          ? "bg-gradient-to-br from-rose-500 to-pink-500"
                          : "bg-gradient-to-br from-primary to-accent"
                    )}>
                      {submitted ? <Check size={20} /> : <FileText size={20} />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{assignment.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{assignment.subject}</span>
                        <span>•</span>
                        <span>{assignment.grade_level}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {assignment.due_date && (
                        <div className={cn(
                          "flex items-center gap-1 text-xs",
                          isPastDue ? "text-destructive" : "text-muted-foreground"
                        )}>
                          <Clock size={12} />
                          {format(new Date(assignment.due_date), 'MMM d')}
                        </div>
                      )}
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-border/30">
                      {assignment.description && (
                        <p className="text-sm text-muted-foreground mb-3 mt-3">
                          {assignment.description}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          onClick={() => openAssignment(assignment)}
                        >
                          {submitted ? 'View Submission' : 'Open Assignment'}
                        </Button>
                        
                        {isTeacher && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteAssignment(assignment.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
