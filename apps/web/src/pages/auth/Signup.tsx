import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { User, Building2 } from "lucide-react";

type UserType = "patient" | "clinic_owner";

export default function Signup() {
  const [searchParams] = useSearchParams();
  const [userType, setUserType] = useState<UserType>("patient");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  // Pre-fill form from URL parameters (for staff invitations)
  useEffect(() => {
    const emailParam = searchParams.get('email');
    const nameParam = searchParams.get('name');

    if (emailParam) {
      setEmail(emailParam);
    }
    if (nameParam) {
      setFullName(nameParam);
    }
  }, [searchParams]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (userType === "patient") {
        // For patients, create account immediately
        // Validate phone number is provided
        if (!phone || !phone.trim()) {
          toast({
            title: t('auth.signup.phoneRequiredTitle'),
            description: t('auth.signup.phoneRequiredDesc'),
            variant: "destructive",
          });
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone_number: phone.trim(),
              role: userType,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) throw error;

        if (data.user) {
          if (data.user.identities && data.user.identities.length === 0) {
            toast({
              title: t('auth.signup.emailExistsTitle'),
              description: t('auth.signup.emailExistsDesc'),
              variant: "destructive",
            });
            return;
          }

          toast({
            title: t('auth.signup.accountCreatedTitle'),
            description: t('auth.signup.accountCreatedDesc'),
          });

          navigate("/auth/onboarding/patient");
        }
      } else {
        // For clinic owners, store data and go to clinic setup WITHOUT creating account yet
        const signupData = {
          email,
          password,
          phone,
          fullName,
          userType,
        };

        // Store in sessionStorage (temporary)
        sessionStorage.setItem('clinicOwnerSignup', JSON.stringify(signupData));

        toast({
          title: t('auth.signup.nextStepTitle'),
          description: t('auth.signup.nextStepDesc'),
        });

        navigate("/auth/onboarding/clinic");
      }
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : t('auth.signup.errorDescription', { defaultValue: 'Unable to sign up' });
      toast({
        title: t('auth.signup.errorTitle'),
        description,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Dark with Form */}
      <div className="flex-1 bg-[#1a1a1a] flex flex-col">
        {/* Top Bar */}
        <div className="flex items-center justify-between p-6">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center">
              <span className="text-[#1a1a1a] text-sm font-bold">Q</span>
            </div>
            <span className="text-base font-semibold text-white">QueueMed</span>
          </button>
          <LanguageSwitcher />
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center px-6 pb-12">
          <div className="w-full max-w-md">
            {/* Headline */}
            <div className="mb-8">
              <h1 className="text-4xl sm:text-5xl font-serif text-white leading-tight mb-3">
                Join us,<br />
                <span className="text-gray-400">today.</span>
              </h1>
              <p className="text-gray-500 text-base">
                Create your account to get started
              </p>
            </div>

            {/* Form Card */}
            <div className="bg-white rounded-xl p-6 shadow-2xl">
              <form onSubmit={handleSignup} className="space-y-5">
                {/* User Type Selection */}
                <div>
                  <p className="block text-sm font-medium text-gray-700 mb-2">
                    {t('auth.signup.iAmA', "I'm signing up as")}
                  </p>
                  <RadioGroup
                    value={userType}
                    onValueChange={(val) => setUserType(val as UserType)}
                    className="grid grid-cols-2 gap-3"
                  >
                    <label
                      htmlFor="patient"
                      className={`relative flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        userType === "patient"
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <RadioGroupItem value="patient" id="patient" className="sr-only" />
                      <User className={`w-5 h-5 ${userType === "patient" ? "text-gray-900" : "text-gray-400"}`} />
                      <span className={`text-sm font-medium mt-2 ${userType === "patient" ? "text-gray-900" : "text-gray-600"}`}>
                        {t('auth.signup.patient', 'Patient')}
                      </span>
                    </label>
                    <label
                      htmlFor="clinic_owner"
                      className={`relative flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        userType === "clinic_owner"
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <RadioGroupItem value="clinic_owner" id="clinic_owner" className="sr-only" />
                      <Building2 className={`w-5 h-5 ${userType === "clinic_owner" ? "text-gray-900" : "text-gray-400"}`} />
                      <span className={`text-sm font-medium mt-2 ${userType === "clinic_owner" ? "text-gray-900" : "text-gray-600"}`}>
                        {t('auth.signup.healthcareProvider', 'Clinic')}
                      </span>
                    </label>
                  </RadioGroup>
                </div>

                {/* Form Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t('auth.signup.fullName', 'Full name')}
                    </label>
                    <Input
                      placeholder={t('auth.signup.fullNamePlaceholder', 'Enter your name')}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="h-11 border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t('auth.signup.email', 'Email')}
                    </label>
                    <Input
                      type="email"
                      placeholder={t('auth.signup.emailPlaceholder', 'Enter your email')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t('auth.signup.phone', 'Phone')}
                    </label>
                    <Input
                      type="tel"
                      placeholder={t('auth.signup.phonePlaceholder', '+212 6XX XXX XXX')}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-11 border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t('auth.signup.password', 'Password')}
                    </label>
                    <Input
                      type="password"
                      placeholder={t('auth.signup.passwordPlaceholder', 'Create a password')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 border-gray-200 rounded-lg text-sm"
                      required
                      minLength={6}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('auth.signup.passwordHint', 'Minimum 6 characters')}
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white text-sm font-medium rounded-lg"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      {t('auth.signup.creatingAccount', 'Creating account...')}
                    </span>
                  ) : (
                    t('auth.signup.createAccount', 'Create account')
                  )}
                </Button>

                {/* Terms */}
                <p className="text-xs text-gray-500 text-center">
                  By signing up, you agree to QueueMed's{" "}
                  <Link to="/terms" className="underline hover:text-gray-700">Terms</Link> and{" "}
                  <Link to="/privacy" className="underline hover:text-gray-700">Privacy Policy</Link>.
                </p>
              </form>

              {/* Sign in link */}
              <div className="mt-6 pt-6 border-t border-gray-100">
                <p className="text-sm text-gray-600 text-center">
                  {t('auth.signup.haveAccount', 'Already have an account?')}{" "}
                  <Link to="/auth/login" className="font-medium text-gray-900 hover:underline">
                    {t('auth.signup.signInLink', 'Sign in')}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Image/Illustration */}
      <div className="hidden lg:block lg:w-[45%] bg-[#e8f4f8] relative overflow-hidden">
        {/* Abstract Healthcare Illustration */}
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="relative w-full h-full max-w-lg">
            {/* Decorative elements */}
            <div className="absolute top-10 left-10 w-40 h-40 rounded-full bg-[#d0e8ef] opacity-60"></div>
            <div className="absolute bottom-16 right-10 w-56 h-56 rounded-full bg-[#c1dfe8] opacity-50"></div>
            <div className="absolute top-1/2 right-1/4 w-28 h-28 rounded-full bg-[#a8d4e1] opacity-40"></div>

            {/* Central card */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl p-8 w-80">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <User className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Welcome to QueueMed</p>
                  <p className="text-xs text-gray-500">Your healthcare, simplified</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm text-gray-700">Book appointments instantly</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-sm text-gray-700">Real-time queue updates</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <span className="text-sm text-gray-700">Secure health records</span>
                </div>
              </div>
            </div>

            {/* Floating stats */}
            <div className="absolute top-20 right-8 bg-white rounded-lg shadow-lg px-4 py-3">
              <p className="text-2xl font-bold text-gray-900">50K+</p>
              <p className="text-xs text-gray-500">Patients served</p>
            </div>

            <div className="absolute bottom-28 left-8 bg-white rounded-lg shadow-lg px-4 py-3">
              <p className="text-2xl font-bold text-gray-900">2K+</p>
              <p className="text-xs text-gray-500">Clinics registered</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
