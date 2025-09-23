import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useLicense, LicenseData } from '@/hooks/useLicense';

interface LicenseGeneratorProps {
  planType: 'starter' | 'growth' | 'scale';
  planTitle: string;
  keyLength: number;
}

const LicenseGenerator: React.FC<LicenseGeneratorProps> = ({
  planType,
  planTitle,
  keyLength,
}) => {
  const [email, setEmail] = useState('');
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const { loading, error, generateLicense, getLicense } = useLicense();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@') || hasGenerated) {
      return;
    }

    try {
      setLicenseData(null);

      // First check if license already exists
      const existingLicense = await getLicense(email);
      
      if (existingLicense) {
        setLicenseData(existingLicense);
        setHasGenerated(true);
      } else {
        // Generate new license
        const newLicense = await generateLicense(email, planType);
        setLicenseData(newLicense);
        setHasGenerated(true);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const handleBlockedClick = () => {
    if (hasGenerated) {
      alert("Can't generate new key! You have already generated a license key.");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const downloadPDF = async (data: LicenseData) => {
    try {
      // Dynamic import of jsPDF
      const { jsPDF } = await import('jspdf');
      const QRCode = await import('qrcode');
      
      const doc = new jsPDF();
      
      // Header with Aczen branding
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('ACZEN', 105, 30, { align: 'center' });
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('One Stop Accounting Software', 105, 40, { align: 'center' });
      
      // Draw header line
      doc.setDrawColor(102, 126, 234);
      doc.setLineWidth(2);
      doc.line(20, 50, 190, 50);
      
      // License Certificate Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('LICENSE CERTIFICATE', 105, 70, { align: 'center' });
      
      // License details
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      
      const startY = 90;
      const rowHeight = 15;
      const leftCol = 30;
      const rightCol = 100;
      
      let currentY = startY + 15;
      
      // Email
      doc.setFont('helvetica', 'bold');
      doc.text('Email:', leftCol, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(data.email, rightCol, currentY);
      currentY += rowHeight;
      
      // License Key
      doc.setFont('helvetica', 'bold');
      doc.text('License Key:', leftCol, currentY);
      doc.setFont('courier', 'bold');
      doc.setFontSize(14);
      doc.text(data.license_key, rightCol, currentY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      currentY += rowHeight;
      
      // Plan Type
      doc.setFont('helvetica', 'bold');
      doc.text('Plan Type:', leftCol, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(data.plan_type.charAt(0).toUpperCase() + data.plan_type.slice(1), rightCol, currentY);
      currentY += rowHeight;
      
      // Expiry Date
      doc.setFont('helvetica', 'bold');
      doc.text('Expiry Date:', leftCol, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(formatDate(data.due_date), rightCol, currentY);
      currentY += rowHeight + 20;
      
      // Generate QR Code
      try {
        const qrDataUrl = await QRCode.toDataURL(data.license_key, {
          width: 100,
          margin: 1,
        });
        
        doc.addImage(qrDataUrl, 'PNG', 150, currentY, 30, 30);
        doc.setFontSize(10);
        doc.text('Scan QR Code', 155, currentY + 35);
      } catch (qrError) {
        console.error('Error generating QR code:', qrError);
      }
      
      // Footer
      doc.setFontSize(8);
      doc.text('Generated on: ' + new Date().toLocaleDateString(), 20, 280);
      doc.text('Aczen - One Stop Accounting Software', 105, 280, { align: 'center' });
      
      // Download the PDF
      doc.save(`Aczen_License_${data.plan_type}_${data.license_key}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  const downloadWelcomeLetter = (data: LicenseData) => {
    const welcomeContent = `
Dear Valued Customer,

Welcome to Aczen!

We are delighted to welcome you to Aczen, your one-stop accounting software solution.

Your license details:
- Email: ${data.email}
- License Key: ${data.license_key}
- Plan: ${data.plan_type.charAt(0).toUpperCase() + data.plan_type.slice(1)}
- Valid Until: ${formatDate(data.due_date)}

What you can expect from Aczen:
• Complete accounting management
• Invoice and billing solutions
• Financial reporting and analytics
• Tax compliance tools
• Multi-user collaboration
• Secure cloud-based platform
• 24/7 customer support

If you have any questions or need assistance getting started, our support team is here to help. You can reach us at support@aczen.com or through our help center.

Thank you for choosing Aczen. We look forward to helping you achieve your business goals!

Best Regards,
Team Aczen

---
Aczen - One Stop Accounting Software
www.aczen.com
support@aczen.com
`;

    // Create and download the text file
    const blob = new Blob([welcomeContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Welcome_to_Aczen_${data.license_key}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-gray-50 to-gray-100">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">{planTitle} License Generator</CardTitle>
          <p className="text-sm text-muted-foreground">Generate your {keyLength}-digit license key</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                disabled={loading || hasGenerated}
                className="mt-1"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !email}
              variant={hasGenerated ? "destructive" : "default"}
              onClick={hasGenerated ? handleBlockedClick : undefined}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : hasGenerated ? (
                "Can't Generate New Key"
              ) : (
                `Generate ${planTitle} License`
              )}
            </Button>
          </form>

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {licenseData && (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  <div>
                    <div className="font-semibold">License Generated Successfully!</div>
                    <div className="text-sm mt-1">
                      ✅ Your license key has been generated<br/>
                      📧 Welcome email sent to: {licenseData.email}<br/>
                      📄 Download your PDF certificate below
                    </div>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-center">
                <h3 className="font-semibold text-gray-900">
                  Your License Information
                </h3>
                
                <div className="space-y-2">
                  <p><strong>Email:</strong> {licenseData.email}</p>
                  <p><strong>Plan:</strong> {licenseData.plan_type}</p>
                  <p><strong>License Key:</strong></p>
                  <div className="p-3 bg-white border rounded font-mono text-lg tracking-wider break-all">
                    {licenseData.license_key}
                  </div>
                  <p><strong>Valid Until:</strong> {formatDate(licenseData.due_date)}</p>
                </div>

                {/* Download Button */}
                <div className="flex justify-center mt-4">
                  <Button 
                    onClick={() => downloadPDF(licenseData)}
                    variant="outline"
                    size="sm"
                  >
                    📄 Download PDF Certificate
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LicenseGenerator;