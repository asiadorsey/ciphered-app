export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          role: 'PA' | 'PC';
          phone: string | null;
          notes: string | null;
          project_code: string | null;
          production_id: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          email: string;
          name: string;
          role: 'PA' | 'PC';
          phone?: string | null;
          notes?: string | null;
          project_code?: string | null;
          production_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          role?: 'PA' | 'PC';
          phone?: string | null;
          notes?: string | null;
          project_code?: string | null;
          production_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      availability: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          status: 'unavailable' | 'available' | 'preferred';
          pa_note: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          status: 'unavailable' | 'available' | 'preferred';
          pa_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          status?: 'unavailable' | 'available' | 'preferred';
          pa_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      shifts: {
        Row: {
          id: string;
          date: string;
          assigned_pa_id: string;
          assigned_by_id: string;
          call_time: string | null;
          wrap_time: string | null;
          confirmation_status: 'pending' | 'confirmed' | 'declined';
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          date: string;
          assigned_pa_id: string;
          assigned_by_id: string;
          call_time?: string | null;
          wrap_time?: string | null;
          confirmation_status?: 'pending' | 'confirmed' | 'declined';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assigned_pa_id?: string;
          assigned_by_id?: string;
          date?: string;
          call_time?: string | null;
          wrap_time?: string | null;
          confirmation_status?: 'pending' | 'confirmed' | 'declined';
          created_at?: string;
          updated_at?: string;
        };
      };
      productions: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          created_by: string;
          start_date: string | null;
          end_date: string | null;
          is_active: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code: string;
          created_by: string;
          start_date?: string | null;
          end_date?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_by?: string;
          start_date?: string | null;
          end_date?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};

