import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useToast } from '@/hooks/use-toast';

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

export function useCourseMaterials() {
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [views, setViews] = useState<MaterialView[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { profile, school, isTeacher } = useRoleGuard();
  const { toast } = useToast();

  // Load course materials filtered by school and grade level
  const loadMaterials = useCallback(async () => {
    if (!school) {
      setMaterials([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    let query = supabase
      .from('course_materials')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error loading materials:', error);
      setMaterials([]);
    } else {
      // Filter by grade level for students
      let filteredMaterials = data || [];
      
      if (!isTeacher && profile?.grade_level) {
        // Students only see materials for their grade level or 'All' grades
        filteredMaterials = filteredMaterials.filter((m: any) => {
          const materialGrade = m.grade_level;
          return !materialGrade || materialGrade === 'All' || materialGrade === profile.grade_level;
        });
      }
      
      setMaterials(filteredMaterials as CourseMaterial[]);
    }
    setLoading(false);
  }, [school, profile, isTeacher]);

  // Load user's material views
  const loadViews = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('material_views')
      .select('*')
      .eq('user_id', user.id);

    if (!error) {
      setViews(data || []);
    }
  }, [user]);

  useEffect(() => {
    loadMaterials();
    loadViews();
  }, [loadMaterials, loadViews]);

  // Get materials by subject
  const getMaterialsBySubject = useCallback((subject: string) => {
    if (subject === 'all') return materials;
    return materials.filter(m => m.subject === subject);
  }, [materials]);

  // Get unique subjects
  const getSubjects = useCallback(() => {
    const subjectSet = new Set(materials.map(m => m.subject));
    return Array.from(subjectSet);
  }, [materials]);

  // Check if material is viewed
  const isMaterialViewed = useCallback((materialId: string) => {
    return views.some(v => v.material_id === materialId);
  }, [views]);

  // Mark material as viewed
  const markAsViewed = useCallback(async (materialId: string) => {
    if (!user || isMaterialViewed(materialId)) return;

    const { data, error } = await supabase
      .from('material_views')
      .insert({ material_id: materialId, user_id: user.id })
      .select()
      .single();

    if (!error && data) {
      setViews(prev => [...prev, data]);
    }
  }, [user, isMaterialViewed]);

  // Upload new material (teachers only) - now with grade level
  const uploadMaterial = useCallback(async (
    subject: string,
    title: string,
    content: string,
    gradeLevel: string,
    fileUrl?: string
  ) => {
    if (!user || !isTeacher || !school) {
      toast({ variant: 'destructive', title: 'Only teachers can upload materials' });
      return null;
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
        grade_level: gradeLevel
      } as any)
      .select()
      .single();

    if (error) {
      console.error('Error uploading material:', error);
      toast({ variant: 'destructive', title: 'Error uploading material' });
      return null;
    }

    setMaterials(prev => [data as CourseMaterial, ...prev]);
    toast({ title: 'Material uploaded successfully!' });
    return data;
  }, [user, isTeacher, school, toast]);

  // Update material (teachers only, own materials)
  const updateMaterial = useCallback(async (
    materialId: string,
    title: string,
    content: string,
    gradeLevel: string,
    fileUrl?: string
  ) => {
    if (!user || !isTeacher) return null;

    const { data, error } = await supabase
      .from('course_materials')
      .update({
        title,
        content,
        file_url: fileUrl || null,
        grade_level: gradeLevel
      } as any)
      .eq('id', materialId)
      .eq('uploaded_by', user.id)
      .select()
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error updating material' });
      return null;
    }

    setMaterials(prev => prev.map(m => m.id === materialId ? data as CourseMaterial : m));
    toast({ title: 'Material updated!' });
    return data;
  }, [user, isTeacher, toast]);

  // Delete material (teachers only, own materials)
  const deleteMaterial = useCallback(async (materialId: string) => {
    if (!user || !isTeacher) return false;

    const { error } = await supabase
      .from('course_materials')
      .delete()
      .eq('id', materialId)
      .eq('uploaded_by', user.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Error deleting material' });
      return false;
    }

    setMaterials(prev => prev.filter(m => m.id !== materialId));
    toast({ title: 'Material deleted!' });
    return true;
  }, [user, isTeacher, toast]);

  // Get comments for a material
  const getComments = useCallback(async (materialId: string) => {
    const { data, error } = await supabase
      .from('material_comments')
      .select('*')
      .eq('material_id', materialId)
      .order('created_at', { ascending: true });

    if (error) return [];
    return data || [];
  }, []);

  // Submit a comment
  const submitComment = useCallback(async (materialId: string, comment: string) => {
    if (!user || !comment.trim()) return null;

    const { data, error } = await supabase
      .from('material_comments')
      .insert({
        material_id: materialId,
        user_id: user.id,
        comment: comment.trim()
      })
      .select()
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error submitting comment' });
      return null;
    }

    return data;
  }, [user, toast]);

  return {
    materials,
    isTeacher,
    loading,
    getMaterialsBySubject,
    getSubjects,
    isMaterialViewed,
    markAsViewed,
    uploadMaterial,
    updateMaterial,
    deleteMaterial,
    getComments,
    submitComment,
    refresh: loadMaterials
  };
}
