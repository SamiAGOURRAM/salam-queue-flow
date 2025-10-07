import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, Clock, Bell } from "lucide-react";
import heroImage from "@/assets/hero-queue.jpg";

const Hero = () => {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-gradient-to-br from-primary/5 via-secondary/5 to-background">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
      
      <div className="container mx-auto px-4 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <Bell className="w-4 h-4" />
              AI-Powered Queue Intelligence
            </div>
            
            <h1 className="text-5xl lg:text-6xl font-bold leading-tight">
              Transform Your
              <span className="block bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Healthcare Waiting Experience
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground leading-relaxed max-w-xl">
              Smart queue management designed for Moroccan healthcare. Reduce wait times, predict arrivals with AI, and keep patients informed every step of the way.
            </p>
            
            {/* Feature Pills */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border shadow-sm">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Real-time Updates</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border shadow-sm">
                <Calendar className="w-4 h-4 text-secondary" />
                <span className="text-sm font-medium">Smart Scheduling</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border shadow-sm">
                <Bell className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium">SMS Notifications</span>
              </div>
            </div>
            
            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 pt-4">
              <Button size="lg" className="group shadow-lg hover:shadow-xl transition-all">
                Get Started Free
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="lg" variant="outline" className="shadow-sm hover:shadow-md">
                Watch Demo
              </Button>
            </div>
            
            {/* Trust Indicators */}
            <div className="flex items-center gap-6 pt-8 border-t">
              <div>
                <div className="text-3xl font-bold text-primary">500+</div>
                <div className="text-sm text-muted-foreground">Clinics Trust Us</div>
              </div>
              <div className="w-px h-12 bg-border" />
              <div>
                <div className="text-3xl font-bold text-secondary">50K+</div>
                <div className="text-sm text-muted-foreground">Daily Patients</div>
              </div>
              <div className="w-px h-12 bg-border" />
              <div>
                <div className="text-3xl font-bold text-accent">-40%</div>
                <div className="text-sm text-muted-foreground">Wait Time</div>
              </div>
            </div>
          </div>
          
          {/* Right Image */}
          <div className="relative animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border-8 border-background">
              <img 
                src={heroImage} 
                alt="Modern healthcare queue management system in action"
                className="w-full h-auto"
              />
              {/* Floating Elements */}
              <div className="absolute top-8 right-8 bg-card/95 backdrop-blur-sm px-6 py-4 rounded-xl shadow-lg border animate-scale-in">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Avg Wait Time</div>
                    <div className="text-2xl font-bold text-primary">12 min</div>
                  </div>
                </div>
              </div>
              
              <div className="absolute bottom-8 left-8 bg-card/95 backdrop-blur-sm px-6 py-4 rounded-xl shadow-lg border animate-scale-in" style={{ animationDelay: '0.4s' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                    <Bell className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Notifications Sent</div>
                    <div className="text-2xl font-bold text-accent">1,247</div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Decorative Elements */}
            <div className="absolute -z-10 top-1/4 -right-8 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute -z-10 bottom-1/4 -left-8 w-64 h-64 bg-secondary/10 rounded-full blur-3xl" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
