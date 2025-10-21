import { useState, useEffect } from "react";
import { 
  Heart, Activity, Shield, Stethoscope, Clock, Users, 
  Building2, Calendar,
  Star, Sparkles, TrendingUp,
  Pill, LineChart, Layers, BellRing
} from "lucide-react";

const WelcomePage = () => {
  const [hoveredFeature, setHoveredFeature] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const parallaxStyle = {
    transform: `translate(${mousePosition.x * 0.01}px, ${mousePosition.y * 0.01}px)`,
  };

  return (
    <div className="min-h-screen w-full bg-transparent overflow-hidden">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>


      {/* 3D Features Grid */}
      <section className="py-22 px-6">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-gray-900 mb-4">
              Everything You Need to
              <span className="block bg-gradient-to-r from-blue-600 to-sky-600 bg-clip-text text-transparent">
                Streamline Patient Care
              </span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Clock, title: "Real-Time Queue", desc: "Live updates on patient wait times", color: "blue" },
              { icon: Calendar, title: "Smart Scheduling", desc: "AI-powered appointment optimization", color: "sky" },
              { icon: Users, title: "Patient Portal", desc: "Self-service check-in and updates", color: "cyan" },
              { icon: Shield, title: "Data Security", desc: "Medical-grade encryption", color: "blue" },
              { icon: LineChart, title: "Analytics Dashboard", desc: "Insights to improve efficiency", color: "sky" },
              { icon: BellRing, title: "Instant Notifications", desc: "SMS and app alerts for patients", color: "cyan" },
            ].map((feature, index) => (
              <div 
                key={index}
                className="group relative"
                onMouseEnter={() => setHoveredFeature(index)}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                <div 
                  className="relative h-64 rounded-3xl bg-white border border-blue-100 shadow-xl overflow-hidden transition-all duration-500 hover:shadow-2xl"
                  style={{
                    transform: hoveredFeature === index ? 'perspective(1000px) rotateX(-5deg) scale(1.02)' : 'perspective(1000px) rotateX(0deg)',
                    transformStyle: 'preserve-3d'
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-50"></div>
                  <div className="relative p-8">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-sky-500 flex items-center justify-center mb-6 shadow-lg transform group-hover:scale-110 transition-transform`}>
                      <feature.icon className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
                    <p className="text-gray-600">{feature.desc}</p>
                  </div>
                  <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-blue-100 to-transparent rounded-tl-full opacity-50"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section with 3D Effect */}
      <section className="py-24 px-8 relative">
        <div className="container mx-auto">
          <div className="rounded-[3rem] bg-gradient-to-br from-blue-600 via-sky-600 to-cyan-600 p-16 relative overflow-hidden">
            <div className="absolute inset-0 bg-white/10"></div>
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 grid md:grid-cols-4 gap-8 text-white">
              {[
                { value: "50K+", label: "Patients Served", icon: Users },
                { value: "2K+", label: "Clinics Active", icon: Building2 },
                { value: "99.9%", label: "Uptime", icon: Shield },
                { value: "4.9", label: "User Rating", icon: Star },
              ].map((stat, index) => (
                <div 
                  key={index} 
                  className="text-center group"
                  style={{
                    animation: `slideUp 0.6s ease-out ${index * 0.1}s both`
                  }}
                >
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm mb-4 group-hover:scale-110 transition-transform">
                    <stat.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-5xl font-bold mb-2">{stat.value}</h3>
                  <p className="text-blue-100">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-24 px-8">
        <div className="container mx-auto text-center">
          <div className="max-w-3xl mx-auto space-y-8">
            <h2 className="text-5xl font-bold text-gray-900">
              Our Mission
              <span className="block bg-gradient-to-r from-blue-600 to-sky-600 bg-clip-text text-transparent">
                Better Healthcare for Everyone
              </span>
            </h2>
            <p className="text-xl text-gray-600 leading-relaxed">
              INTIDAR is dedicated to revolutionizing healthcare delivery through innovative technology. 
              We believe that efficient queue management and seamless appointment scheduling shouldn't be a luxury—
              it should be the standard. Our platform empowers clinics to deliver exceptional patient experiences 
              while optimizing their operations.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-8 border-t border-gray-200">
        <div className="container mx-auto flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-gray-900">INTIDAR</span>
            <span>© 2025 All rights reserved</span>
          </div>
          <div className="flex gap-6">
            <button className="hover:text-blue-600 transition-colors">Privacy</button>
            <button className="hover:text-blue-600 transition-colors">Terms</button>
            <button className="hover:text-blue-600 transition-colors">Contact</button>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default WelcomePage;