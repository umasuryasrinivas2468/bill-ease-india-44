import React, { useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Calculator, Calendar, Scale } from 'lucide-react';
import GSTSummaryReport from '@/components/reports/GSTSummaryReport';
import GSTR3BSummary from '@/components/reports/GSTR3BSummary';
import GSTMonthCalendar from '@/components/reports/GSTMonthCalendar';

const GSTCompliance = () => {
  const [activeTab, setActiveTab] = useState('summary');

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Scale className="h-7 w-7" />
            GST Compliance
          </h1>
          <p className="text-muted-foreground">
            GST summary, GSTR-3B filing data, and monthly GST calendar
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="summary" className="gap-1.5">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">GST Summary</span>
            <span className="sm:hidden">Summary</span>
          </TabsTrigger>
          <TabsTrigger value="gstr3b" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">GSTR-3B</span>
            <span className="sm:hidden">3B</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Monthly</span>
            <span className="sm:hidden">Monthly</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <GSTSummaryReport />
        </TabsContent>

        <TabsContent value="gstr3b" className="mt-4">
          <GSTR3BSummary />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <GSTMonthCalendar />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GSTCompliance;
