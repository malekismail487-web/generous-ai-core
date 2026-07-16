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
      ability_estimates: {
        Row: {
          concept_id: string | null
          created_at: string
          elo_count: number
          elo_rating: number
          graded_count: number
          id: string
          last_graded_at: string | null
          provisional: boolean
          school_id: string | null
          subject: string
          theta: number
          theta_se: number
          updated_at: string
          user_id: string
        }
        Insert: {
          concept_id?: string | null
          created_at?: string
          elo_count?: number
          elo_rating?: number
          graded_count?: number
          id?: string
          last_graded_at?: string | null
          provisional?: boolean
          school_id?: string | null
          subject: string
          theta?: number
          theta_se?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          concept_id?: string | null
          created_at?: string
          elo_count?: number
          elo_rating?: number
          graded_count?: number
          id?: string
          last_graded_at?: string | null
          provisional?: boolean
          school_id?: string | null
          subject?: string
          theta?: number
          theta_se?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      ai_output_signals: {
        Row: {
          created_at: string
          feature: string
          id: string
          output_excerpt: string | null
          output_hash: string
          profile_snapshot: Json | null
          reason: string | null
          school_id: string | null
          signal: string
          subject: string | null
          topic: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feature: string
          id?: string
          output_excerpt?: string | null
          output_hash: string
          profile_snapshot?: Json | null
          reason?: string | null
          school_id?: string | null
          signal: string
          subject?: string | null
          topic?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          feature?: string
          id?: string
          output_excerpt?: string | null
          output_hash?: string
          profile_snapshot?: Json | null
          reason?: string | null
          school_id?: string | null
          signal?: string
          subject?: string | null
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      anchor_recalibrations: {
        Row: {
          anchor_count: number
          created_at: string
          id: string
          items_shifted: number
          mean_drift: number
          notes: string | null
          responses_considered: number
          subject: string
        }
        Insert: {
          anchor_count?: number
          created_at?: string
          id?: string
          items_shifted?: number
          mean_drift?: number
          notes?: string | null
          responses_considered?: number
          subject: string
        }
        Update: {
          anchor_count?: number
          created_at?: string
          id?: string
          items_shifted?: number
          mean_drift?: number
          notes?: string | null
          responses_considered?: number
          subject?: string
        }
        Relationships: []
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
      assessment_scores: {
        Row: {
          id: string
          measured_at: string
          metadata: Json
          pct: number | null
          phase: string
          pilot_id: string | null
          school_id: string | null
          score: number
          source: string
          student_id: string
          subject: string
          total: number
        }
        Insert: {
          id?: string
          measured_at?: string
          metadata?: Json
          pct?: number | null
          phase: string
          pilot_id?: string | null
          school_id?: string | null
          score: number
          source?: string
          student_id: string
          subject: string
          total: number
        }
        Update: {
          id?: string
          measured_at?: string
          metadata?: Json
          pct?: number | null
          phase?: string
          pilot_id?: string | null
          school_id?: string | null
          score?: number
          source?: string
          student_id?: string
          subject?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_scores_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilot_studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_scores_school_id_fkey"
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
          relevance_override: boolean
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
          relevance_override?: boolean
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
          relevance_override?: boolean
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
      bandit_arm_state: {
        Row: {
          a_inv: Json
          alpha: number
          arm_id: string
          b_vector: Json
          created_at: string
          cumulative_reward: number
          dim: number
          id: string
          lambda: number
          last_decision_at: string | null
          n_pulls: number
          scope: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          a_inv: Json
          alpha?: number
          arm_id: string
          b_vector: Json
          created_at?: string
          cumulative_reward?: number
          dim?: number
          id?: string
          lambda?: number
          last_decision_at?: string | null
          n_pulls?: number
          scope?: string
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          a_inv?: Json
          alpha?: number
          arm_id?: string
          b_vector?: Json
          created_at?: string
          cumulative_reward?: number
          dim?: number
          id?: string
          lambda?: number
          last_decision_at?: string | null
          n_pulls?: number
          scope?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      bandit_decisions: {
        Row: {
          alternatives: Json | null
          arm_id: string
          behaviour_prob: number | null
          bonus: number
          concept_id: string | null
          context_vec: Json
          created_at: string
          ensemble_p_at_decision: number | null
          id: string
          lecture_id: string | null
          mean: number
          propensity_dist: Json | null
          reward: number | null
          rewarded: boolean
          rewarded_at: string | null
          softmax_temp: number | null
          source: string
          subject: string
          ucb: number
          user_id: string
        }
        Insert: {
          alternatives?: Json | null
          arm_id: string
          behaviour_prob?: number | null
          bonus: number
          concept_id?: string | null
          context_vec: Json
          created_at?: string
          ensemble_p_at_decision?: number | null
          id?: string
          lecture_id?: string | null
          mean: number
          propensity_dist?: Json | null
          reward?: number | null
          rewarded?: boolean
          rewarded_at?: string | null
          softmax_temp?: number | null
          source?: string
          subject: string
          ucb: number
          user_id: string
        }
        Update: {
          alternatives?: Json | null
          arm_id?: string
          behaviour_prob?: number | null
          bonus?: number
          concept_id?: string | null
          context_vec?: Json
          created_at?: string
          ensemble_p_at_decision?: number | null
          id?: string
          lecture_id?: string | null
          mean?: number
          propensity_dist?: Json | null
          reward?: number | null
          rewarded?: boolean
          rewarded_at?: string | null
          softmax_temp?: number | null
          source?: string
          subject?: string
          ucb?: number
          user_id?: string
        }
        Relationships: []
      }
      calibration_state: {
        Row: {
          auc_cal: number | null
          auc_raw: number | null
          brier_cal: number | null
          brier_raw: number | null
          ece_cal: number | null
          ece_raw: number | null
          fitted_at: string | null
          id: string
          method: string
          n_events: number
          platt_a: number
          platt_b: number
          subject: string
          temperature: number
          updated_at: string
        }
        Insert: {
          auc_cal?: number | null
          auc_raw?: number | null
          brier_cal?: number | null
          brier_raw?: number | null
          ece_cal?: number | null
          ece_raw?: number | null
          fitted_at?: string | null
          id?: string
          method?: string
          n_events?: number
          platt_a?: number
          platt_b?: number
          subject: string
          temperature?: number
          updated_at?: string
        }
        Update: {
          auc_cal?: number | null
          auc_raw?: number | null
          brier_cal?: number | null
          brier_raw?: number | null
          ece_cal?: number | null
          ece_raw?: number | null
          fitted_at?: string | null
          id?: string
          method?: string
          n_events?: number
          platt_a?: number
          platt_b?: number
          subject?: string
          temperature?: number
          updated_at?: string
        }
        Relationships: []
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
          concept_id: string | null
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
          concept_id?: string | null
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
          concept_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "concept_mastery_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_standard_map: {
        Row: {
          alignment_strength: number
          concept_key: string
          created_at: string
          id: string
          objective_id: string | null
          rationale: string | null
          school_id: string | null
          standard_id: string
          subject: string
        }
        Insert: {
          alignment_strength?: number
          concept_key: string
          created_at?: string
          id?: string
          objective_id?: string | null
          rationale?: string | null
          school_id?: string | null
          standard_id: string
          subject: string
        }
        Update: {
          alignment_strength?: number
          concept_key?: string
          created_at?: string
          id?: string
          objective_id?: string | null
          rationale?: string | null
          school_id?: string | null
          standard_id?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_standard_map_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "learning_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_standard_map_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_standard_map_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "curriculum_standards"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          created_at: string
          description: string | null
          difficulty_weight: number
          id: string
          is_active: boolean
          lecture_id: string
          name: string
          order_index: number
          school_id: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          difficulty_weight?: number
          id?: string
          is_active?: boolean
          lecture_id: string
          name: string
          order_index?: number
          school_id: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          difficulty_weight?: number
          id?: string
          is_active?: boolean
          lecture_id?: string
          name?: string
          order_index?: number
          school_id?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepts_lecture_id_fkey"
            columns: ["lecture_id"]
            isOneToOne: false
            referencedRelation: "lectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepts_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
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
      continuous_validation_runs: {
        Row: {
          alerts: Json
          base_rate: number | null
          brier: number | null
          created_at: string
          cumulative_regret: number | null
          ece: number | null
          ensemble_weight_std: number | null
          id: string
          n_decisions: number
          n_predictions: number
          reliability: number | null
          resolution: number | null
          status: string
          uncertainty: number | null
          window_end: string
          window_start: string
        }
        Insert: {
          alerts?: Json
          base_rate?: number | null
          brier?: number | null
          created_at?: string
          cumulative_regret?: number | null
          ece?: number | null
          ensemble_weight_std?: number | null
          id?: string
          n_decisions?: number
          n_predictions?: number
          reliability?: number | null
          resolution?: number | null
          status?: string
          uncertainty?: number | null
          window_end: string
          window_start: string
        }
        Update: {
          alerts?: Json
          base_rate?: number | null
          brier?: number | null
          created_at?: string
          cumulative_regret?: number | null
          ece?: number | null
          ensemble_weight_std?: number | null
          id?: string
          n_decisions?: number
          n_predictions?: number
          reliability?: number | null
          resolution?: number | null
          status?: string
          uncertainty?: number | null
          window_end?: string
          window_start?: string
        }
        Relationships: []
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
          relevance_override: boolean
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
          relevance_override?: boolean
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
          relevance_override?: boolean
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
      curriculum_standards: {
        Row: {
          code: string
          created_at: string
          description: string
          framework: string
          grade_level: string | null
          id: string
          is_active: boolean
          parent_id: string | null
          school_id: string | null
          subject: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          framework: string
          grade_level?: string | null
          id?: string
          is_active?: boolean
          parent_id?: string | null
          school_id?: string | null
          subject: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          framework?: string
          grade_level?: string | null
          id?: string
          is_active?: boolean
          parent_id?: string | null
          school_id?: string | null
          subject?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_standards_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "curriculum_standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_standards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_standards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "curriculum_standards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_versions: {
        Row: {
          changes: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          school_id: string
          tenant_id: string
          version_label: string | null
        }
        Insert: {
          changes?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          school_id: string
          tenant_id: string
          version_label?: string | null
        }
        Update: {
          changes?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          school_id?: string
          tenant_id?: string
          version_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_versions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "curriculum_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      data_export_requests: {
        Row: {
          completed_at: string | null
          error: string | null
          id: string
          payload: Json | null
          requested_at: string
          requested_by: string
          school_id: string | null
          scope: string
          status: string
          target_id: string | null
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          id?: string
          payload?: Json | null
          requested_at?: string
          requested_by: string
          school_id?: string | null
          scope: string
          status?: string
          target_id?: string | null
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          id?: string
          payload?: Json | null
          requested_at?: string
          requested_by?: string
          school_id?: string | null
          scope?: string
          status?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_export_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
      engine_drift_alerts: {
        Row: {
          baseline: number | null
          created_at: string
          id: string
          message: string
          metric: string
          observed: number | null
          run_id: string | null
          severity: string
        }
        Insert: {
          baseline?: number | null
          created_at?: string
          id?: string
          message: string
          metric: string
          observed?: number | null
          run_id?: string | null
          severity: string
        }
        Update: {
          baseline?: number | null
          created_at?: string
          id?: string
          message?: string
          metric?: string
          observed?: number | null
          run_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_drift_alerts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "continuous_validation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ensemble_fit_runs: {
        Row: {
          accepted: boolean
          brier_after: number | null
          brier_before: number | null
          created_at: string
          ece_after: number | null
          epochs: number
          id: string
          logloss_after: number | null
          logloss_before: number | null
          n_samples: number
          notes: string | null
          scope: string
          subject: string
          user_id: string | null
          weights_after: Json | null
          weights_before: Json | null
        }
        Insert: {
          accepted?: boolean
          brier_after?: number | null
          brier_before?: number | null
          created_at?: string
          ece_after?: number | null
          epochs: number
          id?: string
          logloss_after?: number | null
          logloss_before?: number | null
          n_samples: number
          notes?: string | null
          scope?: string
          subject: string
          user_id?: string | null
          weights_after?: Json | null
          weights_before?: Json | null
        }
        Update: {
          accepted?: boolean
          brier_after?: number | null
          brier_before?: number | null
          created_at?: string
          ece_after?: number | null
          epochs?: number
          id?: string
          logloss_after?: number | null
          logloss_before?: number | null
          n_samples?: number
          notes?: string | null
          scope?: string
          subject?: string
          user_id?: string | null
          weights_after?: Json | null
          weights_before?: Json | null
        }
        Relationships: []
      }
      ensemble_predictions: {
        Row: {
          bandit_decision_id: string | null
          blended_p: number | null
          calibrated_p: number | null
          concept_id: string | null
          created_at: string
          helpfulness_signal: number | null
          id: string
          outcome: number | null
          outcome_attached_at: string | null
          p_2pl: number | null
          p_akt: number | null
          p_dash: number | null
          p_elo: number | null
          p_fsrs: number | null
          p_hawkes: number | null
          quality_score: number | null
          question_id: string | null
          source: string
          subject: string
          user_id: string
          weights_used: Json | null
        }
        Insert: {
          bandit_decision_id?: string | null
          blended_p?: number | null
          calibrated_p?: number | null
          concept_id?: string | null
          created_at?: string
          helpfulness_signal?: number | null
          id?: string
          outcome?: number | null
          outcome_attached_at?: string | null
          p_2pl?: number | null
          p_akt?: number | null
          p_dash?: number | null
          p_elo?: number | null
          p_fsrs?: number | null
          p_hawkes?: number | null
          quality_score?: number | null
          question_id?: string | null
          source?: string
          subject: string
          user_id: string
          weights_used?: Json | null
        }
        Update: {
          bandit_decision_id?: string | null
          blended_p?: number | null
          calibrated_p?: number | null
          concept_id?: string | null
          created_at?: string
          helpfulness_signal?: number | null
          id?: string
          outcome?: number | null
          outcome_attached_at?: string | null
          p_2pl?: number | null
          p_akt?: number | null
          p_dash?: number | null
          p_elo?: number | null
          p_fsrs?: number | null
          p_hawkes?: number | null
          quality_score?: number | null
          question_id?: string | null
          source?: string
          subject?: string
          user_id?: string
          weights_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ensemble_predictions_bandit_decision_id_fkey"
            columns: ["bandit_decision_id"]
            isOneToOne: false
            referencedRelation: "bandit_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      ensemble_weights: {
        Row: {
          auc: number | null
          bias: number
          brier: number | null
          ece: number | null
          fitted_at: string | null
          id: string
          n_events: number
          subject: string
          updated_at: string
          user_id: string | null
          w_2pl: number
          w_akt: number
          w_dash: number
          w_elo: number
          w_fsrs: number
          w_hawkes: number
        }
        Insert: {
          auc?: number | null
          bias?: number
          brier?: number | null
          ece?: number | null
          fitted_at?: string | null
          id?: string
          n_events?: number
          subject: string
          updated_at?: string
          user_id?: string | null
          w_2pl?: number
          w_akt?: number
          w_dash?: number
          w_elo?: number
          w_fsrs?: number
          w_hawkes?: number
        }
        Update: {
          auc?: number | null
          bias?: number
          brier?: number | null
          ece?: number | null
          fitted_at?: string | null
          id?: string
          n_events?: number
          subject?: string
          updated_at?: string
          user_id?: string | null
          w_2pl?: number
          w_akt?: number
          w_dash?: number
          w_elo?: number
          w_fsrs?: number
          w_hawkes?: number
        }
        Relationships: []
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
      fsrs_card_state: {
        Row: {
          concept_id: string | null
          created_at: string
          difficulty: number
          fuzzed_interval_days: number | null
          id: string
          is_leech: boolean
          lapses: number
          last_delivered_at: string | null
          last_review_at: string | null
          next_review_at: string | null
          priority: number
          reps: number
          request_retention: number
          school_id: string | null
          stability: number
          subject: string
          suspended_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          concept_id?: string | null
          created_at?: string
          difficulty?: number
          fuzzed_interval_days?: number | null
          id?: string
          is_leech?: boolean
          lapses?: number
          last_delivered_at?: string | null
          last_review_at?: string | null
          next_review_at?: string | null
          priority?: number
          reps?: number
          request_retention?: number
          school_id?: string | null
          stability?: number
          subject: string
          suspended_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          concept_id?: string | null
          created_at?: string
          difficulty?: number
          fuzzed_interval_days?: number | null
          id?: string
          is_leech?: boolean
          lapses?: number
          last_delivered_at?: string | null
          last_review_at?: string | null
          next_review_at?: string | null
          priority?: number
          reps?: number
          request_retention?: number
          school_id?: string | null
          stability?: number
          subject?: string
          suspended_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fsrs_card_state_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fsrs_card_state_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_audit_trail: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          id: number
          ip_address: string | null
          occurred_at: string
          payload: Json
          school_id: string | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          id?: number
          ip_address?: string | null
          occurred_at?: string
          payload?: Json
          school_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          id?: number
          ip_address?: string | null
          occurred_at?: string
          payload?: Json
          school_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      graded_events: {
        Row: {
          concept_id: string | null
          concept_weight: number | null
          created_at: string
          difficulty_b: number
          expected_p: number
          id: string
          k_effective: number | null
          question_id: string | null
          response_time_ms: number | null
          school_id: string | null
          se_after: number
          se_before: number
          source: string
          subject: string
          theta_after: number
          theta_before: number
          user_id: string
          was_correct: boolean
        }
        Insert: {
          concept_id?: string | null
          concept_weight?: number | null
          created_at?: string
          difficulty_b?: number
          expected_p?: number
          id?: string
          k_effective?: number | null
          question_id?: string | null
          response_time_ms?: number | null
          school_id?: string | null
          se_after?: number
          se_before?: number
          source?: string
          subject: string
          theta_after?: number
          theta_before?: number
          user_id: string
          was_correct: boolean
        }
        Update: {
          concept_id?: string | null
          concept_weight?: number | null
          created_at?: string
          difficulty_b?: number
          expected_p?: number
          id?: string
          k_effective?: number | null
          question_id?: string | null
          response_time_ms?: number | null
          school_id?: string | null
          se_after?: number
          se_before?: number
          source?: string
          subject?: string
          theta_after?: number
          theta_before?: number
          user_id?: string
          was_correct?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "graded_events_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_bank"
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
      hyperparameter_settings: {
        Row: {
          activated_at: string
          active: boolean
          id: string
          notes: string | null
          params: Json
          scope: string
          source_run_id: string | null
        }
        Insert: {
          activated_at?: string
          active?: boolean
          id?: string
          notes?: string | null
          params: Json
          scope?: string
          source_run_id?: string | null
        }
        Update: {
          activated_at?: string
          active?: boolean
          id?: string
          notes?: string | null
          params?: Json
          scope?: string
          source_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hyperparameter_settings_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "hyperparameter_tuning_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      hyperparameter_tuning_runs: {
        Row: {
          algorithm: string
          best_params: Json
          best_value: number
          created_at: string
          elites: number
          evaluations: number
          generations: number
          id: string
          notes: string | null
          population: number
          promoted: boolean
          promoted_at: string | null
          seed: number
          trace: Json
          triggered_by: string | null
        }
        Insert: {
          algorithm?: string
          best_params: Json
          best_value: number
          created_at?: string
          elites: number
          evaluations: number
          generations: number
          id?: string
          notes?: string | null
          population: number
          promoted?: boolean
          promoted_at?: string | null
          seed: number
          trace: Json
          triggered_by?: string | null
        }
        Update: {
          algorithm?: string
          best_params?: Json
          best_value?: number
          created_at?: string
          elites?: number
          evaluations?: number
          generations?: number
          id?: string
          notes?: string | null
          population?: number
          promoted?: boolean
          promoted_at?: string | null
          seed?: number
          trace?: Json
          triggered_by?: string | null
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
          subject_id: string | null
          teacher_category_id: string | null
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
          subject_id?: string | null
          teacher_category_id?: string | null
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
          subject_id?: string | null
          teacher_category_id?: string | null
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
          {
            foreignKeyName: "invite_codes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_codes_teacher_category_id_fkey"
            columns: ["teacher_category_id"]
            isOneToOne: false
            referencedRelation: "teacher_categories"
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
          updated_at: string
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
          updated_at?: string
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
          updated_at?: string
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
      item_parameter_history: {
        Row: {
          a_after: number
          a_before: number
          b_after: number
          b_before: number
          created_at: string
          id: string
          log_likelihood: number | null
          method: string
          question_id: string
          responses_used: number
          subject: string
        }
        Insert: {
          a_after: number
          a_before: number
          b_after: number
          b_before: number
          created_at?: string
          id?: string
          log_likelihood?: number | null
          method?: string
          question_id: string
          responses_used: number
          subject: string
        }
        Update: {
          a_after?: number
          a_before?: number
          b_after?: number
          b_before?: number
          created_at?: string
          id?: string
          log_likelihood?: number | null
          method?: string
          question_id?: string
          responses_used?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_parameter_history_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_bank"
            referencedColumns: ["id"]
          },
        ]
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
      kt_sequence_state: {
        Row: {
          dash_state: Json
          id: string
          interactions: Json
          school_id: string | null
          seq_len: number
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          dash_state?: Json
          id?: string
          interactions?: Json
          school_id?: string | null
          seq_len?: number
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          dash_state?: Json
          id?: string
          interactions?: Json
          school_id?: string | null
          seq_len?: number
          subject?: string
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
          tenant_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          locked_until: string
          student_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          locked_until?: string
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lct_exam_locks_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "lct_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lct_exam_locks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "lct_exam_locks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "lct_exam_students_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "lct_exam_students_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lct_exams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "lct_exams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      learning_objectives: {
        Row: {
          bloom_level: string
          code: string
          created_at: string
          description: string
          id: string
          standard_id: string
          textbook_reference: string | null
        }
        Insert: {
          bloom_level?: string
          code: string
          created_at?: string
          description: string
          id?: string
          standard_id: string
          textbook_reference?: string | null
        }
        Update: {
          bloom_level?: string
          code?: string
          created_at?: string
          description?: string
          id?: string
          standard_id?: string
          textbook_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_objectives_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "curriculum_standards"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_outcomes: {
        Row: {
          baseline_mastery: number | null
          baseline_score: number | null
          computed_at: string
          current_mastery: number | null
          current_score: number | null
          id: string
          mastery_delta: number | null
          pilot_arm: string | null
          retention_14d: number | null
          retention_30d: number | null
          retention_7d: number | null
          school_id: string | null
          score_delta: number | null
          student_id: string
          subject: string
          time_to_mastery_sec: number | null
          topic: string | null
        }
        Insert: {
          baseline_mastery?: number | null
          baseline_score?: number | null
          computed_at?: string
          current_mastery?: number | null
          current_score?: number | null
          id?: string
          mastery_delta?: number | null
          pilot_arm?: string | null
          retention_14d?: number | null
          retention_30d?: number | null
          retention_7d?: number | null
          school_id?: string | null
          score_delta?: number | null
          student_id: string
          subject: string
          time_to_mastery_sec?: number | null
          topic?: string | null
        }
        Update: {
          baseline_mastery?: number | null
          baseline_score?: number | null
          computed_at?: string
          current_mastery?: number | null
          current_score?: number | null
          id?: string
          mastery_delta?: number | null
          pilot_arm?: string | null
          retention_14d?: number | null
          retention_30d?: number | null
          retention_7d?: number | null
          school_id?: string | null
          score_delta?: number | null
          student_id?: string
          subject?: string
          time_to_mastery_sec?: number | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_outcomes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
      lectures: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          difficulty_level: number
          id: string
          is_active: boolean
          order_index: number
          school_id: string
          subject_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty_level?: number
          id?: string
          is_active?: boolean
          order_index?: number
          school_id: string
          subject_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty_level?: number
          id?: string
          is_active?: boolean
          order_index?: number
          school_id?: string
          subject_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lectures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lectures_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_events: {
        Row: {
          concept_ref: string | null
          created_at: string
          id: string
          kind: string
          lesson_id: string
          priority: number
          school_id: string
          seq: number
          teacher_id: string
          teacher_visible: boolean
          text: string
          ts: string
        }
        Insert: {
          concept_ref?: string | null
          created_at?: string
          id?: string
          kind: string
          lesson_id: string
          priority?: number
          school_id: string
          seq?: number
          teacher_id: string
          teacher_visible?: boolean
          text?: string
          ts?: string
        }
        Update: {
          concept_ref?: string | null
          created_at?: string
          id?: string
          kind?: string
          lesson_id?: string
          priority?: number
          school_id?: string
          seq?: number
          teacher_id?: string
          teacher_visible?: boolean
          text?: string
          ts?: string
        }
        Relationships: []
      }
      lesson_explanations: {
        Row: {
          bandit_decision_id: string | null
          concept_id: string | null
          config_snapshot_id: string
          created_at: string
          enforcement_status: string
          explanation: Json
          id: string
          integrity_report: Json
          lecture_id: string | null
          prediction_log_id: string | null
          subject: string | null
          user_id: string | null
        }
        Insert: {
          bandit_decision_id?: string | null
          concept_id?: string | null
          config_snapshot_id: string
          created_at?: string
          enforcement_status: string
          explanation: Json
          id?: string
          integrity_report: Json
          lecture_id?: string | null
          prediction_log_id?: string | null
          subject?: string | null
          user_id?: string | null
        }
        Update: {
          bandit_decision_id?: string | null
          concept_id?: string | null
          config_snapshot_id?: string
          created_at?: string
          enforcement_status?: string
          explanation?: Json
          id?: string
          integrity_report?: Json
          lecture_id?: string | null
          prediction_log_id?: string | null
          subject?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_explanations_bandit_decision_id_fkey"
            columns: ["bandit_decision_id"]
            isOneToOne: false
            referencedRelation: "bandit_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_objective_bindings: {
        Row: {
          alignment_trace: Json
          framework: string | null
          generated_at: string
          id: string
          lesson_ref: string | null
          objective_code: string | null
          objective_id: string | null
          school_id: string | null
          standard_code: string | null
          standard_id: string | null
          student_id: string
          subject: string
          textbook_reference: string | null
          topic: string | null
        }
        Insert: {
          alignment_trace?: Json
          framework?: string | null
          generated_at?: string
          id?: string
          lesson_ref?: string | null
          objective_code?: string | null
          objective_id?: string | null
          school_id?: string | null
          standard_code?: string | null
          standard_id?: string | null
          student_id: string
          subject: string
          textbook_reference?: string | null
          topic?: string | null
        }
        Update: {
          alignment_trace?: Json
          framework?: string | null
          generated_at?: string
          id?: string
          lesson_ref?: string | null
          objective_code?: string | null
          objective_id?: string | null
          school_id?: string | null
          standard_code?: string | null
          standard_id?: string | null
          student_id?: string
          subject?: string
          textbook_reference?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_objective_bindings_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "learning_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_objective_bindings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_objective_bindings_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "curriculum_standards"
            referencedColumns: ["id"]
          },
        ]
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
      lesson_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          last_seq: number
          lesson_id: string
          school_id: string
          started_at: string
          status: string
          student_id: string
          summary: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          last_seq?: number
          lesson_id: string
          school_id: string
          started_at?: string
          status?: string
          student_id: string
          summary?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          last_seq?: number
          lesson_id?: string
          school_id?: string
          started_at?: string
          status?: string
          student_id?: string
          summary?: Json
          updated_at?: string
        }
        Relationships: []
      }
      lesson_state_snapshots: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          school_id: string
          seq: number
          state: Json
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          school_id: string
          seq: number
          state: Json
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          school_id?: string
          seq?: number
          state?: Json
        }
        Relationships: []
      }
      live_meetings: {
        Row: {
          created_at: string
          ended_at: string | null
          grade_level: string
          id: string
          lesson_id: string
          scheduled_at: string | null
          school_id: string
          share_code: string
          started_at: string | null
          status: string
          subject: string | null
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          grade_level: string
          id?: string
          lesson_id?: string
          scheduled_at?: string | null
          school_id: string
          share_code: string
          started_at?: string | null
          status?: string
          subject?: string | null
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          grade_level?: string
          id?: string
          lesson_id?: string
          scheduled_at?: string | null
          school_id?: string
          share_code?: string
          started_at?: string | null
          status?: string
          subject?: string | null
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_meetings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
      mc_curriculum_subjects: {
        Row: {
          applies_grades: number[]
          created_at: string
          description: string | null
          id: string
          is_official: boolean
          language: string | null
          learning_standards: Json
          name: string
          retired_at: string | null
          status: string
          subject_code: string
          tenant_id: string
          updated_at: string
          version_id: string | null
        }
        Insert: {
          applies_grades?: number[]
          created_at?: string
          description?: string | null
          id?: string
          is_official?: boolean
          language?: string | null
          learning_standards?: Json
          name: string
          retired_at?: string | null
          status?: string
          subject_code: string
          tenant_id: string
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          applies_grades?: number[]
          created_at?: string
          description?: string | null
          id?: string
          is_official?: boolean
          language?: string | null
          learning_standards?: Json
          name?: string
          retired_at?: string | null
          status?: string
          subject_code?: string
          tenant_id?: string
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mc_curriculum_subjects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "mc_curriculum_subjects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mc_curriculum_subjects_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "mc_curriculum_version_defs"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_curriculum_version_defs: {
        Row: {
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          label: string
          notes: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          label: string
          notes?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          label?: string
          notes?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_curriculum_version_defs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "mc_curriculum_version_defs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_educational_policies: {
        Row: {
          allows_school_override: boolean
          config: Json
          created_at: string
          effective_from: string | null
          id: string
          policy_key: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          allows_school_override?: boolean
          config?: Json
          created_at?: string
          effective_from?: string | null
          id?: string
          policy_key: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          allows_school_override?: boolean
          config?: Json
          created_at?: string
          effective_from?: string | null
          id?: string
          policy_key?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_educational_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "mc_educational_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_lumina_config: {
        Row: {
          accessibility: Json
          created_at: string
          explanation_style: Json
          id: string
          pacing: Json
          tenant_id: string
          terminology: Json
          updated_at: string
          vocabulary: Json
        }
        Insert: {
          accessibility?: Json
          created_at?: string
          explanation_style?: Json
          id?: string
          pacing?: Json
          tenant_id: string
          terminology?: Json
          updated_at?: string
          vocabulary?: Json
        }
        Update: {
          accessibility?: Json
          created_at?: string
          explanation_style?: Json
          id?: string
          pacing?: Json
          tenant_id?: string
          terminology?: Json
          updated_at?: string
          vocabulary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "mc_lumina_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "mc_lumina_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_regions: {
        Row: {
          code: string | null
          created_at: string
          id: string
          kind: string
          name: string
          parent_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          kind?: string
          name: string
          parent_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_regions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mc_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mc_regions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "mc_regions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_school_lifecycle_events: {
        Row: {
          actor_label: string | null
          created_at: string
          id: string
          new_status: string
          previous_status: string | null
          reason: string | null
          school_id: string
          tenant_id: string
        }
        Insert: {
          actor_label?: string | null
          created_at?: string
          id?: string
          new_status: string
          previous_status?: string | null
          reason?: string | null
          school_id: string
          tenant_id: string
        }
        Update: {
          actor_label?: string | null
          created_at?: string
          id?: string
          new_status?: string
          previous_status?: string | null
          reason?: string | null
          school_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_school_lifecycle_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mc_school_lifecycle_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "mc_school_lifecycle_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mc_school_region_assignments: {
        Row: {
          created_at: string
          id: string
          region_id: string
          school_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          region_id: string
          school_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          region_id?: string
          school_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mc_school_region_assignments_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "mc_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mc_school_region_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mc_school_region_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "mc_school_region_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          tenant_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministry_access_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ministry_access_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ministry_access_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ministry_access_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_announcements: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          published: boolean
          published_at: string
          severity: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string
          severity?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          published?: boolean
          published_at?: string
          severity?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministry_announcements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ministry_announcements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ministry_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ministry_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_capabilities: {
        Row: {
          capability: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["ministry_role"]
        }
        Insert: {
          capability: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["ministry_role"]
        }
        Update: {
          capability?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["ministry_role"]
        }
        Relationships: []
      }
      ministry_change_appliers: {
        Row: {
          applier_function: string
          created_at: string
          description: string | null
          entity_type: string
          registered_by_phase: string | null
        }
        Insert: {
          applier_function: string
          created_at?: string
          description?: string | null
          entity_type: string
          registered_by_phase?: string | null
        }
        Update: {
          applier_function?: string
          created_at?: string
          description?: string | null
          entity_type?: string
          registered_by_phase?: string | null
        }
        Relationships: []
      }
      ministry_change_requests: {
        Row: {
          approved_at: string | null
          author_id: string | null
          author_label: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          payload: Json
          previous_snapshot: Json | null
          published_at: string | null
          publisher_id: string | null
          publisher_label: string | null
          reject_reason: string | null
          rejected_at: string | null
          review_notes: string | null
          reviewer_id: string | null
          reviewer_label: string | null
          status: Database["public"]["Enums"]["ministry_change_status"]
          submitted_at: string | null
          summary: string | null
          tenant_id: string
          title: string
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          approved_at?: string | null
          author_id?: string | null
          author_label?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          payload?: Json
          previous_snapshot?: Json | null
          published_at?: string | null
          publisher_id?: string | null
          publisher_label?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          review_notes?: string | null
          reviewer_id?: string | null
          reviewer_label?: string | null
          status?: Database["public"]["Enums"]["ministry_change_status"]
          submitted_at?: string | null
          summary?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          approved_at?: string | null
          author_id?: string | null
          author_label?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          payload?: Json
          previous_snapshot?: Json | null
          published_at?: string | null
          publisher_id?: string | null
          publisher_label?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          review_notes?: string | null
          reviewer_id?: string | null
          reviewer_label?: string | null
          status?: Database["public"]["Enums"]["ministry_change_status"]
          submitted_at?: string | null
          summary?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ministry_change_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ministry_change_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_ip_bans: {
        Row: {
          banned_at: string
          banned_by: string | null
          device_fingerprint: string | null
          id: string
          ip_address: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          banned_at?: string
          banned_by?: string | null
          device_fingerprint?: string | null
          id?: string
          ip_address: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          banned_at?: string
          banned_by?: string | null
          device_fingerprint?: string | null
          id?: string
          ip_address?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministry_ip_bans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ministry_ip_bans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_role_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["ministry_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["ministry_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["ministry_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministry_role_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ministry_role_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_activity?: string
          session_token: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_activity?: string
          session_token?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministry_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "ministry_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      misconception_embeddings: {
        Row: {
          activation: number
          concept_id: string
          embedding: Json
          id: string
          last_updated: string
          misconception_id: string
          posterior: number
          user_id: string
        }
        Insert: {
          activation?: number
          concept_id: string
          embedding: Json
          id?: string
          last_updated?: string
          misconception_id: string
          posterior?: number
          user_id: string
        }
        Update: {
          activation?: number
          concept_id?: string
          embedding?: Json
          id?: string
          last_updated?: string
          misconception_id?: string
          posterior?: number
          user_id?: string
        }
        Relationships: []
      }
      model_evaluation_metrics: {
        Row: {
          accuracy: number
          auc: number
          base_rate: number
          brier: number
          brier_skill: number
          channel: string
          ci_auc_hi: number | null
          ci_auc_lo: number | null
          ci_brier_hi: number | null
          ci_brier_lo: number | null
          created_at: string
          ece: number
          id: string
          log_loss: number
          n: number
          pr_auc: number
          reliability: number
          reliability_bins: Json | null
          resolution: number
          run_id: string
          slice_key: string | null
          slice_kind: string
          uncertainty: number
        }
        Insert: {
          accuracy: number
          auc: number
          base_rate: number
          brier: number
          brier_skill: number
          channel: string
          ci_auc_hi?: number | null
          ci_auc_lo?: number | null
          ci_brier_hi?: number | null
          ci_brier_lo?: number | null
          created_at?: string
          ece: number
          id?: string
          log_loss: number
          n: number
          pr_auc: number
          reliability: number
          reliability_bins?: Json | null
          resolution: number
          run_id: string
          slice_key?: string | null
          slice_kind?: string
          uncertainty: number
        }
        Update: {
          accuracy?: number
          auc?: number
          base_rate?: number
          brier?: number
          brier_skill?: number
          channel?: string
          ci_auc_hi?: number | null
          ci_auc_lo?: number | null
          ci_brier_hi?: number | null
          ci_brier_lo?: number | null
          created_at?: string
          ece?: number
          id?: string
          log_loss?: number
          n?: number
          pr_auc?: number
          reliability?: number
          reliability_bins?: Json | null
          resolution?: number
          run_id?: string
          slice_key?: string | null
          slice_kind?: string
          uncertainty?: number
        }
        Relationships: [
          {
            foreignKeyName: "model_evaluation_metrics_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "model_evaluation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      model_evaluation_runs: {
        Row: {
          base_rate: number | null
          bootstrap_iterations: number
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          n_predictions: number
          n_with_outcome: number
          notes: string | null
          scope: string
          scope_key: string | null
          status: string
          triggered_by: string | null
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          base_rate?: number | null
          bootstrap_iterations?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          n_predictions?: number
          n_with_outcome?: number
          notes?: string | null
          scope?: string
          scope_key?: string | null
          status?: string
          triggered_by?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          base_rate?: number | null
          bootstrap_iterations?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          n_predictions?: number
          n_with_outcome?: number
          notes?: string | null
          scope?: string
          scope_key?: string | null
          status?: string
          triggered_by?: string | null
          window_end?: string | null
          window_start?: string | null
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
          tenant_id: string
          used: boolean
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          tenant_id: string
          used?: boolean
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          tenant_id?: string
          used?: boolean
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderator_invite_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "moderator_invite_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      pilot_assignments: {
        Row: {
          arm: string
          enrolled_at: string
          id: string
          pilot_id: string
          student_id: string
        }
        Insert: {
          arm: string
          enrolled_at?: string
          id?: string
          pilot_id: string
          student_id: string
        }
        Update: {
          arm?: string
          enrolled_at?: string
          id?: string
          pilot_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_assignments_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilot_studies"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_studies: {
        Row: {
          control_description: string
          created_at: string
          created_by: string
          ended_at: string | null
          grade_level: string | null
          hypothesis: string
          id: string
          name: string
          school_id: string | null
          started_at: string | null
          status: string
          subject: string | null
          treatment_description: string
          updated_at: string
        }
        Insert: {
          control_description?: string
          created_at?: string
          created_by: string
          ended_at?: string | null
          grade_level?: string | null
          hypothesis: string
          id?: string
          name: string
          school_id?: string | null
          started_at?: string | null
          status?: string
          subject?: string | null
          treatment_description?: string
          updated_at?: string
        }
        Update: {
          control_description?: string
          created_at?: string
          created_by?: string
          ended_at?: string | null
          grade_level?: string | null
          hypothesis?: string
          id?: string
          name?: string
          school_id?: string | null
          started_at?: string | null
          status?: string
          subject?: string | null
          treatment_description?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_studies_school_id_fkey"
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
      policy_evaluation_results: {
        Row: {
          ci95_hi: number
          ci95_lo: number
          created_at: string
          cumulative_regret: number | null
          details: Json | null
          effective_sample_size: number
          estimator: string
          id: string
          n_used: number
          policy_name: string
          run_id: string
          stderr: number
          value: number
        }
        Insert: {
          ci95_hi: number
          ci95_lo: number
          created_at?: string
          cumulative_regret?: number | null
          details?: Json | null
          effective_sample_size: number
          estimator: string
          id?: string
          n_used: number
          policy_name: string
          run_id: string
          stderr: number
          value: number
        }
        Update: {
          ci95_hi?: number
          ci95_lo?: number
          created_at?: string
          cumulative_regret?: number | null
          details?: Json | null
          effective_sample_size?: number
          estimator?: string
          id?: string
          n_used?: number
          policy_name?: string
          run_id?: string
          stderr?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_evaluation_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "policy_evaluation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_evaluation_runs: {
        Row: {
          created_at: string
          id: string
          mean_behaviour_reward: number | null
          n_decisions: number
          notes: string | null
          subject: string | null
          triggered_by: string | null
          window_end: string
          window_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          mean_behaviour_reward?: number | null
          n_decisions: number
          notes?: string | null
          subject?: string | null
          triggered_by?: string | null
          window_end: string
          window_start: string
        }
        Update: {
          created_at?: string
          id?: string
          mean_behaviour_reward?: number | null
          n_decisions?: number
          notes?: string | null
          subject?: string | null
          triggered_by?: string | null
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      policy_regret_log: {
        Row: {
          bucket_key: string
          created_at: string
          decision_id: string | null
          id: string
          oracle_reward: number
          realised_reward: number
          regret: number
          run_id: string | null
          subject: string
          user_id: string | null
        }
        Insert: {
          bucket_key: string
          created_at?: string
          decision_id?: string | null
          id?: string
          oracle_reward: number
          realised_reward: number
          regret: number
          run_id?: string | null
          subject: string
          user_id?: string | null
        }
        Update: {
          bucket_key?: string
          created_at?: string
          decision_id?: string | null
          id?: string
          oracle_reward?: number
          realised_reward?: number
          regret?: number
          run_id?: string | null
          subject?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policy_regret_log_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "bandit_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_regret_log_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "policy_evaluation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      population_prior_runs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          metrics: Json | null
          ms_elapsed: number
          ok: boolean
          rows_examined: number
          rows_written: number
          scope_filter: string | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          metrics?: Json | null
          ms_elapsed?: number
          ok?: boolean
          rows_examined?: number
          rows_written?: number
          scope_filter?: string | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          metrics?: Json | null
          ms_elapsed?: number
          ok?: boolean
          rows_examined?: number
          rows_written?: number
          scope_filter?: string | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      population_priors: {
        Row: {
          computed_at: string
          concept_id: string | null
          created_at: string
          ensemble_weights: Json | null
          id: string
          mastery_mean: number
          mastery_var: number
          n_mastery: number
          n_theta: number
          n_weights: number
          school_id: string | null
          scope: string
          se_seed: number
          subject: string | null
          theta_mean: number
          theta_var: number
          updated_at: string
        }
        Insert: {
          computed_at?: string
          concept_id?: string | null
          created_at?: string
          ensemble_weights?: Json | null
          id?: string
          mastery_mean?: number
          mastery_var?: number
          n_mastery?: number
          n_theta?: number
          n_weights?: number
          school_id?: string | null
          scope: string
          se_seed?: number
          subject?: string | null
          theta_mean?: number
          theta_var?: number
          updated_at?: string
        }
        Update: {
          computed_at?: string
          concept_id?: string | null
          created_at?: string
          ensemble_weights?: Json | null
          id?: string
          mastery_mean?: number
          mastery_var?: number
          n_mastery?: number
          n_theta?: number
          n_weights?: number
          school_id?: string | null
          scope?: string
          se_seed?: number
          subject?: string | null
          theta_mean?: number
          theta_var?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "population_priors_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "population_priors_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
          teacher_category_id: string | null
          teacher_subject_id: string | null
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
          teacher_category_id?: string | null
          teacher_subject_id?: string | null
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
          teacher_category_id?: string | null
          teacher_subject_id?: string | null
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
          {
            foreignKeyName: "profiles_teacher_category_id_fkey"
            columns: ["teacher_category_id"]
            isOneToOne: false
            referencedRelation: "teacher_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_teacher_subject_id_fkey"
            columns: ["teacher_subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      question_bank: {
        Row: {
          concept_id: string | null
          confidence: number
          correct_answer: string | null
          created_at: string
          difficulty_b: number
          difficulty_provisional: boolean
          discrimination_a: number
          elo_count: number
          elo_rating: number
          id: string
          is_anchor: boolean
          question_hash: string
          question_text: string
          source: string
          subject: string
          times_correct: number
          times_seen: number
          updated_at: string
        }
        Insert: {
          concept_id?: string | null
          confidence?: number
          correct_answer?: string | null
          created_at?: string
          difficulty_b?: number
          difficulty_provisional?: boolean
          discrimination_a?: number
          elo_count?: number
          elo_rating?: number
          id?: string
          is_anchor?: boolean
          question_hash: string
          question_text: string
          source?: string
          subject: string
          times_correct?: number
          times_seen?: number
          updated_at?: string
        }
        Update: {
          concept_id?: string | null
          confidence?: number
          correct_answer?: string | null
          created_at?: string
          difficulty_b?: number
          difficulty_provisional?: boolean
          discrimination_a?: number
          elo_count?: number
          elo_rating?: number
          id?: string
          is_anchor?: boolean
          question_hash?: string
          question_text?: string
          source?: string
          subject?: string
          times_correct?: number
          times_seen?: number
          updated_at?: string
        }
        Relationships: []
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
      saved_lectures: {
        Row: {
          created_at: string
          duration_minutes: number | null
          expertise: string | null
          grade_level: string | null
          hero_url: string | null
          id: string
          image_urls: Json
          mode: string
          outline_json: Json
          school_id: string | null
          subject: string | null
          title: string
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          expertise?: string | null
          grade_level?: string | null
          hero_url?: string | null
          id?: string
          image_urls?: Json
          mode?: string
          outline_json: Json
          school_id?: string | null
          subject?: string | null
          title: string
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          expertise?: string | null
          grade_level?: string | null
          hero_url?: string | null
          id?: string
          image_urls?: Json
          mode?: string
          outline_json?: Json
          school_id?: string | null
          subject?: string | null
          title?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          governance_status: string | null
          id: string
          is_test_data: boolean | null
          name: string
          status: string
          subjects_sync_enabled: boolean
          tenant_id: string
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
          governance_status?: string | null
          id?: string
          is_test_data?: boolean | null
          name: string
          status?: string
          subjects_sync_enabled?: boolean
          tenant_id: string
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
          governance_status?: string | null
          id?: string
          is_test_data?: boolean | null
          name?: string
          status?: string
          subjects_sync_enabled?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "schools_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          color: string | null
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          is_default: boolean
          name: string
          school_id: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_default?: boolean
          name: string
          school_id: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          is_default?: boolean
          name?: string
          school_id?: string
          slug?: string | null
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
      symbolic_alignment_matrices: {
        Row: {
          created_at: string
          forward: Json
          forward_bias: Json
          id: string
          inverse: Json
          is_active: boolean
          standard_ids: Json
          version: string
        }
        Insert: {
          created_at?: string
          forward: Json
          forward_bias: Json
          id?: string
          inverse: Json
          is_active?: boolean
          standard_ids: Json
          version: string
        }
        Update: {
          created_at?: string
          forward?: Json
          forward_bias?: Json
          id?: string
          inverse?: Json
          is_active?: boolean
          standard_ids?: Json
          version?: string
        }
        Relationships: []
      }
      teacher_categories: {
        Row: {
          color: string | null
          created_at: string
          emoji: string | null
          id: string
          is_default: boolean
          name: string
          permanent_invite_code: string
          school_id: string
          subject_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          is_default?: boolean
          name: string
          permanent_invite_code: string
          school_id: string
          subject_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          is_default?: boolean
          name?: string
          permanent_invite_code?: string
          school_id?: string
          subject_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_categories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_categories_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_overrides: {
        Row: {
          active: boolean
          class_id: string | null
          created_at: string
          effective_from: string
          expires_at: string | null
          id: string
          override_type: string
          payload: Json
          reason: string | null
          school_id: string
          scope: string
          student_id: string | null
          subject: string | null
          teacher_id: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          class_id?: string | null
          created_at?: string
          effective_from?: string
          expires_at?: string | null
          id?: string
          override_type: string
          payload?: Json
          reason?: string | null
          school_id: string
          scope: string
          student_id?: string | null
          subject?: string | null
          teacher_id: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          class_id?: string | null
          created_at?: string
          effective_from?: string
          expires_at?: string | null
          id?: string
          override_type?: string
          payload?: Json
          reason?: string | null
          school_id?: string
          scope?: string
          student_id?: string | null
          subject?: string | null
          teacher_id?: string
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_overrides_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
      tenant_feature_flags: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          enabled: boolean
          flag_key: string
          id: string
          mode: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key: string
          id?: string
          mode?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key?: string
          id?: string
          mode?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_analytics_view"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          academic_calendar: Json
          ai_config: Json
          country_code: string
          country_name: string
          created_at: string
          curriculum_framework: string | null
          default_language: string
          default_subjects: Json
          grading_system: Json
          id: string
          is_visible: boolean
          ministry_name: string
          slug: string
          status: string
          supported_languages: string[]
          updated_at: string
        }
        Insert: {
          academic_calendar?: Json
          ai_config?: Json
          country_code: string
          country_name: string
          created_at?: string
          curriculum_framework?: string | null
          default_language?: string
          default_subjects?: Json
          grading_system?: Json
          id?: string
          is_visible?: boolean
          ministry_name: string
          slug: string
          status?: string
          supported_languages?: string[]
          updated_at?: string
        }
        Update: {
          academic_calendar?: Json
          ai_config?: Json
          country_code?: string
          country_name?: string
          created_at?: string
          curriculum_framework?: string | null
          default_language?: string
          default_subjects?: Json
          grading_system?: Json
          id?: string
          is_visible?: boolean
          ministry_name?: string
          slug?: string
          status?: string
          supported_languages?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      topic_locks: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          reason: string | null
          school_id: string
          scope: string
          state: string
          student_id: string | null
          subject: string
          teacher_id: string
          topic: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          school_id: string
          scope: string
          state?: string
          student_id?: string | null
          subject: string
          teacher_id: string
          topic: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          school_id?: string
          scope?: string
          state?: string
          student_id?: string | null
          subject?: string
          teacher_id?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_locks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
      unified_objective_runs: {
        Row: {
          breakdown_after: Json | null
          breakdown_before: Json | null
          candidate_version: string | null
          finished_at: string | null
          id: string
          loss_after: number | null
          loss_before: number | null
          notes: string | null
          promoted: boolean
          sample_count: number
          started_at: string
        }
        Insert: {
          breakdown_after?: Json | null
          breakdown_before?: Json | null
          candidate_version?: string | null
          finished_at?: string | null
          id?: string
          loss_after?: number | null
          loss_before?: number | null
          notes?: string | null
          promoted?: boolean
          sample_count?: number
          started_at?: string
        }
        Update: {
          breakdown_after?: Json | null
          breakdown_before?: Json | null
          candidate_version?: string | null
          finished_at?: string | null
          id?: string
          loss_after?: number | null
          loss_before?: number | null
          notes?: string | null
          promoted?: boolean
          sample_count?: number
          started_at?: string
        }
        Relationships: []
      }
      unified_policy_decisions: {
        Row: {
          action: Json
          created_at: string
          id: string
          joint_propensity: number
          probabilities: Json
          realised_reward: number | null
          school_id: string | null
          shadow_mode: boolean
          user_id: string
          weights_version: string
          z_vector: Json
        }
        Insert: {
          action: Json
          created_at?: string
          id?: string
          joint_propensity: number
          probabilities: Json
          realised_reward?: number | null
          school_id?: string | null
          shadow_mode?: boolean
          user_id: string
          weights_version: string
          z_vector: Json
        }
        Update: {
          action?: Json
          created_at?: string
          id?: string
          joint_propensity?: number
          probabilities?: Json
          realised_reward?: number | null
          school_id?: string | null
          shadow_mode?: boolean
          user_id?: string
          weights_version?: string
          z_vector?: Json
        }
        Relationships: [
          {
            foreignKeyName: "unified_policy_decisions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_policy_weights: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          lambdas: Json
          promoted_at: string | null
          version: string
          weights: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          lambdas?: Json
          promoted_at?: string | null
          version: string
          weights: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          lambdas?: Json
          promoted_at?: string | null
          version?: string
          weights?: Json
        }
        Relationships: []
      }
      unified_student_state: {
        Row: {
          created_at: string
          id: string
          layout_version: number
          school_id: string | null
          subject: string
          subsystem_snapshot: Json
          user_id: string
          z_vector: Json
        }
        Insert: {
          created_at?: string
          id?: string
          layout_version?: number
          school_id?: string | null
          subject: string
          subsystem_snapshot?: Json
          user_id: string
          z_vector: Json
        }
        Update: {
          created_at?: string
          id?: string
          layout_version?: number
          school_id?: string | null
          subject?: string
          subsystem_snapshot?: Json
          user_id?: string
          z_vector?: Json
        }
        Relationships: [
          {
            foreignKeyName: "unified_student_state_school_id_fkey"
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
      tenant_analytics_view: {
        Row: {
          active_users_7d: number | null
          assignments_30d: number | null
          avg_grade_30d: number | null
          computed_at: string | null
          country_name: string | null
          school_count: number | null
          status: string | null
          student_count: number | null
          submissions_30d: number | null
          teacher_count: number | null
          tenant_id: string | null
          tenant_slug: string | null
          user_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _slugify_name: { Args: { p: string }; Returns: string }
      activate_school_with_code: {
        Args: { activation_code_input: string; user_uuid: string }
        Returns: Json
      }
      activate_tenant: { Args: { p_tenant_id: string }; Returns: Json }
      apply_curriculum_subject_change: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      apply_curriculum_version_change: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      apply_educational_policy_change: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      apply_feature_mode_change: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      apply_lumina_config_change: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      apply_national_notice_change: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      apply_region_change: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      apply_school_lifecycle_change: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      apply_school_region_assignment: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      apply_test_change: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      apply_user_role_change: {
        Args: { p_payload: Json; p_request_id: string }
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
      assign_ministry_role: {
        Args: {
          p_actor_label?: string
          p_role: Database["public"]["Enums"]["ministry_role"]
          p_session_token?: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: string
      }
      attach_bandit_reward: {
        Args: {
          p_concept_id: string
          p_reward: number
          p_subject: string
          p_user_id: string
        }
        Returns: {
          arm_id: string
          context_vec: Json
          decision_id: string
        }[]
      }
      attach_ensemble_outcome: {
        Args: {
          p_concept_id: string
          p_outcome: number
          p_subject: string
          p_user_id: string
        }
        Returns: string
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
      derive_level: { Args: { p_theta: number }; Returns: string }
      gen_teacher_category_code: { Args: { p_name: string }; Returns: string }
      generate_ministry_invite_code: { Args: never; Returns: Json }
      generate_moderator_invite_code: { Args: never; Returns: Json }
      get_active_tenants: {
        Args: never
        Returns: {
          country_code: string
          country_name: string
          default_language: string
          id: string
          ministry_name: string
          slug: string
          supported_languages: string[]
        }[]
      }
      get_cross_tenant_observatory: {
        Args: never
        Returns: {
          active_users_7d: number | null
          assignments_30d: number | null
          avg_grade_30d: number | null
          computed_at: string | null
          country_name: string | null
          school_count: number | null
          status: string | null
          student_count: number | null
          submissions_30d: number | null
          teacher_count: number | null
          tenant_id: string | null
          tenant_slug: string | null
          user_count: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_analytics_view"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
      get_fsrs_due_cards: {
        Args: { p_limit?: number; p_school_id?: string; p_user_id: string }
        Returns: {
          card_id: string
          concept_id: string
          concept_name: string
          difficulty: number
          is_leech: boolean
          lapses: number
          last_review_at: string
          next_review_at: string
          overdue_hours: number
          priority: number
          reps: number
          retrievability: number
          stability: number
          subject: string
        }[]
      }
      get_ministry_dashboard_data: {
        Args: { p_session_token: string }
        Returns: Json
      }
      get_tenant_analytics: { Args: { p_tenant_id?: string }; Returns: Json }
      get_tenant_config: { Args: never; Returns: Json }
      get_user_school_id: { Args: { user_uuid: string }; Returns: string }
      get_user_tenant_id: { Args: { uid: string }; Returns: string }
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
      has_ministry_capability: {
        Args: {
          p_capability: string
          p_session_token?: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tenant_role: {
        Args: { role_name: string; tenant: string; uid: string }
        Returns: boolean
      }
      is_feature_enabled: {
        Args: { p_flag_key: string; p_tenant_id: string }
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
      is_super_admin: { Args: { uid: string }; Returns: boolean }
      is_super_admin_caller: { Args: never; Returns: boolean }
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
      list_change_requests: {
        Args: {
          p_limit?: number
          p_session_token?: string
          p_status?: Database["public"]["Enums"]["ministry_change_status"]
          p_tenant_id?: string
        }
        Returns: {
          approved_at: string | null
          author_id: string | null
          author_label: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          payload: Json
          previous_snapshot: Json | null
          published_at: string | null
          publisher_id: string | null
          publisher_label: string | null
          reject_reason: string | null
          rejected_at: string | null
          review_notes: string | null
          reviewer_id: string | null
          reviewer_label: string | null
          status: Database["public"]["Enums"]["ministry_change_status"]
          submitted_at: string | null
          summary: string | null
          tenant_id: string
          title: string
          updated_at: string
          withdrawn_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "ministry_change_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_feature_flags: {
        Args: { p_tenant_id?: string }
        Returns: {
          config: Json
          created_at: string
          description: string | null
          enabled: boolean
          flag_key: string
          id: string
          mode: string | null
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_feature_flags"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_mc_curriculum_subjects: {
        Args: { p_session_token?: string }
        Returns: {
          applies_grades: number[]
          created_at: string
          description: string | null
          id: string
          is_official: boolean
          language: string | null
          learning_standards: Json
          name: string
          retired_at: string | null
          status: string
          subject_code: string
          tenant_id: string
          updated_at: string
          version_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mc_curriculum_subjects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_mc_curriculum_versions: {
        Args: { p_session_token?: string }
        Returns: {
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          label: string
          notes: string | null
          status: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mc_curriculum_version_defs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_mc_feature_flags: {
        Args: { p_session_token?: string }
        Returns: {
          config: Json
          created_at: string
          description: string | null
          enabled: boolean
          flag_key: string
          id: string
          mode: string | null
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_feature_flags"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_mc_lumina_config: {
        Args: { p_session_token?: string }
        Returns: {
          accessibility: Json
          created_at: string
          explanation_style: Json
          id: string
          pacing: Json
          tenant_id: string
          terminology: Json
          updated_at: string
          vocabulary: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "mc_lumina_config"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_mc_notices: {
        Args: { p_session_token?: string }
        Returns: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          published: boolean
          published_at: string
          severity: string
          tenant_id: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ministry_announcements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_mc_policies: {
        Args: { p_session_token?: string }
        Returns: {
          allows_school_override: boolean
          config: Json
          created_at: string
          effective_from: string | null
          id: string
          policy_key: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mc_educational_policies"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_mc_regions: {
        Args: { p_session_token?: string }
        Returns: {
          code: string | null
          created_at: string
          id: string
          kind: string
          name: string
          parent_id: string | null
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mc_regions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_mc_schools: {
        Args: { p_session_token?: string }
        Returns: {
          code: string
          created_at: string
          governance_status: string
          id: string
          name: string
          status: string
          tenant_id: string
        }[]
      }
      list_ministry_audit: {
        Args: {
          p_limit?: number
          p_session_token?: string
          p_tenant_id?: string
        }
        Returns: {
          action: string
          actor_id: string | null
          actor_label: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          tenant_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "ministry_audit_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_ministry_role_assignments: {
        Args: { p_session_token?: string; p_tenant_id?: string }
        Returns: {
          assigned_by: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["ministry_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ministry_role_assignments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_ministry_sessions: {
        Args: { p_limit?: number; p_session_token?: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          ip_address: string
          is_active: boolean
          last_activity: string
          tenant_id: string
        }[]
      }
      mc_can_govern_tenant: { Args: { p_tenant: string }; Returns: boolean }
      ministry_audit: {
        Args: {
          p_action: string
          p_actor_id: string
          p_actor_label: string
          p_after: Json
          p_before: Json
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
          p_tenant_id: string
        }
        Returns: string
      }
      ministry_session_tenant: {
        Args: { p_session_token: string }
        Returns: string
      }
      provision_tenant: { Args: { payload: Json }; Returns: Json }
      publish_change_request: {
        Args: {
          p_publisher_label?: string
          p_request_id: string
          p_session_token?: string
        }
        Returns: Json
      }
      record_review_delivered: {
        Args: { p_card_id: string }
        Returns: undefined
      }
      resolve_ministry_request: {
        Args: { p_action: string; p_request_id: string }
        Returns: Json
      }
      review_change_request: {
        Args: {
          p_decision: string
          p_notes?: string
          p_request_id: string
          p_reviewer_label?: string
          p_session_token?: string
        }
        Returns: undefined
      }
      revoke_ministry_role: {
        Args: {
          p_actor_label?: string
          p_assignment_id: string
          p_session_token?: string
        }
        Returns: undefined
      }
      rotate_teacher_category_code: {
        Args: { p_category_id: string }
        Returns: string
      }
      seed_default_subjects: {
        Args: { p_school_id: string }
        Returns: undefined
      }
      seed_default_teacher_categories: {
        Args: { p_school_id: string }
        Returns: undefined
      }
      set_feature_flag: {
        Args: {
          p_config?: Json
          p_description?: string
          p_enabled: boolean
          p_flag_key: string
          p_tenant_id: string
        }
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
      submit_change_request: {
        Args: {
          p_author_label?: string
          p_entity_id: string
          p_entity_type: string
          p_payload: Json
          p_session_token?: string
          p_summary: string
          p_tenant_id: string
          p_title: string
        }
        Returns: string
      }
      suspend_tenant: { Args: { p_tenant_id: string }; Returns: Json }
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
      update_tenant_defaults: {
        Args: {
          p_academic_calendar?: Json
          p_curriculum_framework?: string
          p_default_language?: string
          p_default_subjects?: Json
          p_grading_system?: Json
          p_supported_languages?: string[]
          p_tenant_id: string
        }
        Returns: Json
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
      withdraw_change_request: {
        Args: {
          p_actor_label?: string
          p_request_id: string
          p_session_token?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "teacher" | "student" | "admin"
      ministry_change_status:
        | "draft"
        | "in_review"
        | "approved"
        | "published"
        | "rejected"
        | "withdrawn"
      ministry_role:
        | "minister"
        | "deputy_minister"
        | "curriculum_officer"
        | "regional_supervisor"
        | "ministry_admin"
        | "viewer"
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
      ministry_change_status: [
        "draft",
        "in_review",
        "approved",
        "published",
        "rejected",
        "withdrawn",
      ],
      ministry_role: [
        "minister",
        "deputy_minister",
        "curriculum_officer",
        "regional_supervisor",
        "ministry_admin",
        "viewer",
      ],
    },
  },
} as const
