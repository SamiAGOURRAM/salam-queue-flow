import { Facebook, Twitter, Linkedin, Instagram } from "lucide-react";
import { Link } from "react-router-dom";

const socialLinks = [
  { href: "https://www.facebook.com/", label: "Facebook", icon: Facebook },
  { href: "https://x.com/", label: "X", icon: Twitter },
  { href: "https://www.linkedin.com/", label: "LinkedIn", icon: Linkedin },
  { href: "https://www.instagram.com/", label: "Instagram", icon: Instagram },
];

const productLinks = [
  { label: "Features", to: "/welcome#features" },
  { label: "Pricing", to: "/welcome#pricing" },
  { label: "Case Studies", to: "/welcome#case-studies" },
  { label: "Integrations", to: "/welcome#integrations" },
];

const companyLinks = [
  { label: "About Us", to: "/welcome" },
  { label: "Careers", to: "/welcome#careers" },
  { label: "Blog", to: "/welcome#blog" },
  { label: "Contact", to: "/welcome#contact" },
];

const legalLinks = [
  { label: "Privacy Policy", to: "/welcome#privacy-policy" },
  { label: "Terms of Service", to: "/welcome#terms-of-service" },
  { label: "Cookie Policy", to: "/welcome#cookie-policy" },
  { label: "HIPAA Compliance", to: "/welcome#hipaa" },
];

const Footer = () => {
  return (
    <footer className="bg-muted/30 border-t py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <span className="text-white font-bold text-sm">Q</span>
              </div>
              <span className="text-xl font-bold">QueueMed</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Modern queue management for Moroccan healthcare. Powered by AI.
            </p>
            <div className="flex gap-3">
              {socialLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={link.label}
                    className="w-9 h-9 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors"
                  >
                    <Icon className="w-4 h-4 text-primary" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="font-semibold mb-4">Product</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="hover:text-primary transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold mb-4">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="hover:text-primary transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="hover:text-primary transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t text-center text-sm text-muted-foreground">
          <p>© 2025 QueueMed. All rights reserved. Built for Moroccan Healthcare.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
