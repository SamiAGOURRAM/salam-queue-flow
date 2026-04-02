import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BookingService } from '@/services/booking/BookingService';
import { QueueRepository } from '@/services/queue/repositories/QueueRepository';
import { supabase } from '@/integrations/supabase/client';

const clinicId = import.meta.env.VITE_SMOKE_CLINIC_ID || '00000000-0000-0000-0000-00000000f101';
const ownerEmail = import.meta.env.VITE_SMOKE_OWNER_EMAIL || 'smoke.owner.webflow+local@queuemed.test';
const ownerPassword = import.meta.env.VITE_SMOKE_OWNER_PASSWORD || 'SmokeOwner#123';
const ownerPhone = import.meta.env.VITE_SMOKE_OWNER_PHONE || '+212600009101';
const patientEmail = import.meta.env.VITE_SMOKE_PATIENT_EMAIL || 'smoke.patient.webflow+local@queuemed.test';
const patientPassword = import.meta.env.VITE_SMOKE_PATIENT_PASSWORD || 'SmokePatient#123';
const patientPhone = import.meta.env.VITE_SMOKE_PATIENT_PHONE || '+212600009201';
const staffEmail = import.meta.env.VITE_SMOKE_STAFF_EMAIL || 'smoke.staff.webflow+local@queuemed.test';
const staffPassword = import.meta.env.VITE_SMOKE_STAFF_PASSWORD || 'SmokeStaff#123';
const staffPhone = import.meta.env.VITE_SMOKE_STAFF_PHONE || '+212600009301';

let ownerUserId = '';
let patientUserId = '';
let staffUserId = '';
let appointmentId = '';
let appointmentDate = '';

function getFutureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

async function signUpAndEnsureSession(input: {
  email: string;
  password: string;
  fullName: string;
  phoneNumber: string;
}): Promise<string> {
  const signUp = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
        phone_number: input.phoneNumber,
      },
    },
  });

  if (signUp.error) {
    throw new Error(`Sign up failed for ${input.email}: ${signUp.error.message}`);
  }

  const signedUpUserId = signUp.data.user?.id;
  if (!signedUpUserId) {
    throw new Error(`No user returned during sign up for ${input.email}`);
  }

  if (signUp.data.session) {
    return signedUpUserId;
  }

  const signIn = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (signIn.error || !signIn.data.user) {
    throw new Error(`Sign in failed for ${input.email}: ${signIn.error?.message || 'unknown error'}`);
  }

  return signIn.data.user.id;
}

async function signInWithPassword(email: string, password: string): Promise<string> {
  const signIn = await supabase.auth.signInWithPassword({ email, password });

  if (signIn.error || !signIn.data.user) {
    throw new Error(`Sign in failed for ${email}: ${signIn.error?.message || 'unknown error'}`);
  }

  return signIn.data.user.id;
}

describe('Web Booking Flow Integration Smoke', () => {
  beforeAll(async () => {
    appointmentDate = getFutureDate(7);
    await supabase.auth.signOut();

    ownerUserId = await signUpAndEnsureSession({
      email: ownerEmail,
      password: ownerPassword,
      fullName: 'Smoke Owner',
      phoneNumber: ownerPhone,
    });

    const clinicInsert = await supabase.from('clinics').insert({
      id: clinicId,
      owner_id: ownerUserId,
      name: 'Smoke Web Booking Clinic',
      specialty: 'general_medicine',
      address: '2 Integration Ave',
      city: 'Casablanca',
      phone: '+212500009101',
      queue_mode: 'slotted',
      settings: {
        day_start: '09:00',
        day_end: '12:00',
        slot_interval_minutes: 15,
        slot_capacity: 1,
      },
    });

    if (clinicInsert.error) {
      throw new Error(`Clinic setup failed: ${clinicInsert.error.message}`);
    }

    const staffInsert = await supabase.from('clinic_staff').insert({
      clinic_id: clinicId,
      user_id: ownerUserId,
      role: 'doctor',
      is_active: true,
    });

    if (staffInsert.error) {
      throw new Error(`Clinic staff setup failed: ${staffInsert.error.message}`);
    }

    await supabase.auth.signOut();

    patientUserId = await signUpAndEnsureSession({
      email: patientEmail,
      password: patientPassword,
      fullName: 'Smoke Patient',
      phoneNumber: patientPhone,
    });
  }, 120000);

  afterAll(async () => {
    await supabase.auth.signOut();
  });

  it('creates owner and patient accounts', async () => {
    expect(ownerUserId).toMatch(/[0-9a-f-]{36}/i);
    expect(patientUserId).toMatch(/[0-9a-f-]{36}/i);
    expect(ownerUserId).not.toBe(patientUserId);
  });

  it('finds clinic via canonical clinics query path', async () => {
    const { data, error } = await supabase
      .from('clinics')
      .select('id, name, city, specialty')
      .eq('is_active', true)
      .or('name.ilike.%Smoke%,specialty.ilike.%general_medicine%,city.ilike.%Casablanca%')
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Clinic search query failed: ${error.message}`);
    }

    expect(Array.isArray(data)).toBe(true);
    expect((data || []).some((clinic) => clinic.id === clinicId)).toBe(true);
  });

  it('books and cancels via web services against local Supabase', async () => {
    const bookingService = new BookingService();

    const slots = await bookingService.getAvailableSlotsForMode(
      clinicId,
      appointmentDate,
      'consultation'
    );

    expect(slots.available).toBe(true);
    expect(Array.isArray(slots.slots)).toBe(true);

    const firstAvailableSlot = slots.slots.find((slot) => slot.available);
    expect(firstAvailableSlot).toBeDefined();

    const bookingResult = await bookingService.bookAppointmentForMode({
      clinicId,
      patientId: patientUserId,
      appointmentDate,
      scheduledTime: firstAvailableSlot?.time || null,
      appointmentType: 'consultation',
      reasonForVisit: 'smoke_web_flow',
    });

    expect(bookingResult.success).toBe(true);
    expect(bookingResult.appointmentId).toBeTruthy();

    appointmentId = bookingResult.appointmentId!;

    const queueRepository = new QueueRepository();
    const cancelled = await queueRepository.cancelAppointmentViaRpc(
      appointmentId,
      patientUserId,
      'smoke_web_flow_cancel'
    );

    expect(cancelled.id).toBe(appointmentId);
    expect(cancelled.status).toBe('cancelled');
  }, 120000);

  it('supports clinic listing and staff invitation role assignment workflow', async () => {
    await supabase.auth.signOut();
    await signInWithPassword(ownerEmail, ownerPassword);

    const invitationToken = `smoke-invite-${Date.now()}`;
    const invitationInsert = await supabase
      .from('staff_invitations')
      .insert({
        clinic_id: clinicId,
        invited_by: ownerUserId,
        full_name: 'Smoke Staff',
        phone_number: staffPhone,
        role: 'receptionist',
        invitation_token: invitationToken,
        status: 'pending',
      })
      .select('id, status')
      .single();

    if (invitationInsert.error || !invitationInsert.data) {
      throw new Error(`Staff invitation setup failed: ${invitationInsert.error?.message || 'unknown error'}`);
    }

    await supabase.auth.signOut();

    staffUserId = await signUpAndEnsureSession({
      email: staffEmail,
      password: staffPassword,
      fullName: 'Smoke Staff',
      phoneNumber: staffPhone,
    });

    await supabase.auth.signOut();
    await signInWithPassword(ownerEmail, ownerPassword);

    const invitationAccept = await supabase
      .from('staff_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitationInsert.data.id)
      .select('id, status')
      .single();

    if (invitationAccept.error || !invitationAccept.data) {
      throw new Error(`Invitation acceptance failed: ${invitationAccept.error?.message || 'unknown error'}`);
    }

    const roleInsert = await supabase
      .from('user_roles')
      .insert({
        user_id: staffUserId,
        role: 'staff',
        clinic_id: clinicId,
      });

    if (roleInsert.error) {
      throw new Error(`Staff role assignment failed: ${roleInsert.error.message}`);
    }

    const staffInsert = await supabase
      .from('clinic_staff')
      .insert({
        clinic_id: clinicId,
        user_id: staffUserId,
        role: 'receptionist',
        is_active: true,
      });

    if (staffInsert.error) {
      throw new Error(`Clinic staff assignment failed: ${staffInsert.error.message}`);
    }

    const listedClinic = await supabase
      .from('clinics')
      .select('id')
      .eq('id', clinicId)
      .eq('is_active', true)
      .single();

    if (listedClinic.error || !listedClinic.data) {
      throw new Error(`Clinic listing verification failed: ${listedClinic.error?.message || 'unknown error'}`);
    }

    await supabase.auth.signOut();
    await signInWithPassword(staffEmail, staffPassword);

    const staffRoles = await supabase
      .from('user_roles')
      .select('role, clinic_id')
      .eq('user_id', staffUserId)
      .eq('clinic_id', clinicId)
      .eq('role', 'staff');

    if (staffRoles.error) {
      throw new Error(`Staff role verification failed: ${staffRoles.error.message}`);
    }

    expect((staffRoles.data || []).length).toBeGreaterThan(0);
  }, 120000);
});
