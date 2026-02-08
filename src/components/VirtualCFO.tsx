
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, MessageCircle, TrendingUp, Calculator } from 'lucide-react';

const VirtualCFO = () => {
  const handleVirtualCFOClick = () => {
    window.open(
      'https://app.relevanceai.com/agents/f1db6c/2f7fdb99e2f5-4f72-aeb4-a9ca62e34066/6191bc84-a88b-4efa-94c1-5d16ad667040/share?starting_message_prompts=&hide_tool_steps=false&hide_file_uploads=false&hide_conversation_list=false&bubble_style=icon&primary_color=%23685FFF&bubble_icon=pd%2Fchat&input_placeholder_text=Hi+there+%2C+i+am+your+V-CFO+.&hide_logo=false&hide_description=false',
      '_blank',
      'width=1200,height=800,scrollbars=yes,resizable=yes'
    );
  };

  return (
    <Card className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <Brain className="h-6 w-6 text-purple-600" />
          Virtual CFO Assistant
        </CardTitle>
        <CardDescription>
          Get AI-powered financial insights and strategic guidance for your business
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
            <MessageCircle className="h-5 w-5 text-blue-500" />
            <div>
              <div className="font-medium text-sm">Financial Analysis</div>
              <div className="text-xs text-muted-foreground">Get insights on your financial data</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
            <TrendingUp className="h-5 w-5 text-green-500" />
            <div>
              <div className="font-medium text-sm">Growth Strategy</div>
              <div className="text-xs text-muted-foreground">Strategic planning and advice</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
            <Calculator className="h-5 w-5 text-orange-500" />
            <div>
              <div className="font-medium text-sm">Tax Planning</div>
              <div className="text-xs text-muted-foreground">Optimize your tax strategies</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <h4 className="font-medium mb-2">What can the Virtual CFO help you with?</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Cash flow analysis and forecasting</li>
            <li>• Budget planning and variance analysis</li>
            <li>• Investment recommendations</li>
            <li>• Risk assessment and mitigation</li>
            <li>• Tax optimization strategies</li>
            <li>• Financial reporting insights</li>
          </ul>
        </div>

        <Button 
          onClick={handleVirtualCFOClick}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
          size="lg"
        >
          <Brain className="h-5 w-5 mr-2" />
          Chat with Virtual CFO
        </Button>
      </CardContent>
    </Card>
  );
};

export default VirtualCFO;
