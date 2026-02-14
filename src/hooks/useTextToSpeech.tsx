import { useState, useRef, useCallback, useEffect } from 'react';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const { language } = useThemeLanguage();

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Cancel on unmount
  useEffect(() => {
    return () => {
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, [isSupported]);

  const speak = useCallback((text: string) => {
    if (!isSupported || !text.trim()) return;

    stop();

    // Clean markdown/latex for speech
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/```[\s\S]*?```/g, 'code block omitted')
      .replace(/`(.*?)`/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\$\$[\s\S]*?\$\$/g, 'math formula')
      .replace(/\$[^$]+\$/g, 'math formula')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const isArabic = language === 'ar';
    utterance.lang = isArabic ? 'ar-SA' : 'en-US';

    // Try to pick a good voice for the current language
    const voices = window.speechSynthesis.getVoices();
    const preferred = isArabic
      ? voices.find(v => v.lang.startsWith('ar'))
      : (voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
         || voices.find(v => v.lang.startsWith('en')));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsLoading(false);
    };
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsLoading(false);
    };

    utteranceRef.current = utterance;
    setIsLoading(true);
    window.speechSynthesis.speak(utterance);
  }, [isSupported, stop]);

  return { speak, stop, isSpeaking, isLoading, isSupported };
}
