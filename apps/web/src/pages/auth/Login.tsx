import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Mail, Lock, ArrowRight } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        // Fetch user role to redirect appropriately
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .limit(1)
          .single();

        if (roles?.role === "patient") {
          navigate("/");
        } else if (roles?.role === "clinic_owner") {
          navigate("/clinic/dashboard");
        } else if (roles?.role === "staff") {
          navigate("/clinic/reception");
        } else {
          navigate("/");
        }

        toast({
          title: t('auth.login.successTitle'),
          description: t('auth.login.successDescription'),
        });
      }
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : t('auth.login.errorDescription', { defaultValue: 'Unable to sign in' });
      toast({
        title: t('auth.login.errorTitle'),
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
            <div className="mb-10">
              <h1 className="text-4xl sm:text-5xl font-serif text-white leading-tight mb-3">
                {t('auth.login.welcomeTitle', 'Welcome back')}
              </h1>
              <p className="text-gray-500 text-base">
                {t('auth.login.subtitle', 'Sign in to continue to your account')}
              </p>
            </div>

            {/* Form Card */}
            <div className="bg-white rounded-xl p-6 shadow-2xl">
              <form onSubmit={handleLogin} className="space-y-5">
                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                    {t('auth.login.email', 'Email')}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('auth.login.emailPlaceholder', 'Enter your email')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 pl-10 border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                    {t('auth.login.password', 'Password')}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="password"
                      type="password"
                      placeholder={t('auth.login.passwordPlaceholder', 'Enter your password')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pl-10 border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                </div>

                {/* Remember me & Forgot password */}
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
                    <span className="text-gray-600">{t('auth.login.rememberMe', 'Remember me')}</span>
                  </label>
                  <Link to="/auth/forgot-password" className="text-gray-600 hover:text-gray-900 font-medium">
                    {t('auth.login.forgotPassword', 'Forgot password?')}
                  </Link>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white text-sm font-medium rounded-lg"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      {t('auth.login.signingIn', 'Signing in...')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {t('auth.login.signIn', 'Sign in')}
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 bg-white text-xs text-gray-500 uppercase tracking-wider">
                      {t('auth.login.orContinueWith', 'or continue with')}
                    </span>
                  </div>
                </div>

                {/* Social Login */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className="h-11 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    {t('auth.login.google', 'Google')}
                  </button>
                  <button
                    type="button"
                    className="h-11 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                    </svg>
                    {t('auth.login.github', 'GitHub')}
                  </button>
                </div>

                {/* Terms */}
                <p className="text-xs text-gray-500 text-center">
                  By continuing, you acknowledge QueueMed's{" "}
                  <Link to="/privacy" className="underline hover:text-gray-700">Privacy Policy</Link>.
                </p>
              </form>

              {/* Sign up link */}
              <div className="mt-6 pt-6 border-t border-gray-100">
                <p className="text-sm text-gray-600 text-center">
                  {t('auth.login.noAccount', "Don't have an account?")}{" "}
                  <Link to="/auth/signup" className="font-medium text-gray-900 hover:underline">
                    {t('auth.login.signUpLink', 'Sign up')}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Image/Illustration */}
      <div className="hidden lg:block lg:w-[45%] bg-[#f5ebe0] relative overflow-hidden">
        {/* Abstract Healthcare Illustration */}
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="relative w-full h-full max-w-lg">
            {/* Decorative elements */}
            <div className="absolute top-10 right-10 w-32 h-32 rounded-full bg-[#e8d5c4] opacity-60"></div>
            <div className="absolute bottom-20 left-10 w-48 h-48 rounded-full bg-[#dcc9b6] opacity-50"></div>
            <div className="absolute top-1/3 left-1/4 w-24 h-24 rounded-full bg-[#c9b8a8] opacity-40"></div>

            {/* Central card */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl p-8 w-72">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Appointment Confirmed</p>
                  <p className="text-xs text-gray-500">Today at 2:30 PM</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-2 bg-gray-100 rounded-full w-full"></div>
                <div className="h-2 bg-gray-100 rounded-full w-3/4"></div>
                <div className="h-2 bg-gray-100 rounded-full w-1/2"></div>
              </div>
            </div>

            {/* Floating elements */}
            <div className="absolute top-16 left-8 bg-white rounded-lg shadow-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-xs font-medium text-gray-700">Queue: #3</span>
              </div>
            </div>

            <div className="absolute bottom-24 right-8 bg-white rounded-lg shadow-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gray-200"></div>
                <div>
                  <p className="text-xs font-medium text-gray-900">Dr. Smith</p>
                  <p className="text-[10px] text-gray-500">Available</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
