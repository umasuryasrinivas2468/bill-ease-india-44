import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileImage, Save, Globe, Loader2, Eye, EyeOff, Edit, Check, X } from 'lucide-react';
import useSimpleBranding from '@/hooks/useSimpleBranding';

const SimpleBrandingManager: React.FC = () => {
  const { branding, isLoading, updateBranding, isUpdating, getBrandingWithFallback } = useSimpleBranding();
  
  // Current saved URLs from database
  const brandingData = getBrandingWithFallback();
  const currentLogoUrl = brandingData.logo_url || '';
  const currentSignatureUrl = brandingData.signature_url || '';
  
  // Edit states
  const [isEditingLogo, setIsEditingLogo] = useState(false);
  const [isEditingSignature, setIsEditingSignature] = useState(false);
  const [tempLogoUrl, setTempLogoUrl] = useState('');
  const [tempSignatureUrl, setTempSignatureUrl] = useState('');
  const [showLogoPreview, setShowLogoPreview] = useState(false);
  const [showSignaturePreview, setShowSignaturePreview] = useState(false);

  // Show preview automatically for existing URLs
  useEffect(() => {
    if (currentLogoUrl && isValidUrl(currentLogoUrl)) {
      setShowLogoPreview(true);
    }
    if (currentSignatureUrl && isValidUrl(currentSignatureUrl)) {
      setShowSignaturePreview(true);
    }
  }, [currentLogoUrl, currentSignatureUrl]);

  const handleEditLogo = () => {
    setTempLogoUrl(currentLogoUrl);
    setIsEditingLogo(true);
  };

  const handleEditSignature = () => {
    setTempSignatureUrl(currentSignatureUrl);
    setIsEditingSignature(true);
  };

  const handleSaveLogo = () => {
    if (isValidUrl(tempLogoUrl)) {
      updateBranding({
        logo_url: tempLogoUrl.trim() || undefined,
        signature_url: currentSignatureUrl || undefined,
      });
      setIsEditingLogo(false);
    }
  };

  const handleSaveSignature = () => {
    if (isValidUrl(tempSignatureUrl)) {
      updateBranding({
        logo_url: currentLogoUrl || undefined,
        signature_url: tempSignatureUrl.trim() || undefined,
      });
      setIsEditingSignature(false);
    }
  };

  const handleCancelEdit = (type: 'logo' | 'signature') => {
    if (type === 'logo') {
      setIsEditingLogo(false);
      setTempLogoUrl('');
    } else {
      setIsEditingSignature(false);
      setTempSignatureUrl('');
    }
  };

  const isValidUrl = (url: string): boolean => {
    if (!url) return true; // Empty URL is valid
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileImage className="h-5 w-5" />
          Business Branding
        </CardTitle>
        <CardDescription>
          Add your business logo and signature URLs for professional documents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo Section */}
        <div className="space-y-4">
          <div className="space-y-3">
            <Label className="text-base font-semibold">Business Logo URL</Label>
            
            {!isEditingLogo ? (
              <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50/50">
                <div className="flex-1">
                  {currentLogoUrl ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-green-700">✅ Logo URL saved</p>
                      <p className="text-xs text-gray-600 break-all">{currentLogoUrl}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No logo URL set</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {currentLogoUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowLogoPreview(!showLogoPreview)}
                    >
                      {showLogoPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleEditLogo}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={tempLogoUrl}
                    onChange={(e) => setTempLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className={!isValidUrl(tempLogoUrl) ? 'border-red-500' : ''}
                  />
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleSaveLogo}
                    disabled={!isValidUrl(tempLogoUrl) || isUpdating}
                  >
                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCancelEdit('logo')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {tempLogoUrl && !isValidUrl(tempLogoUrl) && (
                  <p className="text-sm text-red-500">Please enter a valid URL</p>
                )}
              </div>
            )}
            
            <p className="text-xs text-muted-foreground">
              💡 <strong>Tip:</strong> Use direct image links (ending in .jpg, .png, etc.) from services like GitHub, Imgur, or your own website. Recommended size: 200x80 pixels.
            </p>
          </div>

          {/* Logo Preview */}
          {showLogoPreview && currentLogoUrl && isValidUrl(currentLogoUrl) && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">Logo Preview</Label>
              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                <div className="w-full max-w-md mx-auto flex items-center justify-center min-h-24">
                  <img 
                    src={currentLogoUrl}
                    alt="Business Logo preview" 
                    className="max-w-full max-h-24 object-contain rounded-lg shadow-sm" 
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div className="hidden flex flex-col items-center text-gray-400">
                    <FileImage className="h-12 w-12" />
                    <span className="text-sm mt-2">Failed to load image</span>
                    <span className="text-xs text-gray-500 mt-1">Please check the URL</span>
                  </div>
                </div>
                <p className="text-xs text-center text-gray-600 mt-2">
                  This is how your logo will appear in invoices
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Signature Section */}
        <div className="space-y-4">
          <div className="space-y-3">
            <Label className="text-base font-semibold">Digital Signature URL</Label>
            
            {!isEditingSignature ? (
              <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50/50">
                <div className="flex-1">
                  {currentSignatureUrl ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-green-700">✅ Signature URL saved</p>
                      <p className="text-xs text-gray-600 break-all">{currentSignatureUrl}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No signature URL set</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {currentSignatureUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSignaturePreview(!showSignaturePreview)}
                    >
                      {showSignaturePreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleEditSignature}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={tempSignatureUrl}
                    onChange={(e) => setTempSignatureUrl(e.target.value)}
                    placeholder="https://example.com/signature.png"
                    className={!isValidUrl(tempSignatureUrl) ? 'border-red-500' : ''}
                  />
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleSaveSignature}
                    disabled={!isValidUrl(tempSignatureUrl) || isUpdating}
                  >
                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCancelEdit('signature')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {tempSignatureUrl && !isValidUrl(tempSignatureUrl) && (
                  <p className="text-sm text-red-500">Please enter a valid URL</p>
                )}
              </div>
            )}
            
            <p className="text-xs text-muted-foreground">
              💡 <strong>Tip:</strong> Use PNG with transparent background for best results. Recommended size: 150x60 pixels.
            </p>
          </div>

          {/* Signature Preview */}
          {showSignaturePreview && currentSignatureUrl && isValidUrl(currentSignatureUrl) && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">Signature Preview</Label>
              <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                <div className="w-full max-w-sm mx-auto flex items-center justify-center min-h-20">
                  <img 
                    src={currentSignatureUrl}
                    alt="Digital Signature preview" 
                    className="max-w-full max-h-20 object-contain rounded-lg shadow-sm" 
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div className="hidden flex flex-col items-center text-gray-400">
                    <FileImage className="h-8 w-8" />
                    <span className="text-sm mt-2">Failed to load image</span>
                    <span className="text-xs text-gray-500 mt-1">Please check the URL</span>
                  </div>
                </div>
                <p className="text-xs text-center text-gray-600 mt-2">
                  This signature will appear at the bottom of invoices
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Usage Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
            <FileImage className="h-5 w-5" />
            How your assets will be used:
          </h4>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-sm text-blue-800">🖼️</span>
              <p className="text-sm text-blue-800">Logo appears at the top of invoices and quotations</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-sm text-blue-800">✍️</span>
              <p className="text-sm text-blue-800">Signature appears at the bottom of documents for authorization</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-sm text-blue-800">📄</span>
              <p className="text-sm text-blue-800">Both assets are included in PDF exports</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-sm text-blue-800">🌐</span>
              <p className="text-sm text-blue-800">Make sure URLs are publicly accessible</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-blue-200">
            <p className="text-xs text-blue-700">
              💡 Changes are saved automatically when you click the ✓ button
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SimpleBrandingManager;