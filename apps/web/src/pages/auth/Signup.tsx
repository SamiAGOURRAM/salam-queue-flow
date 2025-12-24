import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useForceLightMode } from "@/hooks/useForceLightMode";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { User, Building2 } from "lucide-react";
import heartImage from "@/assets/heart.png";

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
  
  // Force light mode on signup page
  useForceLightMode();

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
      {/* Left Side - Obsidian Dark with Form */}
      <div className="flex-1 bg-obsidian flex flex-col relative overflow-hidden">
        {/* Subtle noise texture */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
        
        {/* Top Bar */}
        <div className="relative flex items-center justify-between p-6">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center">
              <span className="text-obsidian text-sm font-bold">Q</span>
            </div>
            <span className="text-base font-semibold text-white">QueueMed</span>
          </button>
          <LanguageSwitcher />
        </div>

        {/* Content */}
        <div className="relative flex-1 flex items-center justify-center px-6 py-4 overflow-y-auto">
          <div className="w-full max-w-md">
            {/* Headline - Compact */}
            <div className="mb-5">
              <h1 className="text-3xl sm:text-4xl font-serif text-white leading-tight mb-2">
                Join us, <span className="text-gray-400">today.</span>
              </h1>
              <p className="text-gray-400 text-sm">
                Create your account to get started
              </p>
            </div>

            {/* Form Card - Compact */}
            <div className="bg-white rounded-xl p-5 shadow-2xl">
              <form onSubmit={handleSignup} className="space-y-4">
                {/* User Type Selection - Compact */}
                <div>
                  <p className="block text-xs font-medium text-gray-700 mb-1.5">
                    {t('auth.signup.iAmA', "I'm signing up as")}
                  </p>
                  <RadioGroup
                    value={userType}
                    onValueChange={(val) => setUserType(val as UserType)}
                    className="grid grid-cols-2 gap-2"
                  >
                    <label
                      htmlFor="patient"
                      className={`relative flex items-center justify-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        userType === "patient"
                          ? "border-obsidian bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <RadioGroupItem value="patient" id="patient" className="sr-only" />
                      <User className={`w-4 h-4 ${userType === "patient" ? "text-gray-900" : "text-gray-400"}`} />
                      <span className={`text-sm font-medium ${userType === "patient" ? "text-gray-900" : "text-gray-600"}`}>
                        {t('auth.signup.patient', 'Patient')}
                      </span>
                    </label>
                    <label
                      htmlFor="clinic_owner"
                      className={`relative flex items-center justify-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        userType === "clinic_owner"
                          ? "border-obsidian bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <RadioGroupItem value="clinic_owner" id="clinic_owner" className="sr-only" />
                      <Building2 className={`w-4 h-4 ${userType === "clinic_owner" ? "text-gray-900" : "text-gray-400"}`} />
                      <span className={`text-sm font-medium ${userType === "clinic_owner" ? "text-gray-900" : "text-gray-600"}`}>
                        {t('auth.signup.healthcareProvider', 'Clinic')}
                      </span>
                    </label>
                  </RadioGroup>
                </div>

                {/* Form Fields - Compact */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('auth.signup.fullName', 'Full name')}
                    </label>
                    <Input
                      placeholder={t('auth.signup.fullNamePlaceholder', 'Enter your name')}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="h-10 border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('auth.signup.email', 'Email')}
                    </label>
                    <Input
                      type="email"
                      placeholder={t('auth.signup.emailPlaceholder', 'Enter your email')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-10 border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('auth.signup.phone', 'Phone')}
                    </label>
                    <Input
                      type="tel"
                      placeholder={t('auth.signup.phonePlaceholder', '+212 6XX XXX XXX')}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-10 border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('auth.signup.password', 'Password')} <span className="text-gray-400 font-normal">(min 6 chars)</span>
                    </label>
                    <Input
                      type="password"
                      placeholder={t('auth.signup.passwordPlaceholder', 'Create a password')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-10 border-gray-200 rounded-lg text-sm"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-lg"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      {t('auth.signup.creatingAccount', 'Creating...')}
                    </span>
                  ) : (
                    t('auth.signup.createAccount', 'Create account')
                  )}
                </Button>

                {/* Terms */}
                <p className="text-[11px] text-gray-500 text-center leading-tight">
                  By signing up, you agree to QueueMed's{" "}
                  <Link to="/terms" className="underline hover:text-gray-700">Terms</Link> and{" "}
                  <Link to="/privacy" className="underline hover:text-gray-700">Privacy Policy</Link>.
                </p>
              </form>

              {/* Sign in link */}
              <div className="mt-4 pt-4 border-t border-gray-100">
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

      {/* Right Side - The Gallery */}
      <div className="hidden lg:block lg:w-[45%] relative overflow-hidden" style={{ backgroundColor: '#F9F8F6' }}>
        {/* Subtle noise texture - Heavy cardstock feel */}
        <div 
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
        
        {/* Elegant Tagline - Top Left */}
        <p 
          className="absolute top-12 left-12 text-lg font-serif tracking-wide z-10"
          style={{ color: '#3D5A45' }}
        >
          Your care, our priority.
        </p>

        {/* Hero 3D Asset - Heart centered */}
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <img 
            src={heartImage}
            alt="Healthcare heart"
            className="w-full h-full object-contain mix-blend-multiply"
            style={{ 
              transform: 'rotate(5deg) scale(1.1)',
              filter: 'contrast(1.05) brightness(1.02)'
            }}
          />
        </div>
      </div>
    </div>
  );
}
