import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Note {
  id: string;
  title: string;
  content: string;
  ai_feedback: string | null;
  created_at: string;
  updated_at: string;
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Fetch all notes
  const fetchNotes = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching notes:', error);
    } else {
      setNotes(data || []);
    }
    setLoading(false);
  }, [user]);

  // Create a new note
  const createNote = useCallback(async (title?: string, content?: string) => {
    if (!user) return null;
    
    const { data, error } = await supabase
      .from('notes')
      .insert({ 
        user_id: user.id, 
        title: title || 'Untitled Note',
        content: content || ''
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating note:', error);
      return null;
    }
    
    setNotes(prev => [data, ...prev]);
    setCurrentNote(data);
    return data;
  }, [user]);

  // Update a note
  const updateNote = useCallback(async (noteId: string, updates: Partial<Pick<Note, 'title' | 'content' | 'ai_feedback'>>) => {
    const { data, error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', noteId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating note:', error);
      return null;
    }
    
    setNotes(prev => prev.map(n => n.id === noteId ? data : n));
    if (currentNote?.id === noteId) {
      setCurrentNote(data);
    }
    return data;
  }, [currentNote]);

  // Delete a note
  const deleteNote = useCallback(async (noteId: string) => {
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', noteId);
    
    if (error) {
      console.error('Error deleting note:', error);
      return false;
    }
    
    setNotes(prev => prev.filter(n => n.id !== noteId));
    if (currentNote?.id === noteId) {
      setCurrentNote(null);
    }
    return true;
  }, [currentNote]);

  // Select a note
  const selectNote = useCallback((note: Note) => {
    setCurrentNote(note);
  }, []);

  // Clear current note
  const clearCurrentNote = useCallback(() => {
    setCurrentNote(null);
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  return {
    notes,
    currentNote,
    loading,
    createNote,
    updateNote,
    deleteNote,
    selectNote,
    clearCurrentNote,
    setCurrentNote,
  };
}
