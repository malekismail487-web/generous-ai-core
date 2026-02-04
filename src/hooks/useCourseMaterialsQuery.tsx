import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useToast } from '@/hooks/use-toast';
import { useCallback, useMemo } from 'react';

export type CourseMaterial = {
  id: string;
  subject: string;
  title: string;
  content: string | null;
  file_url: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  school_id: string | null;
  grade_level?: string;
};

export type MaterialView = {
  id: string;
  material_id: string;
  user_id: string;
  seen_at: string;
};

export type MaterialComment = {
  id: string;
  material_id: string;
  user_id: string;
  comment: string;
  created_at: string;
};

// Query keys for cache management
const QUERY_KEYS = {
  materials: (schoolId: string | undefined) => ['course-materials', schoolId],
  views: (userId: string | undefined) => ['material-views', userId],
  comments: (materialId: string) => ['material-comments', materialId],
};

export function useCourseMaterialsQuery() {
  const { user } = useAuth();
  const { profile, school, isTeacher } = useRoleGuard();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch materials with React Query caching
  const {
    data: materials = [],
    isLoading: loading,
    refetch: refresh,
  } = useQuery({
    queryKey: QUERY_KEYS.materials(school?.id),
    queryFn: async () => {
      if (!school) return [];
      
      const { data, error } = await supabase
        .from('course_materials')
        .select('*')
        .eq('school_id', school.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading materials:', error);
        return [];
      }

      // Filter by grade level for students (done client-side for simplicity)
      let filteredMaterials = data || [];
      if (!isTeacher && profile?.grade_level) {
        filteredMaterials = filteredMaterials.filter((m: any) => {
          const materialGrade = m.grade_level;
          return !materialGrade || materialGrade === 'All' || materialGrade === profile.grade_level;
        });
      }
      
      return filteredMaterials as CourseMaterial[];
    },
    enabled: !!school,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
  });

  // Fetch user's material views with caching
  const { data: views = [] } = useQuery({
    queryKey: QUERY_KEYS.views(user?.id),
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('material_views')
        .select('*')
        .eq('user_id', user.id);

      if (error) return [];
      return data || [];
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  // Memoized helper: Get materials by subject
  const getMaterialsBySubject = useCallback((subject: string) => {
    if (subject === 'all') return materials;
    return materials.filter(m => m.subject === subject);
  }, [materials]);

  // Memoized helper: Get unique subjects
  const subjects = useMemo(() => {
    const subjectSet = new Set(materials.map(m => m.subject));
    return Array.from(subjectSet);
  }, [materials]);

  // Check if material is viewed (memoized)
  const viewedMaterialIds = useMemo(() => {
    return new Set(views.map(v => v.material_id));
  }, [views]);

  const isMaterialViewed = useCallback((materialId: string) => {
    return viewedMaterialIds.has(materialId);
  }, [viewedMaterialIds]);

  // Mark material as viewed mutation
  const markViewedMutation = useMutation({
    mutationFn: async (materialId: string) => {
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('material_views')
        .insert({ material_id: materialId, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.views(user?.id) });
    },
  });

  const markAsViewed = useCallback((materialId: string) => {
    if (!user || isMaterialViewed(materialId)) return;
    markViewedMutation.mutate(materialId);
  }, [user, isMaterialViewed, markViewedMutation]);

  // Upload material mutation
  const uploadMutation = useMutation({
    mutationFn: async ({
      subject,
      title,
      content,
      gradeLevel,
      fileUrl,
    }: {
      subject: string;
      title: string;
      content: string;
      gradeLevel: string;
      fileUrl?: string;
    }) => {
      if (!user || !isTeacher || !school) {
        throw new Error('Only teachers can upload materials');
      }

      const { data, error } = await supabase
        .from('course_materials')
        .insert({
          subject,
          title,
          content,
          file_url: fileUrl || null,
          uploaded_by: user.id,
          school_id: school.id,
          grade_level: gradeLevel,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data as CourseMaterial;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.materials(school?.id) });
      toast({ title: 'Material uploaded successfully!' });
    },
    onError: (error) => {
      console.error('Error uploading material:', error);
      toast({ variant: 'destructive', title: 'Error uploading material' });
    },
  });

  const uploadMaterial = useCallback(async (
    subject: string,
    title: string,
    content: string,
    gradeLevel: string,
    fileUrl?: string
  ) => {
    try {
      const result = await uploadMutation.mutateAsync({ subject, title, content, gradeLevel, fileUrl });
      return result;
    } catch {
      return null;
    }
  }, [uploadMutation]);

  // Update material mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      materialId,
      title,
      content,
      gradeLevel,
      fileUrl,
    }: {
      materialId: string;
      title: string;
      content: string;
      gradeLevel: string;
      fileUrl?: string;
    }) => {
      if (!user || !isTeacher) throw new Error('Only teachers can update materials');

      const { data, error } = await supabase
        .from('course_materials')
        .update({
          title,
          content,
          file_url: fileUrl || null,
          grade_level: gradeLevel,
        } as any)
        .eq('id', materialId)
        .eq('uploaded_by', user.id)
        .select()
        .single();

      if (error) throw error;
      return data as CourseMaterial;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.materials(school?.id) });
      toast({ title: 'Material updated!' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Error updating material' });
    },
  });

  const updateMaterial = useCallback(async (
    materialId: string,
    title: string,
    content: string,
    gradeLevel: string,
    fileUrl?: string
  ) => {
    try {
      const result = await updateMutation.mutateAsync({ materialId, title, content, gradeLevel, fileUrl });
      return result;
    } catch {
      return null;
    }
  }, [updateMutation]);

  // Delete material mutation
  const deleteMutation = useMutation({
    mutationFn: async (materialId: string) => {
      if (!user || !isTeacher) throw new Error('Only teachers can delete materials');

      const { error } = await supabase
        .from('course_materials')
        .delete()
        .eq('id', materialId)
        .eq('uploaded_by', user.id);

      if (error) throw error;
      return materialId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.materials(school?.id) });
      toast({ title: 'Material deleted!' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Error deleting material' });
    },
  });

  const deleteMaterial = useCallback(async (materialId: string) => {
    try {
      await deleteMutation.mutateAsync(materialId);
      return true;
    } catch {
      return false;
    }
  }, [deleteMutation]);

  // Get comments with caching
  const getComments = useCallback(async (materialId: string) => {
    const cached = queryClient.getQueryData<MaterialComment[]>(QUERY_KEYS.comments(materialId));
    if (cached) return cached;

    const { data, error } = await supabase
      .from('material_comments')
      .select('*')
      .eq('material_id', materialId)
      .order('created_at', { ascending: true });

    if (error) return [];
    
    const comments = data || [];
    queryClient.setQueryData(QUERY_KEYS.comments(materialId), comments);
    return comments;
  }, [queryClient]);

  // Submit comment mutation
  const commentMutation = useMutation({
    mutationFn: async ({ materialId, comment }: { materialId: string; comment: string }) => {
      if (!user || !comment.trim()) throw new Error('Invalid comment');

      const { data, error } = await supabase
        .from('material_comments')
        .insert({
          material_id: materialId,
          user_id: user.id,
          comment: comment.trim(),
        })
        .select()
        .single();

      if (error) throw error;
      return { materialId, comment: data };
    },
    onSuccess: ({ materialId, comment }) => {
      queryClient.setQueryData<MaterialComment[]>(
        QUERY_KEYS.comments(materialId),
        (old) => [...(old || []), comment]
      );
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Error submitting comment' });
    },
  });

  const submitComment = useCallback(async (materialId: string, comment: string) => {
    try {
      const result = await commentMutation.mutateAsync({ materialId, comment });
      return result.comment;
    } catch {
      return null;
    }
  }, [commentMutation]);

  return {
    materials,
    isTeacher,
    loading,
    getMaterialsBySubject,
    getSubjects: () => subjects,
    isMaterialViewed,
    markAsViewed,
    uploadMaterial,
    updateMaterial,
    deleteMaterial,
    getComments,
    submitComment,
    refresh,
  };
}
