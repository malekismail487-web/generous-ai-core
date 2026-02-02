import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Upload, Trash2, Edit2, Eye, EyeOff, MessageCircle, Send, BookOpen, FileText, Loader2, File, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCourseMaterials, CourseMaterial, MaterialComment } from '@/hooks/useCourseMaterials';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const subjects = [
  { id: 'biology', name: 'Biology', emoji: '🧬', color: 'from-emerald-500 to-green-600' },
  { id: 'physics', name: 'Physics', emoji: '⚛️', color: 'from-blue-500 to-cyan-600' },
  { id: 'mathematics', name: 'Mathematics', emoji: '📐', color: 'from-violet-500 to-purple-600' },
  { id: 'chemistry', name: 'Chemistry', emoji: '🧪', color: 'from-orange-500 to-amber-600' },
  { id: 'english', name: 'English', emoji: '📚', color: 'from-rose-500 to-pink-600' },
  { id: 'social_studies', name: 'Social Studies', emoji: '🌍', color: 'from-teal-500 to-emerald-600' },
  { id: 'technology', name: 'Technology', emoji: '💻', color: 'from-indigo-500 to-blue-600' },
];

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif'
];

const FILE_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
};

type ViewState = 'list' | 'detail' | 'upload' | 'edit';

interface CourseMaterialsSectionProps {
  onBack: () => void;
}

export function CourseMaterialsSection({ onBack }: CourseMaterialsSectionProps) {
  const [viewState, setViewState] = useState<ViewState>('list');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedMaterial, setSelectedMaterial] = useState<CourseMaterial | null>(null);
  const [comments, setComments] = useState<MaterialComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  
  // Form state for upload/edit
  const [formSubject, setFormSubject] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formFileUrl, setFormFileUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const { toast } = useToast();
  const {
    materials,
    isTeacher,
    loading,
    getMaterialsBySubject,
    isMaterialViewed,
    markAsViewed,
    uploadMaterial,
    updateMaterial,
    deleteMaterial,
    getComments,
    submitComment
  } = useCourseMaterials();

  const filteredMaterials = getMaterialsBySubject(selectedSubject);

  // Load comments when viewing a material
  useEffect(() => {
    if (selectedMaterial && viewState === 'detail') {
      getComments(selectedMaterial.id).then(setComments);
      markAsViewed(selectedMaterial.id);
    }
  }, [selectedMaterial, viewState, getComments, markAsViewed]);

  const handleOpenMaterial = (material: CourseMaterial) => {
    setSelectedMaterial(material);
    setViewState('detail');
  };

  const handleUploadClick = () => {
    setFormSubject(subjects[0].id);
    setFormTitle('');
    setFormContent('');
    setFormFileUrl('');
    setViewState('upload');
  };

  const handleEditClick = (material: CourseMaterial) => {
    setSelectedMaterial(material);
    setFormSubject(material.subject);
    setFormTitle(material.title);
    setFormContent(material.content || '');
    setFormFileUrl(material.file_url || '');
    setViewState('edit');
  };

  const handleSubmitUpload = async () => {
    if (!formSubject || !formTitle.trim()) return;
    
    setIsSubmitting(true);
    const result = await uploadMaterial(formSubject, formTitle, formContent, formFileUrl);
    setIsSubmitting(false);
    
    if (result) {
      setViewState('list');
    }
  };

  const handleSubmitEdit = async () => {
    if (!selectedMaterial || !formTitle.trim()) return;
    
    setIsSubmitting(true);
    const result = await updateMaterial(selectedMaterial.id, formTitle, formContent, formFileUrl);
    setIsSubmitting(false);
    
    if (result) {
      setViewState('list');
      setSelectedMaterial(null);
    }
  };

  const handleDelete = async (materialId: string) => {
    if (confirm('Are you sure you want to delete this material?')) {
      await deleteMaterial(materialId);
      if (selectedMaterial?.id === materialId) {
        setSelectedMaterial(null);
        setViewState('list');
      }
    }
  };

  const handleSubmitComment = async () => {
    if (!selectedMaterial || !newComment.trim()) return;
    
    setIsSubmittingComment(true);
    const result = await submitComment(selectedMaterial.id, newComment);
    setIsSubmittingComment(false);
    
    if (result) {
      setComments(prev => [...prev, result]);
      setNewComment('');
    }
  };

  const getSubjectInfo = (subjectId: string) => {
    return subjects.find(s => s.id === subjectId) || { name: subjectId, emoji: '📄', color: 'from-gray-500 to-gray-600' };
  };

  // DETAIL VIEW - View single material with comments
  if (viewState === 'detail' && selectedMaterial) {
    const subjectInfo = getSubjectInfo(selectedMaterial.subject);
    
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={() => setViewState('list')}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
            {isTeacher && selectedMaterial.uploaded_by === user?.id && (
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleEditClick(selectedMaterial)}>
                  <Edit2 size={14} className="mr-1" />
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(selectedMaterial.id)}>
                  <Trash2 size={14} className="mr-1" />
                  Delete
                </Button>
              </div>
            )}
          </div>

          {/* Material Header */}
          <div className="glass-effect rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br text-lg",
                subjectInfo.color
              )}>
                {subjectInfo.emoji}
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{subjectInfo.name}</span>
                <h1 className="font-bold text-lg">{selectedMaterial.title}</h1>
              </div>
            </div>
            
            {selectedMaterial.file_url && (
              <a 
                href={selectedMaterial.file_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors mb-4"
              >
                <FileText size={16} />
                Open File
              </a>
            )}
            
            {selectedMaterial.content && (
              <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                {selectedMaterial.content}
              </div>
            )}
          </div>

          {/* Comments Section */}
          <div className="glass-effect rounded-2xl p-5">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <MessageCircle size={18} />
              Comments ({comments.length})
            </h3>
            
            <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No comments yet</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-sm">{comment.comment}</p>
                    <span className="text-xs text-muted-foreground">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))
              )}
            </div>

            {user && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                  placeholder="Add a comment..."
                  className="flex-1 px-4 py-2 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <Button size="sm" onClick={handleSubmitComment} disabled={isSubmittingComment || !newComment.trim()}>
                  {isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={16} />}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // File upload handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: 'Please upload PDF, Word, or PowerPoint files.' });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 50MB.' });
      return;
    }

    setSelectedFile(file);
  };

  const uploadFile = async (): Promise<string | null> => {
    if (!selectedFile || !user) return null;

    setIsUploading(true);
    setUploadProgress(0);

    const fileExt = selectedFile.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('course-materials')
      .upload(fileName, selectedFile, {
        cacheControl: '3600',
        upsert: false,
      });

    setIsUploading(false);
    setUploadProgress(100);

    if (error) {
      console.error('Upload error:', error);
      toast({ variant: 'destructive', title: 'Upload failed', description: error.message });
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('course-materials')
      .getPublicUrl(data.path);

    return publicUrl;
  };

  const handleSubmitUploadWithFile = async () => {
    if (!formSubject || !formTitle.trim()) return;
    
    setIsSubmitting(true);
    
    let fileUrl = formFileUrl;
    if (selectedFile) {
      const uploadedUrl = await uploadFile();
      if (uploadedUrl) {
        fileUrl = uploadedUrl;
      }
    }
    
    const result = await uploadMaterial(formSubject, formTitle, formContent, fileUrl);
    setIsSubmitting(false);
    
    if (result) {
      setSelectedFile(null);
      setViewState('list');
    }
  };

  // UPLOAD/EDIT VIEW
  if (viewState === 'upload' || viewState === 'edit') {
    return (
      <div className="flex-1 overflow-y-auto pt-16 pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => { setViewState('list'); setSelectedFile(null); }}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          </div>

          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-gradient-to-br from-primary to-accent text-primary-foreground">
              {viewState === 'upload' ? <Upload className="w-7 h-7" /> : <Edit2 className="w-7 h-7" />}
            </div>
            <h1 className="text-2xl font-bold mb-2">
              {viewState === 'upload' ? 'Upload Material' : 'Edit Material'}
            </h1>
          </div>

          <div className="glass-effect rounded-2xl p-5 animate-fade-in space-y-4">
            {/* Subject Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Subject</label>
              <select
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {subjects.map((subj) => (
                  <option key={subj.id} value={subj.id}>
                    {subj.emoji} {subj.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-2">Title</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g., Chapter 3: Photosynthesis"
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* File Upload */}
            {viewState === 'upload' && (
              <div>
                <label className="block text-sm font-medium mb-2">Upload File (PDF, Word, PowerPoint)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.ppt,.pptx"
                  className="hidden"
                />
                
                {selectedFile ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border/50">
                    <File size={20} className="text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        {FILE_TYPE_LABELS[selectedFile.type] && ` • ${FILE_TYPE_LABELS[selectedFile.type]}`}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)}>
                      <X size={16} />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-6 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors text-center"
                  >
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to upload or drag and drop</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, Word, PowerPoint up to 50MB</p>
                  </button>
                )}
                
                {isUploading && (
                  <div className="mt-2">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* File URL (optional - as alternative) */}
            {!selectedFile && (
              <div>
                <label className="block text-sm font-medium mb-2">Or paste a file URL</label>
                <input
                  type="url"
                  value={formFileUrl}
                  onChange={(e) => setFormFileUrl(e.target.value)}
                  placeholder="https://... (link to PDF, document, etc.)"
                  className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            )}

            {/* Content */}
            <div>
              <label className="block text-sm font-medium mb-2">Content (optional notes)</label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Add any additional notes or content here..."
                rows={6}
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>

            <Button
              className="w-full gap-2"
              onClick={viewState === 'upload' ? handleSubmitUploadWithFile : handleSubmitEdit}
              disabled={isSubmitting || isUploading || !formTitle.trim()}
            >
              {isSubmitting || isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : viewState === 'upload' ? (
                <Upload size={16} />
              ) : (
                <Edit2 size={16} />
              )}
              {isUploading ? 'Uploading...' : viewState === 'upload' ? 'Upload Material' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // LIST VIEW - All materials with filters
  return (
    <div className="flex-1 overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={16} className="mr-1" />
            Back
          </Button>
          {isTeacher && (
            <Button size="sm" className="ml-auto gap-2" onClick={handleUploadClick}>
              <Upload size={16} />
              Upload
            </Button>
          )}
        </div>

        <div className="text-center mb-6 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-gradient-to-br from-primary to-accent text-primary-foreground">
            <BookOpen className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold mb-2 gradient-text">Course Materials</h1>
          <p className="text-muted-foreground text-sm">
            {isTeacher ? 'Upload and manage materials for your students' : 'Browse materials uploaded by your teachers'}
          </p>
        </div>

        {/* Subject Filter */}
        <div className="glass-effect rounded-xl p-3 mb-4 overflow-x-auto">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedSubject('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                selectedSubject === 'all'
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
              )}
            >
              All Subjects
            </button>
            {subjects.map((subj) => (
              <button
                key={subj.id}
                onClick={() => setSelectedSubject(subj.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1",
                  selectedSubject === subj.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                )}
              >
                {subj.emoji} {subj.name}
              </button>
            ))}
          </div>
        </div>

        {/* Materials List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="glass-effect rounded-2xl p-8 text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">No materials yet</h3>
            <p className="text-sm text-muted-foreground">
              {isTeacher ? 'Upload your first material to get started!' : 'Check back later for new materials from your teachers.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMaterials.map((material) => {
              const subjectInfo = getSubjectInfo(material.subject);
              const isViewed = isMaterialViewed(material.id);
              const isOwner = material.uploaded_by === user?.id;
              
              return (
                <div
                  key={material.id}
                  className="glass-effect rounded-xl p-4 cursor-pointer hover:shadow-lg transition-all group"
                  onClick={() => handleOpenMaterial(material)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br text-lg shrink-0",
                      subjectInfo.color
                    )}>
                      {subjectInfo.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{material.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {subjectInfo.name} • {new Date(material.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isViewed ? (
                        <Eye size={16} className="text-primary" />
                      ) : (
                        <EyeOff size={16} className="text-muted-foreground" />
                      )}
                      {isTeacher && isOwner && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(material);
                            }}
                            className="p-1.5 rounded-lg hover:bg-secondary transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(material.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-destructive/20 text-destructive transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
