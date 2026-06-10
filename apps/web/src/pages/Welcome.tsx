import {
  Clock, Users, Shield, Calendar,
  Star, Building2, LineChart, BellRing,
  ArrowRight, Check
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

const WelcomePage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const { data: statsSnapshot } = useQuery({
    queryKey: ['public-welcome-stats'],
    queryFn: async () => {
      const { data: clinics, error: clinicError } = await supabase
        .from('clinics')
        .select('id, specialty')
        .eq('is_active', true);

      if (clinicError) throw clinicError;

      const clinicIds = clinics?.map((clinic) => clinic.id) ?? [];

      let totalRatings = 0;
      let weightedRatingSum = 0;
      if (clinicIds.length > 0) {
        const { data: ratingStats, error: ratingError } = await supabase
          .from('clinic_rating_stats')
          .select('average_rating, total_ratings')
          .in('clinic_id', clinicIds);

        if (ratingError) throw ratingError;

        for (const rating of ratingStats ?? []) {
          const total = Number(rating.total_ratings ?? 0);
          const average = Number(rating.average_rating ?? 0);
          if (total > 0 && Number.isFinite(average)) {
            totalRatings += total;
            weightedRatingSum += average * total;
          }
        }
      }

      const specialties = new Set((clinics ?? []).map((clinic) => clinic.specialty).filter(Boolean));

      return {
        totalClinics: clinics?.length ?? 0,
        totalSpecialties: specialties.size,
        totalRatings,
        averageRating: totalRatings > 0 ? weightedRatingSum / totalRatings : 0,
      };
    },
    staleTime: 10 * 60 * 1000,
  });

  const formatCompactNumber = (value: number) => {
    const locale = i18n.resolvedLanguage || i18n.language || 'en';
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  };

  const features = [
    { icon: Clock, title: t('about.features.queue.title'), desc: t('about.features.queue.desc') },
    { icon: Calendar, title: t('about.features.scheduling.title'), desc: t('about.features.scheduling.desc') },
    { icon: Users, title: t('about.features.portal.title'), desc: t('about.features.portal.desc') },
    { icon: Shield, title: t('about.features.security.title'), desc: t('about.features.security.desc') },
    { icon: LineChart, title: t('about.features.analytics.title'), desc: t('about.features.analytics.desc') },
    { icon: BellRing, title: t('about.features.notifications.title'), desc: t('about.features.notifications.desc') },
  ];

  const stats = [
    {
      value: statsSnapshot ? formatCompactNumber(statsSnapshot.totalRatings) : t('about.stats.loadingValue'),
      label: t('about.stats.patients'),
    },
    {
      value: statsSnapshot ? formatCompactNumber(statsSnapshot.totalClinics) : t('about.stats.loadingValue'),
      label: t('about.stats.clinics'),
    },
    {
      value: statsSnapshot ? formatCompactNumber(statsSnapshot.totalSpecialties) : t('about.stats.loadingValue'),
      label: t('about.stats.specialties'),
    },
    {
      value: statsSnapshot && statsSnapshot.averageRating > 0
        ? statsSnapshot.averageRating.toFixed(1)
        : t('about.stats.notAvailable'),
      label: t('about.stats.rating'),
    },
  ];

  const translatedBenefits = t('about.benefits.items', { returnObjects: true });
  const benefits = Array.isArray(translatedBenefits) ? translatedBenefits : [];

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <p className="text-sm font-medium text-muted-foreground mb-3 tracking-wide uppercase">
              {t('about.badge')}
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-foreground tracking-tight mb-4">
              {t('about.hero.title')}
              <span className="block text-muted-foreground mt-1">
                {t('about.hero.subtitle')}
              </span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              {t('about.mission.description')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => navigate('/doctors')}
                className="h-10 px-6 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-md"
              >
                {t('about.actions.findDoctor')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/auth/signup')}
                className="h-10 px-6 border-border hover:bg-muted text-sm font-medium rounded-md"
              >
                {t('about.actions.getStartedFree')}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-200">
            {stats.map((stat, index) => (
              <div key={index} className="py-8 sm:py-10 text-center">
                <p className="text-2xl sm:text-3xl font-semibold text-foreground mb-1">
                  {stat.value}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight mb-3">
              {t('about.featuresSection.title')}
            </h2>
            <p className="text-base text-muted-foreground max-w-xl mx-auto">
              {t('about.featuresSection.subtitle')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, index) => (
              <Card
                key={index}
                className="bg-card border border-border rounded-lg p-5 hover:shadow-sm transition-shadow"
              >
                <div className="w-10 h-10 rounded-lg bg-obsidian flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
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
              <p className="text-base text-muted-foreground mb-8 leading-relaxed">
                {t('about.mission.subtitle')}. {t('about.mission.standardLine')}
              </p>
              <div className="space-y-3">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm text-muted-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{t('about.clinicCard.title')}</p>
                    <p className="text-xs text-muted-foreground">{t('about.clinicCard.subtitle')}</p>
                  </div>
                </div>
                <div className="space-y-3 mb-6">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full bg-emerald-500 rounded-full ${statsSnapshot ? 'w-full' : 'w-1/3'}`}></div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t('about.clinicCard.metricLabel')}</span>
                    <span>{statsSnapshot ? formatCompactNumber(statsSnapshot.totalRatings) : t('about.stats.loadingValue')}</span>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/auth/signup')}
                  className="w-full h-9 bg-card hover:bg-muted text-foreground text-sm font-medium rounded-md"
                >
                  {t('about.clinicCard.register')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <Card className="bg-card border border-border rounded-lg p-8 sm:p-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight mb-3">
              {t('about.cta.title')}
            </h2>
            <p className="text-base text-muted-foreground mb-6 max-w-lg mx-auto">
              {t('about.cta.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => navigate('/doctors')}
                className="h-10 px-6 bg-obsidian hover:bg-obsidian-hover text-white text-sm font-medium rounded-md"
              >
                {t('about.cta.browseDoctors')}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/auth/signup')}
                className="h-10 px-6 border-border hover:bg-muted text-sm font-medium rounded-md"
              >
                {t('about.cta.createAccount')}
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-obsidian flex items-center justify-center">
                <span className="text-white text-xs font-bold">Q</span>
              </div>
              <span className="text-sm font-medium text-foreground">QueueMed</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('about.footer.copyright')}</p>
            <div className="flex gap-4">
              <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {t('about.footer.privacy')}
              </button>
              <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {t('about.footer.terms')}
              </button>
              <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
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
