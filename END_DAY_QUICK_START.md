# 🚀 Quick Start: End Day Feature

## What You Need to Do

### 1️⃣ Apply the Migration (REQUIRED)

Open your Supabase Dashboard and run this SQL:

```bash
# Navigate to: Supabase Dashboard → SQL Editor → New Query
# Then paste the entire contents of:
supabase/migrations/20251026000002_end_day_rpc.sql

# Click "Run" or press Cmd/Ctrl + Enter
```

**✅ How to verify it worked:**
```sql
-- Run this in SQL Editor:
SELECT * FROM clinic_day_closures LIMIT 1;

-- Should return empty table (no errors)
```

---

### 2️⃣ Regenerate TypeScript Types (RECOMMENDED)

This fixes the TypeScript errors you see:

```bash
# In your terminal:
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/integrations/supabase/types.ts

# Or if using Supabase CLI:
supabase gen types typescript --local > src/integrations/supabase/types.ts
```

**Find your project ID:**
- Supabase Dashboard → Project Settings → General → Reference ID

---

### 3️⃣ Test It Out

1. **Go to Clinic Queue page** (`/clinic/queue`)
2. **Look for the RED "End Day" button** at the top (after stats)
3. **Click it** → Dialog opens with preview
4. **Review the impact** (shows what will change)
5. **Click "Continue to Confirmation"**
6. **Read warnings carefully**
7. **Check the box**: "I understand..."
8. **Click "YES, END DAY NOW"**
9. **Watch the magic** ✨ All appointments finalized!

---

## What It Does

### Before End Day:
```
Waiting: 5 patients
In Progress: 1 patient
Absent: 2 patients
Completed: 10 patients
```

### After End Day:
```
Waiting: 0 patients       ← All marked NO-SHOW
In Progress: 0 patients   ← Marked COMPLETED
Absent: 0 patients        ← All marked NO-SHOW
Completed: 11 patients    ← +1 from in-progress
No-Show: 7 patients       ← 5 waiting + 2 absent
```

---

## Safety Features

✅ **Two-step confirmation** (preview → confirm)  
✅ **Shows exact impact** before executing  
✅ **Checkbox required** to prevent accidents  
✅ **Atomic transaction** (all changes or none)  
✅ **Full audit trail** (who, when, why)  
✅ **Emergency rollback** available (via SQL if needed)

---

## Visual Guide

### The Button:
```
┌─────────────────────────────────────────┐
│  🔴 End Day                             │
│  Close queue & finalize all appointments│
│                          [End Day] ←RED │
└─────────────────────────────────────────┘
```

### Step 1 - Preview:
```
⚠️  WARNING: This action will immediately:
   • Mark all waiting patients as NO-SHOW
   • Mark all absent patients as NO-SHOW  
   • Mark current in-progress as COMPLETED
   • Close the queue for today

Impact Summary:
Will Mark NO-SHOW: 7
Will Mark COMPLETED: 1

Current State:
Waiting: 5
In Progress: 1
Absent: 2
Completed: 10
```

### Step 2 - Confirmation:
```
⚠️  FINAL CONFIRMATION REQUIRED

☑️ I understand that this will immediately close
   today's queue and update all pending appointments.

[← Go Back]  [YES, END DAY NOW] ← Big red button
```

---

## Troubleshooting

### "Button doesn't appear"
**Fix:** Check that `staffId` is being passed to `EnhancedQueueManager`
```tsx
// In ClinicQueue.tsx - should see:
<EnhancedQueueManager 
  clinicId={clinic.id}
  userId={user.id}
  staffId={staffProfile.id}  ← This is required!
/>
```

### "RPC function not found"
**Fix:** Run the migration (Step 1 above)

### "Permission denied"
**Fix:** Make sure you're logged in as a clinic staff member

### TypeScript errors in editor
**Fix:** Run Step 2 (regenerate types) - code still works, just IDE complaints

---

## When to Use

### ✅ Good Times:
- End of clinic day (5 PM, 6 PM, etc.)
- Emergency clinic closure
- Staff member ending shift early
- System maintenance prep

### ❌ Bad Times:
- Middle of the day (use individual actions)
- Just to skip one patient (use "Mark Absent")
- Testing without backup

---

## Emergency Rollback

If you click "End Day" by mistake, you can reopen:

```sql
-- 1. Find the closure ID
SELECT id, closure_date, performed_at 
FROM clinic_day_closures 
WHERE staff_id = 'YOUR_STAFF_ID'
AND closure_date = CURRENT_DATE
AND reopened_at IS NULL;

-- 2. Reopen (within 5 minutes for best results)
SELECT reopen_day_for_staff(
  p_closure_id := 'THE_ID_FROM_ABOVE'::UUID,
  p_performed_by := 'YOUR_USER_ID'::UUID,
  p_reason := 'Accidental closure'
);
```

---

## Next Steps

1. ✅ Apply migration
2. ✅ Test with a few test appointments
3. ✅ Train your staff on the workflow
4. ✅ Set up end-of-day routine:
   ```
   17:00 - Complete last patient
   17:05 - Review queue
   17:10 - Click "End Day"
   17:15 - Done! 🎉
   ```

---

**Questions?** Check the full docs: `END_DAY_FEATURE_README.md`

**Status after setup:** 🟢 Production Ready
