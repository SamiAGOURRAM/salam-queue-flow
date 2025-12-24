import {
  Clock, Users, Shield, Calendar,
  Star, Building2, LineChart, BellRing,
  ArrowRight, Check
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const WelcomePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const features = [
    { icon: Clock, title: t('about.features.queue.title'), desc: t('about.features.queue.desc') },
    { icon: Calendar, title: t('about.features.scheduling.title'), desc: t('about.features.scheduling.desc') },
    { icon: Users, title: t('about.features.portal.title'), desc: t('about.features.portal.desc') },
    { icon: Shield, title: t('about.features.security.title'), desc: t('about.features.security.desc') },
    { icon: LineChart, title: t('about.features.analytics.title'), desc: t('about.features.analytics.desc') },
    { icon: BellRing, title: t('about.features.notifications.title'), desc: t('about.features.notifications.desc') },
  ];

  const stats = [
    { value: "50K+", label: t('about.stats.patients') },
    { value: "2K+", label: t('about.stats.clinics') },
    { value: "99.9%", label: t('about.stats.uptime') },
    { value: "4.9", label: t('about.stats.rating') },
  ];

  const benefits = [
    "Real-time queue tracking for patients",
    "AI-powered scheduling optimization",
    "HIPAA-compliant data security",
    "Multi-language support (EN, FR, AR)",
    "SMS and email notifications",
    "Analytics dashboard for clinics",
  ];

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <p className="text-sm font-medium text-gray-500 mb-3 tracking-wide uppercase">
              Healthcare Queue Management
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-gray-900 tracking-tight mb-4">
              {t('about.hero.title')}
              <span className="block text-gray-500 mt-1">
                {t('about.hero.subtitle')}
              </span>
            </h1>
            <p className="text-base sm:text-lg text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed">
              {t('about.mission.description')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => navigate('/clinics')}
                className="h-10 px-6 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-md"
              >
                Find a clinic
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/auth/signup')}
                className="h-10 px-6 border-gray-200 hover:bg-gray-50 text-sm font-medium rounded-md"
              >
                Get started free
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-200">
            {stats.map((stat, index) => (
              <div key={index} className="py-8 sm:py-10 text-center">
                <p className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-1">
                  {stat.value}
                </p>
                <p className="text-xs sm:text-sm text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight mb-3">
              Built for modern healthcare
            </h2>
            <p className="text-base text-gray-600 max-w-xl mx-auto">
              Everything you need to streamline patient flow and improve care delivery.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, index) => (
              <Card
                key={index}
                className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-sm transition-shadow"
              >
                <div className="w-10 h-10 rounded-lg bg-obsidian flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {feature.desc}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 sm:py-20 bg-obsidian">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-4">
                {t('about.mission.title')}
              </h2>
              <p className="text-base text-gray-400 mb-8 leading-relaxed">
                {t('about.mission.subtitle')}. We believe efficient queue management and easy appointment scheduling
                should be the standard, not a luxury.
              </p>
              <div className="space-y-3">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm text-gray-300">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-gray-900" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">For Clinics</p>
                    <p className="text-xs text-gray-400">Start managing your queue today</p>
                  </div>
                </div>
                <div className="space-y-3 mb-6">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full w-3/4 bg-emerald-500 rounded-full"></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Wait time reduced</span>
                    <span>75%</span>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/auth/signup')}
                  className="w-full h-9 bg-white hover:bg-gray-100 text-gray-900 text-sm font-medium rounded-md"
                >
                  Register your clinic
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <Card className="bg-white border border-gray-200 rounded-lg p-8 sm:p-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight mb-3">
              Ready to get started?
            </h2>
            <p className="text-base text-gray-600 mb-6 max-w-lg mx-auto">
              Join thousands of patients and clinics already using our platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => navigate('/clinics')}
                className="h-10 px-6 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-md"
              >
                Browse clinics
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/auth/signup')}
                className="h-10 px-6 border-gray-200 hover:bg-gray-50 text-sm font-medium rounded-md"
              >
                Create account
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-obsidian flex items-center justify-center">
                <span className="text-white text-xs font-bold">Q</span>
              </div>
              <span className="text-sm font-medium text-gray-900">QueueMed</span>
            </div>
            <p className="text-xs text-gray-500">{t('about.footer.copyright')}</p>
            <div className="flex gap-4">
              <button className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
                {t('about.footer.privacy')}
              </button>
              <button className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
                {t('about.footer.terms')}
              </button>
              <button className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
                {t('about.footer.contact')}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default WelcomePage;
