import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next"; // 🌍 ADD THIS
import { Activity, Mail, Lock, ArrowRight, Shield, Zap, Heart } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation(); // 🌍 ADD THIS

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
    } catch (error: any) {
      toast({
        title: t('auth.login.errorTitle'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-white to-sky-50 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>

      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">
          {/* Left Side - Branding */}
          <div className="hidden lg:block space-y-8">
            <div 
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity group"
              onClick={() => navigate("/")}
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-600 flex items-center justify-center shadow-xl group-hover:shadow-2xl transition-all group-hover:scale-105">
                <Activity className="w-8 h-8 text-white" />
              </div>
              <span className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-sky-600 bg-clip-text text-transparent">
                INTIDAR
              </span>
            </div>

            <div className="space-y-4">
              <h1 className="text-5xl font-bold text-gray-900 leading-tight">
                {t('auth.login.welcomeTitle')}
                <span className="block bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-600 bg-clip-text text-transparent">
                  {t('auth.login.welcomeSubtitle')}
                </span>
              </h1>
              <p className="text-xl text-gray-600 leading-relaxed">
                {t('auth.login.welcomeDescription')}
              </p>
            </div>

            {/* Features */}
            <div className="space-y-4">
              <div className="flex items-center gap-4 group">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all group-hover:scale-110">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{t('auth.login.feature1Title')}</p>
                  <p className="text-sm text-gray-600">{t('auth.login.feature1Desc')}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 group">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all group-hover:scale-110">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{t('auth.login.feature2Title')}</p>
                  <p className="text-sm text-gray-600">{t('auth.login.feature2Desc')}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 group">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all group-hover:scale-110">
                  <Heart className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{t('auth.login.feature3Title')}</p>
                  <p className="text-sm text-gray-600">{t('auth.login.feature3Desc')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Login Form */}
          <div className="relative">
            {/* Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-sky-400 rounded-3xl blur-2xl opacity-20"></div>
            
            <Card className="relative backdrop-blur-md bg-white/80 border border-white/60 rounded-3xl shadow-2xl p-8">
              {/* Mobile Logo */}
              <div 
                className="lg:hidden flex items-center justify-center gap-3 mb-8 cursor-pointer hover:opacity-80 transition-opacity group"
                onClick={() => navigate("/")}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-sky-600 flex items-center justify-center shadow-xl">
                  <Activity className="w-7 h-7 text-white" />
                </div>
                <span className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-sky-600 bg-clip-text text-transparent">
                  INTIDAR
                </span>
              </div>

              <div className="space-y-2 text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900">{t('auth.login.title')}</h2>
                <p className="text-gray-600">{t('auth.login.subtitle')}</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-900 font-medium">{t('auth.login.email')}</Label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('auth.login.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-12 h-14 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-900 font-medium">{t('auth.login.password')}</Label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                    <Input
                      id="password"
                      type="password"
                      placeholder={t('auth.login.passwordPlaceholder')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-12 h-14 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-gray-600">{t('auth.login.rememberMe')}</span>
                  </label>
                  <Link to="/auth/forgot-password" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">
                    {t('auth.login.forgotPassword')}
                  </Link>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all text-lg group" 
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      {t('auth.login.signingIn')}
                    </span>
                  ) : (
                    <>
                      <span>{t('auth.login.signIn')}</span>
                      <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-gray-500">{t('auth.login.orContinueWith')}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-xl transition-all"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span className="ml-2">{t('auth.login.google')}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-xl transition-all"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                    </svg>
                    <span className="ml-2">{t('auth.login.github')}</span>
                  </Button>
                </div>

                <p className="text-center text-gray-600">
                  {t('auth.login.noAccount')}{" "}
                  <Link to="/auth/signup" className="text-blue-600 hover:text-blue-700 font-semibold hover:underline">
                    {t('auth.login.signUpLink')}
                  </Link>
                </p>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}