import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next"; // 🌍 ADD THIS
import { Activity, User, Building2, Mail, Lock, Phone, UserCircle, ArrowRight, Shield, Zap, Heart, Check } from "lucide-react";

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
  const { t } = useTranslation(); // 🌍 ADD THIS

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
    } catch (error: any) {
      toast({
        title: t('auth.signup.errorTitle'),
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
                {t('auth.signup.joinTitle')}
                <span className="block bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-600 bg-clip-text text-transparent">
                  {t('auth.signup.joinSubtitle')}
                </span>
              </h1>
              <p className="text-xl text-gray-600 leading-relaxed">
                {t('auth.signup.joinDescription')}
              </p>
            </div>

            {/* Benefits */}
            <div className="space-y-4">
              <div className="flex items-start gap-4 group">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all group-hover:scale-110 flex-shrink-0">
                  <Check className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{t('auth.signup.benefit1Title')}</p>
                  <p className="text-sm text-gray-600">{t('auth.signup.benefit1Desc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-4 group">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all group-hover:scale-110 flex-shrink-0">
                  <Check className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{t('auth.signup.benefit2Title')}</p>
                  <p className="text-sm text-gray-600">{t('auth.signup.benefit2Desc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-4 group">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all group-hover:scale-110 flex-shrink-0">
                  <Check className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{t('auth.signup.benefit3Title')}</p>
                  <p className="text-sm text-gray-600">{t('auth.signup.benefit3Desc')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Signup Form */}
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
                <h2 className="text-3xl font-bold text-gray-900">{t('auth.signup.title')}</h2>
                <p className="text-gray-600">{t('auth.signup.subtitle')}</p>
              </div>

              <form onSubmit={handleSignup} className="space-y-6">
                {/* User Type Selection */}
                <div className="space-y-3">
                  <Label className="text-gray-900 font-medium">{t('auth.signup.iAmA')}</Label>
                  <RadioGroup value={userType} onValueChange={(val) => setUserType(val as UserType)}>
                    <div 
                      className={`flex items-center space-x-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        userType === "patient" 
                          ? "border-blue-500 bg-blue-50/50 shadow-md" 
                          : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/30"
                      }`}
                      onClick={() => setUserType("patient")}
                    >
                      <RadioGroupItem value="patient" id="patient" />
                      <Label htmlFor="patient" className="flex items-center gap-3 cursor-pointer flex-1">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          userType === "patient" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                        }`}>
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{t('auth.signup.patient')}</p>
                          <p className="text-xs text-gray-500">{t('auth.signup.patientDesc')}</p>
                        </div>
                      </Label>
                    </div>
                    <div 
                      className={`flex items-center space-x-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        userType === "clinic_owner" 
                          ? "border-blue-500 bg-blue-50/50 shadow-md" 
                          : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/30"
                      }`}
                      onClick={() => setUserType("clinic_owner")}
                    >
                      <RadioGroupItem value="clinic_owner" id="clinic_owner" />
                      <Label htmlFor="clinic_owner" className="flex items-center gap-3 cursor-pointer flex-1">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          userType === "clinic_owner" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                        }`}>
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{t('auth.signup.healthcareProvider')}</p>
                          <p className="text-xs text-gray-500">{t('auth.signup.healthcareProviderDesc')}</p>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Form Fields */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-gray-900 font-medium">{t('auth.signup.fullName')}</Label>
                    <div className="relative group">
                      <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                      <Input
                        id="fullName"
                        placeholder={t('auth.signup.fullNamePlaceholder')}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="pl-12 h-12 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-900 font-medium">{t('auth.signup.email')}</Label>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                      <Input
                        id="email"
                        type="email"
                        placeholder={t('auth.signup.emailPlaceholder')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-12 h-12 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-gray-900 font-medium">{t('auth.signup.phone')}</Label>
                    <div className="relative group">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                      <Input
                        id="phone"
                        type="tel"
                        placeholder={t('auth.signup.phonePlaceholder')}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-12 h-12 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-gray-900 font-medium">{t('auth.signup.password')}</Label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                      <Input
                        id="password"
                        type="password"
                        placeholder={t('auth.signup.passwordPlaceholder')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-12 h-12 bg-white border-2 border-blue-100 text-gray-900 rounded-xl focus:border-blue-400 focus:shadow-lg focus:shadow-blue-100 transition-all"
                        required
                        minLength={6}
                      />
                    </div>
                    <p className="text-xs text-gray-500">{t('auth.signup.passwordHint')}</p>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all text-lg group" 
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      {t('auth.signup.creatingAccount')}
                    </span>
                  ) : (
                    <>
                      <span>{t('auth.signup.createAccount')}</span>
                      <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-gray-500"></span>
                  </div>
                </div>

                <p className="text-center text-gray-600">
                  {t('auth.signup.haveAccount')}{" "}
                  <Link to="/auth/login" className="text-blue-600 hover:text-blue-700 font-semibold hover:underline">
                    {t('auth.signup.signInLink')}
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