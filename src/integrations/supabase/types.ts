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
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
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
      check_super_admin_lock_status: {
        Args: { p_email: string }
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
      get_user_school_id: { Args: { user_uuid: string }; Returns: string }
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
      is_school_admin: {
        Args: { _school_id: string; _user_id: string }
        Returns: boolean
      }
      is_school_admin_of: {
        Args: { check_school_id: string; user_uuid: string }
        Returns: boolean
      }
      is_student: { Args: { user_uuid: string }; Returns: boolean }
      is_teacher: { Args: { user_uuid: string }; Returns: boolean }
      link_profile_after_signup: {
        Args: { p_email: string; p_user_id: string }
        Returns: Json
      }
      signup_with_invite_code: {
        Args: { p_email: string; p_full_name: string; p_invite_code: string }
        Returns: Json
      }
      verify_admin_access_code: {
        Args: { input_code: string }
        Returns: boolean
      }
      verify_super_admin_code: {
        Args: { p_code: string; p_email: string }
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
