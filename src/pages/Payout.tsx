import React from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Send, History, AlertCircle, CheckCircle, Clock, Brain } from 'lucide-react';

const Payout = () => {
  const handleVirtualCFOClick = () => {
    window.open(
      'https://app.relevanceai.com/agents/f1db6c/2f7fdb99e2f5-4f72-aeb4-a9ca62e34066/6191bc84-a88b-4efa-94c1-5d16ad667040/share?starting_message_prompts=&hide_tool_steps=false&hide_file_uploads=false&hide_conversation_list=false&bubble_style=icon&primary_color=%23685FFF&bubble_icon=pd%2Fchat&input_placeholder_text=Hi+there+%2C+i+am+your+V-CFO+.&hide_logo=false&hide_description=false',
      '_blank',
      'width=800,height=600,scrollbars=yes,resizable=yes'
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Payout</h1>
          <p className="text-muted-foreground">
            Send payments to vendors, employees, and partners
          </p>
        </div>
      </div>

      {/* Service Unavailable Message */}
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-800">
            <AlertCircle className="h-5 w-5" />
            Service Temporarily Unavailable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-orange-700">
            Dear User, Sorry for the inconvenience, this service will not currently operating in your region, 
            will be starting the service from July 9th 2025.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="send" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="send">Send Payout</TabsTrigger>
          <TabsTrigger value="history">Payout History</TabsTrigger>
        </TabsList>

        <TabsContent value="send">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Create New Payout
                </CardTitle>
                <CardDescription>
                  Send money to bank accounts or UPI IDs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="payoutType">Payout Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payout type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="upi">UPI Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="beneficiary">Beneficiary Name</Label>
                  <Input 
                    id="beneficiary"
                    placeholder="Enter beneficiary name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account">Account Number / UPI ID</Label>
                  <Input 
                    id="account"
                    placeholder="Enter account number or UPI ID"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ifsc">IFSC Code (for bank transfers)</Label>
                  <Input 
                    id="ifsc"
                    placeholder="Enter IFSC code"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input 
                    id="amount"
                    type="number"
                    placeholder="Enter amount"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purpose">Purpose</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select purpose" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vendor_payment">Vendor Payment</SelectItem>
                      <SelectItem value="salary">Salary</SelectItem>
                      <SelectItem value="refund">Refund</SelectItem>
                      <SelectItem value="bonus">Bonus</SelectItem>
                      <SelectItem value="others">Others</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full">
                  <Send className="h-4 w-4 mr-2" />
                  Send Payout
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
                <CardDescription>Your payout summary</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Sent Today</p>
                      <p className="text-xl font-bold">₹0</p>
                    </div>
                    <Send className="h-8 w-8 text-blue-500" />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Successful Payouts</p>
                      <p className="text-xl font-bold">0</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Pending Payouts</p>
                      <p className="text-xl font-bold">0</p>
                    </div>
                    <Clock className="h-8 w-8 text-orange-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Payout History
              </CardTitle>
              <CardDescription>
                Track all your payout transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No payouts yet</h3>
                <p className="text-muted-foreground">
                  Your payout history will appear here once you start sending payments.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Virtual CFO Button */}
      <div className="flex justify-center mt-8">
        <Button 
          onClick={handleVirtualCFOClick}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-3 text-lg"
          size="lg"
        >
          <Brain className="h-5 w-5 mr-2" />
          Virtual CFO
        </Button>
      </div>
    </div>
  );
};

export default Payout;
