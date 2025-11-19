# Queue Mode Logic Design - Based on Industry Best Practices

## Core Understanding

### Walk-ins Definition
- **Walk-in** = Patient arrives at clinic asking for appointment
- **Two options**:
  1. **Book for later date**: Staff uses booking system → Regular scheduled appointment
  2. **Same-day request**: Patient wants to be seen TODAY

### Same-Day Walk-in Flow (All Slotted Modes)
1. **Check for empty slots** → If available, assign walk-in to slot
2. **If all booked**:
   - **If waitlist allowed**: Add to waitlist → Monitor for cancellations/no-shows
   - **If waitlist blocked**: "Fully booked. Book for tomorrow?"

---

## The Three Modes - Clarified

### Mode 1: **FIXED SLOTS** (Strict Schedule)

**Philosophy**: Time is sacred. Preserve scheduled times, but maximize efficiency through smart gap filling.

#### No-Show Handling (Smart Gap Filling):
```
Scenario: 10:00 patient is no-show

Step 1: Mark 10:00 as absent (after grace period)
Step 2: Check for gap filling candidates (in priority order):
        
        Option A: Waitlist (if enabled and has patients)
        → Top priority waitlist patient gets the slot
        → Maximizes throughput (they're ready and waiting)
        
        Option B: First scheduled patient who IS present
        → Check 11:00: Is patient present? If YES → Call early
        → If NO → Check 11:15: Is patient present? If YES → Call early
        → Continue until finding first present scheduled patient
        → This frees up their slot for walk-ins/waitlist
        
        Option C: Walk-in (if available and no waitlist)
        → Direct assignment to empty slot

Step 3: If waitlist patient gets slot:
        → Notify them immediately
        → Slot filled, throughput maximized
        
Step 4: If scheduled patient called early:
        → This frees up their original slot
        → That slot can now be used for:
           - Next waitlist patient (if waitlist exists)
           - Walk-in (if available)
        
Step 5: NOTIFICATION STRATEGY (Critical for patient satisfaction):
        → If calling scheduled patient early:
           - Send notification: "Slot available earlier, would you like to come now?"
           - Give them choice (don't force)
           - If they decline or don't respond → Wait for their scheduled time
        → If waitlist patient gets slot:
           - Immediate notification: "Slot available, please come now"
           - They're already expecting this, so no frustration

Step 6: Repeat process for each no-show
```

**Key Principle**: Waitlist patients are READY and EXPECTING a call, so they get priority for gap filling to maximize throughput.

**Key Rules**:
- ✅ **Early calls allowed**: If next patient is present, call them early
- ❌ **NO forced shifting**: Scheduled times remain fixed (11:00 stays 11:00)
- ✅ **Gap filling**: Freed slots can be used for walk-ins/waitlist
- ✅ **Smart notifications**: Notify next person they can come early (optional)
- ⏰ **Wait if needed**: If next person doesn't come early, wait until their time

#### Late Arrival Handling:
```
Scenario: 10:00 patient arrives at 10:30 (late)

Step 1: Mark as late arrival
Step 2: Check if 10:00 slot is still available (not filled by walk-in)
Step 3: If available → Patient can use their original slot
Step 4: If NOT available (filled by walk-in/early call):
        → Check for next available slot
        → If no slots available → Add to waitlist with priority
        → OR offer reschedule
```

---

### Mode 2: **FLUID QUEUE** (Smart Shifting)

**Philosophy**: Flow is king. Maximize throughput through dynamic rescheduling.

#### No-Show Handling:
```
Scenario: 10:00 patient is no-show

Step 1: Mark 10:00 as absent
Step 2: Recalculate ALL positions (shift everyone up)
Step 3: 11:00 → becomes 10:15
        11:15 → becomes 10:30
        11:30 → becomes 10:45
        etc.
Step 4: Notify all affected patients of new times
Step 5: Walk-ins aggressively fill any gaps
```

**Key Rules**:
- ✅ **Aggressive shifting**: Everyone moves up
- ✅ **Dynamic times**: All times recalculate
- ✅ **Priority-based**: Uses priority score for ordering
- ✅ **Gap filling**: Walk-ins fill gaps immediately

---

### Mode 3: **HYBRID** (Intelligent Fixed)

**Philosophy**: Best of both worlds. Fixed schedule with intelligent gap management.

**Key Insight**: Hybrid is essentially a **sophisticated Fixed mode** that handles edge cases better.

#### No-Show Handling (Enhanced Fixed Logic):
```
Scenario: 10:00 patient is no-show, 11:00 patient is present

Step 1: Mark 10:00 as absent
Step 2: Check if 11:00 patient is physically present
Step 3: If YES → Call 11:00 patient early (at 10:15)
        → This frees up the 11:00 slot
Step 4: **SMART GAP DETECTION**:
        - Check if there are multiple consecutive no-shows
        - If yes, batch-process to maximize efficiency
Step 5: **AGGRESSIVE NOTIFICATION**:
        - Notify 12:00 patient: "You can come at 11:00"
        - Notify 13:00 patient: "You can come at 12:00"
        - (Cascade notifications for better utilization)
Step 6: **INTELLIGENT WAITLIST PROMOTION**:
        - If no scheduled patients want to come early
        - Automatically promote waitlist patient to freed slot
Step 7: **LATE ARRIVAL HANDLING**:
        - If 10:00 patient returns late
        - Check for next available slot
        - If available → Assign slot
        - If not → Add to waitlist with HIGH priority (they had original slot)
```

**Key Differences from Fixed**:
- 🔔 **Cascade notifications**: Notify multiple future patients they can come early
- 🤖 **Automatic waitlist promotion**: If no one wants to come early, auto-fill with waitlist
- 📊 **Batch processing**: Handle multiple no-shows more efficiently
- 🎯 **Smarter late arrival handling**: Better slot reassignment logic

---

## "Who Is Next" Algorithm by Mode

### FIXED MODE:
```typescript
async function getNextPatient(
  schedule: QueueEntry[], 
  currentTime: Date,
  waitlistService: WaitlistService
) {
  // 1. Check waitlist first (if enabled and has patients)
  //    Waitlist patients are READY and EXPECTING a call
  //    This maximizes throughput
  const waitlist = await waitlistService.getClinicWaitlist(clinicId, currentDate);
  if (waitlist.length > 0) {
    const topWaitlist = waitlist[0]; // Highest priority
    // Check if we can assign them to current/next available slot
    const availableSlot = findNextAvailableSlot(schedule, currentTime);
    if (availableSlot) {
      return {
        type: 'waitlist',
        patient: topWaitlist,
        slot: availableSlot,
        reason: 'Waitlist patient ready, maximizes throughput'
      };
    }
  }
  
  // 2. Find first scheduled patient who IS present
  //    Check sequentially: 11:00 → 11:15 → 11:30 → etc.
  const scheduledPatients = schedule
    .filter(p => p.status === 'waiting' && !p.skipReason)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  for (const patient of scheduledPatients) {
    if (patient.isPresent) {
      // Found first present scheduled patient
      return {
        type: 'scheduled',
        patient: patient,
        reason: 'First scheduled patient who is present',
        canCallEarly: true // They can be called early, freeing their slot
      };
    }
  }
  
  // 3. If no one is present
  //    → Return null (wait for scheduled time)
  return null;
}
```

### FLUID MODE:
```typescript
function getNextPatient(schedule: QueueEntry[], currentTime: Date) {
  // 1. Recalculate positions (shift everyone up)
  const shiftedSchedule = recalculatePositions(schedule);
  
  // 2. Filter present patients
  const candidates = shiftedSchedule.filter(
    p => p.status === 'waiting' && p.isPresent && !p.skipReason
  );
  
  // 3. Sort by priority score (highest first)
  return candidates.sort((a, b) => 
    (b.priorityScore || 0) - (a.priorityScore || 0)
  )[0];
}
```

### HYBRID MODE:
```typescript
async function getNextPatient(
  schedule: QueueEntry[], 
  currentTime: Date,
  waitlistService: WaitlistService
) {
  // 1. Check waitlist FIRST (same as Fixed, but more aggressive)
  const waitlist = await waitlistService.getClinicWaitlist(clinicId, currentDate);
  if (waitlist.length > 0) {
    const topWaitlist = waitlist[0];
    const availableSlot = findNextAvailableSlot(schedule, currentTime);
    if (availableSlot) {
      // Auto-promote waitlist (more aggressive than Fixed)
      return {
        type: 'waitlist',
        patient: topWaitlist,
        slot: availableSlot,
        reason: 'Hybrid: Auto-promote waitlist for throughput'
      };
    }
  }
  
  // 2. Find first scheduled patient who IS present (same as Fixed)
  const scheduledPatients = schedule
    .filter(p => p.status === 'waiting' && !p.skipReason)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  for (const patient of scheduledPatients) {
    if (patient.isPresent) {
      return {
        type: 'scheduled',
        patient: patient,
        reason: 'First scheduled patient who is present',
        canCallEarly: true
      };
    }
  }
  
  // 3. ENHANCED: Cascade notifications to multiple future patients
  //    (More aggressive than Fixed)
  notifyFuturePatientsCanComeEarly(schedule, currentTime, count: 3); // Notify next 3
  
  return null;
}
```

---

## Late Arrival Return Handling

### All Modes (Best Practice):
```typescript
function handleLateArrivalReturn(appointment: QueueEntry) {
  // 1. Check if original slot is still available
  if (isSlotAvailable(appointment.startTime)) {
    return { action: 'use_original_slot', slot: appointment.startTime };
  }
  
  // 2. Find next available slot
  const nextSlot = findNextAvailableSlot(appointment.clinicId, appointment.appointmentDate);
  if (nextSlot) {
    return { action: 'assign_new_slot', slot: nextSlot };
  }
  
  // 3. Add to waitlist with HIGH priority
  //    (They had original slot, so they get priority)
  return { 
    action: 'add_to_waitlist', 
    priority: 'high',
    reason: 'late_arrival_original_slot_holder'
  };
}
```

---

## Industry Best Practices Integration

### From Doctolib (Rigid Schedule):
- ✅ Preserve scheduled times
- ✅ Late = lose slot (but can reschedule)
- ✅ Waitlist for cancellations

### From Qmatic (Flow Optimization):
- ✅ Priority-based ordering
- ✅ Aggressive gap filling
- ✅ Real-time notifications

### From Palantir (Predictive):
- ✅ Smart notifications ("You can come early")
- ✅ Batch processing of disruptions
- ✅ Predictive gap filling

---

## Implementation Priority

1. **Fixed Mode** (Base implementation)
   - Time-based selection
   - Early call if present
   - Gap filling with walk-ins/waitlist
   - Basic notifications

2. **Hybrid Mode** (Enhanced Fixed)
   - All Fixed features +
   - Cascade notifications
   - Automatic waitlist promotion
   - Smarter late arrival handling

3. **Fluid Mode** (Separate logic)
   - Priority-based selection
   - Dynamic shifting
   - Aggressive gap filling

---

## Key Design Decisions

### 1. Early Call Logic
- **Fixed/Hybrid**: Call next patient early IF present, but preserve their scheduled time
- **Fluid**: Shift everyone, recalculate all times

### 2. Gap Filling Priority (UPDATED)
**When a slot becomes available (no-show/cancellation):**

1. **Waitlist patient** (if waitlist enabled and has patients)
   - ✅ They're READY and EXPECTING a call
   - ✅ Maximizes throughput (no waiting for scheduled patients)
   - ✅ No frustration (they want this)

2. **First scheduled patient who IS present** (if no waitlist or waitlist empty)
   - ✅ Check sequentially: 11:00 → 11:15 → 11:30 → etc.
   - ✅ First one who is physically present gets the slot
   - ⚠️ **IMPORTANT**: Notify them, give them choice (don't force)
   - ⚠️ If they decline → Wait for their scheduled time (don't frustrate)

3. **Walk-in** (if available and no waitlist)
   - ✅ Direct assignment to empty slot

### 3. Notification Strategy (Patient Satisfaction Focus)
- **Fixed**: 
  - Notify first present scheduled patient they can come early (OPTIONAL)
  - Give them choice: "Slot available now, would you like to come?"
  - If they decline → Respect their scheduled time (don't frustrate)
  
- **Hybrid**: 
  - Same as Fixed, but cascade to multiple future patients
  - More aggressive waitlist promotion
  - Batch notifications for efficiency
  
- **Fluid**: 
  - Notify all affected patients of new times (mandatory, times changed)

### 4. Late Arrival Return
- **All modes**: Try to assign original slot → Next available slot → Waitlist with priority

---

## Questions Resolved

✅ **Walk-ins**: Same for all slotted modes (Fixed, Hybrid)  
✅ **Waitlist**: Same for all modes (if enabled)  
✅ **No-show difference**: 
   - **Fixed**: Basic early call + gap fill
   - **Hybrid**: Enhanced early call + cascade notifications + auto waitlist promotion
   - **Fluid**: Shift everyone + recalculate times

✅ **Late arrival return**: All modes handle similarly (original slot → new slot → waitlist priority)

