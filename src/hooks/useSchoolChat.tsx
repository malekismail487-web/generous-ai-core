import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useSchool } from './useSchool';
import { useToast } from './use-toast';

export interface ChatRoom {
  id: string;
  school_id: string;
  name: string;
  created_at: string;
  created_by: string;
}

export interface ChatMessage {
  id: string;
  chat_room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_name?: string;
}

export function useSchoolChat() {
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  // Fetch chat rooms for the user's school
  const fetchChatRooms = useCallback(async () => {
    if (!user || !school) {
      setChatRooms([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching chat rooms:', error);
    } else {
      setChatRooms(data || []);
      // Auto-select first room if none selected
      if (data && data.length > 0 && !currentRoom) {
        setCurrentRoom(data[0]);
      }
    }
    setLoading(false);
  }, [user, school, currentRoom]);

  // Fetch messages for current room
  const fetchMessages = useCallback(async () => {
    if (!currentRoom) {
      setMessages([]);
      return;
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_room_id', currentRoom.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      console.error('Error fetching messages:', error);
    } else {
      setMessages(data || []);
    }
  }, [currentRoom]);

  // Send a message
  const sendMessage = useCallback(async (content: string) => {
    if (!user || !currentRoom) return null;

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        chat_room_id: currentRoom.id,
        user_id: user.id,
        content,
      })
      .select()
      .single();

    if (error) {
      console.error('Error sending message:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send message',
      });
      return null;
    }

    return data;
  }, [user, currentRoom, toast]);

  // Create a chat room (teachers/admins only)
  const createChatRoom = useCallback(async (name: string) => {
    if (!user || !school) return null;

    const { data, error } = await supabase
      .from('chat_rooms')
      .insert({
        school_id: school.id,
        name,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating chat room:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create chat room',
      });
      return null;
    }

    setChatRooms(prev => [...prev, data]);
    return data;
  }, [user, school, toast]);

  // Delete a message
  const deleteMessage = useCallback(async (messageId: string) => {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('id', messageId);

    if (error) {
      console.error('Error deleting message:', error);
      return false;
    }

    setMessages(prev => prev.filter(m => m.id !== messageId));
    return true;
  }, []);

  // Real-time subscription
  useEffect(() => {
    if (!currentRoom) return;

    const channel = supabase
      .channel(`chat-${currentRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `chat_room_id=eq.${currentRoom.id}`,
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as ChatMessage]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_messages',
          filter: `chat_room_id=eq.${currentRoom.id}`,
        },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as ChatMessage).id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom]);

  useEffect(() => {
    fetchChatRooms();
  }, [fetchChatRooms]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return {
    chatRooms,
    currentRoom,
    messages,
    loading,
    setCurrentRoom,
    sendMessage,
    createChatRoom,
    deleteMessage,
    refresh: fetchChatRooms,
  };
}
