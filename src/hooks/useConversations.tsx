import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Fetch all conversations
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching conversations:', error);
    } else {
      setConversations(data || []);
    }
    setLoading(false);
  }, [user]);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching messages:', error);
    } else {
      setMessages((data || []).map(m => ({
        ...m,
        role: m.role as 'user' | 'assistant'
      })));
    }
  }, []);

  // Create a new conversation
  const createConversation = useCallback(async (title?: string) => {
    if (!user) return null;
    
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: title || 'New Chat' })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
    
    setConversations(prev => [data, ...prev]);
    setCurrentConversation(data);
    setMessages([]);
    return data;
  }, [user]);

  // Add a message to the current conversation
  const addMessage = useCallback(async (role: 'user' | 'assistant', content: string, conversationId?: string) => {
    const convId = conversationId || currentConversation?.id;
    if (!convId) return null;
    
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: convId, role, content })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding message:', error);
      return null;
    }
    
    const typedData = { ...data, role: data.role as 'user' | 'assistant' };
    setMessages(prev => [...prev, typedData]);
    
    // Update conversation title if it's the first user message
    if (role === 'user' && messages.length === 0) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      await supabase
        .from('conversations')
        .update({ title })
        .eq('id', convId);
      
      setConversations(prev => 
        prev.map(c => c.id === convId ? { ...c, title } : c)
      );
      if (currentConversation?.id === convId) {
        setCurrentConversation(prev => prev ? { ...prev, title } : null);
      }
    }
    
    return data;
  }, [currentConversation, messages.length]);

  // Update assistant message (for streaming)
  const updateAssistantMessage = useCallback(async (messageId: string, content: string) => {
    setMessages(prev => 
      prev.map(m => m.id === messageId ? { ...m, content } : m)
    );
  }, []);

  // Delete a conversation
  const deleteConversation = useCallback(async (conversationId: string) => {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);
    
    if (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
    
    setConversations(prev => prev.filter(c => c.id !== conversationId));
    if (currentConversation?.id === conversationId) {
      setCurrentConversation(null);
      setMessages([]);
    }
    return true;
  }, [currentConversation]);

  // Select a conversation
  const selectConversation = useCallback(async (conversation: Conversation) => {
    setCurrentConversation(conversation);
    await fetchMessages(conversation.id);
  }, [fetchMessages]);

  // Clear current conversation (new chat)
  const clearCurrentConversation = useCallback(() => {
    setCurrentConversation(null);
    setMessages([]);
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    currentConversation,
    messages,
    loading,
    createConversation,
    addMessage,
    updateAssistantMessage,
    deleteConversation,
    selectConversation,
    clearCurrentConversation,
    fetchMessages,
    setMessages,
  };
}
