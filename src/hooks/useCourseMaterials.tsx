import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
  const [isTeacher, setIsTeacher] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // Check if user is a teacher
  const checkRole = useCallback(async () => {
    if (!user) {
      setIsTeacher(false);
      return;
    }

    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .maybeSingle();

    setIsTeacher(!!data && !error);
  }, [user]);

  // Load all course materials
  const loadMaterials = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('course_materials')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading materials:', error);
    } else {
      setMaterials(data || []);
    }
    setLoading(false);
  }, []);

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
    checkRole();
    loadMaterials();
    loadViews();
  }, [checkRole, loadMaterials, loadViews]);

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

  // Upload new material (teachers only)
  const uploadMaterial = useCallback(async (
    subject: string,
    title: string,
    content: string,
    fileUrl?: string
  ) => {
    if (!user || !isTeacher) {
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
        uploaded_by: user.id
      })
      .select()
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error uploading material' });
      return null;
    }

    setMaterials(prev => [data, ...prev]);
    toast({ title: 'Material uploaded successfully!' });
    return data;
  }, [user, isTeacher, toast]);

  // Update material (teachers only, own materials)
  const updateMaterial = useCallback(async (
    materialId: string,
    title: string,
    content: string,
    fileUrl?: string
  ) => {
    if (!user || !isTeacher) return null;

    const { data, error } = await supabase
      .from('course_materials')
      .update({
        title,
        content,
        file_url: fileUrl || null
      })
      .eq('id', materialId)
      .eq('uploaded_by', user.id)
      .select()
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error updating material' });
      return null;
    }

    setMaterials(prev => prev.map(m => m.id === materialId ? data : m));
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
