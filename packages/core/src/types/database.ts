export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      absent_patients: {
        Row: {
          appointment_id: string
          auto_cancelled: boolean | null
          clinic_id: string
          created_at: string | null
          grace_period_ends_at: string | null
          id: string
          marked_absent_at: string | null
          new_position: number | null
          notification_sent: boolean | null
          patient_id: string
          returned_at: string | null
          updated_at: string | null
        }
        Insert: {
          appointment_id: string
          auto_cancelled?: boolean | null
          clinic_id: string
          created_at?: string | null
          grace_period_ends_at?: string | null
          id?: string
          marked_absent_at?: string | null
          new_position?: number | null
          notification_sent?: boolean | null
          patient_id: string
          returned_at?: string | null
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string
          auto_cancelled?: boolean | null
          clinic_id?: string
          created_at?: string | null
          grace_period_ends_at?: string | null
          id?: string
          marked_absent_at?: string | null
          new_position?: number | null
          notification_sent?: boolean | null
          patient_id?: string
          returned_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "absent_patients_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absent_patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absent_patients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_metrics: {
        Row: {
          absolute_error: number | null
          actual_wait_time: number | null
          appointment_id: string
          average_service_time: number | null
          clinic_id: string
          confidence_score: number | null
          current_delay_minutes: number | null
          features: Json
          id: string
          model_version: string | null
          predicted_wait_time: number | null
          prediction_error: number | null
          queue_length: number | null
          queue_position: number | null
          recorded_at: string | null
          staff_count: number | null
        }
        Insert: {
          absolute_error?: number | null
          actual_wait_time?: number | null
          appointment_id: string
          average_service_time?: number | null
          clinic_id: string
          confidence_score?: number | null
          current_delay_minutes?: number | null
          features?: Json
          id?: string
          model_version?: string | null
          predicted_wait_time?: number | null
          prediction_error?: number | null
          queue_length?: number | null
          queue_position?: number | null
          recorded_at?: string | null
          staff_count?: number | null
        }
        Update: {
          absolute_error?: number | null
          actual_wait_time?: number | null
          appointment_id?: string
          average_service_time?: number | null
          clinic_id?: string
          confidence_score?: number | null
          current_delay_minutes?: number | null
          features?: Json
          id?: string
          model_version?: string | null
          predicted_wait_time?: number | null
          prediction_error?: number | null
          queue_length?: number | null
          queue_position?: number | null
          recorded_at?: string | null
          staff_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_metrics_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_metrics_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          actual_duration: number | null
          actual_end_time: string | null
          appointment_date: string
          appointment_type: Database["public"]["Enums"]["appointment_type"]
          billing_amount: number | null
          booked_by: string | null
          booking_method: string | null
          cancellation_reason: string | null
          checked_in_at: string | null
          clinic_id: string
          created_at: string | null
          currency: string
          day_of_week: number | null
          estimated_duration: number | null
          id: string
          is_first_visit: boolean | null
          is_gap_filler: boolean | null
          is_holiday: boolean | null
          is_present: boolean | null
          is_walk_in: boolean | null
          last_notification_sent_at: string | null
          last_prediction_update: string | null
          late_arrival_converted: boolean | null
          late_by_minutes: number | null
          marked_absent_at: string | null
          notes: string | null
          notification_count: number | null
          original_queue_position: number | null
          original_slot_time: string | null
          override_by: string | null
          paid_at: string | null
          patient_id: string
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["appointment_payment_status"]
          predicted_start_time: string | null
          predicted_wait_time: number | null
          prediction_confidence: number | null
          priority_score: number | null
          promoted_from_waitlist: boolean | null
          queue_position: number | null
          queue_status_token: string | null
          reason_for_visit: string | null
          resource_id: string | null
          returned_at: string | null
          scheduled_time: string | null
          skip_count: number | null
          skip_reason: Database["public"]["Enums"]["skip_reason_type"] | null
          staff_id: string
          status: Database["public"]["Enums"]["appointment_status"] | null
          time_slot: string | null
          updated_at: string | null
        }
        Insert: {
          actual_duration?: number | null
          actual_end_time?: string | null
          appointment_date: string
          appointment_type?: Database["public"]["Enums"]["appointment_type"]
          billing_amount?: number | null
          booked_by?: string | null
          booking_method?: string | null
          cancellation_reason?: string | null
          checked_in_at?: string | null
          clinic_id: string
          created_at?: string | null
          currency?: string
          day_of_week?: number | null
          estimated_duration?: number | null
          id?: string
          is_first_visit?: boolean | null
          is_gap_filler?: boolean | null
          is_holiday?: boolean | null
          is_present?: boolean | null
          is_walk_in?: boolean | null
          last_notification_sent_at?: string | null
          last_prediction_update?: string | null
          late_arrival_converted?: boolean | null
          late_by_minutes?: number | null
          marked_absent_at?: string | null
          notes?: string | null
          notification_count?: number | null
          original_queue_position?: number | null
          original_slot_time?: string | null
          override_by?: string | null
          paid_at?: string | null
          patient_id: string
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["appointment_payment_status"]
          predicted_start_time?: string | null
          predicted_wait_time?: number | null
          prediction_confidence?: number | null
          priority_score?: number | null
          promoted_from_waitlist?: boolean | null
          queue_position?: number | null
          queue_status_token?: string | null
          reason_for_visit?: string | null
          resource_id?: string | null
          returned_at?: string | null
          scheduled_time?: string | null
          skip_count?: number | null
          skip_reason?: Database["public"]["Enums"]["skip_reason_type"] | null
          staff_id: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          time_slot?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_duration?: number | null
          actual_end_time?: string | null
          appointment_date?: string
          appointment_type?: Database["public"]["Enums"]["appointment_type"]
          billing_amount?: number | null
          booked_by?: string | null
          booking_method?: string | null
          cancellation_reason?: string | null
          checked_in_at?: string | null
          clinic_id?: string
          created_at?: string | null
          currency?: string
          day_of_week?: number | null
          estimated_duration?: number | null
          id?: string
          is_first_visit?: boolean | null
          is_gap_filler?: boolean | null
          is_holiday?: boolean | null
          is_present?: boolean | null
          is_walk_in?: boolean | null
          last_notification_sent_at?: string | null
          last_prediction_update?: string | null
          late_arrival_converted?: boolean | null
          late_by_minutes?: number | null
          marked_absent_at?: string | null
          notes?: string | null
          notification_count?: number | null
          original_queue_position?: number | null
          original_slot_time?: string | null
          override_by?: string | null
          paid_at?: string | null
          patient_id?: string
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["appointment_payment_status"]
          predicted_start_time?: string | null
          predicted_wait_time?: number | null
          prediction_confidence?: number | null
          priority_score?: number | null
          promoted_from_waitlist?: boolean | null
          queue_position?: number | null
          queue_status_token?: string | null
          reason_for_visit?: string | null
          resource_id?: string | null
          returned_at?: string | null
          scheduled_time?: string | null
          skip_count?: number | null
          skip_reason?: Database["public"]["Enums"]["skip_reason_type"] | null
          staff_id?: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          time_slot?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "clinic_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "clinic_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          clinic_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          clinic_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          clinic_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_day_closure_reports: {
        Row: {
          absent_count: number
          already_no_show_count: number
          clinic_id: string
          closed_at: string
          closed_by: string
          closure_date: string
          completed_count: number
          created_at: string
          id: string
          in_progress_count: number
          marked_completed_count: number
          marked_no_show_count: number
          notes: string | null
          reason: string | null
          staff_id: string
          total_appointments: number
          updated_at: string
          waiting_count: number
        }
        Insert: {
          absent_count?: number
          already_no_show_count?: number
          clinic_id: string
          closed_at?: string
          closed_by: string
          closure_date: string
          completed_count?: number
          created_at?: string
          id?: string
          in_progress_count?: number
          marked_completed_count?: number
          marked_no_show_count?: number
          notes?: string | null
          reason?: string | null
          staff_id: string
          total_appointments?: number
          updated_at?: string
          waiting_count?: number
        }
        Update: {
          absent_count?: number
          already_no_show_count?: number
          clinic_id?: string
          closed_at?: string
          closed_by?: string
          closure_date?: string
          completed_count?: number
          created_at?: string
          id?: string
          in_progress_count?: number
          marked_completed_count?: number
          marked_no_show_count?: number
          notes?: string | null
          reason?: string | null
          staff_id?: string
          total_appointments?: number
          updated_at?: string
          waiting_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "clinic_day_closure_reports_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_day_closure_reports_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "clinic_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_notification_budgets: {
        Row: {
          alert_threshold: number | null
          clinic_id: string
          created_at: string | null
          current_month_sms_count: number | null
          current_month_spend: number | null
          last_reset_date: string | null
          monthly_budget_amount: number | null
          monthly_sms_limit: number | null
          notifications_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          alert_threshold?: number | null
          clinic_id: string
          created_at?: string | null
          current_month_sms_count?: number | null
          current_month_spend?: number | null
          last_reset_date?: string | null
          monthly_budget_amount?: number | null
          monthly_sms_limit?: number | null
          notifications_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          alert_threshold?: number | null
          clinic_id?: string
          created_at?: string | null
          current_month_sms_count?: number | null
          current_month_spend?: number | null
          last_reset_date?: string | null
          monthly_budget_amount?: number | null
          monthly_sms_limit?: number | null
          notifications_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_notification_budgets_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_ratings: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          patient_id: string
          rating: number
          review_text: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          patient_id: string
          rating: number
          review_text?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          patient_id?: string
          rating?: number
          review_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_ratings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_resources: {
        Row: {
          capacity: number
          clinic_id: string
          created_at: string
          created_by: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          resource_type: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          clinic_id: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          resource_type?: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          resource_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_resources_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_staff: {
        Row: {
          appointment_types_override: Json | null
          average_consultation_duration: number | null
          clinic_id: string
          created_at: string | null
          daily_queue_modes_override: Json | null
          id: string
          is_active: boolean | null
          license_number: string | null
          patients_per_day_avg: number | null
          role: string
          specialization: string | null
          updated_at: string | null
          user_id: string
          working_hours: Json | null
        }
        Insert: {
          appointment_types_override?: Json | null
          average_consultation_duration?: number | null
          clinic_id: string
          created_at?: string | null
          daily_queue_modes_override?: Json | null
          id?: string
          is_active?: boolean | null
          license_number?: string | null
          patients_per_day_avg?: number | null
          role?: string
          specialization?: string | null
          updated_at?: string | null
          user_id: string
          working_hours?: Json | null
        }
        Update: {
          appointment_types_override?: Json | null
          average_consultation_duration?: number | null
          clinic_id?: string
          created_at?: string | null
          daily_queue_modes_override?: Json | null
          id?: string
          is_active?: boolean | null
          license_number?: string | null
          patients_per_day_avg?: number | null
          role?: string
          specialization?: string | null
          updated_at?: string | null
          user_id?: string
          working_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_staff_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string
          allow_overflow: boolean | null
          city: string
          created_at: string | null
          daily_capacity_limit: number | null
          email: string | null
          grace_period_minutes: number | null
          id: string
          is_active: boolean | null
          late_arrival_policy: string | null
          logo_url: string | null
          name: string
          name_ar: string | null
          owner_id: string
          phone: string
          practice_type: Database["public"]["Enums"]["practice_type"] | null
          queue_mode: string | null
          settings: Json | null
          specialty: string
          subscription_tier: string | null
          updated_at: string | null
        }
        Insert: {
          address: string
          allow_overflow?: boolean | null
          city: string
          created_at?: string | null
          daily_capacity_limit?: number | null
          email?: string | null
          grace_period_minutes?: number | null
          id?: string
          is_active?: boolean | null
          late_arrival_policy?: string | null
          logo_url?: string | null
          name: string
          name_ar?: string | null
          owner_id: string
          phone: string
          practice_type?: Database["public"]["Enums"]["practice_type"] | null
          queue_mode?: string | null
          settings?: Json | null
          specialty: string
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          allow_overflow?: boolean | null
          city?: string
          created_at?: string | null
          daily_capacity_limit?: number | null
          email?: string | null
          grace_period_minutes?: number | null
          id?: string
          is_active?: boolean | null
          late_arrival_policy?: string | null
          logo_url?: string | null
          name?: string
          name_ar?: string | null
          owner_id?: string
          phone?: string
          practice_type?: Database["public"]["Enums"]["practice_type"] | null
          queue_mode?: string | null
          settings?: Json | null
          specialty?: string
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      medical_medication_catalog: {
        Row: {
          aliases: string[]
          canonical_name: string
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          name_key: string
          updated_at: string
          updated_by: string | null
          usage_count: number
        }
        Insert: {
          aliases?: string[]
          canonical_name: string
          clinic_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name_key: string
          updated_at?: string
          updated_by?: string | null
          usage_count?: number
        }
        Update: {
          aliases?: string[]
          canonical_name?: string
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name_key?: string
          updated_at?: string
          updated_by?: string | null
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "medical_medication_catalog_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_procedure_reports: {
        Row: {
          appointment_id: string
          authored_by: string
          clinic_id: string
          content: Json
          content_plain_text: string | null
          created_at: string
          finalized_at: string | null
          id: string
          is_patient_visible: boolean
          patient_id: string
          status: string
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          authored_by: string
          clinic_id: string
          content: Json
          content_plain_text?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          is_patient_visible?: boolean
          patient_id: string
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          authored_by?: string
          clinic_id?: string
          content?: Json
          content_plain_text?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          is_patient_visible?: boolean
          patient_id?: string
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_procedure_reports_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_procedure_reports_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_procedure_reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_procedure_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "medical_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_record_access_grants: {
        Row: {
          appointment_id: string
          clinic_id: string
          consent_method: string | null
          consent_recorded_at: string | null
          created_at: string
          duration_seconds: number | null
          expires_at: string | null
          granted_at: string | null
          grantee_user_id: string
          id: string
          owner_override_reason: string | null
          patient_id: string
          requested_at: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          scope: Json
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          clinic_id: string
          consent_method?: string | null
          consent_recorded_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          expires_at?: string | null
          granted_at?: string | null
          grantee_user_id: string
          id?: string
          owner_override_reason?: string | null
          patient_id: string
          requested_at?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          clinic_id?: string
          consent_method?: string | null
          consent_recorded_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          expires_at?: string | null
          granted_at?: string | null
          grantee_user_id?: string
          id?: string
          owner_override_reason?: string | null
          patient_id?: string
          requested_at?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_record_access_grants_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_access_grants_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_access_grants_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_record_access_log: {
        Row: {
          accessed_at: string
          accessed_by: string
          action: string
          clinic_id: string
          grant_id: string | null
          id: string
          ip_address: unknown
          patient_id: string | null
          patient_pseudonym: string
          record_id: string | null
          record_type: string
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          accessed_by: string
          action: string
          clinic_id: string
          grant_id?: string | null
          id?: string
          ip_address?: unknown
          patient_id?: string | null
          patient_pseudonym: string
          record_id?: string | null
          record_type: string
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          accessed_by?: string
          action?: string
          clinic_id?: string
          grant_id?: string | null
          id?: string
          ip_address?: unknown
          patient_id?: string | null
          patient_pseudonym?: string
          record_id?: string | null
          record_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_record_access_log_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_access_log_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "medical_record_access_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_access_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_record_diagnoses: {
        Row: {
          appointment_id: string
          clinic_id: string
          created_at: string
          diagnosed_by: string
          diagnosis_code: string | null
          diagnosis_label: string
          diagnosis_notes: string | null
          id: string
          is_patient_visible: boolean
          patient_id: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          clinic_id: string
          created_at?: string
          diagnosed_by: string
          diagnosis_code?: string | null
          diagnosis_label: string
          diagnosis_notes?: string | null
          id?: string
          is_patient_visible?: boolean
          patient_id: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          clinic_id?: string
          created_at?: string
          diagnosed_by?: string
          diagnosis_code?: string | null
          diagnosis_label?: string
          diagnosis_notes?: string | null
          id?: string
          is_patient_visible?: boolean
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_record_diagnoses_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_diagnoses_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_diagnoses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_record_lab_results: {
        Row: {
          appointment_id: string
          clinic_id: string
          created_at: string
          id: string
          interpretation: string | null
          is_patient_visible: boolean
          patient_id: string
          recorded_by: string
          reference_range: string | null
          result_value: string | null
          test_name: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          appointment_id: string
          clinic_id: string
          created_at?: string
          id?: string
          interpretation?: string | null
          is_patient_visible?: boolean
          patient_id: string
          recorded_by: string
          reference_range?: string | null
          result_value?: string | null
          test_name: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          clinic_id?: string
          created_at?: string
          id?: string
          interpretation?: string | null
          is_patient_visible?: boolean
          patient_id?: string
          recorded_by?: string
          reference_range?: string | null
          result_value?: string | null
          test_name?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_record_lab_results_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_lab_results_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_lab_results_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_record_otp_codes: {
        Row: {
          attempt_count: number
          code_hmac: string
          code_key_version: string
          code_salt: string
          created_at: string
          delivered_to_encrypted: string | null
          delivery_attempt_count: number
          delivery_channel: string
          delivery_error: string | null
          delivery_status: string
          expires_at: string
          grant_id: string
          id: string
          is_used: boolean
          last_delivery_attempt_at: string | null
          locked_until: string | null
          max_attempts: number
          patient_id: string
          requesting_user_id: string
          validated_at: string | null
        }
        Insert: {
          attempt_count?: number
          code_hmac: string
          code_key_version?: string
          code_salt: string
          created_at?: string
          delivered_to_encrypted?: string | null
          delivery_attempt_count?: number
          delivery_channel: string
          delivery_error?: string | null
          delivery_status?: string
          expires_at: string
          grant_id: string
          id?: string
          is_used?: boolean
          last_delivery_attempt_at?: string | null
          locked_until?: string | null
          max_attempts?: number
          patient_id: string
          requesting_user_id: string
          validated_at?: string | null
        }
        Update: {
          attempt_count?: number
          code_hmac?: string
          code_key_version?: string
          code_salt?: string
          created_at?: string
          delivered_to_encrypted?: string | null
          delivery_attempt_count?: number
          delivery_channel?: string
          delivery_error?: string | null
          delivery_status?: string
          expires_at?: string
          grant_id?: string
          id?: string
          is_used?: boolean
          last_delivery_attempt_at?: string | null
          locked_until?: string | null
          max_attempts?: number
          patient_id?: string
          requesting_user_id?: string
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_record_otp_codes_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "medical_record_access_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_otp_codes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_record_prescriptions: {
        Row: {
          appointment_id: string
          clinic_id: string
          created_at: string
          dosage: string | null
          duration_days: number | null
          frequency: string | null
          id: string
          instructions: string | null
          is_patient_visible: boolean
          medication_name: string
          patient_id: string
          prescribed_by: string
          route: string | null
          updated_at: string
        }
        Insert: {
          appointment_id: string
          clinic_id: string
          created_at?: string
          dosage?: string | null
          duration_days?: number | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          is_patient_visible?: boolean
          medication_name: string
          patient_id: string
          prescribed_by: string
          route?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          clinic_id?: string
          created_at?: string
          dosage?: string | null
          duration_days?: number | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          is_patient_visible?: boolean
          medication_name?: string
          patient_id?: string
          prescribed_by?: string
          route?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_record_prescriptions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_prescriptions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_record_prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_report_images: {
        Row: {
          clinic_id: string
          created_at: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
          report_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          file_name: string
          file_size: number
          id?: string
          mime_type: string
          report_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          report_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_report_images_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_report_images_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "medical_procedure_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_templates: {
        Row: {
          clinic_id: string | null
          content: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          scope: string
          specialty: string | null
          tags: string[]
          template_type: string
          title: string
          title_ar: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          clinic_id?: string | null
          content: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          scope?: string
          specialty?: string | null
          tags?: string[]
          template_type: string
          title: string
          title_ar?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          clinic_id?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          scope?: string
          specialty?: string | null
          tags?: string[]
          template_type?: string
          title?: string
          title_ar?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "medical_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_analytics: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          clinic_id: string
          cost_actual: number | null
          created_at: string | null
          date: string
          delivery_time_seconds: number | null
          id: string
          notification_id: string | null
          type: Database["public"]["Enums"]["notification_type"]
          was_delivered: boolean
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          clinic_id: string
          cost_actual?: number | null
          created_at?: string | null
          date: string
          delivery_time_seconds?: number | null
          id?: string
          notification_id?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          was_delivered?: boolean
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          clinic_id?: string
          cost_actual?: number | null
          created_at?: string | null
          date?: string
          delivery_time_seconds?: number | null
          id?: string
          notification_id?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          was_delivered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_analytics_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_analytics_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_custom: boolean | null
          language: string
          template_key: string
          template_text: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          language?: string
          template_key: string
          template_text: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          language?: string
          template_key?: string
          template_text?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          appointment_id: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          clinic_id: string
          cost_estimate: number | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          max_retries: number | null
          message_template: string
          message_variables: Json | null
          patient_id: string
          priority: number | null
          read_at: string | null
          recipient: string
          rendered_message: string | null
          retry_count: number | null
          scheduled_for: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"] | null
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          appointment_id?: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          clinic_id: string
          cost_estimate?: number | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          message_template: string
          message_variables?: Json | null
          patient_id: string
          priority?: number | null
          read_at?: string | null
          recipient: string
          rendered_message?: string | null
          retry_count?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"] | null
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          appointment_id?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          clinic_id?: string
          cost_estimate?: number | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          message_template?: string
          message_variables?: Json | null
          patient_id?: string
          priority?: number | null
          read_at?: string | null
          recipient?: string
          rendered_message?: string | null
          retry_count?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"] | null
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_allergies: {
        Row: {
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          id: string
          is_active: boolean
          notes: string | null
          patient_id: string
          reaction: string | null
          recorded_at: string
          recorded_by: string | null
          severity: Database["public"]["Enums"]["patient_allergy_severity"]
          source: Database["public"]["Enums"]["patient_allergy_source"]
          substance: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          patient_id: string
          reaction?: string | null
          recorded_at?: string
          recorded_by?: string | null
          severity?: Database["public"]["Enums"]["patient_allergy_severity"]
          source?: Database["public"]["Enums"]["patient_allergy_source"]
          substance: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          patient_id?: string
          reaction?: string | null
          recorded_at?: string
          recorded_by?: string | null
          severity?: Database["public"]["Enums"]["patient_allergy_severity"]
          source?: Database["public"]["Enums"]["patient_allergy_source"]
          substance?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_clinic_history: {
        Row: {
          average_actual_duration: number | null
          cancellation_count: number | null
          clinic_id: string
          completed_visits: number | null
          id: string
          last_appointment_id: string | null
          last_visit_date: string | null
          no_show_count: number | null
          patient_id: string
          preferred_day_of_week: number | null
          preferred_staff_id: string | null
          preferred_time_slot: string | null
          punctuality_score: number | null
          reliability_score: number | null
          total_visits: number | null
          updated_at: string | null
        }
        Insert: {
          average_actual_duration?: number | null
          cancellation_count?: number | null
          clinic_id: string
          completed_visits?: number | null
          id?: string
          last_appointment_id?: string | null
          last_visit_date?: string | null
          no_show_count?: number | null
          patient_id: string
          preferred_day_of_week?: number | null
          preferred_staff_id?: string | null
          preferred_time_slot?: string | null
          punctuality_score?: number | null
          reliability_score?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Update: {
          average_actual_duration?: number | null
          cancellation_count?: number | null
          clinic_id?: string
          completed_visits?: number | null
          id?: string
          last_appointment_id?: string | null
          last_visit_date?: string | null
          no_show_count?: number | null
          patient_id?: string
          preferred_day_of_week?: number | null
          preferred_staff_id?: string | null
          preferred_time_slot?: string | null
          punctuality_score?: number | null
          reliability_score?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_clinic_history_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_clinic_history_last_appointment_id_fkey"
            columns: ["last_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_clinic_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_clinic_history_preferred_staff_id_fkey"
            columns: ["preferred_staff_id"]
            isOneToOne: false
            referencedRelation: "clinic_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_current_medications: {
        Row: {
          clinic_id: string | null
          created_at: string
          dosage: string | null
          expected_end_on: string | null
          frequency: string | null
          id: string
          instructions: string | null
          is_active: boolean
          medication_name: string
          patient_id: string
          recorded_at: string
          recorded_by: string | null
          route: string | null
          source: Database["public"]["Enums"]["patient_medical_entry_source"]
          started_on: string | null
          stop_reason: string | null
          stopped_at: string | null
          stopped_by: string | null
          updated_at: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          dosage?: string | null
          expected_end_on?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          medication_name: string
          patient_id: string
          recorded_at?: string
          recorded_by?: string | null
          route?: string | null
          source?: Database["public"]["Enums"]["patient_medical_entry_source"]
          started_on?: string | null
          stop_reason?: string | null
          stopped_at?: string | null
          stopped_by?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          dosage?: string | null
          expected_end_on?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          medication_name?: string
          patient_id?: string
          recorded_at?: string
          recorded_by?: string | null
          route?: string | null
          source?: Database["public"]["Enums"]["patient_medical_entry_source"]
          started_on?: string | null
          stop_reason?: string | null
          stopped_at?: string | null
          stopped_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_current_medications_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_current_medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_favorites: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          patient_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          patient_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_favorites_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_problem_list: {
        Row: {
          clinic_id: string | null
          created_at: string
          icd10_code: string | null
          id: string
          is_active: boolean
          notes: string | null
          onset_date: string | null
          patient_id: string
          problem_name: string
          recorded_at: string
          recorded_by: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          source: Database["public"]["Enums"]["patient_medical_entry_source"]
          updated_at: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          icd10_code?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          onset_date?: string | null
          patient_id: string
          problem_name: string
          recorded_at?: string
          recorded_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: Database["public"]["Enums"]["patient_medical_entry_source"]
          updated_at?: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          icd10_code?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          onset_date?: string | null
          patient_id?: string
          problem_name?: string
          recorded_at?: string
          recorded_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: Database["public"]["Enums"]["patient_medical_entry_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_problem_list_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_problem_list_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_referrals: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          linked_appointment_id: string | null
          notes: string | null
          patient_id: string
          reason: string
          responded_at: string | null
          responded_by: string | null
          response_notes: string | null
          source_staff_id: string
          status: Database["public"]["Enums"]["referral_status"]
          target_clinic_id: string | null
          target_clinic_name: string | null
          target_doctor_name: string
          target_specialty: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          linked_appointment_id?: string | null
          notes?: string | null
          patient_id: string
          reason: string
          responded_at?: string | null
          responded_by?: string | null
          response_notes?: string | null
          source_staff_id: string
          status?: Database["public"]["Enums"]["referral_status"]
          target_clinic_id?: string | null
          target_clinic_name?: string | null
          target_doctor_name: string
          target_specialty?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          linked_appointment_id?: string | null
          notes?: string | null
          patient_id?: string
          reason?: string
          responded_at?: string | null
          responded_by?: string | null
          response_notes?: string | null
          source_staff_id?: string
          status?: Database["public"]["Enums"]["referral_status"]
          target_clinic_id?: string | null
          target_clinic_name?: string | null
          target_doctor_name?: string
          target_specialty?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_referrals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_referrals_linked_appointment_id_fkey"
            columns: ["linked_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_referrals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_referrals_source_staff_id_fkey"
            columns: ["source_staff_id"]
            isOneToOne: false
            referencedRelation: "clinic_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_referrals_target_clinic_id_fkey"
            columns: ["target_clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          consent_data_processing: boolean
          consent_data_processing_at: string | null
          consent_given_by: string | null
          consent_sms: boolean
          consent_sms_at: string | null
          created_at: string | null
          created_by: string | null
          data_retention_until: string | null
          display_name: string
          email_encrypted: string | null
          full_name_encrypted: string
          id: string
          is_anonymized: boolean
          is_claimed: boolean
          phone_number_encrypted: string
          phone_number_hash: string
          source: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          consent_data_processing?: boolean
          consent_data_processing_at?: string | null
          consent_given_by?: string | null
          consent_sms?: boolean
          consent_sms_at?: string | null
          created_at?: string | null
          created_by?: string | null
          data_retention_until?: string | null
          display_name: string
          email_encrypted?: string | null
          full_name_encrypted: string
          id?: string
          is_anonymized?: boolean
          is_claimed?: boolean
          phone_number_encrypted: string
          phone_number_hash: string
          source?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          consent_data_processing?: boolean
          consent_data_processing_at?: string | null
          consent_given_by?: string | null
          consent_sms?: boolean
          consent_sms_at?: string | null
          created_at?: string | null
          created_by?: string | null
          data_retention_until?: string | null
          display_name?: string
          email_encrypted?: string | null
          full_name_encrypted?: string
          id?: string
          is_anonymized?: boolean
          is_claimed?: boolean
          phone_number_encrypted?: string
          phone_number_hash?: string
          source?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          city: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          notification_preferences: Json | null
          phone_number: string
          preferred_language: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id: string
          notification_preferences?: Json | null
          phone_number: string
          preferred_language?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notification_preferences?: Json | null
          phone_number?: string
          preferred_language?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      queue_breaks: {
        Row: {
          clinic_id: string
          created_at: string
          duration_minutes: number
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          ends_at: string
          id: string
          pushed_schedule: boolean
          reason: string | null
          shifted_appointments_count: number
          staff_id: string
          started_at: string
          started_by: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          duration_minutes: number
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ends_at: string
          id?: string
          pushed_schedule?: boolean
          reason?: string | null
          shifted_appointments_count?: number
          staff_id: string
          started_at?: string
          started_by: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          duration_minutes?: number
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ends_at?: string
          id?: string
          pushed_schedule?: boolean
          reason?: string | null
          shifted_appointments_count?: number
          staff_id?: string
          started_at?: string
          started_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_breaks_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_breaks_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "clinic_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_overrides: {
        Row: {
          action_type: string
          affected_appointments: string[] | null
          appointment_id: string
          clinic_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          new_position: number | null
          new_state: Json | null
          performed_by: string
          previous_position: number | null
          previous_state: Json | null
          reason: string | null
          skipped_patient_ids: string[] | null
        }
        Insert: {
          action_type: string
          affected_appointments?: string[] | null
          appointment_id: string
          clinic_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_position?: number | null
          new_state?: Json | null
          performed_by: string
          previous_position?: number | null
          previous_state?: Json | null
          reason?: string | null
          skipped_patient_ids?: string[] | null
        }
        Update: {
          action_type?: string
          affected_appointments?: string[] | null
          appointment_id?: string
          clinic_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_position?: number | null
          new_state?: Json | null
          performed_by?: string
          previous_position?: number | null
          previous_state?: Json | null
          reason?: string | null
          skipped_patient_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_overrides_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_overrides_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_snapshots: {
        Row: {
          active_staff_count: number | null
          average_wait_time: number | null
          clinic_id: string
          created_at: string | null
          current_delay_minutes: number | null
          id: string
          longest_wait_time: number | null
          snapshot_date: string
          snapshot_time: string
          staff_utilization: number | null
          total_completed_today: number | null
          total_in_progress: number | null
          total_waiting: number | null
        }
        Insert: {
          active_staff_count?: number | null
          average_wait_time?: number | null
          clinic_id: string
          created_at?: string | null
          current_delay_minutes?: number | null
          id?: string
          longest_wait_time?: number | null
          snapshot_date: string
          snapshot_time: string
          staff_utilization?: number | null
          total_completed_today?: number | null
          total_in_progress?: number | null
          total_waiting?: number | null
        }
        Update: {
          active_staff_count?: number | null
          average_wait_time?: number | null
          clinic_id?: string
          created_at?: string | null
          current_delay_minutes?: number | null
          id?: string
          longest_wait_time?: number | null
          snapshot_date?: string
          snapshot_time?: string
          staff_utilization?: number | null
          total_completed_today?: number | null
          total_in_progress?: number | null
          total_waiting?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_snapshots_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          clinic_id: string
          created_at: string | null
          expires_at: string | null
          full_name: string
          id: string
          invitation_token: string
          invited_by: string
          phone_number: string
          role: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          clinic_id: string
          created_at?: string | null
          expires_at?: string | null
          full_name: string
          id?: string
          invitation_token: string
          invited_by: string
          phone_number: string
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          clinic_id?: string
          created_at?: string | null
          expires_at?: string | null
          full_name?: string
          id?: string
          invitation_token?: string
          invited_by?: string
          phone_number?: string
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_queue_assignments: {
        Row: {
          assigned_staff_id: string
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          assigned_staff_id: string
          clinic_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          assigned_staff_id?: string
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_queue_assignments_assigned_staff_fk"
            columns: ["clinic_id", "assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "clinic_staff"
            referencedColumns: ["clinic_id", "id"]
          },
          {
            foreignKeyName: "staff_queue_assignments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_queue_assignments_staff_fk"
            columns: ["clinic_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "clinic_staff"
            referencedColumns: ["clinic_id", "id"]
          },
        ]
      }
      user_roles: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_roles_clinic"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          clinic_id: string
          created_at: string | null
          id: string
          notes: string | null
          patient_id: string | null
          priority_score: number | null
          requested_date: string
          requested_time_range_end: string | null
          requested_time_range_start: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          priority_score?: number | null
          requested_date: string
          requested_time_range_end?: string | null
          requested_time_range_start?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          priority_score?: number | null
          requested_date?: string
          requested_time_range_end?: string | null
          requested_time_range_start?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      clinic_favorite_stats: {
        Row: {
          clinic_id: string | null
          total_favorites: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_favorites_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_rating_stats: {
        Row: {
          average_rating: number | null
          clinic_id: string | null
          five_star_count: number | null
          four_star_count: number | null
          one_star_count: number | null
          three_star_count: number | null
          total_ratings: number | null
          two_star_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_ratings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _appointment_belongs_to_auth_user: {
        Args: { p_patient_id: string; p_user_id?: string }
        Returns: boolean
      }
      _appointment_to_queue_json: {
        Args: { p_appointment_id: string }
        Returns: Json
      }
      _assert_super_admin_user: {
        Args: { p_user_id?: string }
        Returns: string
      }
      _clinic_staff_can_access_patient_allergies: {
        Args: { p_patient_id: string; p_user_id?: string }
        Returns: boolean
      }
      _clinic_staff_can_manage_patient_allergies: {
        Args: { p_patient_id: string; p_user_id?: string }
        Returns: boolean
      }
      _clinic_user_can_access_patient_medical_passport: {
        Args: {
          p_patient_id: string
          p_permission_key?: string
          p_user_id?: string
        }
        Returns: boolean
      }
      _default_appointment_duration: {
        Args: {
          p_appointment_type: Database["public"]["Enums"]["appointment_type"]
        }
        Returns: number
      }
      _default_clinic_role_permissions: {
        Args: { p_base_role: string }
        Returns: Json
      }
      _is_patient_owner: {
        Args: { p_patient_id: string; p_user_id?: string }
        Returns: boolean
      }
      _is_staff_provider_role: {
        Args: { p_clinic_id: string; p_role_key: string }
        Returns: boolean
      }
      _is_super_admin_user: { Args: { p_user_id?: string }; Returns: boolean }
      _medical_assert_authenticated: { Args: never; Returns: string }
      _medical_assert_service_role: { Args: never; Returns: undefined }
      _medical_insert_audit_log: {
        Args: {
          p_action: string
          p_changes?: Json
          p_clinic_id: string
          p_entity_id: string
          p_entity_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      _medical_is_clinic_owner: {
        Args: { p_clinic_id: string; p_user_id: string }
        Returns: boolean
      }
      _medical_normalize_scope: {
        Args: { p_default_appointment_id: string; p_scope: Json }
        Returns: Json
      }
      _medical_resolve_delivery_channel: {
        Args: { p_patient_id: string }
        Returns: {
          consent_sms: boolean
          delivery_channel: string
          patient_has_app: boolean
          recipient_contact: string
        }[]
      }
      _medical_scope_allows_appointment: {
        Args: {
          p_appointment_date: string
          p_appointment_id: string
          p_scope: Json
        }
        Returns: boolean
      }
      _resolve_audit_actor_user_id: { Args: never; Returns: string }
      _resolve_clinic_appointment_type_price: {
        Args: {
          p_appointment_type: Database["public"]["Enums"]["appointment_type"]
          p_clinic_id: string
        }
        Returns: number
      }
      _resolve_patient_record_id: {
        Args: { p_patient_or_user_id: string }
        Returns: string
      }
      _resolve_queue_scope_for_user: {
        Args: { p_clinic_id: string; p_user_id?: string }
        Returns: Json
      }
      _user_can_access_day_closure_scope: {
        Args: {
          p_clinic_id: string
          p_clinic_wide?: boolean
          p_staff_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      _user_can_manage_appointment_with_scope: {
        Args: { p_appointment_id: string; p_user_id?: string }
        Returns: boolean
      }
      _user_can_manage_clinic: {
        Args: { p_clinic_id: string; p_user_id?: string }
        Returns: boolean
      }
      _user_can_manage_target_queue_staff: {
        Args: { p_clinic_id: string; p_staff_id: string; p_user_id: string }
        Returns: boolean
      }
      _user_has_clinic_permission: {
        Args: {
          p_clinic_id: string
          p_permission_key: string
          p_user_id: string
        }
        Returns: boolean
      }
      anonymize_patient: { Args: { p_patient_id: string }; Returns: undefined }
      approve_medical_record_access: {
        Args: { p_duration_seconds: number; p_grant_id: string }
        Returns: Json
      }
      assign_resource_and_call_patient: {
        Args: {
          p_appointment_id: string
          p_performed_by?: string
          p_resource_id?: string
        }
        Returns: Json
      }
      calculate_priority_score: {
        Args: {
          p_appointment_type: Database["public"]["Enums"]["appointment_type"]
          p_is_emergency?: boolean
          p_is_walk_in: boolean
        }
        Returns: number
      }
      cancel_appointment: {
        Args: {
          p_appointment_id: string
          p_cancelled_by: string
          p_reason?: string
        }
        Returns: Json
      }
      cancel_referral: { Args: { p_referral_id: string }; Returns: boolean }
      check_active_grant_for_patient: {
        Args: { p_patient_id: string }
        Returns: Json
      }
      check_appointment_availability: {
        Args: {
          p_appointment_date: string
          p_clinic_id: string
          p_scheduled_time: string
          p_staff_id: string
        }
        Returns: Json
      }
      claim_medical_record_otp_for_delivery: {
        Args: { p_grant_id: string; p_requester_user_id: string }
        Returns: Json
      }
      claim_patient_account: {
        Args: { p_email?: string; p_phone_number?: string; p_user_id: string }
        Returns: string
      }
      create_appointment_for_mode: {
        Args: {
          p_appointment_date?: string
          p_appointment_type?: string
          p_clinic_id: string
          p_patient_id: string
          p_reason_for_visit?: string
          p_scheduled_time?: string
          p_staff_id: string
        }
        Returns: Json
      }
      create_appointment_with_validation: {
        Args: {
          p_appointment_date: string
          p_appointment_type: string
          p_clinic_id: string
          p_patient_id: string
          p_reason?: string
          p_scheduled_time: string
          p_staff_id: string
        }
        Returns: Json
      }
      create_clinic_resource: {
        Args: {
          p_capacity?: number
          p_clinic_id: string
          p_created_by?: string
          p_name: string
          p_notes?: string
          p_resource_type?: string
        }
        Returns: {
          capacity: number
          clinic_id: string
          created_at: string
          created_by: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          resource_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "clinic_resources"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_patient: {
        Args: {
          p_consent_data_processing?: boolean
          p_consent_given_by?: string
          p_consent_sms?: boolean
          p_created_by?: string
          p_email?: string
          p_full_name: string
          p_phone_number: string
          p_source?: string
          p_user_id?: string
        }
        Returns: string
      }
      create_patient_referral: {
        Args: {
          p_clinic_id: string
          p_linked_appointment_id?: string
          p_notes?: string
          p_patient_id: string
          p_reason: string
          p_source_staff_id: string
          p_target_clinic_id?: string
          p_target_clinic_name?: string
          p_target_doctor_name: string
          p_target_specialty?: string
        }
        Returns: string
      }
      create_queue_entry: {
        Args: {
          p_appointment_type?: string
          p_clinic_id: string
          p_end_time?: string
          p_guest_patient_id?: string
          p_is_guest?: boolean
          p_is_walk_in?: boolean
          p_patient_id?: string
          p_staff_id?: string
          p_start_time?: string
        }
        Returns: Json
      }
      decrypt_patient_pii: { Args: { ciphertext: string }; Returns: string }
      encrypt_patient_pii: { Args: { plaintext: string }; Returns: string }
      end_day_for_staff: {
        Args: {
          p_clinic_id: string
          p_closure_date: string
          p_notes?: string
          p_performed_by: string
          p_reason?: string
          p_staff_id: string
        }
        Returns: Json
      }
      end_queue_break: {
        Args: {
          p_clinic_id: string
          p_performed_by?: string
          p_reason?: string
          p_staff_id: string
        }
        Returns: Json
      }
      expire_stale_medical_record_grants: { Args: never; Returns: Json }
      finalize_medical_record_otp_delivery: {
        Args: { p_error?: string; p_otp_id: string; p_success: boolean }
        Returns: Json
      }
      find_patient_by_phone: {
        Args: { p_phone_number: string }
        Returns: {
          display_name: string
          full_name: string
          id: string
          is_claimed: boolean
          source: string
        }[]
      }
      generate_queue_status_token: {
        Args: { p_appointment_id: string }
        Returns: string
      }
      get_active_queue_break: {
        Args: { p_clinic_id: string; p_staff_id: string }
        Returns: Json
      }
      get_available_clinic_resources: {
        Args: { p_clinic_id: string }
        Returns: {
          capacity: number
          clinic_id: string
          display_order: number
          id: string
          is_active: boolean
          is_occupied: boolean
          name: string
          notes: string
          resource_type: string
        }[]
      }
      get_available_slots: {
        Args: {
          p_appointment_date: string
          p_appointment_type?: string
          p_clinic_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      get_available_slots_for_mode: {
        Args: {
          p_appointment_date: string
          p_appointment_type?: string
          p_clinic_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      get_clinic_realtime_metrics: {
        Args: { p_clinic_id: string }
        Returns: Json
      }
      get_clinic_revenue_kpis: { Args: { p_clinic_id: string }; Returns: Json }
      get_daily_schedule_for_clinic: {
        Args: { p_clinic_id: string; p_target_date: string }
        Returns: Json
      }
      get_daily_schedule_for_doctors: {
        Args: {
          p_clinic_id: string
          p_staff_ids: string[]
          p_target_date: string
        }
        Returns: Json
      }
      get_daily_schedule_for_staff: {
        Args: { p_staff_id: string; p_target_date: string }
        Returns: Json
      }
      get_day_closure_history: {
        Args: {
          p_clinic_id: string
          p_limit?: number
          p_offset?: number
          p_staff_id?: string
        }
        Returns: Json
      }
      get_day_closure_preview: {
        Args: {
          p_clinic_id: string
          p_closure_date: string
          p_staff_id: string
        }
        Returns: Json
      }
      get_doctor_activity_report: {
        Args: { p_clinic_id: string; p_from_date: string; p_to_date: string }
        Returns: {
          avg_duration_minutes: number
          cancelled_count: number
          completed_count: number
          doctor_name: string
          in_progress_count: number
          no_show_count: number
          specialization: string
          staff_id: string
          total_patients: number
        }[]
      }
      get_effective_queue_mode: {
        Args: { p_clinic_id: string; p_date: string }
        Returns: string
      }
      get_effective_queue_mode_for_staff: {
        Args: { p_clinic_id: string; p_date: string; p_staff_id: string }
        Returns: string
      }
      get_medical_record_delivery_contact_for_service: {
        Args: { p_patient_id: string }
        Returns: {
          consent_sms: boolean
          email: string
          phone_number: string
        }[]
      }
      get_my_active_shares: { Args: never; Returns: Json }
      get_my_medical_record_access_log: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_patient_decrypted: {
        Args: { p_patient_id: string }
        Returns: {
          consent_data_processing: boolean
          consent_sms: boolean
          created_at: string
          display_name: string
          email: string
          full_name: string
          id: string
          is_claimed: boolean
          phone_number: string
          source: string
          user_id: string
        }[]
      }
      get_patient_medical_passport: {
        Args: { p_patient_id: string }
        Returns: Json
      }
      get_patient_referrals: {
        Args: { p_clinic_id: string; p_patient_id: string }
        Returns: Json
      }
      get_public_queue_status: {
        Args: { p_queue_status_token: string }
        Returns: Json
      }
      get_queue_mode_for_date: {
        Args: { p_clinic_id: string; p_date: string }
        Returns: string
      }
      get_queue_mode_for_staff: {
        Args: { p_clinic_id: string; p_date: string; p_staff_id: string }
        Returns: string
      }
      get_shared_appointment_detail: {
        Args: { p_appointment_id: string; p_grant_id: string }
        Returns: Json
      }
      get_shared_appointment_history: {
        Args: { p_grant_id: string }
        Returns: Json
      }
      grant_super_admin_role: {
        Args: { p_target_user_id: string }
        Returns: Json
      }
      has_clinic_role: {
        Args: {
          _clinic_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
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
      hash_phone_number: { Args: { phone: string }; Returns: string }
      list_super_admin_users: {
        Args: never
        Returns: {
          clinic_scoped_role_count: number
          email: string
          first_granted_at: string
          full_name: string
          has_global_role: boolean
          user_id: string
        }[]
      }
      make_display_name: { Args: { full_name: string }; Returns: string }
      manually_assign_time_slot: {
        Args: {
          p_appointment_id: string
          p_assigned_by: string
          p_scheduled_time: string
        }
        Returns: Json
      }
      recalculate_queue_positions: {
        Args: { p_appointment_date: string; p_clinic_id: string }
        Returns: undefined
      }
      record_actual_wait_time: {
        Args: {
          p_actual_service_duration?: number
          p_actual_wait_time: number
          p_appointment_id: string
        }
        Returns: undefined
      }
      record_queue_snapshot: {
        Args: {
          p_active_staff_count?: number
          p_average_wait_time?: number
          p_clinic_id: string
          p_current_delay_minutes?: number
          p_longest_wait_time?: number
          p_snapshot_date: string
          p_snapshot_time: string
          p_staff_utilization?: number
          p_total_completed_today: number
          p_total_in_progress: number
          p_total_waiting: number
        }
        Returns: undefined
      }
      refresh_demo_queue: { Args: never; Returns: undefined }
      replace_staff_queue_assignments: {
        Args: { p_assigned_staff_ids?: string[]; p_staff_id: string }
        Returns: Json
      }
      request_medical_record_access:
        | {
            Args: {
              p_appointment_id: string
              p_clinic_id: string
              p_owner_override_reason?: string
              p_patient_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_appointment_id: string
              p_clinic_id: string
              p_owner_override_reason: string
              p_patient_id: string
              p_scope: Json
            }
            Returns: Json
          }
      resend_medical_record_otp: { Args: { p_grant_id: string }; Returns: Json }
      resolve_queue_scope_for_staff: {
        Args: { p_staff_id: string }
        Returns: Json
      }
      respond_to_referral: {
        Args: {
          p_new_status: Database["public"]["Enums"]["referral_status"]
          p_referral_id: string
          p_response_notes?: string
        }
        Returns: boolean
      }
      revoke_all_medical_record_access: { Args: never; Returns: Json }
      revoke_medical_record_access: {
        Args: { p_grant_id: string }
        Returns: Json
      }
      revoke_super_admin_role: {
        Args: { p_target_user_id: string }
        Returns: Json
      }
      revoke_walkin_access_with_token: {
        Args: { p_grant_id: string; p_stop_token: string }
        Returns: Json
      }
      search_super_admin_candidates: {
        Args: { p_limit?: number; p_query?: string }
        Returns: {
          email: string
          full_name: string
          is_super_admin: boolean
          phone_number: string
          user_id: string
        }[]
      }
      start_queue_break: {
        Args: {
          p_clinic_id: string
          p_duration_minutes?: number
          p_performed_by?: string
          p_push_schedule?: boolean
          p_reason?: string
          p_staff_id: string
        }
        Returns: Json
      }
      update_appointment_payment_status: {
        Args: {
          p_appointment_id: string
          p_billing_amount?: number
          p_currency?: string
          p_paid_at?: string
          p_payment_method?: string
          p_payment_status: Database["public"]["Enums"]["appointment_payment_status"]
        }
        Returns: Json
      }
      update_staff_doctor_overrides: {
        Args: {
          p_appointment_types_override?: Json
          p_daily_queue_modes_override?: Json
          p_staff_id: string
          p_working_hours?: Json
        }
        Returns: {
          appointment_types_override: Json | null
          average_consultation_duration: number | null
          clinic_id: string
          created_at: string | null
          daily_queue_modes_override: Json | null
          id: string
          is_active: boolean | null
          license_number: string | null
          patients_per_day_avg: number | null
          role: string
          specialization: string | null
          updated_at: string | null
          user_id: string
          working_hours: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "clinic_staff"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_medical_record_otp: {
        Args: { p_code: string; p_duration_seconds: number; p_grant_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "super_admin" | "clinic_owner" | "staff" | "patient"
      appointment_payment_status:
        | "unpaid"
        | "paid"
        | "partially_paid"
        | "refunded"
        | "waived"
      appointment_status:
        | "scheduled"
        | "waiting"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled"
      appointment_type:
        | "consultation"
        | "follow_up"
        | "emergency"
        | "procedure"
        | "vaccination"
        | "screening"
      notification_channel: "sms" | "whatsapp" | "email" | "push"
      notification_status: "pending" | "sent" | "delivered" | "failed"
      notification_type:
        | "appointment_confirmed"
        | "position_update"
        | "almost_your_turn"
        | "your_turn"
        | "appointment_delayed"
        | "appointment_cancelled"
        | "patient_absent"
        | "grace_period_ending"
      patient_allergy_severity: "mild" | "moderate" | "severe" | "unknown"
      patient_allergy_source: "patient" | "clinician"
      patient_medical_entry_source: "patient" | "clinician"
      practice_type: "solo_practice" | "group_clinic" | "hospital"
      referral_status:
        | "pending"
        | "accepted"
        | "declined"
        | "completed"
        | "cancelled"
      skip_reason_type:
        | "patient_absent"
        | "patient_present"
        | "emergency_case"
        | "doctor_preference"
        | "late_arrival"
        | "technical_issue"
        | "other"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["super_admin", "clinic_owner", "staff", "patient"],
      appointment_payment_status: [
        "unpaid",
        "paid",
        "partially_paid",
        "refunded",
        "waived",
      ],
      appointment_status: [
        "scheduled",
        "waiting",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "rescheduled",
      ],
      appointment_type: [
        "consultation",
        "follow_up",
        "emergency",
        "procedure",
        "vaccination",
        "screening",
      ],
      notification_channel: ["sms", "whatsapp", "email", "push"],
      notification_status: ["pending", "sent", "delivered", "failed"],
      notification_type: [
        "appointment_confirmed",
        "position_update",
        "almost_your_turn",
        "your_turn",
        "appointment_delayed",
        "appointment_cancelled",
        "patient_absent",
        "grace_period_ending",
      ],
      patient_allergy_severity: ["mild", "moderate", "severe", "unknown"],
      patient_allergy_source: ["patient", "clinician"],
      patient_medical_entry_source: ["patient", "clinician"],
      practice_type: ["solo_practice", "group_clinic", "hospital"],
      referral_status: [
        "pending",
        "accepted",
        "declined",
        "completed",
        "cancelled",
      ],
      skip_reason_type: [
        "patient_absent",
        "patient_present",
        "emergency_case",
        "doctor_preference",
        "late_arrival",
        "technical_issue",
        "other",
      ],
    },
  },
} as const

