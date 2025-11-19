# Queue Mode Disruption Handling Logic

**Understanding the Three Modes: Fixed, Fluid, and Hybrid**

## Core Principle
All three modes **allow walk-ins**, but they differ in how they handle **no-shows** and **disruptions**.

---

## Mode 1: **FIXED SLOTS** (Strict Schedule)

### Characteristics:
- ✅ **Walk-ins allowed**: Can fill empty slots
- ❌ **NO SHIFTING**: Scheduled appointment times remain fixed
- 🕐 **Time is King**: 10:00 is 10:00, 11:00 is 11:00

### No-Show Handling:
**Scenario**: Patient scheduled for 10:00 is a no-show (marked absent after grace period)

**Behavior**:
1. **Slot time stays FIXED**: The 10:00 slot remains 10:00
2. **Next patient can be called early**: If 11:00 patient is present, they can be called at 10:15
3. **BUT**: 11:00 patient's **scheduled time does NOT change** (still shows as 11:00)
4. **Walk-in can fill empty slot**: A walk-in can be assigned to the 10:00 slot
5. **No cascading shifts**: Other scheduled appointments keep their original times

**Example**:
```
10:00 - No-show (empty)
10:15 - Call 11:00 patient early (they're present)
        → 11:00 patient's slot time: STILL 11:00 (not changed to 10:15)
        → Walk-in can be assigned to 10:00 slot
11:00 - Original 11:00 patient (if not already seen)
11:15 - Next scheduled patient (unchanged)
```

### Cancellation Handling:
- **Slot remains empty**: No shifting of other appointments
- **Walk-ins can fill**: Empty slots can be assigned to walk-ins
- **Scheduled times preserved**: All scheduled appointments keep their original times

---

## Mode 2: **FLUID QUEUE** (Smart Shifting)

### Characteristics:
- ✅ **Walk-ins allowed**: Aggressively fill gaps
- ✅ **AGGRESSIVE SHIFTING**: Everyone shifts up when disruptions occur
- 🔄 **Flow is King**: Priority-based, first-arrived-first-served

### No-Show Handling:
**Scenario**: Patient scheduled for 10:00 is a no-show

**Behavior**:
1. **Everyone shifts UP**: 11:00 becomes 10:15, 11:15 becomes 10:30, etc.
2. **Scheduled times UPDATE**: All subsequent appointments get new times
3. **Gap filling**: Walk-ins aggressively fill any gaps
4. **Priority-based**: Uses priority score to determine order

**Example**:
```
Before:
10:00 - Patient A (no-show)
11:00 - Patient B
11:15 - Patient C

After no-show:
10:00 - Patient B (shifted from 11:00)
10:15 - Patient C (shifted from 11:15)
10:30 - Walk-in (fills gap)
```

### Cancellation Handling:
- **YES, shift everyone up**: All appointments move forward
- **Aggressive gap filling**: Walk-ins fill gaps immediately
- **Dynamic rescheduling**: Times are recalculated based on flow

---

## Mode 3: **HYBRID** (Mixed Blocks)

### Characteristics:
- ✅ **Walk-ins allowed**: In designated walk-in blocks
- 🔀 **Mixed blocks**: Scheduled blocks + Walk-in blocks
- ⚠️ **Different no-show handling**: This is the key difference from Fixed

### No-Show Handling:
**Scenario**: Patient scheduled for 10:00 (in scheduled block) is a no-show

**Behavior** (TO BE CLARIFIED):
- **Scheduled blocks**: May behave like Fixed (no shifting) OR have special rules
- **Walk-in blocks**: May behave like Fluid (priority-based)
- **Block transitions**: Different rules when moving between block types

**Key Question**: How exactly does Hybrid handle no-shows differently from Fixed?

**Possible interpretations**:
1. **Option A**: In scheduled blocks, no-shows allow walk-ins to fill more aggressively than Fixed
2. **Option B**: Scheduled blocks have time-based rules (like Fixed), but walk-in blocks have priority-based rules (like Fluid)
3. **Option C**: No-shows in scheduled blocks trigger a transition to walk-in block behavior for that time period

### Example Structure:
```
09:00-11:00: Scheduled Block (Fixed-like behavior)
11:00-13:00: Walk-in Block (Fluid-like behavior)
13:00-15:00: Scheduled Block (Fixed-like behavior)
```

---

## "Who Is Next" Logic by Mode

### When Disruption Occurs (No-Show, Cancellation, Late Arrival):

#### **FIXED MODE**:
```typescript
getNextPatient() {
  // 1. Find earliest scheduled time with present patient
  // 2. If no-show created gap, walk-in can fill it
  // 3. Next scheduled patient can be called early, but time doesn't change
  // 4. Sort by: start_time ASC (time-based, no shifting)
}
```

#### **FLUID MODE**:
```typescript
getNextPatient() {
  // 1. Recalculate all positions (shift everyone up)
  // 2. Sort by: priority_score DESC, then queue_position ASC
  // 3. Walk-ins aggressively fill gaps
  // 4. Times are dynamic, not fixed
}
```

#### **HYBRID MODE**:
```typescript
getNextPatient() {
  // 1. Determine current block type (scheduled vs walk-in)
  // 2. If scheduled block: Use Fixed logic (time-based, no shifting)
  // 3. If walk-in block: Use Fluid logic (priority-based, shifting)
  // 4. Handle no-shows based on block type
  // TODO: Clarify exact no-show behavior
}
```

---

## Key Differences Summary

| Aspect | Fixed | Fluid | Hybrid |
|--------|-------|-------|--------|
| **Walk-ins** | ✅ Allowed | ✅ Allowed | ✅ Allowed (in blocks) |
| **Shifting** | ❌ NO | ✅ YES | 🔀 Depends on block |
| **No-show: Slot** | Stays empty | Filled by shift | ??? |
| **No-show: Times** | Preserved | Recalculated | ??? |
| **No-show: Walk-ins** | Can fill | Aggressively fill | ??? |

---

## Questions to Clarify

1. **Hybrid No-Show Handling**: How exactly does Hybrid handle no-shows differently from Fixed?
   - In scheduled blocks, do no-shows allow walk-ins to fill more aggressively?
   - Do scheduled blocks have different no-show rules than walk-in blocks?
   - Does a no-show in a scheduled block trigger a transition to walk-in behavior?

2. **Block Configuration**: How are blocks defined?
   - Time ranges (e.g., 09:00-11:00 scheduled, 11:00-13:00 walk-in)?
   - Percentage-based (e.g., 60% scheduled, 40% walk-in)?
   - Dynamic based on demand?

3. **Transition Logic**: When moving from scheduled block to walk-in block, how does the queue transition?
   - Do scheduled patients in the walk-in block get priority?
   - How are walk-ins handled during scheduled blocks?

---

## Implementation Notes

- All three modes need to handle the same disruption events:
  - No-shows (after grace period)
  - Cancellations
  - Late arrivals
  - Early arrivals
  - Walk-ins

- The difference is in the **response** to these disruptions:
  - **Fixed**: Preserve scheduled times, allow early calls, fill gaps with walk-ins
  - **Fluid**: Shift everyone, recalculate times, aggressive gap filling
  - **Hybrid**: Block-dependent behavior (needs clarification)

