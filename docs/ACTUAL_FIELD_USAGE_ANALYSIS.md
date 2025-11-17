# 📊 Actual Field Usage Analysis: Codebase Investigation

**Date**: January 2025  
**Purpose**: Analyze what fields are actually used/ingested vs defined in schema

---

## 🔍 Key Findings

### **1. `patient_arrival_time`** ❌ **NOT USED ANYWHERE**

**Schema Definition**: ✅ Exists in `appointments` table  
**Code Usage**: ❌ **ZERO usage** - Dead code!

**Search Results**:
- Only found in `types.ts` (TypeScript definitions)
- **NO INSERT** statements set it
- **NO UPDATE** statements set it
- **NO SELECT** statements read it
- **NO queries** reference it

**Conclusion**: **DROP IT** - It's unused dead code.

**Recommendation**: Remove `patient_arrival_time` column entirely.

---

### **2. `checked_in_at`** ✅ **USED, BUT SIMPLIFICATION NEEDED**

**Current Usage**:
- ✅ Set in `checkInPatient()` method (QueueRepository.ts:688)
- ✅ Called when patient clicks "Check In" button (MyQueue.tsx:149)
- ✅ Called automatically when walk-in is added (AddWalkInDialog.tsx:111)
- ✅ Used in wait time calculation (actual_start_time - checked_in_at)
- ✅ Used in late arrival detection (WaitTimeEstimationOrchestrator.ts:172)

**Your Requirement**:
> "the checked in time would be the time where the staff call the patient (call next) and they enter"

**Current Flow**:
```
1. Patient arrives → Patient clicks "Check In" → checked_in_at set
2. Staff clicks "Call Next" → actual_start_time set (when patient enters)
```

**Your Desired Flow**:
```
1. Staff clicks "Call Next" → checked_in_at set (when patient enters)
2. actual_start_time = checked_in_at (same moment)
```

**Simplification Recommendation**: ✅ **SIMPLIFY TO ONE TIMESTAMP**

**Option A: Use `checked_in_at` only**
- Set `checked_in_at` when staff calls "Call Next" (`callNextPatient()`)
- Remove `actual_start_time` (redundant)
- `checked_in_at` = when patient enters consultation room

**Option B: Use `actual_start_time` only**
- Set `actual_start_time` when staff calls "Call Next"
- Remove `checked_in_at` (redundant)
- `actual_start_time` = when consultation starts

**My Recommendation**: **Option A** - Use `checked_in_at` as "entry time"
- Rename to `entered_at` for clarity? Or keep `checked_in_at`
- Simpler: One timestamp for "when patient entered"
- Remove `actual_start_time` if it's the same moment

**Action Required**:
1. Update `callNextPatient()` to set `checked_in_at` (instead of `actual_start_time`)
2. Remove patient-facing "Check In" button (simplifies flow)
3. Consider: Do you need separate "arrival at clinic" vs "entered consultation room"?
   - If NO: One timestamp is enough ✅
   - If YES: Keep both (but rename for clarity)

---

### **3. `start_time` / `end_time` vs `actual_start_time` / `actual_end_time`** ✅ **CLEAR DESIGN**

**Your Understanding**: ✅ **CORRECT!**

**Current Implementation**:
- ✅ `start_time` / `end_time`: Set when creating appointment (scheduled times)
  - Used in: `createQueueEntryViaRpc()` (QueueRepository.ts:553-554)
  - Used in: Booking flow (BookingFlow.tsx:397-398)
  - Used in: Walk-in creation (AddWalkInDialog.tsx:104-105)

- ✅ `actual_start_time`: Set when staff calls "Call Next" (`callNextPatient()`)
  - Used in: QueueService.ts:179 (`callNextPatient()` sets it)
  
- ✅ `actual_end_time`: Set when staff completes appointment (`completeAppointment()`)
  - Used in: QueueService.ts:331

**Your Intent**: ✅ **Perfect!**
> "I thought of having the information of the scheduled appointment : start_time end_time, then the actual after the appointment to quantify the difference between scheduled and actual in practice"

**This is EXACTLY what you have!**

- `start_time` = Scheduled start (when appointment was booked)
- `actual_start_time` = Actual start (when consultation began)
- `actual_end_time` = Actual end (when consultation ended)

**Insights You Can Derive**:
- **Scheduled vs Actual Start**: `actual_start_time - start_time` = Delay/Overtime
- **Actual Duration**: `actual_end_time - actual_start_time` = Real consultation duration
- **Wait Time**: `actual_start_time - checked_in_at` = Time waiting (if check-in exists)
- **Scheduled Duration vs Actual**: `(actual_end_time - actual_start_time) - (end_time - start_time)` = Duration difference

**Recommendation**: ✅ **KEEP THIS DESIGN** - It's perfect for analytics!

**Only Change Needed**: 
- If you simplify `checked_in_at` (as discussed above), wait time becomes: `actual_start_time - appointment_date + start_time` (time from scheduled to actual start)

---

### **4. `complexity_score`** ❌ **NOT USED**

**Schema Definition**: ✅ Exists (1-5 integer)  
**Code Usage**: ❌ **ZERO usage**

**Search Results**:
- No INSERT statements set it
- No UPDATE statements set it
- No SELECT statements read it
- Not in `CreateQueueEntryDTO`
- Not in `UpdateQueueEntryDTO`
- Not in any queries

**Conclusion**: **DEAD CODE** - Not ingested anywhere

**Recommendation**: 
- ❌ **DROP IT** if you don't plan to use it
- ⚠️ **OR** Implement it if clinics need it (but verify demand first)

---

### **5. `requires_preparation`** ❌ **NOT USED**

**Schema Definition**: ✅ Exists (boolean, default false)  
**Code Usage**: ❌ **ZERO usage**

**Search Results**:
- No INSERT statements set it
- No UPDATE statements set it
- No SELECT statements read it
- Not in `CreateQueueEntryDTO`
- Not in `UpdateQueueEntryDTO`

**Conclusion**: **DEAD CODE** - Not ingested anywhere

**Recommendation**:
- ❌ **DROP IT** if you don't plan to use it
- ⚠️ **OR** Implement it if clinics need buffer time for preparation (but verify demand first)

---

## 📊 Fields Actually Ingested (Used in Code)

### **Appointment Creation** (`createQueueEntryViaRpc`):
```typescript
✅ clinic_id (required)
✅ staff_id (required)
✅ patient_id (required)
✅ guest_patient_id (optional)
✅ appointment_type (required)
✅ is_walk_in (optional, default false)
✅ start_time (required) - Scheduled start
✅ end_time (required) - Scheduled end
```

**Set by Trigger** (`calculate_appointment_features`):
```sql
✅ appointment_date - Derived from start_time
✅ day_of_week - Derived from appointment_date
✅ time_slot - Derived from start_time (morning/afternoon/evening)
✅ is_holiday - From calendar lookup
✅ late_by_minutes - Calculated (if checked_in_at exists)
```

**Set by Business Logic**:
```typescript
✅ queue_position - Calculated by RPC function
✅ status - Default 'scheduled'
✅ is_first_visit - From patient_clinic_history
✅ estimated_duration - From appointment_type (default 15)
```

### **Check-In** (`checkInPatient`):
```typescript
✅ checked_in_at - Set to NOW() when called
✅ is_present - Set to true
✅ status - Changed to 'waiting'
```

### **Call Next Patient** (`callNextPatient`):
```typescript
✅ actual_start_time - Set to NOW() when called
✅ status - Changed to 'in_progress'
```

### **Complete Appointment** (`completeAppointment`):
```typescript
✅ actual_end_time - Set to NOW() when called
✅ actual_duration - Calculated from actual_end_time - actual_start_time
✅ status - Changed to 'completed'
```

---

## 🎯 Recommendations Summary

### **Drop These Fields** (Not Used):
1. ❌ `patient_arrival_time` - **DEAD CODE** (never used)
2. ❌ `complexity_score` - **DEAD CODE** (never used)
3. ❌ `requires_preparation` - **DEAD CODE** (never used)

### **Simplify These**:
4. ⚠️ `checked_in_at` vs `actual_start_time` - **CONSIDER MERGING**
   - If they represent the same moment (when patient enters), keep only one
   - Recommendation: Keep `checked_in_at`, set it in `callNextPatient()`
   - Remove patient-facing "Check In" button (staff controls entry)

### **Keep These** (Used & Valuable):
5. ✅ `start_time` / `end_time` - Scheduled times (used everywhere)
6. ✅ `actual_start_time` / `actual_end_time` - Actual times (for analytics)
7. ✅ `actual_duration` - Can be computed, but stored for convenience
8. ✅ `day_of_week`, `time_slot`, `is_holiday` - Computed by trigger (useful for queries)

---

## 🔄 Proposed Simplification Flow

### **Current Flow** (Complex):
```
1. Patient books → start_time, end_time set
2. Patient arrives → Patient clicks "Check In" → checked_in_at set
3. Staff calls "Call Next" → actual_start_time set
4. Staff completes → actual_end_time set, actual_duration calculated
```

### **Proposed Flow** (Simplified):
```
1. Patient books → start_time, end_time set (scheduled)
2. Staff calls "Call Next" → checked_in_at set (patient enters) + status = 'in_progress'
3. Staff completes → actual_end_time set + actual_duration calculated
```

**Benefits**:
- ✅ Simpler for patients (no check-in button needed)
- ✅ Staff controls entry (more accurate)
- ✅ One timestamp for entry (`checked_in_at`)
- ✅ Still track scheduled vs actual (for analytics)

**Wait Time Calculation**:
```sql
-- Old: actual_start_time - checked_in_at
-- New: NOW() - checked_in_at (for waiting patients)
-- Or: actual_end_time - checked_in_at (for completed, if you track end)
-- Or: actual_start_time - start_time (delay from scheduled time)
```

**Analytics Available**:
- Scheduled vs Actual Start: `checked_in_at - start_time` (delay)
- Actual Duration: `actual_end_time - checked_in_at` (consultation time)
- Scheduled vs Actual Duration: `(actual_end_time - checked_in_at) - (end_time - start_time)`

---

## 📋 Migration Plan

### **Phase 1: Remove Dead Code** (Low Risk)
1. Drop `patient_arrival_time` column
2. Drop `complexity_score` column
3. Drop `requires_preparation` column

### **Phase 2: Simplify Check-In** (Medium Risk)
1. Update `callNextPatient()` to set `checked_in_at` (instead of `actual_start_time`)
2. Remove `actual_start_time` (if you merge) OR keep it for "consultation start" vs "entry"
3. Remove patient-facing "Check In" button from UI
4. Update wait time calculations

### **Phase 3: Clarify Timestamps** (Low Risk)
1. Keep `start_time` / `end_time` (scheduled) ✅
2. Keep `checked_in_at` (entry time) ✅
3. Keep `actual_end_time` (completion time) ✅
4. Decide: Keep `actual_start_time` separate? Or merge with `checked_in_at`?

---

## ✅ Final Answer to Your Questions

### **1. `patient_arrival_time` vs `checked_in_at`?**
**Answer**: `patient_arrival_time` is **NOT USED** - drop it!
- `checked_in_at` is used (but can be simplified)
- Recommendation: Set `checked_in_at` when staff calls "Call Next" (simpler flow)

### **2. `start_time` / `end_time` vs `actual_start_time` / `actual_end_time`?**
**Answer**: ✅ **KEEP BOTH** - Perfect design!
- `start_time` / `end_time` = Scheduled (set at booking)
- `actual_start_time` / `actual_end_time` = Actual (set during visit)
- This enables scheduled vs actual analytics (exactly what you want!)

### **3. `complexity_score` usage?**
**Answer**: ❌ **NOT USED** - drop it (or implement if needed)

### **4. `requires_preparation` usage?**
**Answer**: ❌ **NOT USED** - drop it (or implement if needed)

---

## 🎯 Recommended Actions

### **Immediate** (This Week):
1. ✅ Drop `patient_arrival_time` (not used)
2. ✅ Drop `complexity_score` (not used, unless you need it)
3. ✅ Drop `requires_preparation` (not used, unless you need it)

### **Next Sprint** (If Simplifying):
4. ⚠️ Update `callNextPatient()` to set `checked_in_at`
5. ⚠️ Remove patient "Check In" button
6. ⚠️ Update wait time calculations

### **Keep As-Is** (Good Design):
7. ✅ Keep `start_time` / `end_time` (scheduled)
8. ✅ Keep `actual_start_time` / `actual_end_time` (actual)
9. ✅ Keep `actual_duration` (computed but stored for convenience)

---

**Your schema design is mostly excellent! Just remove the unused fields and consider simplifying check-in flow.** ✅

