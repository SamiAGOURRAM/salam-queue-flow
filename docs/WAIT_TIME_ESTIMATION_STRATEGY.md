# 🎯 Wait Time Estimation Strategy - Smart & Event-Driven

**Date**: January 2025  
**Principle**: Only estimate when disruptions occur. Otherwise, show scheduled time.

---

## 🧠 Core Philosophy

### **Normal Flow = No Estimation Needed**

**Scenario**: Everything goes according to schedule
- Patient scheduled for 10:00 AM
- Patient arrives on time
- Doctor sees patients in order
- Each appointment takes expected duration
- **Display**: "10:00 AM" (scheduled time)

**Why no estimation?**
- ✅ Schedule is accurate
- ✅ No disruption = no need for prediction
- ✅ Simpler, clearer for users
- ✅ Avoids unnecessary computation

---

## ⚠️ When to Trigger Estimation (Disruption Events)

### **Category 1: Patient-Related Disruptions**

#### **1. Patient Arrives Late**
**Trigger**: `PATIENT_CHECKED_IN` event  
**Condition**: `checked_in_at > scheduled_time + buffer` (e.g., > 5 minutes late)  
**Impact**: Affects all patients after this one  
**Action**: Recalculate wait times for all waiting patients

#### **2. Patient Doesn't Show Up (No-Show)**
**Trigger**: `PATIENT_MARKED_ABSENT` event  
**Condition**: Patient marked absent (not just late)  
**Impact**: Removes patient from queue, speeds up others  
**Action**: Recalculate wait times for all waiting patients

#### **3. Patient Returns After Being Absent**
**Trigger**: `PATIENT_RETURNED` event  
**Condition**: Patient returns after grace period  
**Impact**: Adds patient back to queue, may delay others  
**Action**: Recalculate wait times for all waiting patients

---

### **Category 2: Appointment Duration Disruptions**

#### **4. Appointment Takes Longer Than Expected**
**Trigger**: `APPOINTMENT_STATUS_CHANGED` (to COMPLETED)  
**Condition**: `actual_duration > estimated_duration + threshold` (e.g., > 10 minutes over)  
**Impact**: Delays all subsequent patients  
**Action**: Recalculate wait times for all waiting patients

#### **5. Appointment Takes Less Time Than Expected**
**Trigger**: `APPOINTMENT_STATUS_CHANGED` (to COMPLETED)  
**Condition**: `actual_duration < estimated_duration - threshold` (e.g., > 10 minutes under)  
**Impact**: Speeds up queue, patients may be seen earlier  
**Action**: Recalculate wait times for all waiting patients

---

### **Category 3: Queue Structure Disruptions**

#### **6. Queue Position Changed (Manual Override)**
**Trigger**: `QUEUE_POSITION_CHANGED` event  
**Condition**: Manual reordering by staff  
**Impact**: Changes order, affects all affected patients  
**Action**: Recalculate wait times for affected patients

#### **7. Emergency Case Inserted**
**Trigger**: `PATIENT_ADDED_TO_QUEUE` event  
**Condition**: `appointment_type === 'emergency'` OR `is_walk_in === true`  
**Impact**: May delay scheduled patients  
**Action**: Recalculate wait times for all waiting patients

---

### **Category 4: Staff/Resource Disruptions**

#### **8. Doctor Arrives Late**
**Trigger**: First appointment of day delayed  
**Condition**: First `PATIENT_CALLED` event happens after scheduled time + threshold  
**Impact**: Delays entire day's schedule  
**Action**: Recalculate wait times for all patients

#### **9. Staff Becomes Unavailable**
**Trigger**: Staff marked inactive OR no appointments being called  
**Condition**: No `PATIENT_CALLED` events for > 30 minutes during clinic hours  
**Impact**: Delays all patients  
**Action**: Recalculate wait times for all waiting patients

---

### **Category 5: Cumulative Disruptions**

#### **10. Multiple No-Shows in a Row**
**Trigger**: Multiple `PATIENT_MARKED_ABSENT` events  
**Condition**: 2+ consecutive no-shows  
**Impact**: Significant queue speedup  
**Action**: Recalculate wait times for all waiting patients

#### **11. Current Appointment Running Over**
**Trigger**: Periodic check (every 5 minutes)  
**Condition**: `current_time > scheduled_start_time + estimated_duration + threshold`  
**Impact**: Delays all waiting patients  
**Action**: Recalculate wait times for all waiting patients

---

## 🏗️ Architecture Design

### **Event-Driven Estimation Service**

```typescript
class WaitTimeEstimationOrchestrator {
  // Subscribe to queue events
  subscribeToEvents() {
    // Patient disruptions
    eventBus.subscribe(PATIENT_CHECKED_IN, this.handleCheckIn);
    eventBus.subscribe(PATIENT_MARKED_ABSENT, this.handleAbsent);
    eventBus.subscribe(PATIENT_RETURNED, this.handleReturned);
    
    // Duration disruptions
    eventBus.subscribe(APPOINTMENT_STATUS_CHANGED, this.handleStatusChange);
    
    // Queue structure disruptions
    eventBus.subscribe(QUEUE_POSITION_CHANGED, this.handlePositionChange);
    eventBus.subscribe(PATIENT_ADDED_TO_QUEUE, this.handlePatientAdded);
    
    // Periodic check for running-over appointments
    this.startPeriodicCheck();
  }
  
  // Only recalculate when disruption detected
  async handleCheckIn(event) {
    const appointment = await getAppointment(event.appointmentId);
    
    // Check if late arrival
    if (isLateArrival(appointment)) {
      await this.recalculateForClinic(event.clinicId);
    }
    // Otherwise, no recalculation needed
  }
  
  async handleStatusChange(event) {
    if (event.newStatus === 'completed') {
      const appointment = await getAppointment(event.appointmentId);
      
      // Check if duration was unusual
      if (isUnusualDuration(appointment)) {
        await this.recalculateForClinic(event.clinicId);
      }
    }
  }
}
```

---

## 📊 Decision Logic

### **When to Show Scheduled Time vs Estimated Time**

```typescript
function getDisplayTime(appointment: Appointment): string {
  // If no disruption detected, show scheduled time
  if (!appointment.hasDisruption) {
    return appointment.scheduledTime; // "10:00 AM"
  }
  
  // If disruption detected, show estimated time
  if (appointment.estimatedWaitTime) {
    const estimatedStart = calculateEstimatedStart(appointment);
    return formatTime(estimatedStart); // "10:15 AM" (estimated)
  }
  
  // Fallback to scheduled time
  return appointment.scheduledTime;
}
```

### **Disruption Detection**

```typescript
function hasDisruption(appointment: Appointment): boolean {
  // Check various disruption indicators
  return (
    appointment.isLateArrival ||           // Arrived late
    appointment.wasAbsent ||               // Was marked absent
    appointment.actualDuration > expected + threshold ||  // Took longer
    appointment.actualDuration < expected - threshold ||  // Took less time
    appointment.queuePositionChanged ||    // Manual override
    appointment.isEmergency ||              // Emergency case
    appointment.previousPatientDelayed     // Previous patient delayed
  );
}
```

---

## 🎯 Implementation Strategy

### **Phase 1: Disruption Detection**

1. **Add disruption tracking to appointments table**
   - `has_disruption: boolean`
   - `disruption_reason: string`
   - `last_estimation_update: timestamp`

2. **Event handlers detect disruptions**
   - Check conditions on each event
   - Mark appointment as disrupted if condition met
   - Trigger recalculation only when needed

### **Phase 2: Smart Recalculation**

1. **Only recalculate affected patients**
   - If patient A is late → recalculate patients after A
   - If patient B takes longer → recalculate patients after B
   - If queue reordered → recalculate affected positions

2. **Batch recalculation**
   - Collect all disruptions in short window (e.g., 1 minute)
   - Recalculate once for all affected patients
   - Avoid redundant calculations

### **Phase 3: Display Logic**

1. **Default to scheduled time**
   - Show scheduled time if no disruption
   - Clear, simple, accurate

2. **Show estimated time only when needed**
   - Display estimated time when disruption detected
   - Show confidence indicator
   - Explain why estimation is shown

---

## 📋 Event-to-Action Mapping

| Event | Condition | Action |
|-------|-----------|--------|
| `PATIENT_CHECKED_IN` | Arrived > 5 min late | Recalculate all waiting |
| `PATIENT_MARKED_ABSENT` | Always | Recalculate all waiting |
| `PATIENT_RETURNED` | Always | Recalculate all waiting |
| `APPOINTMENT_STATUS_CHANGED` → COMPLETED | Duration > expected + 10 min | Recalculate all waiting |
| `APPOINTMENT_STATUS_CHANGED` → COMPLETED | Duration < expected - 10 min | Recalculate all waiting |
| `QUEUE_POSITION_CHANGED` | Always | Recalculate affected patients |
| `PATIENT_ADDED_TO_QUEUE` | Emergency or walk-in | Recalculate all waiting |
| Periodic check | Appointment running over | Recalculate all waiting |

---

## ✅ Benefits of This Approach

1. **Smart**: Only calculates when needed
2. **Efficient**: No unnecessary computation
3. **Accurate**: Scheduled time is accurate when no disruption
4. **User-Friendly**: Clear display (scheduled vs estimated)
5. **Event-Driven**: Reactive to actual changes
6. **Scalable**: Only recalculates affected patients

---

## 🚀 Next Steps

1. **Design disruption detection logic**
2. **Implement event handlers**
3. **Add disruption tracking to database**
4. **Update display logic in MyQueue**
5. **Test with real scenarios**

---

**This approach is smart, efficient, and avoids over-engineering!** 🎯

