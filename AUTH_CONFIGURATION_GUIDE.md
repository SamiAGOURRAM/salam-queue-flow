# 🔧 Supabase Auth Configuration Fix

## Issue: "Email not confirmed" Error

When users sign up, Supabase creates their account but requires email confirmation before they can log in. This is a security feature, but can be disabled for development.

## Solution Options

### Option 1: Disable Email Confirmation (Development Only)

**⚠️ Recommended for Development/Testing**

1. Go to your Supabase Dashboard:
   https://supabase.com/dashboard/project/giietgqfnhcfkjvneqdf/auth/providers

2. Click on **Email** provider

3. **Disable** "Confirm email" toggle

4. Save changes

**Result:** Users can sign up and immediately log in without confirming their email.

---

### Option 2: Enable Email Confirmation (Production)

**✅ Recommended for Production**

If you keep email confirmation enabled, users will receive an email with a confirmation link. You need to:

#### Step 1: Configure Email Templates

1. Go to: https://supabase.com/dashboard/project/giietgqfnhcfkjvneqdf/auth/templates

2. Customize the **Confirm signup** email template:
   ```html
   <h2>Confirm your signup</h2>
   <p>Follow this link to confirm your account:</p>
   <p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
   ```

#### Step 2: Configure Redirect URLs

1. Go to: https://supabase.com/dashboard/project/giietgqfnhcfkjvneqdf/auth/url-configuration

2. Add these URLs to **Redirect URLs**:
   ```
   http://localhost:8080/auth/callback
   http://localhost:8080/*
   https://yourdomain.com/auth/callback
   https://yourdomain.com/*
   ```

3. Set **Site URL** to:
   ```
   http://localhost:8080
   ```
   (Change to your production URL when deploying)

#### Step 3: Create Auth Callback Page

Create `/src/pages/auth/Callback.tsx`:

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const handleCallback = async () => {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
        navigate("/auth/login");
        return;
      }

      if (data.session) {
        toast({
          title: "Email confirmed!",
          description: "Your account has been verified.",
        });
        
        // Check user role and redirect
        const { data: userData } = await supabase
          .from("user_roles")
          .select("role, clinic_id")
          .eq("user_id", data.session.user.id)
          .single();

        if (userData) {
          if (userData.role === "clinic_owner" && !userData.clinic_id) {
            navigate("/auth/onboarding/clinic");
          } else if (userData.role === "clinic_owner") {
            navigate("/clinic/dashboard");
          } else if (userData.role === "patient") {
            navigate("/");
          }
        }
      }
    };

    handleCallback();
  }, [navigate, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Confirming your email...</p>
      </div>
    </div>
  );
}
```

#### Step 4: Add Route

Add to your router:
```tsx
import AuthCallback from "@/pages/auth/Callback";

// In your routes:
<Route path="/auth/callback" element={<AuthCallback />} />
```

---

## Troubleshooting the Clinic Setup Form

### Issue: "Complete Setup" Button Not Working

**Possible Causes:**

1. **User not authenticated**
   - Open browser console (F12)
   - Check for errors when clicking button
   - Verify user object exists in AuthContext

2. **Database permission errors**
   - Check if `clinics` table has INSERT policy for authenticated users
   - Verify RLS policies allow clinic creation

3. **Missing required fields**
   - All fields marked `required` must be filled
   - Check browser console for validation errors

### Fix: Check RLS Policies

Run this in Supabase SQL Editor:

```sql
-- Check if clinic_owner users can insert clinics
SELECT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE tablename = 'clinics'
  AND policyname LIKE '%insert%'
);

-- Add policy if missing
CREATE POLICY "Clinic owners can create clinics"
  ON clinics
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Allow clinic owners to insert staff
CREATE POLICY "Clinic owners can add staff"
  ON clinic_staff
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id IN (
      SELECT id FROM clinics WHERE owner_id = auth.uid()
    )
  );
```

### Fix: Add Better Error Logging

The updated clinic onboarding code now includes:
- ✅ Console logging for debugging
- ✅ Better error messages
- ✅ Fallback for optional fields (name_ar, email)
- ✅ Graceful handling of duplicate entries

**To test:**
1. Open browser console (F12)
2. Fill out the form
3. Click "Complete Setup"
4. Check console for any errors
5. Look for detailed error messages in toasts

---

## Current Status After Code Updates

### ✅ Signup Flow Fixed
- Better email confirmation handling
- Distinguishes between confirmed and unconfirmed emails
- Shows appropriate messages for each case
- Handles existing user emails

### ✅ Clinic Onboarding Fixed
- Added detailed console logging
- Better error messages
- Handles missing optional fields
- Graceful degradation for trigger conflicts

---

## Testing Steps

### Test 1: Email Confirmation Disabled
1. Disable email confirmation in Supabase dashboard
2. Sign up as healthcare provider
3. Should immediately redirect to clinic onboarding
4. Fill out form and submit
5. Should create clinic and redirect to dashboard

### Test 2: Email Confirmation Enabled
1. Enable email confirmation in Supabase dashboard
2. Sign up as healthcare provider
3. Should see "Check your email" message
4. Check email inbox for confirmation link
5. Click confirmation link
6. Should redirect to clinic onboarding
7. Complete form and submit

### Test 3: Existing Email
1. Try signing up with an existing email
2. Should see "Email already registered" error
3. Should suggest logging in instead

---

## Quick Fix Checklist

- [ ] Go to Supabase Auth settings
- [ ] Disable "Confirm email" for development
- [ ] Add redirect URLs for production
- [ ] Create auth callback page
- [ ] Test signup flow
- [ ] Open browser console when testing
- [ ] Check for any error messages
- [ ] Verify RLS policies allow clinic creation

---

## Production Recommendations

When going to production:

1. **Enable Email Confirmation** ✅
2. **Configure SMTP** (custom email provider)
3. **Add Custom Domain** for emails
4. **Set up Email Templates** with branding
5. **Configure Redirect URLs** for your domain
6. **Test Complete Flow** from signup to onboarding

---

## Support

If issues persist:
1. Check browser console for errors
2. Check Supabase logs: https://supabase.com/dashboard/project/giietgqfnhcfkjvneqdf/logs/explorer
3. Check Auth logs: https://supabase.com/dashboard/project/giietgqfnhcfkjvneqdf/auth/users
4. Look for failed signups or email delivery issues

**Most Common Issue:** Email confirmation is enabled but users don't check their email. Consider disabling it for development!
