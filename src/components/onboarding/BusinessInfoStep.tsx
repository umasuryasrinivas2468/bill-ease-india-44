
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BusinessInfo } from '@/hooks/useOnboardingData';
import { validateGSTByCountry, getGSTPlaceholder, getGSTRateOptions, getCurrencySymbol } from '@/utils/countryValidation';
import { validateIECNumber } from '@/utils/onboardingValidation';
import { useToast } from '@/hooks/use-toast';

interface BusinessInfoStepProps {
  businessInfo: BusinessInfo;
  setBusinessInfo: (info: BusinessInfo) => void;
  onNext: () => Promise<void>;
  isLoading?: boolean;
}

export const BusinessInfoStep: React.FC<BusinessInfoStepProps> = ({
  businessInfo,
  setBusinessInfo,
  onNext,
  isLoading = false,
}) => {
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('Form submitted with data:', businessInfo);
    
    // Basic validation
    if (!businessInfo.businessName?.trim()) {
      toast({
        title: "Validation Error",
        description: "Business name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!businessInfo.ownerName?.trim()) {
      toast({
        title: "Validation Error",
        description: "Owner name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!businessInfo.email?.trim()) {
      toast({
        title: "Validation Error",
        description: "Email is required.",
        variant: "destructive",
      });
      return;
    }

    if (!businessInfo.phone?.trim()) {
      toast({
        title: "Validation Error",
        description: "Phone number is required.",
        variant: "destructive",
      });
      return;
    }

    if (!businessInfo.gstNumber?.trim()) {
      toast({
        title: "Validation Error",
        description: "GST number is required.",
        variant: "destructive",
      });
      return;
    }

    if (!validateGSTByCountry(businessInfo.gstNumber, businessInfo.country)) {
      toast({
        title: "Validation Error",
        description: `Invalid GST number format for ${businessInfo.country}.`,
        variant: "destructive",
      });
      return;
    }

    if (!businessInfo.address?.trim()) {
      toast({
        title: "Validation Error",
        description: "Business address is required.",
        variant: "destructive",
      });
      return;
    }

    if (!businessInfo.city?.trim()) {
      toast({
        title: "Validation Error",
        description: "City is required.",
        variant: "destructive",
      });
      return;
    }

    if (!businessInfo.state?.trim()) {
      toast({
        title: "Validation Error",
        description: "State is required.",
        variant: "destructive",
      });
      return;
    }

    if (!businessInfo.pincode?.trim()) {
      toast({
        title: "Validation Error",
        description: "Pincode is required.",
        variant: "destructive",
      });
      return;
    }

    if (businessInfo.isImportExportApplicable === 'yes' && businessInfo.iecNumber && !validateIECNumber(businessInfo.iecNumber)) {
      toast({
        title: "Validation Error",
        description: "Invalid IEC number format. Should be 10 digits.",
        variant: "destructive",
      });
      return;
    }

    console.log('Validation passed, calling onNext');
    try {
      await onNext();
    } catch (error) {
      console.error('Error in onNext:', error);
    }
  };

  const handleCountryChange = (value: string) => {
    setBusinessInfo({
      ...businessInfo,
      country: value,
      gstNumber: '', // Reset GST number when country changes
    });
  };

  const gstRateOptions = getGSTRateOptions(businessInfo.country);
  const currencySymbol = getCurrencySymbol(businessInfo.currency);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Information</CardTitle>
        <CardDescription>Enter your business details for invoicing</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="businessName">Business Name *</Label>
              <Input
                id="businessName"
                value={businessInfo.businessName}
                onChange={(e) => setBusinessInfo({ ...businessInfo, businessName: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="ownerName">Owner Name *</Label>
              <Input
                id="ownerName"
                value={businessInfo.ownerName}
                onChange={(e) => setBusinessInfo({ ...businessInfo, ownerName: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={businessInfo.email}
                onChange={(e) => setBusinessInfo({ ...businessInfo, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                value={businessInfo.phone}
                onChange={(e) => setBusinessInfo({ ...businessInfo, phone: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="country">Country *</Label>
              <Select
                value={businessInfo.country}
                onValueChange={handleCountryChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="india">🇮🇳 India</SelectItem>
                  <SelectItem value="singapore">🇸🇬 Singapore</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={`${businessInfo.currency} (${currencySymbol})`}
                readOnly
                className="bg-gray-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gstNumber">
                {businessInfo.country === 'singapore' ? 'GST Registration Number' : 'GST Number'} *
              </Label>
              <Input
                id="gstNumber"
                value={businessInfo.gstNumber}
                onChange={(e) => setBusinessInfo({ ...businessInfo, gstNumber: e.target.value.toUpperCase() })}
                placeholder={getGSTPlaceholder(businessInfo.country)}
                required
              />
            </div>
            <div>
              <Label htmlFor="gstRate">GST Rate (%)</Label>
              <Select
                value={businessInfo.gstRate}
                onValueChange={(value) => setBusinessInfo({ ...businessInfo, gstRate: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gstRateOptions.map((rate) => (
                    <SelectItem key={rate} value={rate}>
                      {rate}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="address">Business Address *</Label>
            <Input
              id="address"
              value={businessInfo.address}
              onChange={(e) => setBusinessInfo({ ...businessInfo, address: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                value={businessInfo.city}
                onChange={(e) => setBusinessInfo({ ...businessInfo, city: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="state">State *</Label>
              <Input
                id="state"
                value={businessInfo.state}
                onChange={(e) => setBusinessInfo({ ...businessInfo, state: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="pincode">
                {businessInfo.country === 'singapore' ? 'Postal Code' : 'Pincode'} *
              </Label>
              <Input
                id="pincode"
                value={businessInfo.pincode}
                onChange={(e) => setBusinessInfo({ ...businessInfo, pincode: e.target.value })}
                required
              />
            </div>
          </div>

          {businessInfo.country === 'india' && (
            <>
              <div>
                <Label htmlFor="importExport">Is Import/Export Applicable?</Label>
                <Select
                  value={businessInfo.isImportExportApplicable}
                  onValueChange={(value) => setBusinessInfo({ ...businessInfo, isImportExportApplicable: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {businessInfo.isImportExportApplicable === 'yes' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="iecNumber">IEC Number</Label>
                    <Input
                      id="iecNumber"
                      value={businessInfo.iecNumber}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, iecNumber: e.target.value })}
                      placeholder="10 digit number"
                      maxLength={10}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lutNumber">LUT Number</Label>
                    <Input
                      id="lutNumber"
                      value={businessInfo.lutNumber}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, lutNumber: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              "Continue to Banking Details"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
