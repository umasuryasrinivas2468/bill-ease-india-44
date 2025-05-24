
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCreateUPICollection } from '@/hooks/useUPICollection';

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
  
  const [formData, setFormData] = useState({
    payer_upi: '',
    payee_account: '1234567890', // Your business account
    amount: prefilledAmount || 0,
    purpose_message: prefilledPurpose || '',
    expiry_minutes: 30,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.payer_upi || !formData.amount || !formData.purpose_message) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!/^[\w.-]+@[\w.-]+$/.test(formData.payer_upi)) {
      toast({
        title: "Invalid UPI ID",
        description: "Please enter a valid UPI ID (e.g., abc@upi).",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await createUPICollection.mutateAsync({
        ...formData,
        invoice_id: invoiceId,
      });

      toast({
        title: "UPI Collection Request Created",
        description: `Payment request sent to ${formData.payer_upi}`,
      });

      // Reset form
      setFormData({
        payer_upi: '',
        payee_account: '1234567890',
        amount: 0,
        purpose_message: '',
        expiry_minutes: 30,
      });

      onSuccess?.();
    } catch (error) {
      console.error('Error creating UPI collection:', error);
      toast({
        title: "Error",
        description: "Failed to create UPI collection request. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          UPI Payment Request
        </CardTitle>
        <CardDescription>
          Send a payment request to any UPI ID for instant collections
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payer_upi">Customer UPI ID *</Label>
            <Input
              id="payer_upi"
              type="text"
              placeholder="customer@upi"
              value={formData.payer_upi}
              onChange={(e) => setFormData({...formData, payer_upi: e.target.value})}
              required
            />
          </div>

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
            {createUPICollection.isPending ? "Creating Request..." : "Send Payment Request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default UPICollectionForm;
