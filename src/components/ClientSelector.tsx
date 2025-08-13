
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { useClients, useCreateClient, Client } from '@/hooks/useClients';
import { useToast } from '@/hooks/use-toast';
import { validateGSTNumber, getGSTPlaceholder, formatGSTNumber } from '@/utils/gstValidation';

interface ClientSelectorProps {
  onClientSelect: (client: Client | null) => void;
  selectedClientId?: string;
}

const ClientSelector: React.FC<ClientSelectorProps> = ({ onClientSelect, selectedClientId }) => {
  const { toast } = useToast();
  const { data: clients = [], isLoading } = useClients();
  const createClientMutation = useCreateClient();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    phone: '',
    gst_number: '',
    address: '',
  });

  const handleClientSelect = (clientId: string) => {
    if (clientId === 'new') {
      setIsAddDialogOpen(true);
      return;
    }
    
    const client = clients.find(c => c.id === clientId);
    onClientSelect(client || null);
  };

  const handleGSTChange = (value: string) => {
    const formatted = formatGSTNumber(value);
    setNewClient({ ...newClient, gst_number: formatted });
  };

  const handleAddClient = async () => {
    if (!newClient.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Client name is required.",
        variant: "destructive",
      });
      return;
    }

    // Validate GST number if provided
    if (newClient.gst_number && !validateGSTNumber(newClient.gst_number)) {
      toast({
        title: "Invalid GST Number",
        description: "Please enter a valid GST number in the format: 22AAAAA0000A1Z5",
        variant: "destructive",
      });
      return;
    }

    try {
      const createdClient = await createClientMutation.mutateAsync(newClient);
      toast({
        title: "Client Added",
        description: `${newClient.name} has been added to your client list.`,
      });
      
      // Select the newly created client
      onClientSelect(createdClient);
      
      // Reset form and close dialog
      setNewClient({ name: '', email: '', phone: '', gst_number: '', address: '' });
      setIsAddDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add client. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>Select Client</Label>
        <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="clientSelect">Select Client</Label>
      <div className="flex gap-2">
        <Select value={selectedClientId || ''} onValueChange={handleClientSelect}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Choose a client..." />
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name} {client.email && `(${client.email})`}
              </SelectItem>
            ))}
            <SelectItem value="new" className="text-blue-600 font-medium">
              <Plus className="h-4 w-4 mr-2 inline" />
              Add New Client
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>
              Enter the client details below to add them to your database.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Client Name *</Label>
              <Input
                id="name"
                value={newClient.name}
                onChange={(e) => setNewClient({...newClient, name: e.target.value})}
                placeholder="Enter client name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newClient.email}
                onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                placeholder="client@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={newClient.phone}
                onChange={(e) => setNewClient({...newClient, phone: e.target.value})}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gstNumber">GST Number</Label>
              <Input
                id="gstNumber"
                value={newClient.gst_number}
                onChange={(e) => handleGSTChange(e.target.value)}
                placeholder={getGSTPlaceholder()}
                maxLength={15}
              />
              {newClient.gst_number && !validateGSTNumber(newClient.gst_number) && (
                <p className="text-xs text-red-500">Invalid GST format</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={newClient.address}
                onChange={(e) => setNewClient({...newClient, address: e.target.value})}
                placeholder="Enter client address"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              onClick={handleAddClient}
              disabled={createClientMutation.isPending}
            >
              {createClientMutation.isPending ? "Adding..." : "Add Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientSelector;
