import { useState, useCallback, useRef, useEffect } from 'react';

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface UseVoiceRecordingProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  continuous?: boolean;
}

export function useVoiceRecording({ 
  onTranscript, 
  onInterimTranscript,
  onError,
  continuous = true 
}: UseVoiceRecordingProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldRestartRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = continuous;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.results.length - 1; i >= 0; i--) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript = result[0].transcript;
            break;
          } else {
            interimTranscript = result[0].transcript;
          }
        }

        if (interimTranscript) {
          setInterimText(interimTranscript);
          onInterimTranscript?.(interimTranscript);
        }

        if (finalTranscript) {
          setInterimText('');
          onTranscript(finalTranscript);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          onError?.('Microphone access denied. Please enable microphone permissions.');
          setIsListening(false);
          shouldRestartRef.current = false;
        } else if (event.error === 'no-speech') {
          // Don't show error for no-speech, just restart if continuous
          if (continuous && shouldRestartRef.current) {
            try {
              recognition.start();
            } catch (e) {
              // Ignore restart errors
            }
          }
        } else if (event.error === 'aborted') {
          // Ignore aborted errors
        } else {
          onError?.(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        if (continuous && shouldRestartRef.current) {
          try {
            recognition.start();
          } catch (e) {
            setIsListening(false);
            shouldRestartRef.current = false;
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [onTranscript, onInterimTranscript, onError, continuous]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        shouldRestartRef.current = continuous;
        recognitionRef.current.start();
        setIsListening(true);
        setInterimText('');
      } catch (error) {
        console.error('Failed to start recognition:', error);
        onError?.('Failed to start voice recognition');
      }
    }
  }, [isListening, onError, continuous]);

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimText('');
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    isSupported,
    interimText,
    startListening,
    stopListening,
    toggleListening,
  };
}