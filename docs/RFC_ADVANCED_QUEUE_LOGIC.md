# RFC: Advanced Queue Management & Smart Scheduling Logic

**Status**: Draft v4 (Comprehensive Consolidated Version)
**Date**: 2025-01-22
**Author**: Antigravity (AI Assistant)
**Context**: "Moroccan Healthcare Unicorn" - QueueMed / Salam Queue Flow

---

## 1. Problem Statement

The current queue system is functional but basic. It operates on a linear "Call Next" basis. However, real-world clinics face complex scenarios:
- **Late Arrivals**: The scheduled patient is late. Do we wait or call the next person?
- **Cancellations**: A slot opens up. Do we shift everyone up (Fluid) or leave a gap (Fixed)?
- **Walk-ins**: How do we interleave walk-ins with scheduled appointments without causing delays?
- **Physical Presence**: A patient for 11:00 is here at 10:00. The 10:00 patient is missing. Should the 11:00 patient go in?

To achieve "Unicorn" status, we need **Smart Queue Logic** that adapts to these realities.

---

## 2. Industry Standards & Best Practices

How do world leaders tackle queue efficiency vs. schedule adherence?

### **Doctolib (Europe/France)**
*   **Philosophy**: "The Calendar is Truth".
*   **Approach**: Rigid slots. If a patient is late, they are often marked "Seen Late" or cancelled.
*   **Gap Filling**: "Waitlist" feature. If a slot opens >4h in advance, notify waitlist.
*   **Relevance to Morocco**: Low. Too rigid. Doesn't account for the "lobby culture".

### **Qmatic / Orchestra (Enterprise/Hospitals)**
*   **Philosophy**: "Flow is Truth".
*   **Approach**: Segmentation.
    *   *Stream A*: Appointments (Priority).
    *   *Stream B*: Walk-ins (Fillers).
*   **Logic**: "Call Next" algorithm looks at: `(Wait Time * Priority Weight)`.
*   **Relevance to Morocco**: High. Handles the mix of scheduled vs. physical presence well.

### **Palantir Foundry for Healthcare (US/NHS)**
*   **Philosophy**: "Predictive Optimization".
*   **Approach**: Dynamic Rescheduling.
*   **Logic**: Real-time recalculation. "Dr. X is running 15m late. Send SMS to 11:00 patient to arrive at 11:15."
*   **Relevance to Morocco**: **The Goal**. This is the "Just-in-Time" unicorn feature.

---

## 3. Proposed Queue Modes

We propose introducing distinct **Queue Modes** configurable per clinic.

### Mode A: **Strict Schedule (Fixed Slots)**
*Best for: Specialists, Psychiatrists, High-end Dental*
- **Behavior**: Time is king. 10:00 is 10:00.
- **Late Arrival**: If 10:00 is late, the doctor waits.
- **Cancellation**: The slot remains empty.
- **Shifting**: **NO**.

### Mode B: **Fluid Queue (Smart Shifting)**
*Best for: GPs, Pediatricians, Public Clinics*
- **Behavior**: "First Arrived (of the scheduled), First Served".
- **Late Arrival**: If 10:00 is not checked in, system **automatically** suggests the next *checked-in* patient.
- **Cancellation**: **YES**, shift everyone up.
- **Gap Filling**: Aggressively fills gaps with Walk-ins.

### Mode C: **Hybrid (Blocks)**
*Best for: Busy Clinics with Walk-ins*
- **Behavior**: Mixed slots (e.g., 09:00-11:00 Scheduled, 11:00-13:00 Walk-ins).

---

## 4. The "Moroccan Hybrid Model" (Core Philosophy)

**Goal**: Maximize clinic throughput ("Empty chair is lost revenue") while respecting the "Scheduled" status of punctual patients.

### **The Golden Rules**
1.  **Punctuality is Rewarded**: Scheduled patients who are present on time have absolute priority.
2.  **Lateness is Penalized**: If you miss your slot (Grace Period Exceeded), you lose your "Scheduled" priority and become a **"Priority Walk-in"**.
3.  **Efficiency is King**: Gaps are aggressively filled by "Early Birds" or "Walk-ins".
4.  **Data Integrity**: We preserve `scheduled_time` for history/scoring, but record `actual_start_time` for operations.

---

## 5. Detailed Logic: The "Late = Walk-in" Rule

**Scenario**: Patient A is scheduled for 10:00. It is now 10:15 (Grace Period Exceeded).

**The Logic**:
1.  **Status Change**: Patient A is marked `ABSENT` (or `LATE_ARRIVED` if they show up).
2.  **Priority Downgrade**:
    *   *Before*: Priority 1 (Scheduled Slot Owner).
    *   *After*: Priority 3 (Walk-in).
3.  **Insertion Strategy**:
    *   Patient A arrives at 10:30.
    *   System checks: Is there a **Gap** (Cancellation/No-show)?
        *   *Yes*: Insert Patient A there.
        *   *No*: Patient A waits for the *next available gap* or the *end of the session*.
    *   *Crucial*: Patient A does **NOT** bump Patient B (10:30) or Patient C (10:45). They have lost their right to displace others.

---

## 6. Walk-in vs. Waitlist: Definitions & Mechanics

### **Walk-in Definition (CRITICAL CLARIFICATION)**
A **Walk-in** is a patient who:
- Does **NOT** use the website/app to book
- Arrives physically at the clinic and asks the receptionist for an appointment
- Can be handled in two ways by staff:
  1. **Book for Future**: Staff uses booking system to schedule for a later date
  2. **Same-Day Request**: Patient wants to be seen TODAY

### **Same-Day Walk-in Flow**

#### **For Slotted Modes (Fixed/Fluid)**
1. Staff checks: **Are there empty slots today?**
   - **Yes**: Book walk-in into available slot
   - **No**: Proceed to overflow check

2. **Overflow Check**: Does clinic allow overflow?
   - **If YES (Overflow Allowed)**:
     - Add walk-in to **Waitlist**
     - System monitors for:
       - **Cancellations** (slot opens up)
       - **Fast appointments** (multiple appointments finish early, creating time gaps)
     - If gap appears: Promote waitlist patient to active queue
   - **If NO (Overflow Blocked)**:
     - **Refuse same-day appointment**
     - Offer: "We're fully booked today. Would you like to book for tomorrow?"

#### **For Pure Queue Mode**
1. Staff checks: **Is there capacity?** (Daily limit, e.g., max 50 patients)
   - **Yes**: Add to queue directly
   - **No**: Same overflow logic as above

### **Overflow**: The state where `(Scheduled + Walk-ins) > Clinic Capacity`.

---

## 7. Late Arrival Policy (ABSOLUTE RULE)

**The Cardinal Rule**: Late arrivals **NEVER** displace punctual patients.

### **Grace Period Mechanism**
1. Patient scheduled for 10:00
2. Grace period = 10 minutes (configurable)
3. At 10:10: Patient marked `ABSENT`

### **Late Arrival Scenarios**

#### **Scenario A: Late but within session (10:30)**
- Patient A (10:00) arrives at 10:30
- Status: Convert to **"Priority Walk-in"** (NOT regular walk-in)
- Insertion Logic:
  ```
  IF gap exists (cancellation/no-show):
    Insert into gap
  ELSE:
    Wait for next gap OR end of session
  ```
- **NEVER** bumps 10:30, 11:00, etc. scheduled patients

#### **Scenario B: Very late (after session ends)**
- If all scheduled slots filled: Offer rebooking
- If overflow allowed: Add to end-of-day overflow

---

## 8. Manual Override & Staff Control

**Philosophy**: Technology assists, humans decide.

### **Manual Actions Staff Can Perform**

1. **Swap Appointments**
   - Patients agree to switch slots
   - Staff clicks: "Swap [Patient A 10:00] ↔ [Patient B 11:00]"
   - System updates both records
   - Audit log: "Manual swap by [Staff Name]"

2. **Manual Priority Boost**
   - VIP patient arrives
   - Staff: "Move [Patient X] to front of queue"
   - System asks: "Reason?" → Record in audit log

3. **Manual Slot Creation**
   - Staff sees doctor has 20-min gap at 2:00 PM
   - Manually creates ad-hoc slot
   - System allows if `end_time < clinic_closing_time`

4. **Override "Full" Status**
   - Clinic is "full" but doctor agrees to see one more
   - Staff: "Force add to queue"
   - Requires reason + approval

5. **Manual Time Adjustments**
   - Patient needs longer appointment (surgery discussion)
   - Staff extends slot: 10:00-10:15 → 10:00-10:30
   - System recalculates downstream impact

### **Audit Trail**
Every manual action creates a record:
```typescript
{
  action: "MANUAL_SWAP",
  performedBy: "staff_id_123",
  timestamp: "2025-01-22T10:15:00Z",
  affectedAppointments: ["apt_456", "apt_789"],
  reason: "Patient emergency, mutual agreement",
  approvedBy: "clinic_owner_id_001" // Optional
}
```

---

## 9. Disruption Scenarios (Deep Dive)

### **Scenario A: The "Early Bird" (Common in Morocco)**
*   11:00 Appointment arrives at 09:30
*   Add to "Ready Pool" with **Gap Filler Priority**
*   If 10:00 cancels: Auto-promote 11:00 to fill gap

### **Scenario B: The "Domino Delay"**
*   Doctor running 60m late
*   System detects `avg_duration > expected`
*   SMS to 11:00+: "Doctor delayed 60m. Arrive at [New Time]"

### **Scenario C: The "Ghost" (No-Show)**
*   10:00 missing, 10:15 not arrived, 11:00 present
*   Wait grace period → Mark 10:00 absent → Call 11:00

### **Scenario D: Walk-in Overflow**
*   All slots booked. Walk-in arrives.
*   **If overflow allowed**: Add to waitlist → Monitor for gaps
*   **If blocked**: "Fully booked. Book for tomorrow?"

---

## 10. Technical Implementation Strategy

### **Phase 1: The "Smart Queue" Algorithm**

```typescript
interface ScoredQueueEntry extends QueueEntry {
  score: number;
  reason: string; // "Scheduled On-Time", "Gap Filler", "Late Arrival"
  canCall: boolean;
}

function calculateScore(patient: QueueEntry, context: ClinicContext): number {
  let score = 0;

  // 1. Physical Presence (GATEKEEPER - Absolute requirement)
  if (!patient.isPresent) return -1000;

  // 2. Schedule Adherence
  const timeDiff = differenceInMinutes(now, patient.scheduledTime);
  
  if (Math.abs(timeDiff) < 15) {
    score += 100; // On Time (High Priority)
  } else if (timeDiff > 15) {
    score += 50; // Late (Lower Priority - "Walk-in" status)
  } else {
    score += 20; // Early (Gap Filler status)
  }

  // 3. Wait Time (Fairness)
  score += (patient.waitingMinutes * 0.5); // +1 point every 2 mins waiting

  // 4. Status
  if (patient.isVip) score += 10;
  if (patient.isEmergency) score += 500;

  return score;
}
```

### **Phase 2: The "Gap Manager"**
Background service that monitors for gaps and fills them intelligently.

```typescript
class GapManager {
  async onSlotCancelled(slot: QueueEntry) {
    // 1. Check for waitlist patients
    const waitlist = await this.getWaitlistForDate(slot.clinicId, slot.date);
    
    // 2. Check for early arrivals (Gap Fillers)
    const earlyArrivals = this.getEarlyArrivals(slot.scheduledTime);
    
    // 3. Prioritize: Physical presence > Remote waitlist
    if (earlyArrivals.length > 0) {
      await this.promoteToSlot(earlyArrivals[0], slot);
    } else if (waitlist.length > 0) {
      await this.notifyWaitlist(waitlist[0], slot);
    }
  }
}
```

### **Phase 3: Manual Override UI**
Staff dashboard actions:

```typescript
// 1. Swap appointments
<Button onClick={() => swapAppointments(patientA, patientB)}>
  Swap Slots
</Button>

// 2. Manual slot creation
<Button onClick={() => createAdHocSlot(startTime, duration)}>
  Create Slot
</Button>

// 3. Force add to queue (override "Full")
<Button onClick={() => forceAddToQueue(patient, reason)}>
  Override Full Status
</Button>
```

---

## 11. Database Schema Changes

### **New Tables**

#### `waitlist`
```sql
CREATE TABLE waitlist (
  id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL,
  patient_id UUID,
  guest_patient_id UUID,
  requested_date DATE NOT NULL,
  requested_time_range TSRANGE, -- e.g., '10:00-14:00' or NULL for "anytime"
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notified_at TIMESTAMPTZ,
  promoted_to_appointment_id UUID, -- If successfully booked
  status TEXT DEFAULT 'waiting' -- 'waiting', 'notified', 'booked', 'expired'
);
```

#### `manual_overrides`
```sql
CREATE TABLE manual_overrides (
  id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL,
  action_type TEXT NOT NULL, -- 'swap', 'priority_boost', 'force_add', etc.
  performed_by UUID NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  affected_appointments UUID[],
  reason TEXT,
  approved_by UUID,
  metadata JSONB -- Flexible for action-specific data
);
```

### **Schema Updates to Existing Tables**

#### `clinics` - Add queue mode settings
```sql
ALTER TABLE clinics ADD COLUMN queue_mode TEXT DEFAULT 'fluid'; 
-- 'fixed', 'fluid', 'hybrid'

ALTER TABLE clinics ADD COLUMN allow_overflow BOOLEAN DEFAULT false;
ALTER TABLE clinics ADD COLUMN grace_period_minutes INT DEFAULT 10;
ALTER TABLE clinics ADD COLUMN daily_capacity_limit INT; -- For pure queue mode
```

#### `appointments` - Add priority/status fields
```sql
ALTER TABLE appointments ADD COLUMN priority_score INT DEFAULT 100;
ALTER TABLE appointments ADD COLUMN is_gap_filler BOOLEAN DEFAULT false;
ALTER TABLE appointments ADD COLUMN promoted_from_waitlist BOOLEAN DEFAULT false;
ALTER TABLE appointments ADD COLUMN late_arrival_converted BOOLEAN DEFAULT false;
```

---

## 12. Implementation Roadmap (Step-by-Step)

### **Phase 1: Foundation (Weeks 1-2)**
- [x] RFC complete and approved
- [ ] Database migrations (new tables + schema updates)
- [ ] Update `QueueService` with scoring algorithm
- [ ] Create `NextPatientStrategy` interface
- [ ] Implement `FluidQueueStrategy` and `FixedScheduleStrategy`

### **Phase 2: Core Logic (Weeks 3-4)**
- [ ] Implement `calculateScore()` function
- [ ] Update `callNextPatient()` to use scoring
- [ ] Add Grace Period logic to `markPatientAbsent()`
- [ ] Implement Late Arrival → Priority Walk-in conversion
- [ ] Create `GapManager` service
- [ ] Add Waitlist CRUD operations

### **Phase 3: Overflow Management (Week 5)**
- [ ] Add `allow_overflow` setting to clinic config
- [ ] Implement capacity checks for walk-ins
- [ ] Create "Fully Booked" rejection flow
- [ ] Build waitlist notification system
- [ ] Add "Fast appointments free up time" detection

### **Phase 4: Manual Overrides (Week 6)**
- [ ] Build Swap Appointments UI + API
- [ ] Build Manual Priority Boost UI + API
- [ ] Build Manual Slot Creation UI + API
- [ ] Build Force Add (Override Full) UI + API
- [ ] Implement Audit Trail for all manual actions

### **Phase 5: Real-time Notifications (Week 7)**
- [ ] Implement "Domino Delay" detection
- [ ] Send "Doctor Running Late" SMS
- [ ] Send "Come Early" SMS for fast queues
- [ ] Send Waitlist promotion notifications

### **Phase 6: Testing & Refinement (Week 8)**
- [ ] Unit tests for scoring algorithm
- [ ] Integration tests for gap filling
- [ ] E2E tests for all disruption scenarios
- [ ] Load testing (100 patients/day)
- [ ] User acceptance testing with pilot clinic

---

## 13. Verification Strategy

### **Test Scenarios**

#### **Test 1: Late Arrival Never Displaces**
1. Patient A (10:00) marked absent at 10:10
2. Patient B (10:15) called at 10:10
3. Patient A arrives at 10:20
4. **Expected**: Patient A waits, does NOT bump Patient C (10:30)

#### **Test 2: Early Bird Fills Gap**
1. Patient X (11:00) arrives at 09:30
2. Patient Y (10:00) cancels at 10:00
3. **Expected**: Patient X promoted to 10:00 slot

#### **Test 3: Overflow Blocked**
1. Clinic has 32 slots, all booked
2. Walk-in arrives, `allow_overflow = false`
3. **Expected**: "Fully booked. Book for tomorrow?"

#### **Test 4: Overflow Allowed**
1. Clinic has 32 slots, all booked
2. Walk-in arrives, `allow_overflow = true`
3. **Expected**: Added to waitlist, monitors for gaps

#### **Test 5: Manual Swap**
1. Staff swaps Patient A (10:00) ↔ Patient B (11:00)
2. **Expected**: Both records updated, audit log created

---

## 14. Success Metrics

**After implementation, we measure:**

1. **Lobby Wait Time Reduction**: Target 40% reduction
2. **Doctor Idle Time**: Target < 5% of session time
3. **Patient Satisfaction**: Survey score > 4.5/5
4. **No-Show Rate**: Reduce by 30% (via better notifications)
5. **Same-Day Capacity Utilization**: Target > 95%

---

## 15. Conclusion

This RFC defines a **world-class queue management system** that:
- ✅ Respects punctuality (On-time patients have priority)
- ✅ Maximizes efficiency (Gaps are filled aggressively)
- ✅ Adapts to Moroccan culture (Early arrivals, walk-ins, lobby waiting)
- ✅ Empowers staff (Manual overrides with audit trails)
- ✅ Scales to "Unicorn" status (Palantir-style predictive optimization)

**Next Steps**: Upon approval, proceed to Phase 1 implementation.
