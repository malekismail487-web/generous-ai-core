import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Material {
  id: string;
  subject: string;
  grade: string;
  topic: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export function useMaterials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Fetch all materials for the user
  const fetchMaterials = useCallback(async () => {
    if (!user) {
      setMaterials([]);
      setLoading(false);
      return;
    }
    
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching materials:', error);
    } else {
      setMaterials(data || []);
    }
    setLoading(false);
  }, [user]);

  // Get materials for a specific subject and grade
  const getMaterialsBySubjectAndGrade = useCallback((subject: string, grade: string) => {
    return materials.filter(m => m.subject === subject && m.grade === grade);
  }, [materials]);

  // Get all materials for a specific subject (all grades)
  const getMaterialsBySubject = useCallback((subject: string) => {
    return materials.filter(m => m.subject === subject);
  }, [materials]);

  // Create a new material
  const createMaterial = useCallback(async (
    subject: string, 
    grade: string, 
    topic: string, 
    content: string
  ) => {
    if (!user) return null;
    
    const { data, error } = await supabase
      .from('materials')
      .insert({ 
        user_id: user.id, 
        subject,
        grade,
        topic,
        content
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating material:', error);
      return null;
    }
    
    setMaterials(prev => [data, ...prev]);
    return data;
  }, [user]);

  // Update a material
  const updateMaterial = useCallback(async (
    materialId: string, 
    updates: Partial<Pick<Material, 'topic' | 'content'>>
  ) => {
    const { data, error } = await supabase
      .from('materials')
      .update(updates)
      .eq('id', materialId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating material:', error);
      return null;
    }
    
    setMaterials(prev => prev.map(m => m.id === materialId ? data : m));
    return data;
  }, []);

  // Delete a material
  const deleteMaterial = useCallback(async (materialId: string) => {
    const { error } = await supabase
      .from('materials')
      .delete()
      .eq('id', materialId);
    
    if (error) {
      console.error('Error deleting material:', error);
      return false;
    }
    
    setMaterials(prev => prev.filter(m => m.id !== materialId));
    return true;
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  return {
    materials,
    loading,
    getMaterialsBySubjectAndGrade,
    getMaterialsBySubject,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    refetch: fetchMaterials,
  };
}
