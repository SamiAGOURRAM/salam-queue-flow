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
          booked_by: string | null
          booking_method: string | null
          cancellation_reason: string | null
          checked_in_at: string | null
          clinic_id: string
          created_at: string | null
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
          patient_id: string
          predicted_start_time: string | null
          predicted_wait_time: number | null
          prediction_confidence: number | null
          priority_score: number | null
          promoted_from_waitlist: boolean | null
          queue_position: number | null
          reason_for_visit: string | null
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
          booked_by?: string | null
          booking_method?: string | null
          cancellation_reason?: string | null
          checked_in_at?: string | null
          clinic_id: string
          created_at?: string | null
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
          patient_id: string
          predicted_start_time?: string | null
          predicted_wait_time?: number | null
          prediction_confidence?: number | null
          priority_score?: number | null
          promoted_from_waitlist?: boolean | null
          queue_position?: number | null
          reason_for_visit?: string | null
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
          booked_by?: string | null
          booking_method?: string | null
          cancellation_reason?: string | null
          checked_in_at?: string | null
          clinic_id?: string
          created_at?: string | null
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
          patient_id?: string
          predicted_start_time?: string | null
          predicted_wait_time?: number | null
          prediction_confidence?: number | null
          priority_score?: number | null
          promoted_from_waitlist?: boolean | null
          queue_position?: number | null
          reason_for_visit?: string | null
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
      clinic_staff: {
        Row: {
          average_consultation_duration: number | null
          clinic_id: string
          created_at: string | null
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
          average_consultation_duration?: number | null
          clinic_id: string
          created_at?: string | null
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
          average_consultation_duration?: number | null
          clinic_id?: string
          created_at?: string | null
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
      _appointment_to_queue_json: {
        Args: { p_appointment_id: string }
        Returns: Json
      }
      _default_appointment_duration: {
        Args: {
          p_appointment_type: Database["public"]["Enums"]["appointment_type"]
        }
        Returns: number
      }
      _resolve_patient_record_id: {
        Args: { p_patient_or_user_id: string }
        Returns: string
      }
      _user_can_manage_clinic: {
        Args: { p_clinic_id: string; p_user_id?: string }
        Returns: boolean
      }
      anonymize_patient: { Args: { p_patient_id: string }; Returns: undefined }
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
      check_appointment_availability: {
        Args: {
          p_appointment_date: string
          p_clinic_id: string
          p_scheduled_time: string
          p_staff_id: string
        }
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
      create_queue_entry: {
        Args: {
          p_appointment_type?: string
          p_clinic_id: string
          p_end_time?: string
          p_guest_patient_id?: string
          p_is_guest?: boolean
          p_is_walk_in?: boolean
          p_patient_id?: string
          p_staff_id: string
          p_start_time?: string
        }
        Returns: Json
      }
      decrypt_patient_pii: { Args: { ciphertext: string }; Returns: string }
      encrypt_patient_pii: { Args: { plaintext: string }; Returns: string }
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
      get_daily_schedule_for_clinic: {
        Args: { p_clinic_id: string; p_target_date: string }
        Returns: Json
      }
      get_daily_schedule_for_staff: {
        Args: { p_staff_id: string; p_target_date: string }
        Returns: Json
      }
      get_effective_queue_mode: {
        Args: { p_clinic_id: string; p_date: string }
        Returns: string
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
      get_queue_mode_for_date: {
        Args: { p_clinic_id: string; p_date: string }
        Returns: string
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
    }
    Enums: {
      app_role: "super_admin" | "clinic_owner" | "staff" | "patient"
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
      practice_type: "solo_practice" | "group_clinic" | "hospital"
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
      ],
      practice_type: ["solo_practice", "group_clinic", "hospital"],
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

export type PatientFavorite = Tables<"patient_favorites">
export type ClinicRating = Tables<"clinic_ratings">
export type ClinicRatingStats = Tables<"clinic_rating_stats">

