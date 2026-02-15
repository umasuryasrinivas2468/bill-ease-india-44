import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ExternalLink, 
  Smartphone, 
  Monitor, 
  Key, 
  Mail, 
  HelpCircle,
  CheckCircle 
} from 'lucide-react';

interface ApplicationAccessGuideProps {
  email: string;
  licenseKey: string;
  planType: string;
}

export const ApplicationAccessGuide: React.FC<ApplicationAccessGuideProps> = ({
  email,
  licenseKey,
  planType
}) => {
  const accessSteps = [
    {
      icon: Monitor,
      title: "Web Application Access",
      description: "Visit https://app.aczen.com on your computer or tablet",
      action: () => window.open('https://app.aczen.com', '_blank'),
      buttonText: "Open Web App"
    },
    {
      icon: Smartphone,
      title: "Mobile Application",
      description: "Download the Aczen app from Play Store or App Store",
      action: () => {
        // Detect device and redirect accordingly
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('android')) {
          window.open('https://play.google.com/store/search?q=aczen&c=apps', '_blank');
        } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
          window.open('https://apps.apple.com/search?term=aczen', '_blank');
        } else {
          // Desktop - show both options
          window.open('https://play.google.com/store/search?q=aczen&c=apps', '_blank');
        }
      },
      buttonText: "Download App"
    }
  ];

  const loginSteps = [
    "Visit the application (web or mobile)",
    "Click 'Sign In' or 'Log In'",
    `Enter your email: ${email}`,
    "Create a password if it's your first time",
    `Enter your license key: ${licenseKey}`,
    "Complete the setup wizard"
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-600" />
            Application Access Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Access Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accessSteps.map((step, index) => (
              <Card key={index} className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <step.icon className="w-6 h-6 text-blue-600 mt-1" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm">{step.title}</h3>
                      <p className="text-xs text-gray-600 mt-1">{step.description}</p>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="mt-2 text-xs"
                        onClick={step.action}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        {step.buttonText}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Login Steps */}
          <Alert>
            <Mail className="w-4 h-4" />
            <AlertDescription>
              <div>
                <div className="font-semibold mb-2">How to Sign In:</div>
                <ol className="text-sm space-y-1">
                  {loginSteps.map((step, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="bg-blue-100 text-blue-800 text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium mt-0.5">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </AlertDescription>
          </Alert>

          {/* Plan Benefits */}
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-800 text-sm">
                    Your {planType.charAt(0).toUpperCase() + planType.slice(1)} Plan Includes:
                  </h3>
                  <ul className="text-xs text-green-700 mt-2 space-y-1">
                    <li>• Complete accounting management</li>
                    <li>• Invoice and billing solutions</li>
                    <li>• Financial reporting and analytics</li>
                    <li>• Tax compliance tools</li>
                    <li>• Multi-user collaboration</li>
                    <li>• Secure cloud-based platform</li>
                    <li>• 24/7 customer support</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Support Information */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <HelpCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-800 text-sm">Need Help?</h3>
                  <div className="text-xs text-blue-700 mt-2 space-y-1">
                    <div>📧 Email: support@aczen.com</div>
                    <div>📞 Phone: +91-XXXXXXXXXX</div>
                    <div>🌐 Help Center: https://help.aczen.com</div>
                    <div>💬 Live Chat: Available 24/7 in the application</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApplicationAccessGuide;