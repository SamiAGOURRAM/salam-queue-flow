import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { templateService } from '@/services/medical-records';

const clinicId = import.meta.env.VITE_SMOKE_TEMPLATES_CLINIC_ID || '00000000-0000-0000-0000-00000000f201';
const ownerEmail =
  import.meta.env.VITE_SMOKE_TEMPLATES_OWNER_EMAIL || 'smoke.owner.templates+local@queuemed.test';
const ownerPassword = import.meta.env.VITE_SMOKE_TEMPLATES_OWNER_PASSWORD || 'SmokeTemplatesOwner#123';
const ownerPhone = import.meta.env.VITE_SMOKE_TEMPLATES_OWNER_PHONE || '+212600009401';

let ownerUserId = '';

const RICH_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Template smoke test content.' }],
    },
  ],
};

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

describe('Template Service Integration Smoke', () => {
  beforeAll(async () => {
    await supabase.auth.signOut();

    ownerUserId = await signUpAndEnsureSession({
      email: ownerEmail,
      password: ownerPassword,
      fullName: 'Templates Smoke Owner',
      phoneNumber: ownerPhone,
    });

    const clinicInsert = await supabase.from('clinics').insert({
      id: clinicId,
      owner_id: ownerUserId,
      name: 'Templates Smoke Clinic',
      specialty: 'general_medicine',
      address: '7 Integration Ave',
      city: 'Casablanca',
      phone: '+212500009401',
      queue_mode: 'fluid',
      settings: {
        day_start: '09:00',
        day_end: '13:00',
      },
    });

    if (clinicInsert.error) {
      throw new Error(`Clinic setup failed: ${clinicInsert.error.message}`);
    }

    const roleInsert = await supabase.from('user_roles').insert({
      user_id: ownerUserId,
      role: 'clinic_owner',
      clinic_id: clinicId,
    });

    if (roleInsert.error) {
      throw new Error(`User role setup failed: ${roleInsert.error.message}`);
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
  }, 120000);

  afterAll(async () => {
    await supabase.auth.signOut();
  });

  it('creates, updates, uses, and soft-deletes templates against local Supabase', async () => {
    const signedInUserId = await signInWithPassword(ownerEmail, ownerPassword);
    expect(signedInUserId).toBe(ownerUserId);

    const uniquePrefix = `templates-smoke-${Date.now()}`;

    const clinicTemplate = await templateService.createTemplate({
      createdBy: ownerUserId,
      clinicId,
      scope: 'clinic',
      templateType: 'consultation_note',
      title: `${uniquePrefix}-clinic`,
      description: 'Clinic template created by integration smoke test.',
      tags: ['smoke', 'clinic'],
      content: RICH_CONTENT,
    });

    expect(clinicTemplate.scope).toBe('clinic');
    expect(clinicTemplate.clinicId).toBe(clinicId);

    const personalTemplate = await templateService.createTemplate({
      createdBy: ownerUserId,
      scope: 'personal',
      templateType: 'consultation_note',
      title: `${uniquePrefix}-personal`,
      description: 'Personal template created by integration smoke test.',
      tags: ['smoke', 'personal'],
      content: RICH_CONTENT,
    });

    expect(personalTemplate.scope).toBe('personal');

    const scopedFallbackTemplate = await templateService.createTemplate({
      createdBy: ownerUserId,
      scope: 'clinic',
      templateType: 'consultation_note',
      title: `${uniquePrefix}-scope-fallback`,
      description: 'Scope fallback behavior check.',
      tags: ['smoke', 'fallback'],
      content: RICH_CONTENT,
    });

    expect(scopedFallbackTemplate.scope).toBe('personal');
    expect(scopedFallbackTemplate.clinicId).toBeUndefined();

    const initialSearch = await templateService.searchTemplates({
      clinicId,
      userId: ownerUserId,
      templateType: 'consultation_note',
      query: uniquePrefix,
      limit: 20,
    });

    const initialIds = new Set(initialSearch.map((item) => item.id));
    expect(initialIds.has(clinicTemplate.id)).toBe(true);
    expect(initialIds.has(personalTemplate.id)).toBe(true);
    expect(initialIds.has(scopedFallbackTemplate.id)).toBe(true);

    const updatedClinicTemplate = await templateService.updateTemplate(clinicTemplate.id, {
      clinicId,
      scope: 'clinic',
      title: `${uniquePrefix}-clinic-updated`,
      description: 'Updated by integration smoke test.',
      tags: ['smoke', 'updated'],
      content: RICH_CONTENT,
    });

    expect(updatedClinicTemplate.title).toBe(`${uniquePrefix}-clinic-updated`);

    await templateService.markTemplateUsed(clinicTemplate.id);

    const afterUseSearch = await templateService.searchTemplates({
      clinicId,
      userId: ownerUserId,
      templateType: 'consultation_note',
      query: `${uniquePrefix}-clinic-updated`,
      limit: 10,
    });

    const usedTemplate = afterUseSearch.find((item) => item.id === clinicTemplate.id);
    expect(usedTemplate).toBeDefined();
    expect((usedTemplate?.usageCount || 0) >= 1).toBe(true);

    await templateService.deleteTemplate(clinicTemplate.id);

    const afterDeleteSearch = await templateService.searchTemplates({
      clinicId,
      userId: ownerUserId,
      templateType: 'consultation_note',
      query: `${uniquePrefix}-clinic-updated`,
      limit: 10,
    });

    expect(afterDeleteSearch.some((item) => item.id === clinicTemplate.id)).toBe(false);

    await templateService.deleteTemplate(personalTemplate.id);
    await templateService.deleteTemplate(scopedFallbackTemplate.id);
  }, 120000);
});
