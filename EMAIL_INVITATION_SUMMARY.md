# 📊 Email-Based Staff Invitation - Implementation Summary

## 🎯 Goal
Convert the staff invitation system from **SMS (Twilio)** to **Email (Brevo)** for free, reliable invitations.

---

## 📋 Current State vs Target State

| Component | Current State | Target State |
|-----------|--------------|--------------|
| **Database** | `phone_number` (required) | `email` (required), `phone_number` (optional) |
| **Edge Function** | Twilio SMS API | Brevo Email API |
| **TeamManagement** | Sends `email` & `name` | Sends `email` & `fullName` ✅ |
| **AcceptInvitation** | Reads `phone_number` | Reads `email` + validation |
| **Signup** | No URL params | Pre-fills from URL params |
| **RLS Policies** | Owners only | Owners + self-insertion |

---

## 🔑 Key Changes Required

### 1️⃣ **Database** (2 migrations)
- Add `email` column to `staff_invitations`
- Make `phone_number` nullable
- Add RLS policies for staff self-insertion

### 2️⃣ **Edge Function** (Complete rewrite)
- Remove: Twilio SMS code
- Add: Brevo API email sending
- Update: Interface to use `email` instead of `phoneNumber`

### 3️⃣ **Frontend** (3 files)
- **TeamManagement.tsx**: Fix parameter name (`name` → `fullName`)
- **AcceptInvitation.tsx**: 
  - Change `phone_number` → `email`
  - Add email validation
  - Add duplicate checks
  - Add logout button
- **Signup.tsx**: Add URL parameter pre-filling

### 4️⃣ **External Setup**
- Create Brevo account (free)
- Get API key
- Verify sender email
- Configure Supabase secrets

---

## 📦 Deliverables

### New Files:
1. `supabase/migrations/20251020_add_email_to_staff_invitations.sql`
2. `supabase/migrations/20251020_staff_invitation_rls.sql`
3. `EMAIL_INVITATION_IMPLEMENTATION_PLAN.md` (this file)

### Modified Files:
1. `supabase/functions/send-staff-invitation/index.ts`
2. `src/pages/clinic/TeamManagement.tsx`
3. `src/pages/AcceptInvitation.tsx`
4. `src/pages/auth/Signup.tsx`

---

## 🚦 Implementation Order

```
1. Database Migrations (5 min)
   ↓
2. Brevo Account Setup (10 min)
   ↓
3. Configure Supabase Secrets (2 min)
   ↓
4. Update Edge Function (20 min)
   ↓
5. Update Frontend Files (20 min)
   ↓
6. Test End-to-End (15 min)
```

**Total Estimated Time: 1-2 hours**

---

## ⚠️ Critical Issues to Avoid

### ❌ Don't Do This:
1. **Parameter Mismatch**: Using `name` instead of `fullName` in API calls
2. **Auth.users Access**: Querying `auth.users` in RLS policies (permission denied)
3. **No Duplicate Checks**: Inserting without checking existing records (409 error)
4. **Wrong Account Login**: Not validating email matches invitation

### ✅ Do This Instead:
1. **Use consistent naming**: `fullName` across all interfaces
2. **Use profiles table**: Join with `profiles` instead of `auth.users`
3. **Check before insert**: Use `.maybeSingle()` to check existence
4. **Validate email**: Compare user's email with invitation email

---

## 🧪 Testing Checklist

```
□ Database migrations run successfully
□ Brevo API key is valid and configured
□ Sender email is verified in Brevo
□ Edge function deploys without errors
□ Edge function logs show successful email send
□ Email arrives in inbox (check spam!)
□ Invitation link opens correct page
□ Signup form pre-fills email and name
□ Wrong account shows error message
□ Logout button works on invitation page
□ Duplicate invitation doesn't cause 409 error
□ Staff record created in clinic_staff table
□ User role created in user_roles table
□ Invitation status updates to 'accepted'
□ Staff member can access clinic queue
```

---

## 🆘 Quick Troubleshooting

| Error | Solution |
|-------|----------|
| "Permission denied for table users" | Update RLS policies to use `profiles` table |
| 409 Conflict | Add `.maybeSingle()` duplicate checks |
| "Wrong account" | User logged in with different email - show logout |
| Email not received | Check spam, verify sender in Brevo |
| "name is undefined" | Change `name` to `fullName` in TeamManagement |

---

## 📞 Support Resources

- **Brevo Documentation**: https://developers.brevo.com/
- **Brevo API Reference**: https://developers.brevo.com/reference/sendtransacemail
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions
- **Implementation Plan**: See `EMAIL_INVITATION_IMPLEMENTATION_PLAN.md`

---

## ✨ Benefits After Implementation

1. ✅ **Free**: 300 emails/day with Brevo (vs paid Twilio)
2. ✅ **No Domain Required**: Works with any email
3. ✅ **Better UX**: Email > SMS for professional invitations
4. ✅ **Rich Content**: HTML emails with branding
5. ✅ **Reliable Delivery**: Better than SMS in many regions
6. ✅ **Audit Trail**: Email records for compliance
7. ✅ **Easy Testing**: No need for real phone numbers

---

## 🎯 Next Steps

1. Read the full implementation plan: `EMAIL_INVITATION_IMPLEMENTATION_PLAN.md`
2. Follow Phase 1: Database Schema Updates
3. Follow Phase 2: Edge Function Integration
4. Follow Phase 3: Frontend Updates
5. Follow Phase 4: Brevo Setup
6. Test the complete flow

**Ready to start? Let's implement! 🚀**
