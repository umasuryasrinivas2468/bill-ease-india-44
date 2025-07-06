
import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useGSTVerification } from '@/hooks/useGSTVerification';
import { validateGSTNumber, validateIECNumber } from '@/utils/onboardingValidation';
import { BusinessInfo } from '@/hooks/useOnboardingState';

interface BusinessInfoStepProps {
  businessInfo: BusinessInfo;
  setBusinessInfo: (info: BusinessInfo) => void;
  onNext: () => void;
  toast: any;
}

export const BusinessInfoStep: React.FC<BusinessInfoStepProps> = ({
  businessInfo,
  setBusinessInfo,
  onNext,
  toast,
}) => {
  const { verifyGST, isVerifying } = useGSTVerification();

  useEffect(() => {
    const verifyGSTNumber = async () => {
      if (businessInfo.gstNumber && businessInfo.gstNumber.length === 15) {
        try {
          const result = await verifyGST(businessInfo.gstNumber);
          
          if (result.success && result.data) {
            setBusinessInfo({
              ...businessInfo,
              businessName: result.data.tradeNam || result.data.lgnm || businessInfo.businessName,
              address: result.data.pradr?.addr?.bno && result.data.pradr?.addr?.st 
                ? `${result.data.pradr.addr.bno}, ${result.data.pradr.addr.st}, ${result.data.pradr.addr.loc}`
                : businessInfo.address,
              city: result.data.pradr?.addr?.dst || businessInfo.city,
              state: result.data.pradr?.addr?.stcd || businessInfo.state,
              pincode: result.data.pradr?.addr?.pncd || businessInfo.pincode,
            });

            toast({
              title: "GST Verified Successfully",
              description: "Business information has been auto-filled.",
            });
          }
        } catch (error) {
          // Silent error handling
        }
      }
    };

    const timeoutId = setTimeout(verifyGSTNumber, 500);
    return () => clearTimeout(timeoutId);
  }, [businessInfo.gstNumber, verifyGST, toast, businessInfo, setBusinessInfo]);

  const handleSubmit = () => {
    if (!businessInfo.businessName || !businessInfo.ownerName || !businessInfo.phone || 
        !businessInfo.email || !businessInfo.gstNumber || !businessInfo.address || 
        !businessInfo.city || !businessInfo.state || !businessInfo.pincode) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!validateGSTNumber(businessInfo.gstNumber)) {
      toast({
        title: "Invalid GST Number",
        description: "GST number format is invalid. Example: 36AAFCL5374E1ZG",
        variant: "destructive",
      });
      return;
    }

    if (businessInfo.isImportExportApplicable === 'yes') {
      if (!businessInfo.iecNumber || !businessInfo.lutNumber) {
        toast({
          title: "Missing Import/Export Information",
          description: "Please fill in both IEC Number and LUT Number.",
          variant: "destructive",
        });
        return;
      }

      if (!validateIECNumber(businessInfo.iecNumber)) {
        toast({
          title: "Invalid IEC Number",
          description: "IEC number must be exactly 10 digits.",
          variant: "destructive",
        });
        return;
      }
    }

    onNext();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Information</CardTitle>
        <CardDescription>Tell us about your business (All fields are mandatory)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="businessName">Business Name *</Label>
            <Input
              id="businessName"
              value={businessInfo.businessName}
              onChange={(e) => setBusinessInfo({...businessInfo, businessName: e.target.value})}
              placeholder="Enter business name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ownerName">Owner Name *</Label>
            <Input
              id="ownerName"
              value={businessInfo.ownerName}
              onChange={(e) => setBusinessInfo({...businessInfo, ownerName: e.target.value})}
              placeholder="Enter owner name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={businessInfo.email}
              onChange={(e) => setBusinessInfo({...businessInfo, email: e.target.value})}
              placeholder="business@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone *</Label>
            <Input
              id="phone"
              value={businessInfo.phone}
              onChange={(e) => setBusinessInfo({...businessInfo, phone: e.target.value})}
              placeholder="+91 98765 43210"
              required
            />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="gstNumber">GST Number *</Label>
            <div className="relative">
              <Input
                id="gstNumber"
                value={businessInfo.gstNumber}
                onChange={(e) => setBusinessInfo({...businessInfo, gstNumber: e.target.value.toUpperCase()})}
                placeholder="36AAFCL5374E1ZG"
                maxLength={15}
                required
              />
              {isVerifying && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                </div>
              )}
            </div>
            {businessInfo.gstNumber && !validateGSTNumber(businessInfo.gstNumber) && (
              <p className="text-sm text-red-500">Invalid GST format. Example: 36AAFCL5374E1ZG</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pincode">PIN Code *</Label>
            <Input
              id="pincode"
              value={businessInfo.pincode}
              onChange={(e) => setBusinessInfo({...businessInfo, pincode: e.target.value})}
              placeholder="400001"
              required
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="address">Business Address *</Label>
          <Textarea
            id="address"
            value={businessInfo.address}
            onChange={(e) => setBusinessInfo({...businessInfo, address: e.target.value})}
            placeholder="Enter complete business address"
            rows={3}
            required
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Input
              id="city"
              value={businessInfo.city}
              onChange={(e) => setBusinessInfo({...businessInfo, city: e.target.value})}
              placeholder="Mumbai"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State *</Label>
            <Input
              id="state"
              value={businessInfo.state}
              onChange={(e) => setBusinessInfo({...businessInfo, state: e.target.value})}
              placeholder="Maharashtra"
              required
            />
          </div>
        </div>

        <div className="space-y-4">
          <Label className="text-base font-medium">Import/Export Applicable *</Label>
          <RadioGroup 
            value={businessInfo.isImportExportApplicable} 
            onValueChange={(value) => setBusinessInfo({...businessInfo, isImportExportApplicable: value, iecNumber: value === 'no' ? '' : businessInfo.iecNumber, lutNumber: value === 'no' ? '' : businessInfo.lutNumber})}
            className="flex flex-row space-x-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="importExportYes" />
              <Label htmlFor="importExportYes">Yes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="importExportNo" />
              <Label htmlFor="importExportNo">No</Label>
            </div>
          </RadioGroup>
        </div>

        {businessInfo.isImportExportApplicable === 'yes' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="iecNumber">IEC Number *</Label>
              <Input
                id="iecNumber"
                value={businessInfo.iecNumber}
                onChange={(e) => setBusinessInfo({...businessInfo, iecNumber: e.target.value})}
                placeholder="1234567890"
                maxLength={10}
                pattern="\d*"
                required
              />
              {businessInfo.iecNumber && !validateIECNumber(businessInfo.iecNumber) && (
                <p className="text-sm text-red-500">IEC number must be exactly 10 digits</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lutNumber">LUT Number *</Label>
              <Input
                id="lutNumber"
                value={businessInfo.lutNumber}
                onChange={(e) => setBusinessInfo({...businessInfo, lutNumber: e.target.value})}
                placeholder="Enter LUT number"
                required
              />
            </div>
          </div>
        )}

        <div className="space-y-4">
          <Label className="text-base font-medium">GST Rate Selection *</Label>
          <RadioGroup 
            value={businessInfo.gstRate} 
            onValueChange={(value) => setBusinessInfo({...businessInfo, gstRate: value})}
            className="flex flex-col space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="18" id="gst18" />
              <Label htmlFor="gst18">18%</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="12" id="gst12" />
              <Label htmlFor="gst12">12%</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="5" id="gst5" />
              <Label htmlFor="gst5">5%</Label>
            </div>
          </RadioGroup>
          <p className="text-sm text-muted-foreground">This will apply for the invoice</p>
        </div>
        
        <Button onClick={handleSubmit} className="w-full">
          Continue to Banking
        </Button>
      </CardContent>
    </Card>
  );
};
