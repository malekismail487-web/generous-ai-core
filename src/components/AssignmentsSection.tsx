import { useState } from 'react';
import { 
  ArrowLeft, Plus, Calendar, BookOpen, Check, Clock, 
  FileText, Send, Trash2, ChevronDown, ChevronUp,
  Wand2, Edit3, GraduationCap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAssignments, Assignment } from '@/hooks/useAssignments';
import { useUserRole } from '@/hooks/useUserRole';
import { BannerAd } from './BannerAd';
import { AssignmentCreator } from './AssignmentCreator';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

type ViewState = 'list' | 'choose-creation' | 'create-manual' | 'create-ai' | 'detail' | 'submit';

export function AssignmentsSection() {
  const [viewState, setViewState] = useState<ViewState>('list');
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submissionContent, setSubmissionContent] = useState('');

  const {
    assignments,
    loading,
    submitAssignment,
    deleteAssignment,
    isSubmitted,
    getSubmission,
    refresh,
  } = useAssignments();
  
  const { isTeacher } = useUserRole();

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

  // CHOOSE CREATION METHOD (Teachers) - New flow
  if (viewState === 'choose-creation' && isTeacher) {
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
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-gradient-to-br from-primary to-accent text-primary-foreground">
              <Plus className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Create Assignment</h1>
            <p className="text-muted-foreground text-sm">
              Choose how you'd like to create your assignment
            </p>
          </div>

          <div className="space-y-4">
            {/* Manual Creation Option */}
            <button
              onClick={() => setViewState('create-manual')}
              className="w-full glass-effect rounded-2xl p-6 text-left hover:shadow-lg transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0">
                  <Edit3 className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">
                    Create Manually
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Design your own questions with Short Answer, Multiple Choice, and Essay formats.
                    Full control over every question and answer option.
                  </p>
                </div>
              </div>
            </button>

            {/* AI Creation Option */}
            <button
              onClick={() => setViewState('create-ai')}
              className="w-full glass-effect rounded-2xl p-6 text-left hover:shadow-lg transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white shrink-0">
                  <Wand2 className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">
                    Use Lumina AI
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Let Lumina generate questions for you based on a topic or learning objectives.
                    Review and customize before publishing.
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    ✨ Coming Soon
                  </Badge>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MANUAL CREATE VIEW (Teachers) - Uses AssignmentCreator component
  if (viewState === 'create-manual' && isTeacher) {
    return (
      <AssignmentCreator 
        onBack={() => setViewState('choose-creation')} 
        onSuccess={() => {
          setViewState('list');
          refresh();
        }} 
      />
    );
  }

  // AI CREATE VIEW (Teachers) - Placeholder for now
  if (viewState === 'create-ai' && isTeacher) {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setViewState('choose-creation')}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-gradient-to-br from-purple-500 to-pink-600 text-white">
              <Wand2 className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Lumina AI Assignment Generator</h1>
            <p className="text-muted-foreground text-sm">
              This feature is coming soon!
            </p>
          </div>

          <div className="glass-effect rounded-2xl p-8 text-center">
            <Wand2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">AI-Powered Assignment Creation</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Soon you'll be able to describe your lesson objectives and let Lumina AI 
              generate tailored questions, quizzes, and assignments for your students.
            </p>
            <Button variant="outline" onClick={() => setViewState('create-manual')}>
              Create Manually Instead
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
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                  <span>{selectedAssignment.subject}</span>
                  <span>•</span>
                  <Badge variant="outline" className="gap-1 text-xs">
                    <GraduationCap size={10} />
                    {selectedAssignment.grade_level}
                  </Badge>
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
              <div className="flex items-center gap-2 text-primary mb-3">
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
            onClick={() => setViewState('choose-creation')} 
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
                      "w-10 h-10 rounded-lg flex items-center justify-center text-primary-foreground",
                      submitted 
                        ? "bg-gradient-to-br from-primary to-accent"
                        : isPastDue
                          ? "bg-destructive"
                          : "bg-gradient-to-br from-primary to-accent"
                    )}>
                      {submitted ? <Check size={20} /> : <FileText size={20} />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{assignment.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{assignment.subject}</span>
                        <span>•</span>
                        <span className="text-primary">{assignment.grade_level}</span>
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
