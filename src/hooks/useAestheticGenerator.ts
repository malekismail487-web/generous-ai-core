/**
 * PHASE 1: Aesthetic Integration Hook
 * 
 * Provides a React hook to generate aesthetic on demand within LectureStudio.
 * This is called during the outline generation phase to ensure Lumina selects
 * a coherent visual identity before generating content.
 */

import { useCallback } from 'react';
import { generateAesthetic, parseDesignHint, type GeneratedAesthetic } from '@/lib/aestheticGenerator';
import type { Expertise } from '@/components/shared/LectureStudio/types';

export interface UseAestheticGeneratorOptions {
  subject?: string;
  topic?: string;
  expertise?: Expertise;
  gradeLevel?: string;
  designHint?: string;
}

export function useAestheticGenerator() {
  const generateForLecture = useCallback(
    (options: UseAestheticGeneratorOptions): GeneratedAesthetic => {
      const {
        subject = '',
        topic = '',
        expertise = 'intermediate',
        gradeLevel,
        designHint = '',
      } = options;

      // If user provided a strong design hint, respect it
      const hintOverride = parseDesignHint(designHint);

      // Generate full aesthetic system
      let aesthetic = generateAesthetic(subject, topic, expertise, gradeLevel, designHint);

      // Override aesthetic if design hint was specific
      if (hintOverride) {
        aesthetic = { ...aesthetic, aesthetic: hintOverride };
      }

      return aesthetic;
    },
    []
  );

  return { generateForLecture };
}
