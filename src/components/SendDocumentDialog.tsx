import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, MessageCircle, Copy, Check, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SendDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: 'invoice' | 'quotation';
  documentNumber: string;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  amount: number;
  dueDate?: string;
}

const SendDocumentDialog: React.FC<SendDocumentDialogProps> = ({
  isOpen,
  onClose,
  documentType,
  documentNumber,
  recipientName,
  recipientEmail = '',
  recipientPhone = '',
  amount,
  dueDate,
}) => {
  const { toast } = useToast();
  const [email, setEmail] = useState(recipientEmail);
  const [phone, setPhone] = useState(recipientPhone);
  const [copied, setCopied] = useState(false);
  
  const documentTitle = documentType === 'invoice' ? 'Invoice' : 'Quotation';
  
  const defaultEmailMessage = `Dear ${recipientName},

Please find attached your ${documentTitle.toLowerCase()} ${documentNumber} for the amount of ₹${amount.toLocaleString()}.

${dueDate ? `Payment is due by ${new Date(dueDate).toLocaleDateString()}.` : ''}

If you have any questions, please don't hesitate to reach out.

Thank you for your business!

Best regards`;

  const defaultWhatsAppMessage = `Hello ${recipientName}! 👋

Your ${documentTitle.toLowerCase()} *${documentNumber}* is ready.

💰 Amount: *₹${amount.toLocaleString()}*
${dueDate ? `📅 Due: ${new Date(dueDate).toLocaleDateString()}` : ''}

Please let me know if you have any questions.

Thank you! 🙏`;

  const [emailMessage, setEmailMessage] = useState(defaultEmailMessage);
  const [whatsAppMessage, setWhatsAppMessage] = useState(defaultWhatsAppMessage);
  const [emailSubject, setEmailSubject] = useState(`${documentTitle} ${documentNumber} - ₹${amount.toLocaleString()}`);

  const handleSendEmail = () => {
    if (!email) {
      toast({
        title: "Email Required",
        description: "Please enter the recipient's email address.",
        variant: "destructive",
      });
      return;
    }

    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailMessage)}`;
    window.open(mailtoLink, '_blank');
    
    toast({
      title: "Email Client Opened",
      description: "Your email client has been opened with the draft message.",
    });
  };

  const handleSendWhatsApp = () => {
    if (!phone) {
      toast({
        title: "Phone Required",
        description: "Please enter the recipient's phone number.",
        variant: "destructive",
      });
      return;
    }

    // Clean phone number - remove spaces and special chars, keep + for country code
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    const whatsappLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsAppMessage)}`;
    window.open(whatsappLink, '_blank');
    
    toast({
      title: "WhatsApp Opened",
      description: "WhatsApp has been opened with the draft message.",
    });
  };

  const handleCopyMessage = (message: string) => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied!",
      description: "Message copied to clipboard.",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg animate-scale-in">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Send {documentTitle}
          </DialogTitle>
          <DialogDescription>
            Share {documentTitle.toLowerCase()} {documentNumber} via email or WhatsApp
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="email" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="space-y-4 mt-4 animate-fade-in">
            <div className="space-y-2">
              <Label htmlFor="email">Recipient Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="client@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="emailMessage">Message</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyMessage(emailMessage)}
                  className="h-8 px-2"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Textarea
                id="emailMessage"
                rows={8}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                className="resize-none"
              />
            </div>
            
            <Button onClick={handleSendEmail} className="w-full" variant="orange">
              <Mail className="h-4 w-4 mr-2" />
              Open Email Client
            </Button>
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-4 mt-4 animate-fade-in">
            <div className="space-y-2">
              <Label htmlFor="phone">Recipient Phone (with country code)</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="whatsappMessage">Message</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyMessage(whatsAppMessage)}
                  className="h-8 px-2"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Textarea
                id="whatsappMessage"
                rows={8}
                value={whatsAppMessage}
                onChange={(e) => setWhatsAppMessage(e.target.value)}
                className="resize-none"
              />
            </div>
            
            <Button onClick={handleSendWhatsApp} className="w-full bg-green-600 hover:bg-green-700">
              <MessageCircle className="h-4 w-4 mr-2" />
              Open WhatsApp
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SendDocumentDialog;
