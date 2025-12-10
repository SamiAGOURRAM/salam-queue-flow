import { Brain, MessageSquare, BarChart3, Smartphone, Shield, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: Brain,
    title: "AI Wait Time Predictions",
    description: "Machine learning algorithms analyze historical data to predict accurate wait times, helping patients plan their visits better.",
    color: "text-primary",
    bgColor: "bg-primary/10"
  },
  {
    icon: MessageSquare,
    title: "SMS & WhatsApp Alerts",
    description: "Real-time notifications via SMS and WhatsApp keep patients informed without apps. Perfect for the Moroccan market.",
    color: "text-secondary",
    bgColor: "bg-secondary/10"
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description: "Track queue metrics, patient flow, and peak times. Make data-driven decisions to optimize your clinic operations.",
    color: "text-accent",
    bgColor: "bg-accent/10"
  },
  {
    icon: Smartphone,
    title: "Mobile-First Design",
    description: "Works seamlessly on any device. Patients can check their queue status from anywhere, anytime.",
    color: "text-primary",
    bgColor: "bg-primary/10"
  },
  {
    icon: Shield,
    title: "HIPAA Compliant",
    description: "Enterprise-grade security ensures patient data privacy. Built with healthcare regulations in mind.",
    color: "text-secondary",
    bgColor: "bg-secondary/10"
  },
  {
    icon: Zap,
    title: "Instant Setup",
    description: "Get started in minutes, not days. No complex hardware or technical expertise required.",
    color: "text-accent",
    bgColor: "bg-accent/10"
  }
];

const Features = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            Built for Morocco's Healthcare
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Everything You Need to
            <span className="block bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Manage Queues Effectively
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Powerful features designed specifically for Moroccan healthcare providers and their patients
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card 
              key={index}
              className="group hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20 animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CardHeader>
                <div className={`w-14 h-14 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`w-7 h-7 ${feature.color}`} />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16 animate-fade-in" style={{ animationDelay: '0.6s' }}>
          <p className="text-lg text-muted-foreground mb-4">
            Ready to transform your waiting room experience?
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a 
              href="#" 
              className="inline-flex items-center gap-2 text-primary font-semibold hover:gap-3 transition-all"
            >
              Explore All Features
              <span className="text-xl">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
