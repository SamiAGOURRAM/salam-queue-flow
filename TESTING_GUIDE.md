# Testing Guide - Queue Management System

## ✅ Setup Complete!

Your database has been successfully migrated with all the new queue management features!

## What's Now Available

### Database Tables Created:
- ✅ `absent_patients` - Tracks patients marked absent with grace periods
- ✅ `queue_overrides` - Audit log of all queue modifications
- ✅ `clinic_notification_budgets` - Monthly SMS budget tracking
- ✅ `notification_templates` - Multilingual message templates
- ✅ `notification_analytics` - SMS delivery tracking

### Edge Functions Deployed:
- ⚠️ `smart-queue-manager` - Needs to be deployed
- ⚠️ `send-sms` - Needs to be deployed

## Next Steps

### 1. Deploy Edge Functions

```bash
# Deploy the smart queue manager
npx supabase functions deploy smart-queue-manager

# Deploy the SMS notification function
npx supabase functions deploy send-sms
```

### 2. Configure Twilio (Optional - for real SMS)

Add these secrets to your Supabase project:

```bash
# Via Supabase CLI
npx supabase secrets set TWILIO_ACCOUNT_SID=your_account_sid
npx supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token
npx supabase secrets set TWILIO_PHONE_NUMBER=+1234567890
```

Or via Supabase Dashboard:
1. Go to Project Settings → Edge Functions
2. Add environment variables:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`

**Note:** If you don't configure Twilio, the SMS function will run in **simulation mode** (logs to console instead of sending real SMS).

### 3. Test the Queue Management Flow

#### Test Scenario 1: Mark Patient Absent
1. Open the app and navigate to Clinic Queue page
2. Click "Mark Absent" on a waiting patient
3. **Expected Result:**
   - Patient moves to "Absent Patients" panel
   - Grace period countdown starts (10 minutes)
   - SMS notification logged (or sent if Twilio configured)
   - Audit log created in `queue_overrides` table

#### Test Scenario 2: Call Present Patient (Skip Queue)
1. Have multiple patients in the queue
2. Click "Call Present" on a patient who is NOT first in line
3. **Expected Result:**
   - Selected patient status changes to "in_progress"
   - Skipped patients' `skip_count` increments
   - Reassurance SMS sent to skipped patients
   - Audit log shows which patients were skipped

#### Test Scenario 3: Late Arrival
1. After a patient is marked absent (with active grace period)
2. Click "Arrived Late" button on the absent patient
3. **Expected Result:**
   - Patient removed from absent list
   - Re-queued at the end of the active queue
   - Position update SMS sent
   - Status changes to "waiting"

#### Test Scenario 4: Next Patient
1. Click "Next Patient" button
2. **Expected Result:**
   - Current patient marked as "completed"
   - Next patient in queue starts
   - "Your turn" SMS sent
   - All predicted wait times recalculated

### 4. Verify Real-time Updates

1. Open the queue page in **two browser windows**
2. Perform an action in one window (e.g., mark absent)
3. **Expected Result:**
   - Changes appear instantly in both windows
   - No page refresh needed

### 5. Check SMS Notifications

#### If Twilio is Configured:
- Check your phone for SMS messages
- Verify messages are in correct language (ar/fr/en)
- Check variables are replaced correctly (e.g., {patient_name})

#### If Using Simulation Mode:
1. Open browser console (F12)
2. Perform queue actions
3. Look for SMS logs like:
   ```
   [SMS SIMULATION] To: +212612345678
   Message: مرحباً Ahmed، لقد فاتك دورك في Dr. Smith Clinic...
   Cost: 0.05 MAD
   ```

### 6. Monitor Budget Usage

Check budget tracking in Supabase:

```sql
-- View clinic SMS budgets
SELECT * FROM clinic_notification_budgets;

-- View SMS analytics
SELECT * FROM notification_analytics
ORDER BY created_at DESC
LIMIT 20;

-- Check budget alerts
SELECT 
  clinic_id,
  monthly_sms_sent,
  monthly_sms_limit,
  (monthly_sms_sent::float / monthly_sms_limit * 100) as usage_percentage
FROM clinic_notification_budgets;
```

### 7. Verify Audit Trail

Check that all queue modifications are logged:

```sql
-- View recent queue overrides
SELECT 
  qo.*,
  c.name as clinic_name,
  p.full_name as staff_name
FROM queue_overrides qo
JOIN clinics c ON c.id = qo.clinic_id
JOIN profiles p ON p.id = qo.overridden_by
ORDER BY qo.created_at DESC
LIMIT 10;

-- Count overrides by reason
SELECT 
  action_type,
  COUNT(*) as count
FROM queue_overrides
GROUP BY action_type;
```

## Testing Checklist

- [ ] Database migrations applied successfully
- [ ] TypeScript types regenerated
- [ ] Edge functions deployed
- [ ] Twilio configured (or tested in simulation mode)
- [ ] Mark patient absent → Grace period visible
- [ ] Grace period countdown works
- [ ] Call present patient → Skip count increments
- [ ] Skipped patients get reassurance notification
- [ ] Late arrival → Patient re-queued at end
- [ ] Next patient → Queue advances correctly
- [ ] Real-time updates work across browser windows
- [ ] SMS notifications sent (or simulated)
- [ ] Bilingual UI displays correctly (Arabic/English)
- [ ] Budget tracking increments
- [ ] Audit trail logs all actions
- [ ] RLS policies enforce correct access

## Common Issues & Solutions

### Issue: TypeScript errors for new tables
**Solution:** Run `npx supabase gen types typescript --linked > src/integrations/supabase/types.ts`

### Issue: Edge functions not responding
**Solution:** Deploy them with `npx supabase functions deploy <function-name>`

### Issue: SMS not sending
**Solution:** 
1. Check Twilio credentials are set correctly
2. Verify phone numbers are in E.164 format (+212...)
3. Check function logs: `npx supabase functions logs send-sms`

### Issue: Real-time updates not working
**Solution:**
1. Check browser console for subscription errors
2. Verify RLS policies allow reads
3. Ensure clinic_id filter is correct

### Issue: Grace period not auto-calculating
**Solution:** The trigger should set it automatically. Check:
```sql
SELECT * FROM absent_patients WHERE grace_period_ends_at IS NULL;
```

## Monitoring

### View Edge Function Logs

```bash
# Smart queue manager logs
npx supabase functions logs smart-queue-manager --tail

# SMS function logs
npx supabase functions logs send-sms --tail
```

### Database Performance

```sql
-- Check slow queries
SELECT * FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Monitor real-time connections
SELECT * FROM pg_stat_activity
WHERE application_name = 'realtime';
```

## Production Readiness

Before going to production:

1. **Budget Limits:**
   - [ ] Set appropriate SMS limits per clinic
   - [ ] Configure budget alerts
   - [ ] Set up budget monitoring dashboard

2. **Security:**
   - [ ] Review all RLS policies
   - [ ] Test with different user roles
   - [ ] Audit edge function permissions

3. **Performance:**
   - [ ] Test with 100+ patients in queue
   - [ ] Monitor edge function cold starts
   - [ ] Check database query performance

4. **User Training:**
   - [ ] Train clinic staff on new features
   - [ ] Document queue override protocols
   - [ ] Create patient communication guidelines

## Support

If you encounter issues:
1. Check Supabase Dashboard → Logs
2. Review browser console for errors
3. Check edge function logs
4. Verify database schema in Table Editor

Happy testing! 🚀
