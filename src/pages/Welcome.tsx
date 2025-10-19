import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { 
  Heart, Activity, Shield, Stethoscope, Clock, Users, 
  Building2, Calendar, ArrowRight, 
  Star, Sparkles, TrendingUp,
  Pill, LineChart, Layers, BellRing
} from "lucide-react";

const WelcomePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hoveredFeature, setHoveredFeature] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate("/my-appointments");
    }
  }, [user, navigate]);

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
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-white to-sky-50 overflow-hidden">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>

      {/* Navigation Bar */}
      <nav className="relative z-50 px-8 py-6">
        <div className="container mx-auto flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center shadow-2xl">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-sky-600 bg-clip-text text-transparent">
              INTIDAR
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate("/clinics")}
              className="px-4 py-3 text-gray-700 hover:text-blue-600 font-medium transition-colors"
            >
              Browse Clinics
            </button>
            <button 
              onClick={() => navigate("/auth/login")}
              className="px-6 py-3 rounded-xl border-2 border-blue-600 text-blue-600 font-semibold hover:bg-blue-50 transition-all"
            >
              Sign In
            </button>
            <button 
              onClick={() => navigate("/auth/signup")}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 text-white font-semibold hover:from-blue-700 hover:to-sky-700 shadow-lg hover:shadow-xl transition-all"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section with 3D Elements */}
      <section className="relative pt-20 pb-32 px-8">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            {/* Left Content */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-sky-100 border border-blue-200">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Next-Gen Healthcare Management</span>
                <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-green-400 to-emerald-400 text-white text-xs font-bold">NEW</span>
              </div>

              <h1 className="text-7xl font-bold text-gray-900 leading-tight">
                Smart Queue
                <span className="block bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-600 bg-clip-text text-transparent">
                  Management
                </span>
                <span className="block text-gray-900">Redefined</span>
              </h1>

              <p className="text-xl text-gray-600 leading-relaxed">
                Transform your clinic's patient flow with intelligent queue management. 
                Real-time tracking, zero wait times, and seamless appointment scheduling 
                all in one powerful platform.
              </p>

              <div className="flex flex-wrap gap-4">
                <button 
                  onClick={() => navigate("/auth/signup")}
                  className="group px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-sky-600 text-white font-semibold shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all"
                >
                  <span className="flex items-center gap-2">
                    Get Started
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </button>
                <button 
                  onClick={() => navigate("/clinics")}
                  className="px-8 py-4 rounded-2xl bg-white border-2 border-blue-200 text-gray-700 font-semibold hover:border-blue-400 hover:bg-blue-50 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Browse Clinics
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-8">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-sky-400 border-2 border-white"></div>
                  ))}
                </div>
                <div>
                  <p className="text-sm text-gray-500">Trusted by</p>
                  <p className="text-lg font-bold text-gray-900">2,000+ Clinics</p>
                </div>
              </div>
            </div>

            {/* Right Side - 3D Cards */}
            <div className="relative h-[600px]" style={parallaxStyle}>
              {/* 3D Hospital Card */}
              <div 
                className="absolute top-0 right-0 w-72 h-40 rounded-3xl bg-gradient-to-br from-blue-500 to-sky-500 shadow-2xl transform rotate-3 hover:rotate-0 transition-all duration-500"
                style={{
                  transform: `perspective(1000px) rotateX(5deg) rotateY(-10deg) ${hoveredFeature === 'hospital' ? 'scale(1.05)' : ''}`,
                  transformStyle: 'preserve-3d'
                }}
                onMouseEnter={() => setHoveredFeature('hospital')}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                <div className="relative h-full p-6 text-white">
                  <Building2 className="w-10 h-10 mb-2" />
                  <h3 className="text-xl font-bold">Smart Hospital</h3>
                  <p className="text-blue-100 text-sm mt-1">Manage entire facility</p>
                  <div className="absolute bottom-4 right-4">
                    <div className="w-16 h-16 rounded-xl bg-white/20 backdrop-blur-sm"></div>
                  </div>
                </div>
              </div>

              {/* 3D Pills Card */}
              <div 
                className="absolute top-44 left-0 w-64 h-36 rounded-3xl bg-white shadow-2xl border border-blue-100 transform -rotate-3 hover:rotate-0 transition-all duration-500"
                style={{
                  transform: `perspective(1000px) rotateX(-5deg) rotateY(10deg) ${hoveredFeature === 'medicine' ? 'scale(1.05)' : ''}`,
                  transformStyle: 'preserve-3d'
                }}
                onMouseEnter={() => setHoveredFeature('medicine')}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                <div className="relative h-full p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-400 flex items-center justify-center">
                      <Pill className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Smart Booking</h3>
                      <p className="text-xs text-gray-500">Instant appointments</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-sky-50"></div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3D Stats Card */}
              <div 
                className="absolute bottom-20 right-10 w-80 h-44 rounded-3xl bg-gradient-to-br from-white to-blue-50 shadow-2xl border border-blue-100 transform rotate-2 hover:rotate-0 transition-all duration-500"
                style={{
                  transform: `perspective(1000px) rotateX(8deg) rotateY(-5deg) ${hoveredFeature === 'stats' ? 'scale(1.05)' : ''}`,
                  transformStyle: 'preserve-3d'
                }}
                onMouseEnter={() => setHoveredFeature('stats')}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                <div className="relative h-full p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900">Live Analytics</h3>
                    <LineChart className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Patients Today</span>
                      <span className="text-2xl font-bold text-blue-600">247</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Avg Wait Time</span>
                      <span className="text-2xl font-bold text-green-600">8 min</span>
                    </div>
                  </div>
                  <div className="absolute bottom-4 right-4">
                    <TrendingUp className="w-8 h-8 text-green-400" />
                  </div>
                </div>
              </div>

              {/* Floating 3D Elements */}
              <div className="absolute top-32 right-32 w-20 h-20 animate-float">
                <div className="w-full h-full rounded-2xl bg-gradient-to-br from-blue-400 to-sky-400 shadow-xl flex items-center justify-center transform rotate-12">
                  <Stethoscope className="w-10 h-10 text-white" />
                </div>
              </div>

              <div className="absolute bottom-40 left-20 w-16 h-16 animate-float" style={{animationDelay: '2s'}}>
                <div className="w-full h-full rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-400 shadow-xl flex items-center justify-center transform -rotate-12">
                  <Heart className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3D Features Grid */}
      <section className="py-24 px-8">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-sky-100 border border-blue-200 mb-6">
              <Layers className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Powerful Features</span>
            </div>
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

      {/* CTA Section */}
      <section className="py-24 px-8">
        <div className="container mx-auto text-center">
          <div className="max-w-3xl mx-auto space-y-8">
            <h2 className="text-5xl font-bold text-gray-900">
              Ready to Transform Your
              <span className="block bg-gradient-to-r from-blue-600 to-sky-600 bg-clip-text text-transparent">
                Healthcare Experience?
              </span>
            </h2>
            <p className="text-xl text-gray-600">
              Join thousands of patients and clinics already using QueueMed to deliver exceptional healthcare experiences.
            </p>
            <div className="flex items-center justify-center gap-4">
              <button 
                onClick={() => navigate("/auth/signup")}
                className="group px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-sky-600 text-white font-semibold shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all"
              >
                <span className="flex items-center gap-2">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
              <button 
                onClick={() => navigate("/clinics")}
                className="px-8 py-4 rounded-2xl bg-white border-2 border-blue-200 text-gray-700 font-semibold hover:border-blue-400 hover:bg-blue-50 transition-all"
              >
                Browse Clinics
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-8 border-t border-gray-200">
        <div className="container mx-auto flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-gray-900">QueueMed</span>
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