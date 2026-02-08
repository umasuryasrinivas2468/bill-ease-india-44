import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  FileText, 
  Users, 
  BarChart3, 
  Calculator, 
  Shield, 
  Clock, 
  CheckCircle,
  ArrowRight,
  Star
} from 'lucide-react';

const Landing = () => {
  const features = [
    {
      icon: FileText,
      title: "Smart Invoicing",
      description: "Create professional invoices with GST compliance and automated calculations"
    },
    {
      icon: Users,
      title: "Client Management", 
      description: "Organize client information and track payment history effortlessly"
    },
    {
      icon: BarChart3,
      title: "GST Reports",
      description: "Generate comprehensive GST reports for easy tax filing and compliance"
    },
    {
      icon: Calculator,
      title: "CA Tools",
      description: "Professional accounting tools including ledgers, trial balance, and profit & loss"
    },
    {
      icon: Shield,
      title: "Secure & Reliable",
      description: "Your business data is protected with enterprise-grade security"
    },
    {
      icon: Clock,
      title: "Save Time",
      description: "Automate repetitive tasks and focus on growing your business"
    }
  ];

  const testimonials = [
    {
      name: "Rajesh Kumar",
      business: "Kumar Enterprises",
      text: "Aczen has simplified my entire invoicing process. GST compliance is now effortless!"
    },
    {
      name: "Priya Sharma", 
      business: "Sharma Consultancy",
      text: "The CA tools are incredible. I can manage all my accounting needs in one place."
    },
    {
      name: "Mohammed Ali",
      business: "Ali Trading Co.",
      text: "Client management has never been easier. Highly recommend Aczen!"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-orange-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-gradient-to-r from-blue-600 to-orange-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-orange-500 bg-clip-text text-transparent">
                Aczen
              </h1>
            </div>
            <div className="space-x-4">
              <Button variant="ghost" asChild>
                <Link to="/login">Sign In</Link>
              </Button>
              <Button asChild className="bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600">
                <Link to="/clerk-login">Get Started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="bg-gradient-to-r from-blue-600 to-orange-500 bg-clip-text text-transparent">
              Smart Business
            </span>
            <br />
            Solutions for India
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Streamline your business with professional invoicing, GST compliance, 
            client management, and powerful CA tools - all in one platform.
          </p>
          <div className="space-x-4">
            <Button 
              size="lg" 
              asChild
              className="bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-lg px-8 py-3"
            >
              <Link to="/clerk-login">
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg px-8 py-3">
              <Link to="/login">Sign In</Link>
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            No credit card required • Free 30-day trial
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything You Need</h2>
            <p className="text-xl text-gray-600">
              Powerful features designed for Indian businesses
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader>
                  <div className="h-12 w-12 bg-gradient-to-r from-blue-600 to-orange-500 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Trusted by Businesses</h2>
            <p className="text-xl text-gray-600">
              See what our customers say about Aczen
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-gray-600 mb-4">"{testimonial.text}"</p>
                  <div>
                    <p className="font-semibold">{testimonial.name}</p>
                    <p className="text-sm text-gray-500">{testimonial.business}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-orange-500">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Transform Your Business?
          </h2>
          <p className="text-xl text-white/90 mb-8">
            Join thousands of businesses already using Aczen
          </p>
          <Button 
            size="lg" 
            asChild
            className="bg-white text-blue-600 hover:bg-gray-50 text-lg px-8 py-3"
          >
            <Link to="/clerk-login">
              Get Started Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="h-8 w-8 bg-gradient-to-r from-blue-600 to-orange-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">A</span>
                </div>
                <h3 className="text-xl font-bold">Aczen</h3>
              </div>
              <p className="text-gray-400">
                Smart Business Solutions for the modern Indian entrepreneur.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Invoicing</li>
                <li>GST Reports</li>
                <li>Client Management</li>
                <li>CA Tools</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Help Center</li>
                <li>Contact Us</li>
                <li>Documentation</li>
                <li>Community</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li>About Us</li>
                <li>Privacy Policy</li>
                <li>Terms of Service</li>
                <li>Blog</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Aczen. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;