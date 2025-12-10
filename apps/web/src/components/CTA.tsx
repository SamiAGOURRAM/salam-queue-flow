import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar } from "lucide-react";

interface CTAProps {
  onGetStarted?: () => void;
}

const CTA = ({ onGetStarted }: CTAProps) => {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-secondary to-accent opacity-10" />
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
      
      <div className="container mx-auto px-4 relative">
        <div className="max-w-4xl mx-auto text-center">
          {/* Content */}
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              Join 500+ Clinics Across Morocco
            </div>
            
            <h2 className="text-4xl lg:text-5xl font-bold mb-6">
              Ready to Eliminate
              <span className="block bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mt-2">
                Waiting Room Frustration?
              </span>
            </h2>
            
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Start your free trial today. No credit card required. Setup takes less than 5 minutes.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 justify-center mb-8">
              <Button size="lg" className="group shadow-xl hover:shadow-2xl transition-all text-lg px-8" onClick={onGetStarted}>
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="lg" variant="outline" className="shadow-lg hover:shadow-xl text-lg px-8">
                <Calendar className="mr-2 w-5 h-5" />
                Schedule Demo
              </Button>
            </div>
            
            {/* Trust Badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
                <span>Free 14-day trial</span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-border" />
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
                <span>No credit card needed</span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-border" />
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>
          
          {/* Decorative Elements */}
          <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        </div>
      </div>
    </section>
  );
};

export default CTA;
