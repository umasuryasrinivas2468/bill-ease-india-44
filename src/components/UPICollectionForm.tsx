
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QrCode, Clock, CheckCircle, XCircle, Copy, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCreateUPICollection, useCreateVPA, useUserVPA } from '@/hooks/useUPICollection';

interface UPICollectionFormProps {
  invoiceId?: string;
  prefilledAmount?: number;
  prefilledPurpose?: string;
  onSuccess?: () => void;
}

const UPICollectionForm = ({ 
  invoiceId, 
  prefilledAmount, 
  prefilledPurpose, 
  onSuccess 
}: UPICollectionFormProps) => {
  const { toast } = useToast();
  const createUPICollection = useCreateUPICollection();
  const createVPA = useCreateVPA();
  const { data: userVPA, isLoading: vpaLoading } = useUserVPA();
  
  const [formData, setFormData] = useState({
    amount: prefilledAmount || 0,
    purpose_message: prefilledPurpose || '',
    expiry_minutes: 30,
  });

  const [generatedUPILink, setGeneratedUPILink] = useState('');

  const handleCreateVPA = async () => {
    try {
      await createVPA.mutateAsync();
      toast({
        title: "VPA Created Successfully",
        description: "Your Virtual Payment Address has been created. You can now generate payment requests.",
      });
    } catch (error) {
      console.error('Error creating VPA:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create VPA. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.amount || !formData.purpose_message) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!userVPA) {
      toast({
        title: "VPA Required",
        description: "Please create your Virtual Payment Address first.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await createUPICollection.mutateAsync({
        ...formData,
        invoice_id: invoiceId,
      });

      setGeneratedUPILink(result.upiLink || '');

      toast({
        title: "UPI Collection Request Created",
        description: `Payment request created with VPA: ${userVPA.vpa}`,
      });

      // Reset form
      setFormData({
        amount: 0,
        purpose_message: '',
        expiry_minutes: 30,
      });

      onSuccess?.();
    } catch (error) {
      console.error('Error creating UPI collection:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create UPI collection request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const copyUPILink = () => {
    navigator.clipboard.writeText(generatedUPILink);
    toast({
      title: "Copied!",
      description: "UPI link copied to clipboard",
    });
  };

  const openUPIApp = () => {
    window.open(generatedUPILink, '_blank');
  };

  if (vpaLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Federal Bank UPI Collection
          </CardTitle>
          <CardDescription>
            Create VPA and send payment requests via Federal Bank UPI
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!userVPA ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  You need to create a Virtual Payment Address (VPA) first to start collecting payments via UPI.
                </AlertDescription>
              </Alert>
              <Button 
                onClick={handleCreateVPA}
                disabled={createVPA.isPending}
                className="w-full"
              >
                {createVPA.isPending ? "Creating VPA..." : "Create Virtual Payment Address"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Your VPA: <strong>{userVPA.vpa}</strong> is active and ready to receive payments.
                </AlertDescription>
              </Alert>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₹) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    min="1"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purpose">Purpose/Description *</Label>
                  <Textarea
                    id="purpose"
                    placeholder="Payment for invoice #INV-001"
                    value={formData.purpose_message}
                    onChange={(e) => setFormData({...formData, purpose_message: e.target.value})}
                    rows={2}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiry">Request Expiry</Label>
                  <Select 
                    value={formData.expiry_minutes.toString()} 
                    onValueChange={(value) => setFormData({...formData, expiry_minutes: parseInt(value)})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                      <SelectItem value="1440">24 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={createUPICollection.isPending}
                >
                  {createUPICollection.isPending ? "Creating Request..." : "Generate UPI Payment Link"}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>

      {generatedUPILink && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              UPI Payment Link Generated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-3 bg-gray-100 rounded-lg break-all text-sm font-mono">
                {generatedUPILink}
              </div>
              <div className="flex gap-2">
                <Button onClick={copyUPILink} variant="outline" className="flex-1">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
                <Button onClick={openUPIApp} className="flex-1">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open UPI App
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default UPICollectionForm;
