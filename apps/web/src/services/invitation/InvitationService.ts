/**
 * Invitation Service
 * Handles all staff invitation-related operations
 * Uses repository pattern - NO direct Supabase client usage
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, ValidationError, DatabaseError } from '../shared/errors';

export interface Invitation {
  id: string;
  clinicId: string;
  fullName: string;
  email?: string;
  phoneNumber?: string;
  role: string;
  status: string;
  invitationToken: string;
  expiresAt: Date;
  acceptedAt?: Date;
  invitedBy: string;
  createdAt: Date;
  updatedAt: Date;
  clinic?: {
    name: string;
    specialty: string;
  };
}

export interface InvitationRow {
  id: string;
  clinic_id: string;
  full_name: string;
  email?: string | null;
  phone_number?: string | null;
  role: string;
  status: string;
  invitation_token: string;
  expires_at: string;
  accepted_at?: string | null;
  invited_by: string;
  created_at: string;
  updated_at: string;
  clinics?: {
    name: string;
    specialty: string;
  } | null;
}

export class InvitationService {
  /**
   * Get invitation by token
   */
  async getInvitationByToken(token: string): Promise<Invitation> {
    try {
      logger.debug('Fetching invitation by token', { token });

      const { data, error } = await supabase
        .from('staff_invitations')
        .select(`
          *,
          clinics (
            name,
            specialty
          )
        `)
        .eq('invitation_token', token)
        .eq('status', 'pending')
        .single();

      if (error || !data) {
        logger.error('Invitation not found or already used', error, { token });
        throw new NotFoundError('Invitation not found or already used');
      }

      const invitation = data as InvitationRow;

      // Check if expired
      if (new Date(invitation.expires_at) < new Date()) {
        throw new ValidationError('This invitation has expired');
      }

      return this.mapInvitation(invitation);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) throw error;
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching invitation', error as Error, { token });
      throw new DatabaseError('Unexpected error fetching invitation', error as Error);
    }
  }

  /**
   * Update invitation status
   */
  async updateInvitationStatus(invitationId: string, status: string, acceptedAt?: Date): Promise<Invitation> {
    try {
      logger.debug('Updating invitation status', { invitationId, status });

      const updateData: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (acceptedAt) {
        updateData.accepted_at = acceptedAt.toISOString();
      }

      const { data, error } = await supabase
        .from('staff_invitations')
        .update(updateData)
        .eq('id', invitationId)
        .select(`
          *,
          clinics (
            name,
            specialty
          )
        `)
        .single();

      if (error || !data) {
        logger.error('Failed to update invitation', error, { invitationId, status });
        throw new DatabaseError('Failed to update invitation', error);
      }

      logger.info('Invitation status updated', { invitationId, status });
      return this.mapInvitation(data as InvitationRow);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating invitation', error as Error, { invitationId, status });
      throw new DatabaseError('Unexpected error updating invitation', error as Error);
    }
  }

  /**
   * Map database row to Invitation object
   */
  private mapInvitation(row: InvitationRow): Invitation {
    return {
      id: row.id,
      clinicId: row.clinic_id,
      fullName: row.full_name,
      email: row.email || undefined,
      phoneNumber: row.phone_number || undefined,
      role: row.role,
      status: row.status,
      invitationToken: row.invitation_token,
      expiresAt: new Date(row.expires_at),
      acceptedAt: row.accepted_at ? new Date(row.accepted_at) : undefined,
      invitedBy: row.invited_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      clinic: row.clinics || undefined,
    };
  }
}

export const invitationService = new InvitationService();

