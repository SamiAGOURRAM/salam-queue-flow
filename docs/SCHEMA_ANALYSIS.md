# 📊 Database Schema Analysis: Redundancy & Measurability Review

**Date**: January 2025  
**Purpose**: Identify redundant, non-measurable, and computable fields in the schema

---

## 🔍 Analysis Summary

### **Redundant Fields**: 6 found
### **Non-Measurable Fields**: 2 found (subjective)
### **Computed Instead of Stored**: 5 found
### **Design Issues**: 3 found (prediction fields placement)

---

## 🚨 **REDUNDANT FIELDS** (Should Be Removed or Computed)

### **1. `appointments.actual_duration`** ❌ REDUNDANT

**Issue**: Can be computed from `actual_end_time - actual_start_time`

**Current**:
```sql
actual_duration integer null,
actual_end_time timestamp with time zone null,
actual_start_time timestamp with time zone null,
```

**Recommendation**: 
- ✅ **Remove `actual_duration`** - Compute when needed
- ✅ **Keep `actual_end_time` and `actual_start_time`** (source data)

**Why**: 
- Redundancy creates risk of inconsistency
- If timestamps change, duration needs manual update
- Easy to compute: `EXTRACT(EPOCH FROM (actual_end_time - actual_start_time)) / 60`

**Action**: 
- Drop column after ensuring all queries compute it
- Use computed field in views/queries

---

### **2. `appointments.is_present`** ❌ REDUNDANT (Mostly)

**Issue**: Can be computed from `status` and `checked_in_at`

**Current**:
```sql
is_present boolean null default false,
status appointment_status,  -- 'scheduled', 'waiting', 'in_progress', 'completed', etc.
checked_in_at timestamp with time zone null,
```

**Recommendation**:
- ✅ **Remove `is_present`** - Compute when needed
- ✅ **Use `status IN ('waiting', 'in_progress')`** OR `checked_in_at IS NOT NULL`

**Why**:
- `is_present` is redundant with `checked_in_at IS NOT NULL`
- `status` already indicates if patient is present (waiting/in_progress)

**Action**:
- Drop column
- Update queries to use `checked_in_at IS NOT NULL OR status IN ('waiting', 'in_progress')`

---

### **3. `appointments.patient_arrival_time`** ❌ REDUNDANT (Likely)

**Issue**: Likely duplicate of `checked_in_at` (same timestamp)

**Current**:
```sql
patient_arrival_time timestamp with time zone null,
checked_in_at timestamp with time zone null,
```

**Recommendation**:
- ✅ **Remove `patient_arrival_time`** - Use `checked_in_at` instead
- ⚠️ **Keep only if they represent different events** (arrival vs check-in)

**Why**:
- If `patient_arrival_time` = physical arrival and `checked_in_at` = check-in time, they're different
- But if they're the same (patient checks in when they arrive), redundant

**Decision Needed**:
- Are arrival and check-in different events?
- If YES: Keep both (rename for clarity)
- If NO: Remove `patient_arrival_time`

**Action**: 
- Clarify business logic
- Remove if redundant
- Rename if different events (`physical_arrival_time` vs `checked_in_at`)

---

### **4. `appointments.start_time` and `appointments.end_time`** ⚠️ CONFUSING

**Issue**: Unclear what these represent vs `scheduled_time` and `actual_start_time`

**Current**:
```sql
start_time timestamp with time zone null,
end_time timestamp with time zone null,
-- But also:
actual_start_time timestamp with time zone null,
actual_end_time timestamp with time zone null,
-- And possibly:
scheduled_time text null,  -- Not in your schema, but referenced in code
```

**Questions**:
- What is `start_time`? Scheduled time? Initial estimate?
- What is `end_time`? Scheduled end? Estimated end?
- How does it differ from `actual_start_time` and `actual_end_time`?

**Recommendation**:
1. **If `start_time` = scheduled appointment start**:
   - ✅ Keep `start_time` (scheduled start)
   - ✅ Keep `actual_start_time` (actual start)
   - ✅ Remove `end_time` - Compute from `start_time + estimated_duration`

2. **If `start_time` = `actual_start_time` (redundant)**:
   - ❌ Remove `start_time` and `end_time`
   - ✅ Use `actual_start_time` and `actual_end_time` only

**Action**: 
- Clarify what `start_time` represents
- Standardize naming: `scheduled_start_time`, `actual_start_time`, `scheduled_end_time`, `actual_end_time`

---

### **5. `appointments.predicted_wait_time`, `predicted_start_time`, `prediction_confidence`** ⚠️ DESIGN ISSUE

**Issue**: Prediction fields are in `appointments` table, but predictions should be in `appointment_metrics` (versioned, historical)

**Current**:
```sql
-- In appointments table:
predicted_wait_time integer null,
predicted_start_time timestamp with time zone null,
prediction_confidence double precision null,
last_prediction_update timestamp with time zone null,
prediction_mode estimation_mode not null default 'basic',
prediction_features jsonb null,
prediction_source text null,
prediction_expires_at timestamp with time zone null,

-- But also in appointment_metrics table:
predicted_wait_time integer null,  -- Same field!
confidence_score double precision null,  -- Same as prediction_confidence!
features jsonb not null,  -- Same as prediction_features!
```

**Recommendation**:
- ✅ **Remove prediction fields from `appointments`** (except maybe `prediction_expires_at` for cache)
- ✅ **Store all predictions in `appointment_metrics`** (versioned, timestamped)
- ✅ **Join `appointment_metrics` when you need latest prediction**

**Why**:
- Predictions are **time-sensitive** (change over time)
- Need **historical tracking** (what was predicted vs actual)
- `appointment_metrics` already has `recorded_at` for versioning
- Avoids duplication and inconsistency

**Action**:
- Create view: `appointments_with_latest_prediction` (JOIN latest appointment_metrics)
- Remove prediction fields from `appointments` (except `prediction_expires_at` for cache invalidation)
- Update queries to use `appointment_metrics` for predictions

---

### **6. `appointments.day_of_week`** ❌ COMPUTABLE

**Issue**: Can be computed from `appointment_date`

**Current**:
```sql
day_of_week integer null,
appointment_date date not null,
```

**Recommendation**:
- ✅ **Remove `day_of_week`** - Compute when needed: `EXTRACT(DOW FROM appointment_date)`

**Why**:
- Easy to compute
- Redundancy risk (if date changes, day_of_week must update)
- PostgreSQL has efficient date functions

**Action**:
- Drop column
- Use `EXTRACT(DOW FROM appointment_date)` in queries
- Note: Trigger `calculate_appointment_features` already computes this (can remove storage)

---

## ⚠️ **NON-MEASURABLE FIELDS** (Subjective/Requires Manual Input)

### **1. `appointments.complexity_score`** ⚠️ SUBJECTIVE

**Issue**: Requires manual assessment, not automatically measurable

**Current**:
```sql
complexity_score integer null,  -- 1-5 (from constraint)
```

**Analysis**:
- ✅ **Can be measured** IF clinic staff sets it during booking
- ⚠️ **Not automatic** - Requires human input
- ⚠️ **May be NULL** - Many appointments won't have it

**Recommendation**:
- ✅ **Keep if clinic sets it** - Useful feature if used
- ⚠️ **Check usage**: If most are NULL, consider removing or auto-estimating
- 💡 **Alternative**: Auto-estimate from `appointment_type`:
  - `emergency` = 5
  - `procedure` = 4
  - `consultation` = 3
  - `follow_up` = 2
  - `vaccination` = 1

**Action**: 
- Check data: What % of appointments have `complexity_score` set?
- If < 50%: Consider auto-estimation or remove
- If > 50%: Keep (useful feature)

---

### **2. `appointments.requires_preparation`** ⚠️ SUBJECTIVE

**Issue**: Requires manual assessment, not automatically measurable

**Current**:
```sql
requires_preparation boolean null default false,
```

**Analysis**:
- ✅ **Can be measured** IF clinic staff sets it during booking
- ⚠️ **Not automatic** - Requires human input
- ⚠️ **May be rarely used** - Check usage

**Recommendation**:
- ✅ **Keep if clinic uses it** - Useful for scheduling (adds buffer time)
- ⚠️ **Check usage**: If rarely set, consider removing

**Action**: 
- Check data: What % of appointments have `requires_preparation = true`?
- If < 10%: Consider removing
- If > 10%: Keep (useful feature)

---

## ✅ **COMPUTABLE FIELDS** (Should Be Computed, Not Stored)

### **1. `appointments.late_by_minutes`** ✅ COMPUTABLE

**Current**: Stored, but can be computed

**Computation**:
```sql
late_by_minutes = EXTRACT(EPOCH FROM (checked_in_at - scheduled_start_time)) / 60
```

**Recommendation**:
- ⚠️ **Keep if updated in real-time** (useful for queries)
- ✅ **OR compute when needed** (more accurate, less maintenance)

**Why**:
- If `scheduled_start_time` changes, `late_by_minutes` must update
- Computing is more accurate (always current)

**Action**:
- **Option A**: Keep as stored (if trigger updates it automatically) ✅ Current approach
- **Option B**: Remove, compute in views/queries (more accurate)

**Current Implementation**: ✅ Trigger `calculate_appointment_features` computes this - **KEEP**

---

### **2. `appointments.is_holiday`** ✅ COMPUTABLE

**Current**: Stored, but can be computed from calendar

**Computation**:
```sql
is_holiday = EXISTS(SELECT 1 FROM holidays WHERE holiday_date = appointment_date)
```

**Recommendation**:
- ⚠️ **Keep if trigger computes it** (useful for queries)
- ✅ **OR compute when needed** (more maintainable)

**Why**:
- Requires holidays table or calendar logic
- If holidays change, stored values may be stale

**Action**:
- **Option A**: Keep as stored (if trigger updates it) ✅ Current approach
- **Option B**: Remove, compute in views/queries (if you have holidays table)

**Current Implementation**: ✅ Trigger `calculate_appointment_features` computes this - **KEEP**

---

### **3. `appointments.time_slot`** ✅ COMPUTABLE

**Current**: Stored, but can be computed from `start_time`

**Computation**:
```sql
time_slot = CASE
  WHEN EXTRACT(HOUR FROM start_time) < 12 THEN 'morning'
  WHEN EXTRACT(HOUR FROM start_time) < 17 THEN 'afternoon'
  ELSE 'evening'
END
```

**Recommendation**:
- ⚠️ **Keep if trigger computes it** (useful for queries)
- ✅ **OR compute when needed** (more flexible)

**Why**:
- Easy to compute
- Stored values may be stale if `start_time` changes

**Action**:
- **Option A**: Keep as stored (if trigger updates it) ✅ Current approach
- **Option B**: Remove, compute in views/queries (more flexible)

**Current Implementation**: ✅ Trigger `calculate_appointment_features` computes this - **KEEP**

---

### **4. `appointments.is_first_visit`** ✅ COMPUTABLE

**Current**: Stored, but can be computed from `patient_clinic_history`

**Computation**:
```sql
is_first_visit = NOT EXISTS(
  SELECT 1 FROM appointments 
  WHERE patient_id = appointments.patient_id 
  AND clinic_id = appointments.clinic_id
  AND id != appointments.id
  AND created_at < appointments.created_at
)
```

**Recommendation**:
- ⚠️ **Keep if trigger computes it** (useful for queries, avoids expensive joins)
- ✅ **OR compute when needed** (if not queried frequently)

**Why**:
- Computing requires checking history (can be expensive)
- Stored is faster for queries

**Action**:
- **Option A**: Keep as stored (if trigger updates it) ✅ Current approach
- **Option B**: Remove, compute in views/queries (if not frequently queried)

**Current Implementation**: ✅ Trigger `update_patient_history` may compute this - **VERIFY**

---

### **5. `patient_clinic_history.punctuality_score` and `reliability_score`** ✅ COMPUTABLE

**Current**: Stored, but can be computed from appointments

**Computation**:
```sql
-- Punctuality: % of appointments where late_by_minutes <= 5
punctuality_score = (
  COUNT(*) FILTER (WHERE late_by_minutes <= 5 OR late_by_minutes IS NULL)
) / COUNT(*) * 100

-- Reliability: % of completed appointments (not no-shows)
reliability_score = (
  COUNT(*) FILTER (WHERE status = 'completed')
) / COUNT(*) * 100
```

**Recommendation**:
- ✅ **Keep as stored** (computed by trigger) ✅ Current approach
- ✅ **Trigger updates it** automatically

**Why**:
- Expensive to compute on-the-fly
- Stored is faster for queries
- Trigger ensures it's up-to-date

**Action**: ✅ **KEEP** - Already handled by trigger

---

## 📋 **FIELD PLACEMENT ISSUES**

### **1. Prediction Fields in Both Tables** ⚠️ DUPLICATION

**Problem**: Same prediction data in both `appointments` and `appointment_metrics`

**Current**:
```sql
-- appointments table:
predicted_wait_time, predicted_start_time, prediction_confidence, prediction_features, etc.

-- appointment_metrics table:
predicted_wait_time, confidence_score, features, etc.
```

**Recommendation**:
- ✅ **Store predictions ONLY in `appointment_metrics`** (versioned)
- ✅ **Remove from `appointments`** (except maybe `prediction_expires_at` for cache)

**Why**:
- Predictions change over time (versioned)
- Need historical tracking (what was predicted when)
- Avoid duplication and inconsistency

**Action**:
1. Create view: `appointments_with_latest_prediction` (JOIN latest `appointment_metrics`)
2. Remove prediction fields from `appointments` (except `prediction_expires_at`)
3. Update application to use `appointment_metrics` for predictions

---

### **2. `appointment_metrics.features` JSONB** ✅ CORRECT

**Current**: Stores feature snapshot at prediction time

**Analysis**: ✅ **Correct design**
- Features change over time (queue position, staff count, etc.)
- Need snapshot at prediction time
- JSONB allows flexible schema

**Recommendation**: ✅ **KEEP** - Good design

---

## 🎯 **FINAL RECOMMENDATIONS**

### **Remove (Redundant)**:
1. ❌ `appointments.actual_duration` - Compute from timestamps
2. ❌ `appointments.is_present` - Compute from `checked_in_at` or `status`
3. ❌ `appointments.day_of_week` - Compute from `appointment_date`
4. ❓ `appointments.patient_arrival_time` - Verify if same as `checked_in_at`
5. ❓ `appointments.start_time` / `end_time` - Clarify what they represent vs `actual_start_time` / `actual_end_time`

### **Move to `appointment_metrics` (Design)**:
1. ⚠️ `appointments.predicted_wait_time` → Move to `appointment_metrics`
2. ⚠️ `appointments.predicted_start_time` → Move to `appointment_metrics`
3. ⚠️ `appointments.prediction_confidence` → Move to `appointment_metrics` (already as `confidence_score`)
4. ⚠️ `appointments.prediction_features` → Move to `appointment_metrics` (already as `features`)
5. ⚠️ `appointments.prediction_mode` → Move to `appointment_metrics` (can add `mode` field)
6. ⚠️ `appointments.prediction_source` → Move to `appointment_metrics` (can add `source` field)
7. ✅ **Keep `prediction_expires_at` in `appointments`** (for cache invalidation)

### **Verify Usage (Subjective)**:
1. ⚠️ `appointments.complexity_score` - Check % usage
2. ⚠️ `appointments.requires_preparation` - Check % usage

### **Keep (Computed by Triggers)** ✅:
1. ✅ `appointments.late_by_minutes` - Computed by trigger
2. ✅ `appointments.is_holiday` - Computed by trigger
3. ✅ `appointments.time_slot` - Computed by trigger
4. ✅ `appointments.is_first_visit` - Computed by trigger (verify)
5. ✅ `patient_clinic_history.punctuality_score` - Computed by trigger
6. ✅ `patient_clinic_history.reliability_score` - Computed by trigger

---

## 📊 **Summary Table**

| Field | Status | Action |
|-------|--------|--------|
| `actual_duration` | ❌ Redundant | Remove, compute |
| `is_present` | ❌ Redundant | Remove, compute |
| `day_of_week` | ❌ Redundant | Remove, compute |
| `patient_arrival_time` | ❓ Verify | Check if same as `checked_in_at` |
| `start_time` / `end_time` | ❓ Clarify | Clarify vs `actual_start_time` |
| `predicted_*` fields | ⚠️ Move | Move to `appointment_metrics` |
| `complexity_score` | ⚠️ Verify | Check usage % |
| `requires_preparation` | ⚠️ Verify | Check usage % |
| `late_by_minutes` | ✅ Keep | Computed by trigger |
| `is_holiday` | ✅ Keep | Computed by trigger |
| `time_slot` | ✅ Keep | Computed by trigger |
| `is_first_visit` | ✅ Keep | Computed by trigger |

---

## 🔧 **Action Plan**

### **Phase 1: Verify & Clarify** (Before Making Changes)
1. ✅ Check `patient_arrival_time` usage - Same as `checked_in_at`?
2. ✅ Clarify `start_time` / `end_time` - What do they represent?
3. ✅ Check `complexity_score` usage - What % are NULL?
4. ✅ Check `requires_preparation` usage - What % are true?

### **Phase 2: Remove Redundant Fields**
1. ❌ Remove `actual_duration` (compute in views)
2. ❌ Remove `is_present` (compute from `checked_in_at`)
3. ❌ Remove `day_of_week` (compute from `appointment_date`)
4. ❓ Remove `patient_arrival_time` (if same as `checked_in_at`)

### **Phase 3: Refactor Predictions**
1. ⚠️ Create view: `appointments_with_latest_prediction`
2. ⚠️ Move prediction fields to `appointment_metrics`
3. ⚠️ Remove prediction fields from `appointments` (except `prediction_expires_at`)
4. ⚠️ Update application code to use `appointment_metrics`

---

## ✅ **CONCLUSION**

**Redundant Fields Found**: 5-6 fields  
**Non-Measurable Fields**: 2 fields (verify usage)  
**Design Issues**: Prediction fields in wrong table  

**Most Critical**:
1. ❌ Remove `actual_duration` (redundant)
2. ❌ Remove `is_present` (redundant)
3. ⚠️ Move prediction fields to `appointment_metrics` (design improvement)

