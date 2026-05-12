export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          school_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          school_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adaptive_quality_scores: {
        Row: {
          created_at: string
          dimensions: Json
          failures: string[]
          feature: string
          id: string
          output_excerpt: string | null
          profile_snapshot: Json | null
          regenerated: boolean
          school_id: string | null
          score: number
          subject: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dimensions?: Json
          failures?: string[]
          feature: string
          id?: string
          output_excerpt?: string | null
          profile_snapshot?: Json | null
          regenerated?: boolean
          school_id?: string | null
          score: number
          subject?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          dimensions?: Json
          failures?: string[]
          feature?: string
          id?: string
          output_excerpt?: string | null
          profile_snapshot?: Json | null
          regenerated?: boolean
          school_id?: string | null
          score?: number
          subject?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_access_codes: {
        Row: {
          code_hash: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      admin_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          school_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          school_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          school_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          school_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          school_id: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          school_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          content: string | null
          feedback: string | null
          grade: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          student_id: string
          submitted_at: string
        }
        Insert: {
          assignment_id: string
          content?: string | null
          feedback?: string | null
          grade?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          student_id: string
          submitted_at?: string
        }
        Update: {
          assignment_id?: string
          content?: string | null
          feedback?: string | null
          grade?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_views: {
        Row: {
          assignment_id: string
          id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          assignment_id: string
          id?: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          assignment_id?: string
          id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_views_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          class_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          grade_level: string
          id: string
          points: number | null
          questions_json: Json | null
          school_id: string
          source: string
          subject: string
          subject_id: string | null
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          grade_level: string
          id?: string
          points?: number | null
          questions_json?: Json | null
          school_id: string
          source?: string
          subject: string
          subject_id?: string | null
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          grade_level?: string
          id?: string
          points?: number | null
          questions_json?: Json | null
          school_id?: string
          source?: string
          subject?: string
          subject_id?: string | null
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_id: string
          created_at: string
          date: string
          id: string
          notes: string | null
          status: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          status: string
          student_id: string
          teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          status?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      awards: {
        Row: {
          created_at: string
          description: string | null
          id: string
          school_id: string
          student_id: string
          teacher_id: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          school_id: string
          student_id: string
          teacher_id: string
          title: string
          type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          school_id?: string
          student_id?: string
          teacher_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "awards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          chat_room_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          chat_room_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          chat_room_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          school_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name?: string
          school_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          grade_level: string | null
          id: string
          name: string
          school_id: string
        }
        Insert: {
          created_at?: string
          grade_level?: string | null
          id?: string
          name: string
          school_id: string
        }
        Update: {
          created_at?: string
          grade_level?: string | null
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cognitive_mirror_snapshots: {
        Row: {
          actual_answer: string | null
          context: Json | null
          created_at: string
          drift_score: number | null
          id: string
          predicted_answer: string | null
          predicted_misconception: string | null
          predicted_reasoning: string | null
          prediction_matched: boolean | null
          question: string
          resolved_at: string | null
          school_id: string | null
          source: string
          subject: string | null
          topic: string | null
          user_id: string
          was_correct: boolean | null
        }
        Insert: {
          actual_answer?: string | null
          context?: Json | null
          created_at?: string
          drift_score?: number | null
          id?: string
          predicted_answer?: string | null
          predicted_misconception?: string | null
          predicted_reasoning?: string | null
          prediction_matched?: boolean | null
          question: string
          resolved_at?: string | null
          school_id?: string | null
          source?: string
          subject?: string | null
          topic?: string | null
          user_id: string
          was_correct?: boolean | null
        }
        Update: {
          actual_answer?: string | null
          context?: Json | null
          created_at?: string
          drift_score?: number | null
          id?: string
          predicted_answer?: string | null
          predicted_misconception?: string | null
          predicted_reasoning?: string | null
          prediction_matched?: boolean | null
          question?: string
          resolved_at?: string | null
          school_id?: string | null
          source?: string
          subject?: string | null
          topic?: string | null
          user_id?: string
          was_correct?: boolean | null
        }
        Relationships: []
      }
      cognitive_mirror_stats: {
        Row: {
          avg_drift: number
          last_updated: string
          matched_predictions: number
          rolling_accuracy: number
          school_id: string | null
          total_predictions: number
          user_id: string
        }
        Insert: {
          avg_drift?: number
          last_updated?: string
          matched_predictions?: number
          rolling_accuracy?: number
          school_id?: string | null
          total_predictions?: number
          user_id: string
        }
        Update: {
          avg_drift?: number
          last_updated?: string
          matched_predictions?: number
          rolling_accuracy?: number
          school_id?: string | null
          total_predictions?: number
          user_id?: string
        }
        Relationships: []
      }
      concept_mastery: {
        Row: {
          created_at: string
          ease_factor: number
          id: string
          interval_days: number
          is_test_data: boolean
          last_practiced_at: string
          mastery_score: number
          next_review_at: string
          repetitions: number
          school_id: string | null
          subject: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ease_factor?: number
          id?: string
          interval_days?: number
          is_test_data?: boolean
          last_practiced_at?: string
          mastery_score?: number
          next_review_at?: string
          repetitions?: number
          school_id?: string | null
          subject: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ease_factor?: number
          id?: string
          interval_days?: number
          is_test_data?: boolean
          last_practiced_at?: string
          mastery_score?: number
          next_review_at?: string
          repetitions?: number
          school_id?: string | null
          subject?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      confidence_calibration_stats: {
        Row: {
          avg_accuracy: number
          avg_confidence: number
          calibration_gap: number
          id: string
          sample_size: number
          school_id: string | null
          subject: string | null
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_accuracy?: number
          avg_confidence?: number
          calibration_gap?: number
          id?: string
          sample_size?: number
          school_id?: string | null
          subject?: string | null
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_accuracy?: number
          avg_confidence?: number
          calibration_gap?: number
          id?: string
          sample_size?: number
          school_id?: string | null
          subject?: string | null
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      confidence_responses: {
        Row: {
          confidence_level: number
          created_at: string
          id: string
          is_test_data: boolean
          question_id: string | null
          question_text: string | null
          school_id: string | null
          source: string
          subject: string | null
          topic: string | null
          user_id: string
          was_correct: boolean
        }
        Insert: {
          confidence_level: number
          created_at?: string
          id?: string
          is_test_data?: boolean
          question_id?: string | null
          question_text?: string | null
          school_id?: string | null
          source: string
          subject?: string | null
          topic?: string | null
          user_id: string
          was_correct: boolean
        }
        Update: {
          confidence_level?: number
          created_at?: string
          id?: string
          is_test_data?: boolean
          question_id?: string | null
          question_text?: string | null
          school_id?: string | null
          source?: string
          subject?: string | null
          topic?: string | null
          user_id?: string
          was_correct?: boolean
        }
        Relationships: []
      }
      content_flags: {
        Row: {
          content_id: string | null
          content_text: string
          content_type: string
          created_at: string
          id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string | null
          severity: string
          status: string
          user_id: string
        }
        Insert: {
          content_id?: string | null
          content_text: string
          content_type: string
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          severity?: string
          status?: string
          user_id: string
        }
        Update: {
          content_id?: string | null
          content_text?: string
          content_type?: string
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          severity?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_flags_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      course_materials: {
        Row: {
          content: string | null
          created_at: string
          file_url: string | null
          grade_level: string | null
          id: string
          school_id: string | null
          subject: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_url?: string | null
          grade_level?: string | null
          id?: string
          school_id?: string | null
          subject: string
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          content?: string | null
          created_at?: string
          file_url?: string | null
          grade_level?: string | null
          id?: string
          school_id?: string | null
          subject?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_materials_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_streaks: {
        Row: {
          created_at: string
          current_streak: number
          id: string
          last_active_date: string
          max_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          id?: string
          last_active_date?: string
          max_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          id?: string
          last_active_date?: string
          max_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      decay_refreshers: {
        Row: {
          answered_at: string | null
          concept_mastery_id: string
          correct_index: number | null
          created_at: string
          id: string
          options_json: Json
          question_text: string
          selected_index: number | null
          shown_at: string
          user_id: string
          was_correct: boolean | null
        }
        Insert: {
          answered_at?: string | null
          concept_mastery_id: string
          correct_index?: number | null
          created_at?: string
          id?: string
          options_json?: Json
          question_text: string
          selected_index?: number | null
          shown_at?: string
          user_id: string
          was_correct?: boolean | null
        }
        Update: {
          answered_at?: string | null
          concept_mastery_id?: string
          correct_index?: number | null
          created_at?: string
          id?: string
          options_json?: Json
          question_text?: string
          selected_index?: number | null
          shown_at?: string
          user_id?: string
          was_correct?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "decay_refreshers_concept_mastery_id_fkey"
            columns: ["concept_mastery_id"]
            isOneToOne: false
            referencedRelation: "concept_mastery"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_submissions: {
        Row: {
          answers_json: Json
          auto_graded: boolean
          exam_id: string
          id: string
          score: number | null
          started_at: string
          student_id: string
          submitted_at: string | null
        }
        Insert: {
          answers_json?: Json
          auto_graded?: boolean
          exam_id: string
          id?: string
          score?: number | null
          started_at?: string
          student_id: string
          submitted_at?: string | null
        }
        Update: {
          answers_json?: Json
          auto_graded?: boolean
          exam_id?: string
          id?: string
          score?: number | null
          started_at?: string
          student_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_submissions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          class_ids: string[] | null
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_published: boolean
          questions_json: Json
          scheduled_at: string | null
          school_id: string
          subject_id: string
          teacher_id: string
          title: string
          total_points: number
        }
        Insert: {
          class_ids?: string[] | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_published?: boolean
          questions_json?: Json
          scheduled_at?: string | null
          school_id: string
          subject_id: string
          teacher_id: string
          title: string
          total_points?: number
        }
        Update: {
          class_ids?: string[] | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_published?: boolean
          questions_json?: Json
          scheduled_at?: string | null
          school_id?: string
          subject_id?: string
          teacher_id?: string
          title?: string
          total_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      hardcoded_admins: {
        Row: {
          created_at: string | null
          description: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          role: string
          school_id: string
          used: boolean
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          role: string
          school_id: string
          used?: boolean
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          role?: string
          school_id?: string
          used?: boolean
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_requests: {
        Row: {
          code_id: string
          created_at: string
          email: string
          grade: string | null
          id: string
          name: string
          status: string
          user_id: string | null
        }
        Insert: {
          code_id: string
          created_at?: string
          email: string
          grade?: string | null
          id?: string
          name: string
          status?: string
          user_id?: string | null
        }
        Update: {
          code_id?: string
          created_at?: string
          email?: string
          grade?: string | null
          id?: string
          name?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_requests_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "invite_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      iq_test_results: {
        Row: {
          abstract_thinking_score: number | null
          answers_json: Json
          completed_at: string
          created_at: string
          estimated_iq: number | null
          id: string
          learning_pace: string | null
          logical_reasoning_score: number | null
          mathematical_ability_score: number | null
          pattern_recognition_score: number | null
          processing_speed_score: number | null
          score: number
          spatial_reasoning_score: number | null
          total_questions: number
          user_id: string
          verbal_reasoning_score: number | null
        }
        Insert: {
          abstract_thinking_score?: number | null
          answers_json?: Json
          completed_at?: string
          created_at?: string
          estimated_iq?: number | null
          id?: string
          learning_pace?: string | null
          logical_reasoning_score?: number | null
          mathematical_ability_score?: number | null
          pattern_recognition_score?: number | null
          processing_speed_score?: number | null
          score?: number
          spatial_reasoning_score?: number | null
          total_questions?: number
          user_id: string
          verbal_reasoning_score?: number | null
        }
        Update: {
          abstract_thinking_score?: number | null
          answers_json?: Json
          completed_at?: string
          created_at?: string
          estimated_iq?: number | null
          id?: string
          learning_pace?: string | null
          logical_reasoning_score?: number | null
          mathematical_ability_score?: number | null
          pattern_recognition_score?: number | null
          processing_speed_score?: number | null
          score?: number
          spatial_reasoning_score?: number | null
          total_questions?: number
          user_id?: string
          verbal_reasoning_score?: number | null
        }
        Relationships: []
      }
      knowledge_gaps: {
        Row: {
          created_at: string
          detected_from: string
          gap_description: string
          id: string
          resolved: boolean
          severity: string
          subject: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detected_from?: string
          gap_description: string
          id?: string
          resolved?: boolean
          severity?: string
          subject: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detected_from?: string
          gap_description?: string
          id?: string
          resolved?: boolean
          severity?: string
          subject?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lct_exam_locks: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          locked_until: string
          student_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          locked_until: string
          student_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          locked_until?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lct_exam_locks_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "lct_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      lct_exam_schools: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          school_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          school_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lct_exam_schools_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "lct_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lct_exam_schools_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      lct_exam_students: {
        Row: {
          answers_json: Json
          created_at: string
          exam_id: string
          id: string
          learning_style: string
          school_id: string
          score: number | null
          started_at: string | null
          status: string
          student_id: string
          submitted_at: string | null
          translated_questions_json: Json
        }
        Insert: {
          answers_json?: Json
          created_at?: string
          exam_id: string
          id?: string
          learning_style?: string
          school_id: string
          score?: number | null
          started_at?: string | null
          status?: string
          student_id: string
          submitted_at?: string | null
          translated_questions_json?: Json
        }
        Update: {
          answers_json?: Json
          created_at?: string
          exam_id?: string
          id?: string
          learning_style?: string
          school_id?: string
          score?: number | null
          started_at?: string | null
          status?: string
          student_id?: string
          submitted_at?: string | null
          translated_questions_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lct_exam_students_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "lct_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lct_exam_students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      lct_exams: {
        Row: {
          answer_key_json: Json
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          questions_json: Json
          started_at: string | null
          status: string
          title: string
        }
        Insert: {
          answer_key_json?: Json
          created_at?: string
          created_by: string
          ends_at?: string | null
          id?: string
          questions_json?: Json
          started_at?: string | null
          status?: string
          title?: string
        }
        Update: {
          answer_key_json?: Json
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          questions_json?: Json
          started_at?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      learning_mode_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          is_test_data: boolean
          mode: string
          school_id: string | null
          score: number | null
          started_at: string
          status: string
          subject: string
          topic: string
          turns_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_test_data?: boolean
          mode: string
          school_id?: string | null
          score?: number | null
          started_at?: string
          status?: string
          subject: string
          topic: string
          turns_json?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_test_data?: boolean
          mode?: string
          school_id?: string | null
          score?: number | null
          started_at?: string
          status?: string
          subject?: string
          topic?: string
          turns_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      learning_style_profiles: {
        Row: {
          conceptual_score: number | null
          created_at: string
          dominant_style: string | null
          id: string
          kinesthetic_score: number | null
          last_analyzed_at: string | null
          logical_score: number | null
          secondary_style: string | null
          total_interactions: number | null
          updated_at: string
          user_id: string
          verbal_score: number | null
          visual_score: number | null
        }
        Insert: {
          conceptual_score?: number | null
          created_at?: string
          dominant_style?: string | null
          id?: string
          kinesthetic_score?: number | null
          last_analyzed_at?: string | null
          logical_score?: number | null
          secondary_style?: string | null
          total_interactions?: number | null
          updated_at?: string
          user_id: string
          verbal_score?: number | null
          visual_score?: number | null
        }
        Update: {
          conceptual_score?: number | null
          created_at?: string
          dominant_style?: string | null
          id?: string
          kinesthetic_score?: number | null
          last_analyzed_at?: string | null
          logical_score?: number | null
          secondary_style?: string | null
          total_interactions?: number | null
          updated_at?: string
          user_id?: string
          verbal_score?: number | null
          visual_score?: number | null
        }
        Relationships: []
      }
      lesson_plans: {
        Row: {
          activities: string | null
          class_ids: string[] | null
          content_json: Json | null
          created_at: string
          description: string | null
          files: string[] | null
          id: string
          is_published: boolean
          is_shareable: boolean
          notes: string | null
          objectives: string | null
          pre_learning: string | null
          publish_date: string | null
          school_id: string
          standards: string | null
          strategies: string | null
          subject_id: string
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          activities?: string | null
          class_ids?: string[] | null
          content_json?: Json | null
          created_at?: string
          description?: string | null
          files?: string[] | null
          id?: string
          is_published?: boolean
          is_shareable?: boolean
          notes?: string | null
          objectives?: string | null
          pre_learning?: string | null
          publish_date?: string | null
          school_id: string
          standards?: string | null
          strategies?: string | null
          subject_id: string
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          activities?: string | null
          class_ids?: string[] | null
          content_json?: Json | null
          created_at?: string
          description?: string | null
          files?: string[] | null
          id?: string
          is_published?: boolean
          is_shareable?: boolean
          notes?: string | null
          objectives?: string | null
          pre_learning?: string | null
          publish_date?: string | null
          school_id?: string
          standards?: string | null
          strategies?: string | null
          subject_id?: string
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      lumina_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          monthly_request_quota: number
          partner_name: string
          quota_reset_at: string
          rate_limit_per_minute: number
          requests_this_month: number
          revoked_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          monthly_request_quota?: number
          partner_name: string
          quota_reset_at?: string
          rate_limit_per_minute?: number
          requests_this_month?: number
          revoked_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          monthly_request_quota?: number
          partner_name?: string
          quota_reset_at?: string
          rate_limit_per_minute?: number
          requests_this_month?: number
          revoked_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lumina_api_usage: {
        Row: {
          api_key_id: string
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          latency_ms: number | null
          status_code: number
          tokens_used: number | null
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          status_code: number
          tokens_used?: number | null
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          status_code?: number
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lumina_api_usage_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "lumina_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      lumina_cost_ledger: {
        Row: {
          count: number
          created_at: string
          feature: string
          id: string
          last_used_at: string
          school_id: string | null
          usage_date: string
          user_id: string
        }
        Insert: {
          count?: number
          created_at?: string
          feature: string
          id?: string
          last_used_at?: string
          school_id?: string | null
          usage_date?: string
          user_id: string
        }
        Update: {
          count?: number
          created_at?: string
          feature?: string
          id?: string
          last_used_at?: string
          school_id?: string | null
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      material_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          material_id: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          material_id: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          material_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_comments_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "course_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      material_views: {
        Row: {
          id: string
          material_id: string
          seen_at: string
          user_id: string
        }
        Insert: {
          id?: string
          material_id: string
          seen_at?: string
          user_id: string
        }
        Update: {
          id?: string
          material_id?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_views_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "course_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          content: string
          created_at: string
          grade: string
          id: string
          subject: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          grade: string
          id?: string
          subject: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          grade?: string
          id?: string
          subject?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      mind_map_history: {
        Row: {
          created_at: string | null
          id: string
          mind_map_data: Json
          topic: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          mind_map_data: Json
          topic: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          mind_map_data?: Json
          topic?: string
          user_id?: string
        }
        Relationships: []
      }
      ministry_access_codes: {
        Row: {
          code_hash: string
          created_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
        }
        Insert: {
          code_hash: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
        }
        Update: {
          code_hash?: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      ministry_access_requests: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          expires_at: string
          id: string
          ip_address: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_token: string
          status: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_token: string
          status?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_token?: string
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      ministry_ip_bans: {
        Row: {
          banned_at: string
          banned_by: string | null
          device_fingerprint: string | null
          id: string
          ip_address: string
          reason: string | null
        }
        Insert: {
          banned_at?: string
          banned_by?: string | null
          device_fingerprint?: string | null
          id?: string
          ip_address: string
          reason?: string | null
        }
        Update: {
          banned_at?: string
          banned_by?: string | null
          device_fingerprint?: string | null
          id?: string
          ip_address?: string
          reason?: string | null
        }
        Relationships: []
      }
      ministry_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          is_active: boolean
          last_activity: string
          session_token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_activity?: string
          session_token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_activity?: string
          session_token?: string
        }
        Relationships: []
      }
      moderation_actions: {
        Row: {
          action_type: string
          appeal_reason: string | null
          appeal_resolved_at: string | null
          appeal_resolved_by: string | null
          appeal_status: string | null
          appealed_by: string | null
          created_at: string
          expires_at: string | null
          flag_id: string | null
          id: string
          is_active: boolean
          message: string | null
          moderator_id: string
          school_id: string | null
          target_user_id: string
        }
        Insert: {
          action_type: string
          appeal_reason?: string | null
          appeal_resolved_at?: string | null
          appeal_resolved_by?: string | null
          appeal_status?: string | null
          appealed_by?: string | null
          created_at?: string
          expires_at?: string | null
          flag_id?: string | null
          id?: string
          is_active?: boolean
          message?: string | null
          moderator_id: string
          school_id?: string | null
          target_user_id: string
        }
        Update: {
          action_type?: string
          appeal_reason?: string | null
          appeal_resolved_at?: string | null
          appeal_resolved_by?: string | null
          appeal_status?: string | null
          appealed_by?: string | null
          created_at?: string
          expires_at?: string | null
          flag_id?: string | null
          id?: string
          is_active?: boolean
          message?: string | null
          moderator_id?: string
          school_id?: string | null
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_flag_id_fkey"
            columns: ["flag_id"]
            isOneToOne: false
            referencedRelation: "content_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      moderator_invite_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          used: boolean
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          used?: boolean
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          used?: boolean
          used_by?: string | null
        }
        Relationships: []
      }
      moderator_requests: {
        Row: {
          code_id: string
          created_at: string
          email: string
          id: string
          name: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          code_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          code_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderator_requests_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "moderator_invite_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      morning_briefings: {
        Row: {
          briefing_md: string
          created_at: string
          id: string
          key_insight: string | null
          leverage_topic: string | null
          mini_quiz: Json | null
          opened_at: string | null
          scheduled_for: string
          school_id: string | null
          user_id: string
        }
        Insert: {
          briefing_md: string
          created_at?: string
          id?: string
          key_insight?: string | null
          leverage_topic?: string | null
          mini_quiz?: Json | null
          opened_at?: string | null
          scheduled_for?: string
          school_id?: string | null
          user_id: string
        }
        Update: {
          briefing_md?: string
          created_at?: string
          id?: string
          key_insight?: string | null
          leverage_topic?: string | null
          mini_quiz?: Json | null
          opened_at?: string | null
          scheduled_for?: string
          school_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      note_snapshots: {
        Row: {
          content: string
          content_hash: string
          id: string
          note_id: string
          snapshot_at: string
          title: string
          user_id: string
          word_count: number
        }
        Insert: {
          content: string
          content_hash: string
          id?: string
          note_id: string
          snapshot_at?: string
          title: string
          user_id: string
          word_count?: number
        }
        Update: {
          content?: string
          content_hash?: string
          id?: string
          note_id?: string
          snapshot_at?: string
          title?: string
          user_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "note_snapshots_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      note_timeline_summaries: {
        Row: {
          generated_at: string
          id: string
          note_id: string
          snapshots_count: number
          summary_md: string
          user_id: string
        }
        Insert: {
          generated_at?: string
          id?: string
          note_id: string
          snapshots_count?: number
          summary_md: string
          user_id: string
        }
        Update: {
          generated_at?: string
          id?: string
          note_id?: string
          snapshots_count?: number
          summary_md?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_timeline_summaries_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: true
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          ai_feedback: string | null
          content: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_feedback?: string | null
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_feedback?: string | null
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      parent_invite_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          school_id: string
          student_id: string
          used: boolean
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          school_id: string
          student_id: string
          used?: boolean
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          school_id?: string
          student_id?: string
          used?: boolean
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_invite_codes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_students: {
        Row: {
          created_at: string
          id: string
          parent_id: string
          school_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_id: string
          school_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_id?: string
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      podcast_generations: {
        Row: {
          content: string | null
          created_at: string
          file_name: string
          id: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_name: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          file_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          email: string | null
          full_name: string
          grade_level: string | null
          id: string
          is_active: boolean
          is_test_data: boolean | null
          school_id: string | null
          status: string
          student_teacher_id: string | null
          updated_at: string
          user_type: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name: string
          grade_level?: string | null
          id: string
          is_active?: boolean
          is_test_data?: boolean | null
          school_id?: string | null
          status?: string
          student_teacher_id?: string | null
          updated_at?: string
          user_type: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string
          grade_level?: string | null
          id?: string
          is_active?: boolean
          is_test_data?: boolean | null
          school_id?: string | null
          status?: string
          student_teacher_id?: string | null
          updated_at?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      recall_schedule: {
        Row: {
          concept: string
          created_at: string
          delivered_at: string | null
          due_at: string
          id: string
          reason: string | null
          school_id: string | null
          subject: string | null
          user_id: string
        }
        Insert: {
          concept: string
          created_at?: string
          delivered_at?: string | null
          due_at?: string
          id?: string
          reason?: string | null
          school_id?: string | null
          subject?: string | null
          user_id: string
        }
        Update: {
          concept?: string
          created_at?: string
          delivered_at?: string | null
          due_at?: string
          id?: string
          reason?: string | null
          school_id?: string | null
          subject?: string | null
          user_id?: string
        }
        Relationships: []
      }
      report_cards: {
        Row: {
          average: number | null
          comments: string | null
          created_at: string
          file_url: string | null
          id: string
          school_id: string
          scores_json: Json
          student_id: string
          subject_id: string
          term: string
          updated_at: string
        }
        Insert: {
          average?: number | null
          comments?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          school_id: string
          scores_json?: Json
          student_id: string
          subject_id: string
          term: string
          updated_at?: string
        }
        Update: {
          average?: number | null
          comments?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          school_id?: string
          scores_json?: Json
          student_id?: string
          subject_id?: string
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      school_admins: {
        Row: {
          created_at: string
          id: string
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_admins_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          activation_code: string | null
          address: string | null
          code: string
          code_used: boolean
          code_used_at: string | null
          code_used_by: string | null
          created_at: string
          id: string
          is_test_data: boolean | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          activation_code?: string | null
          address?: string | null
          code: string
          code_used?: boolean
          code_used_at?: string | null
          code_used_by?: string | null
          created_at?: string
          id?: string
          is_test_data?: boolean | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          activation_code?: string | null
          address?: string | null
          code?: string
          code_used?: boolean
          code_used_at?: string | null
          code_used_by?: string | null
          created_at?: string
          id?: string
          is_test_data?: boolean | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_answer_history: {
        Row: {
          correct_answer: string | null
          created_at: string
          difficulty: string | null
          id: string
          is_correct: boolean
          question_text: string | null
          source: string
          student_answer: string | null
          subject: string
          user_id: string
        }
        Insert: {
          correct_answer?: string | null
          created_at?: string
          difficulty?: string | null
          id?: string
          is_correct: boolean
          question_text?: string | null
          source?: string
          student_answer?: string | null
          subject: string
          user_id: string
        }
        Update: {
          correct_answer?: string | null
          created_at?: string
          difficulty?: string | null
          id?: string
          is_correct?: boolean
          question_text?: string | null
          source?: string
          student_answer?: string | null
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      student_classes: {
        Row: {
          class_id: string
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_classes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      student_goals: {
        Row: {
          completed: boolean
          created_at: string
          current_count: number
          goal_type: string
          id: string
          subject: string | null
          target_count: number
          title: string
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          current_count?: number
          goal_type?: string
          id?: string
          subject?: string | null
          target_count?: number
          title: string
          updated_at?: string
          user_id: string
          week_start?: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          current_count?: number
          goal_type?: string
          id?: string
          subject?: string | null
          target_count?: number
          title?: string
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      student_learning_profiles: {
        Row: {
          correct_answers: number
          created_at: string
          difficulty_level: string
          id: string
          recent_accuracy: number | null
          subject: string
          total_questions_answered: number
          updated_at: string
          user_id: string
        }
        Insert: {
          correct_answers?: number
          created_at?: string
          difficulty_level?: string
          id?: string
          recent_accuracy?: number | null
          subject: string
          total_questions_answered?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          correct_answers?: number
          created_at?: string
          difficulty_level?: string
          id?: string
          recent_accuracy?: number | null
          subject?: string
          total_questions_answered?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_memory: {
        Row: {
          confidence: number
          content: string
          created_at: string
          id: string
          memory_type: string
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          content: string
          created_at?: string
          id?: string
          memory_type?: string
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          content?: string
          created_at?: string
          id?: string
          memory_type?: string
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string
          content: string | null
          feedback: string | null
          files: string[] | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          student_id: string
          submitted_at: string
        }
        Insert: {
          assignment_id: string
          content?: string | null
          feedback?: string | null
          files?: string[] | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          student_id: string
          submitted_at?: string
        }
        Update: {
          assignment_id?: string
          content?: string | null
          feedback?: string | null
          files?: string[] | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_attack_attempts: {
        Row: {
          attempts: number | null
          created_at: string | null
          device_fingerprint: string
          id: string
          is_high_alert: boolean | null
          locked_until: string | null
          permanently_blocked: boolean | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          device_fingerprint: string
          id?: string
          is_high_alert?: boolean | null
          locked_until?: string | null
          permanently_blocked?: boolean | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          device_fingerprint?: string
          id?: string
          is_high_alert?: boolean | null
          locked_until?: string | null
          permanently_blocked?: boolean | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      super_admin_attack_logs: {
        Row: {
          attempt_count: number | null
          created_at: string | null
          device_fingerprint: string
          id: string
          resolved_action: string | null
          resolved_at: string | null
          status: string | null
          user_agent: string | null
        }
        Insert: {
          attempt_count?: number | null
          created_at?: string | null
          device_fingerprint: string
          id?: string
          resolved_action?: string | null
          resolved_at?: string | null
          status?: string | null
          user_agent?: string | null
        }
        Update: {
          attempt_count?: number | null
          created_at?: string | null
          device_fingerprint?: string
          id?: string
          resolved_action?: string | null
          resolved_at?: string | null
          status?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      super_admin_codes: {
        Row: {
          active: boolean | null
          code_hash: string
          created_at: string | null
          id: string
        }
        Insert: {
          active?: boolean | null
          code_hash: string
          created_at?: string | null
          id?: string
        }
        Update: {
          active?: boolean | null
          code_hash?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      super_admin_verification: {
        Row: {
          attempts: number
          created_at: string | null
          email: string
          id: string
          is_high_alert: boolean | null
          last_attempt_at: string | null
          locked_until: string | null
          updated_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string | null
          email: string
          id?: string
          is_high_alert?: boolean | null
          last_attempt_at?: string | null
          locked_until?: string | null
          updated_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string | null
          email?: string
          id?: string
          is_high_alert?: boolean | null
          last_attempt_at?: string | null
          locked_until?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      teacher_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teacher_subjects: {
        Row: {
          created_at: string
          id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_reads: {
        Row: {
          id: string
          read_at: string
          trip_id: string
          user_id: string
        }
        Insert: {
          id?: string
          read_at?: string
          trip_id: string
          user_id: string
        }
        Update: {
          id?: string
          read_at?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_reads_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          school_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          school_id: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          school_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_log: {
        Row: {
          activity_type: string
          category: string
          created_at: string
          details_json: Json | null
          duration_seconds: number | null
          id: string
          subject: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          category?: string
          created_at?: string
          details_json?: Json | null
          duration_seconds?: number | null
          id?: string
          subject?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          category?: string
          created_at?: string
          details_json?: Json | null
          duration_seconds?: number | null
          id?: string
          subject?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          created_at: string
          groq_api_key: string
          groq_fallback_api_key: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          groq_api_key: string
          groq_fallback_api_key?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          groq_api_key?: string
          groq_fallback_api_key?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_strikes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          issued_by: string
          reason: string
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          issued_by: string
          reason: string
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          issued_by?: string
          reason?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_strikes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plans: {
        Row: {
          content_json: Json | null
          created_at: string
          created_by: string
          file_name: string | null
          file_url: string | null
          grade_level: string
          id: string
          plan_type: string
          school_id: string
          title: string
          updated_at: string
          week_start: string
        }
        Insert: {
          content_json?: Json | null
          created_at?: string
          created_by: string
          file_name?: string | null
          file_url?: string | null
          grade_level?: string
          id?: string
          plan_type?: string
          school_id: string
          title: string
          updated_at?: string
          week_start: string
        }
        Update: {
          content_json?: Json | null
          created_at?: string
          created_by?: string
          file_name?: string | null
          file_url?: string | null
          grade_level?: string
          id?: string
          plan_type?: string
          school_id?: string
          title?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_school_with_code: {
        Args: { activation_code_input: string; user_uuid: string }
        Returns: Json
      }
      approve_invite_request: {
        Args: { p_grade?: string; p_request_id: string }
        Returns: Json
      }
      approve_moderator_request:
        | { Args: { p_request_id: string }; Returns: Json }
        | {
            Args: { p_request_id: string; p_session_token?: string }
            Returns: Json
          }
      can_view_student_mastery: {
        Args: { p_student: string; p_viewer: string }
        Returns: boolean
      }
      check_and_increment_cost: {
        Args: {
          p_daily_cap: number
          p_feature: string
          p_school_id: string
          p_user_id: string
        }
        Returns: Json
      }
      check_device_ban: {
        Args: { p_device_fingerprint: string }
        Returns: Json
      }
      check_lct_lock: { Args: { p_user_id: string }; Returns: Json }
      check_ministry_ip_ban: {
        Args: { p_fingerprint?: string; p_ip: string }
        Returns: Json
      }
      check_ministry_session: {
        Args: { p_session_token: string }
        Returns: Json
      }
      check_super_admin_lock_status: {
        Args: { p_device_fingerprint?: string; p_email: string }
        Returns: Json
      }
      create_school_with_code: {
        Args: {
          activation_code_input: string
          school_address?: string
          school_code: string
          school_name: string
        }
        Returns: Json
      }
      delete_school_cascade: {
        Args: { school_uuid: string }
        Returns: undefined
      }
      deny_invite_request: { Args: { p_request_id: string }; Returns: Json }
      deny_moderator_request:
        | { Args: { p_request_id: string }; Returns: Json }
        | {
            Args: { p_request_id: string; p_session_token?: string }
            Returns: Json
          }
      generate_ministry_invite_code: { Args: never; Returns: Json }
      generate_moderator_invite_code: { Args: never; Returns: Json }
      get_due_reviews:
        | {
            Args: { p_limit?: number; p_user_id: string }
            Returns: {
              mastery_score: number
              next_review_at: string
              overdue_hours: number
              subject: string
              topic: string
            }[]
          }
        | {
            Args: { p_limit?: number; p_school_id?: string; p_user_id: string }
            Returns: {
              mastery_score: number
              next_review_at: string
              overdue_hours: number
              subject: string
              topic: string
            }[]
          }
      get_ministry_dashboard_data: {
        Args: { p_session_token: string }
        Returns: Json
      }
      get_user_school_id: { Args: { user_uuid: string }; Returns: string }
      get_weakest_topics:
        | {
            Args: { p_limit?: number; p_subject?: string; p_user_id: string }
            Returns: {
              last_practiced_at: string
              mastery_score: number
              next_review_at: string
              repetitions: number
              subject: string
              topic: string
            }[]
          }
        | {
            Args: {
              p_limit?: number
              p_school_id?: string
              p_subject?: string
              p_user_id: string
            }
            Returns: {
              last_practiced_at: string
              mastery_score: number
              next_review_at: string
              repetitions: number
              subject: string
              topic: string
            }[]
          }
      grant_admin_via_code: {
        Args: { input_code: string; target_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_hardcoded_admin: { Args: { check_email: string }; Returns: boolean }
      is_moderator: { Args: { user_uuid: string }; Returns: boolean }
      is_parent_of: {
        Args: { p_parent_id: string; p_student_id: string }
        Returns: boolean
      }
      is_school_admin: {
        Args: { _school_id: string; _user_id: string }
        Returns: boolean
      }
      is_school_admin_of: {
        Args: { check_school_id: string; user_uuid: string }
        Returns: boolean
      }
      is_student: { Args: { user_uuid: string }; Returns: boolean }
      is_super_admin_user: { Args: { uid: string }; Returns: boolean }
      is_teacher: { Args: { user_uuid: string }; Returns: boolean }
      link_moderator_after_signup: {
        Args: { p_email: string; p_user_id: string }
        Returns: Json
      }
      link_profile_after_signup: {
        Args: { p_email: string; p_user_id: string }
        Returns: Json
      }
      resolve_ministry_request: {
        Args: { p_action: string; p_request_id: string }
        Returns: Json
      }
      signup_as_moderator: {
        Args: { p_email: string; p_full_name: string; p_invite_code: string }
        Returns: Json
      }
      signup_as_parent: {
        Args: {
          p_full_name: string
          p_parent_code: string
          p_parent_user_id: string
        }
        Returns: Json
      }
      signup_with_invite_code: {
        Args: { p_email: string; p_full_name: string; p_invite_code: string }
        Returns: Json
      }
      update_concept_mastery: {
        Args: {
          p_school_id: string
          p_subject: string
          p_topic: string
          p_user_id: string
          p_was_correct: boolean
        }
        Returns: string
      }
      verify_admin_access_code: {
        Args: { input_code: string }
        Returns: boolean
      }
      verify_ministry_code: {
        Args: {
          p_code: string
          p_device_fingerprint?: string
          p_ip_address?: string
          p_user_agent?: string
        }
        Returns: Json
      }
      verify_super_admin_code: {
        Args: {
          p_code: string
          p_device_fingerprint?: string
          p_email: string
          p_user_agent?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "teacher" | "student" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["teacher", "student", "admin"],
    },
  },
} as const
