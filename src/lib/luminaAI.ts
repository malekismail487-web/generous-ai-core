// luminaAI.ts
// Pure AI module — all AI calls go through edge functions (Gemini via Lovable AI Gateway)
// This module provides client-side helpers for AI features.
//
// @deprecated These helpers call the `chat` edge function WITHOUT injecting
// adaptive context, so any output is "blind" to the student's IRT ability,
// learning style, cognitive/emotional state, and knowledge gaps.
//
// Do not add new consumers. If you need conversational AI in a student-facing
// surface, use `useAdaptiveIntelligence().getSimpleParams(feature, subject)`
// and pass `adaptiveLevel` / `learningStyle` into the edge function body
// (see PodcastsSection or FlashcardsSection for the canonical pattern).
//
// This file is retained only because a small number of dead-code paths still
// reference it; Stage 15 (Universal Adaptive Wiring) verified zero live
// callers and marked it deprecated rather than delete it in the same pass.

import { supabase } from '@/integrations/supabase/client';

// ----- LaTeX Renderer -----
export function renderLatex(mathString: string): string {
  return mathString ? `$$${mathString}$$` : "";
}

// ----- General Chat (via edge function) -----
export async function generalChat(userMessage: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('chat', {
    body: {
      messages: [{ role: 'user', content: userMessage }],
    },
  });
  if (error) throw error;
  // For non-streaming, extract content
  if (typeof data === 'string') return data;
  return data?.choices?.[0]?.message?.content || 'No response';
}

// ----- Math Chat (via edge function) -----
export async function mathChat(userMessage: string): Promise<{ text: string; latex: string }> {
  const prompt = `Solve this math problem and provide LaTeX output if possible:\n${userMessage}`;
  const text = await generalChat(prompt);
  const mathOutput = text.match(/\$\$.*\$\$/)?.[0] || "";
  return { text, latex: renderLatex(mathOutput) };
}

// ----- Generate Lecture (via edge function) -----
export async function generateLecture(topic: string, level: "beginner" | "intermediate" | "advanced"): Promise<string> {
  const prompt = `Generate a detailed ${level}-level lecture on: ${topic}`;
  return await generalChat(prompt);
}

// ----- Summarize Lecture (via edge function) -----
export async function summarizeLecture(content: string): Promise<string> {
  const prompt = `Summarize the following lecture content concisely:\n${content}`;
  return await generalChat(prompt);
}
