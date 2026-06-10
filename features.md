Feature Completeness Audit
                                                                                                  
  Based on what's shipped vs the codebase structure, here's the honest gap list — grouped by your   focus areas.                                                                                    
                                                                                                    ---                                                                                             
  1. Calling Next / Queue Flow                                                                                                                                                                      
  Shipped:                                                                                          - handleNextPatient → resolveNextPatientCandidate → strategy selects → callNextPatient RPC path   - Resource assignment at call-time (ResourceAssignmentDialog)                                     - Non-present patient handling (nonPresentDialog), skip-absent flow                             
  - Grace period + no-show detector with dedup
  - Concurrent-modification guard (verifies status transitioned to IN_PROGRESS)
  - Manual overrides (swap, priority boost) with rollback
  - Gap filling (GapManagerService), waitlist offers, public queue status tokens

  Gaps / Missing:

  ┌─────┬─────────────────────────────────────────────────────────────────────────────┬────────┐  
  │  #  │                                     Gap                                     │ Impact │  
  ├─────┼─────────────────────────────────────────────────────────────────────────────┼────────┤  
  │     │ No "Recall" button. Once called, if patient doesn't walk in, there's no     │        │  
  │ 1   │ single-click "recall/ping again" flow — only mark absent. Doctors in real   │ High   │  
  │     │ clinics expect to re-announce.                                              │        │  
  ├─────┼─────────────────────────────────────────────────────────────────────────────┼────────┤  
  │ 2   │ No "Pause queue" / "On break" mode. A doctor can't signal "I'm on a 15-min  │ High   │  
  │     │ break, push everyone back" — no queue-level pause state.                    │        │  
  ├─────┼─────────────────────────────────────────────────────────────────────────────┼────────┤  
  │     │ No "Hold patient" state. Patient called in, but needs lab/x-ray first →     │        │  
  │ 3   │ should go into a "parked" state, not complete/absent. Only in/out binary    │ High   │  
  │     │ exists.                                                                     │        │  
  ├─────┼─────────────────────────────────────────────────────────────────────────────┼────────┤  
  │     │ Walk-in insertion UX missing priority override. Walk-ins go to end by       │        │  
  │ 4   │ default — no "urgent walk-in, insert at position 2" in the UI (backend      │ Medium │  
  │     │ supports priority score).                                                   │        │  
  ├─────┼─────────────────────────────────────────────────────────────────────────────┼────────┤  
  │ 5   │ No "next 3 patients" prep view for the doctor. Doctor side only shows the   │ Medium │  
  │     │ current patient, not what's coming. Real clinics need this for chart prep.  │        │  
  ├─────┼─────────────────────────────────────────────────────────────────────────────┼────────┤  
  │ 6   │ No handleCallSpecific path. You can only call "next" — no "call patient X   │ Medium │  
  │     │ out of order" button for returning from lab results, etc.                   │        │  
  ├─────┼─────────────────────────────────────────────────────────────────────────────┼────────┤  
  │ 7   │ Gap manager early-bird promotion has no confirmation UI. Silent reordering  │ Low    │  
  │     │ can confuse the doctor.                                                     │        │  
  └─────┴─────────────────────────────────────────────────────────────────────────────┴────────┘  

  ---
  2. Queue Modes

  Shipped: Slotted + Fluid strategies via factory, per-clinic queue_mode, per-date override       
  support (get_effective_queue_mode).

  Gaps:

  ┌─────┬─────────────────────────────────────────────────────────────────────────────┬────────┐  
  │  #  │                                     Gap                                     │ Impact │  
  ├─────┼─────────────────────────────────────────────────────────────────────────────┼────────┤  
  │     │ No "Hybrid" mode documented in strategies. Code says "merged fixed to       │        │  
  │ 8   │ slotted" in migrations but there's no explicit hybrid (slots + overflow     │ Medium │  
  │     │ lane). If a clinic wants AM-slotted + PM-walk-in, not supported.            │        │  
  ├─────┼─────────────────────────────────────────────────────────────────────────────┼────────┤  
  │ 9   │ No per-doctor mode override. Clinic-level only. In a multi-doctor clinic,   │ High   │  
  │     │ GP might want fluid while the specialist wants slotted.                     │        │  
  ├─────┼─────────────────────────────────────────────────────────────────────────────┼────────┤  
  │ 10  │ No mode preview/simulator. Switching mode mid-day has unpredictable effects │ Low    │  
  │     │  and no dry-run.                                                            │        │  
  └─────┴─────────────────────────────────────────────────────────────────────────────┴────────┘  

  ---
  3. Doctor Reporting / Analytics

  Status: Largely missing.

  - AnalyticsRepository exists but there is no /clinic/analytics or /clinic/reports route in      
  App.tsx.
  - No per-doctor performance view (consultations/day, avg duration, no-show rate).
  - No end-of-day report generation.
  - No export (PDF/CSV) of daily activity.
  - No revenue/billing dashboard at all.

  ┌─────┬────────────────────────────────────────────────────────────┬────────────────────────┐   
  │  #  │                            Gap                             │         Impact         │   
  ├─────┼────────────────────────────────────────────────────────────┼────────────────────────┤   
  │     │ No doctor activity report. Owner can't see "Dr. X saw 24   │ Critical — this is a   │   
  │ 11  │ patients today, avg 12 min, 2 no-shows".                   │ core product ask for   │   
  │     │                                                            │ clinic owners          │   
  ├─────┼────────────────────────────────────────────────────────────┼────────────────────────┤   
  │ 12  │ No clinic-wide KPIs dashboard. Dashboard exists but it's a │ High                   │   
  │     │  landing, not a metrics view.                              │                        │   
  ├─────┼────────────────────────────────────────────────────────────┼────────────────────────┤   
  │ 13  │ No end-of-day summary. EndDayConfirmationDialog closes the │ High                   │   
  │     │  day but produces no report.                               │                        │   
  ├─────┼────────────────────────────────────────────────────────────┼────────────────────────┤   
  │     │ No historical trend charts.                                │                        │   
  │ 14  │ record_queue_snapshot/record_wait_time collect data but    │ High                   │   
  │     │ nothing consumes it.                                       │                        │   
  ├─────┼────────────────────────────────────────────────────────────┼────────────────────────┤   
  │ 15  │ No billing/revenue tracking — no price field on            │ Critical if you want   │   
  │     │ appointments, no payment status.                           │ BNPL later             │   
  ├─────┼────────────────────────────────────────────────────────────┼────────────────────────┤   
  │ 16  │ No referral tracking. Doctor referring to specialist isn't │ Medium                 │   
  │     │  modeled.                                                  │                        │   
  └─────┴────────────────────────────────────────────────────────────┴────────────────────────┘   

  ---
  4. Role Enforcement

  Shipped:
  - ClinicPermissionRoute wraps every clinic route with requiredPermissions /
  requiredAnyPermissions
  - useClinicPermissions resolves role → ClinicRolePermissions → can()/canAll() helpers
  - 13 permission keys (view/manage × dashboard, queue, calendar, appointments, patients, team,   
  settings, roles)
  - Custom role definitions via clinics.settings.role_definitions
  - System roles: staff, doctor, clinic_owner (implicit)
  - DB RLS uses _user_can_manage_clinic (role ∈ owner/super_admin/staff)
  - Queue scope layer (useQueueScope, staff_queue_assignments) for receptionist-to-doctor
  restrictions

  Gaps:

  #: 17
  Gap: Frontend permissions ≠ DB RLS. can('manage_queue') is client-side gating. RLS on
  appointment
    tables typically uses _user_can_manage_clinic which accepts ALL staff. A staff member with    
    manage_queue: false in their custom role can still call the DB directly and mutate.
  Permissions
     are UI-only, not enforced server-side.
  Impact: Critical
  ────────────────────────────────────────
  #: 18
  Gap: No view_medical_records / manage_medical_records permission. Consultation tab (diagnoses,  
    prescriptions) has no permission gate — anyone with view_patients can write medical notes. A  
    receptionist could technically access it if routed.
  Impact: Critical
  ────────────────────────────────────────
  #: 19
  Gap: No view_analytics / manage_billing permissions. Even when built, no granularity.
  Impact: High
  ────────────────────────────────────────
  #: 20
  Gap: No audit log for role changes. Who made Dr. X an owner? When? Unknown.
  Impact: Medium
  ────────────────────────────────────────
  #: 21
  Gap: user_roles.role text field is loosely coupled to clinic_staff.role — two sources of truth  
    for the same concept. Easy to drift.
  Impact: Medium
  ────────────────────────────────────────
  #: 22
  Gap: No super_admin UI. Role exists in DB, no interface.
  Impact: Low

  ---
  5. Medical History per Patient

  Status: Structurally incomplete.

  The patients table (by design, for privacy) has NO medical data fields:
  - No allergies
  - No chronic conditions
  - No medications list (pre-existing)
  - No blood type
  - No emergency contact
  - No vaccination history
  - No family history

  All medical content lives per-appointment (consultations, diagnoses, prescriptions, lab_results,
   procedure_reports).

  ┌─────┬──────────────────────────────────────────────────────────────────────┬──────────────┐   
  │  #  │                                 Gap                                  │    Impact    │   
  ├─────┼──────────────────────────────────────────────────────────────────────┼──────────────┤   
  │     │ No patient "medical passport" view. A doctor opening a patient's     │              │   
  │ 23  │ chart sees appointments one-by-one, not a unified "allergies,        │ Critical     │   
  │     │ current meds, active conditions" header. This is table-stakes for    │              │   
  │     │ EMR.                                                                 │              │   
  ├─────┼──────────────────────────────────────────────────────────────────────┼──────────────┤   
  │     │ No structured allergies table. Prescribing without seeing allergies  │ Critical —   │   
  │ 24  │ is the #1 clinical safety risk. Even a patient_allergies             │ patient      │   
  │     │ (patient_id, substance, severity) table is missing.                  │ safety       │   
  ├─────┼──────────────────────────────────────────────────────────────────────┼──────────────┤   
  │     │ No active problem list. "Diabetes, HTN, CKD stage 3" as a running    │              │   
  │ 25  │ list, independent of the current visit. Currently buried in prior    │ Critical     │   
  │     │ diagnoses.                                                           │              │   
  ├─────┼──────────────────────────────────────────────────────────────────────┼──────────────┤   
  │ 26  │ No current medications list. Prescriptions are per-visit; there's no │ Critical     │   
  │     │  "what is this patient currently taking" aggregate view.             │              │   
  ├─────┼──────────────────────────────────────────────────────────────────────┼──────────────┤   
  │ 27  │ No patient-provided intake form. When a patient signs up, they're    │ High         │   
  │     │ not asked any medical questions.                                     │              │   
  ├─────┼──────────────────────────────────────────────────────────────────────┼──────────────┤   
  │ 28  │ No vitals history. No blood pressure, weight, height, BMI trend      │ High         │   
  │     │ across visits.                                                       │              │   
  ├─────┼──────────────────────────────────────────────────────────────────────┼──────────────┤   
  │ 29  │ No document uploads by patient. Patient can't upload prior lab       │ High         │   
  │     │ results, imaging, referral letters.                                  │              │   
  ├─────┼──────────────────────────────────────────────────────────────────────┼──────────────┤   
  │     │ Consultation editor is free-text. Great for UX, but no discrete data │              │   
  │ 30  │  = no ability to query "all diabetic patients" or drug-interaction   │ Medium       │   
  │     │ checks.                                                              │              │   
  └─────┴──────────────────────────────────────────────────────────────────────┴──────────────┘   

  ---
  6. Medical Record Access Requests

  Shipped (this is actually the most mature area):
  - Doctor-initiated access request with OTP (SMS/email)
  - Patient in-app approval
  - Owner override reason (emergency access)
  - Scoped grants: full_history, date_range, specific_appointments
  - Grant expiration, revocation, revoke-all
  - Audit log (AccessAuditLog component)
  - ActiveSharesPanel for patient to manage who has access
  - Scheduled expiry job, hardened RLS, E2E harness

  Gaps:

  ┌─────┬─────────────────────────────────────────────────────────────────────┬───────────────┐   
  │  #  │                                 Gap                                 │    Impact     │   
  ├─────┼─────────────────────────────────────────────────────────────────────┼───────────────┤   
  │     │ No "request access from home" flow. Patient must be at the clinic   │               │   
  │ 31  │ (appointment context required). A remote telehealth or follow-up    │ High          │   
  │     │ doctor can't request access without an active appointment.          │               │   
  ├─────┼─────────────────────────────────────────────────────────────────────┼───────────────┤   
  │     │ No cross-clinic record portability. A patient going from Clinic A   │               │   
  │ 32  │ to Clinic B can't say "share my file from A". Each clinic's records │ High          │   
  │     │  are siloed.                                                        │               │   
  ├─────┼─────────────────────────────────────────────────────────────────────┼───────────────┤   
  │ 33  │ No patient-initiated share. Patient can only approve/revoke — can't │ Medium        │   
  │     │  proactively share records with a doctor they'll see next week.     │               │   
  ├─────┼─────────────────────────────────────────────────────────────────────┼───────────────┤   
  │ 34  │ No family/guardian proxy access. Parent viewing child's records,    │ High (for     │   
  │     │ spouse with power of attorney — not modeled.                        │ pediatrics)   │   
  ├─────┼─────────────────────────────────────────────────────────────────────┼───────────────┤   
  │     │ No granular record-type filter in grants. Scope is by               │               │   
  │ 35  │ date/appointment, not by "prescriptions only, no diagnoses". The    │ Medium        │   
  │     │ RecordType enum exists in models but grants don't use it.           │               │   
  ├─────┼─────────────────────────────────────────────────────────────────────┼───────────────┤   
  │ 36  │ No "access expired — request renewal" UX for the doctor side.       │ Low           │   
  ├─────┼─────────────────────────────────────────────────────────────────────┼───────────────┤   
  │ 37  │ OTP verbal consent path is defined but has no UI.                   │ Low           │   
  └─────┴─────────────────────────────────────────────────────────────────────┴───────────────┘   

  ---
  Priority Stack Ranking (what I'd ship first)

  Must-have before "clinic-grade" launch:

  1. #17, #18 — Enforce permissions server-side via RLS, not just UI
  2. #23, #24, #25, #26 — Patient allergies + problem list + current meds aggregate view (safety) 
  3. #11, #13 — Doctor activity report + end-of-day summary (owner retention driver)

  Next wave (competitive parity with Dabadoc):

  4. #15 — Revenue/billing per appointment
  5. #2, #3 — Pause queue + hold patient state
  6. #9 — Per-doctor queue mode
  7. #28, #29 — Vitals tracking + patient document uploads

  Differentiators (Salam's "why":

  8. #32 — Cross-clinic record portability (patient owns their data — huge in Morocco)
  9. #34 — Family/guardian proxy access (pediatrics + elderly)
  10. #1, #6 — Recall + call specific patient (pro-grade queue control)

  ---
  One-line summary

  Queue mechanics are sophisticated; medical records have great sharing plumbing but missing a    
  patient-centric view; role enforcement is dangerously UI-only; doctor reporting/analytics is    
  essentially absent. The biggest clinical risk is #24 (no allergies). The biggest security risk  
  is #17/#18 (permissions not enforced in RLS). The biggest commercial gap is #11 (no doctor      
  activity reports for owners).