import { UserPlus, Bell, LineChart, CheckCircle2 } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    title: "Patient Joins Queue",
    description: "Patients check in via QR code, kiosk, or staff registration. No app download required.",
    step: "01"
  },
  {
    icon: Bell,
    title: "Real-time Updates",
    description: "Automatic SMS/WhatsApp notifications keep patients informed of their queue position and wait time.",
    step: "02"
  },
  {
    icon: LineChart,
    title: "AI Predictions",
    description: "Machine learning analyzes patterns to predict accurate wait times and optimize scheduling.",
    step: "03"
  },
  {
    icon: CheckCircle2,
    title: "Seamless Experience",
    description: "Patients arrive just in time, reducing crowding and improving satisfaction for everyone.",
    step: "04"
  }
];

const HowItWorks = () => {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 text-secondary text-sm font-medium mb-4">
            Simple & Powerful
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            How It Works
          </h2>
          <p className="text-xl text-muted-foreground">
            From check-in to consultation in four simple steps
          </p>
        </div>

        {/* Steps */}
        <div className="relative max-w-5xl mx-auto">
          {/* Connection Line */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-secondary to-accent -z-10" />
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div 
                key={index}
                className="relative animate-fade-in"
                style={{ animationDelay: `${index * 0.15}s` }}
              >
                {/* Step Card */}
                <div className="bg-card border-2 rounded-2xl p-6 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                  {/* Step Number */}
                  <div className="absolute -top-4 -right-4 w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                    {step.step}
                  </div>
                  
                  {/* Icon */}
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mb-4">
                    <step.icon className="w-8 h-8 text-primary" />
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
                
                {/* Arrow Connector (mobile) */}
                {index < steps.length - 1 && (
                  <div className="lg:hidden flex justify-center my-4">
                    <div className="w-0.5 h-8 bg-gradient-to-b from-primary to-secondary" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Stats */}
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-20">
          <div className="text-center p-6 rounded-xl bg-gradient-to-br from-primary/5 to-transparent border animate-fade-in" style={{ animationDelay: '0.6s' }}>
            <div className="text-4xl font-bold text-primary mb-2">2 min</div>
            <div className="text-sm text-muted-foreground">Average Setup Time</div>
          </div>
          <div className="text-center p-6 rounded-xl bg-gradient-to-br from-secondary/5 to-transparent border animate-fade-in" style={{ animationDelay: '0.7s' }}>
            <div className="text-4xl font-bold text-secondary mb-2">95%</div>
            <div className="text-sm text-muted-foreground">Patient Satisfaction</div>
          </div>
          <div className="text-center p-6 rounded-xl bg-gradient-to-br from-accent/5 to-transparent border animate-fade-in" style={{ animationDelay: '0.8s' }}>
            <div className="text-4xl font-bold text-accent mb-2">24/7</div>
            <div className="text-sm text-muted-foreground">Support Available</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
