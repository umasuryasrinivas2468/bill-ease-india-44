import React, { useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Calculator,
  Calendar,
  Scale,
  Wallet,
  AlertTriangle,
  BarChart3,
  FileWarning,
  Undo2,
} from 'lucide-react';
import GSTSummaryReport from '@/components/reports/GSTSummaryReport';
import GSTR3BSummary from '@/components/reports/GSTR3BSummary';
import GSTR1Report from '@/components/reports/GSTR1Report';
import GSTMonthCalendar from '@/components/reports/GSTMonthCalendar';
import GSTLiabilityDashboard from '@/components/reports/GSTLiabilityDashboard';
import GSTPenaltyCalculator from '@/components/reports/GSTPenaltyCalculator';
import CreditNoteReversalCalculator from '@/components/reports/CreditNoteReversalCalculator';
import ITCMismatchCenter from '@/components/reports/ITCMismatchCenter';
import PeriodComparison from '@/components/reports/PeriodComparison';
import TaxPaymentPlanner from '@/components/reports/TaxPaymentPlanner';

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
            Summary, returns, reconciliation, and payment planning — all in one place
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="summary" className="gap-1.5">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Summary</span>
          </TabsTrigger>
          <TabsTrigger value="liability" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Liability</span>
          </TabsTrigger>
          <TabsTrigger value="gstr1" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">GSTR-1</span>
          </TabsTrigger>
          <TabsTrigger value="gstr3b" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">GSTR-3B</span>
          </TabsTrigger>
          <TabsTrigger value="itc-mismatch" className="gap-1.5">
            <FileWarning className="h-4 w-4" />
            <span className="hidden sm:inline">ITC Match</span>
          </TabsTrigger>
          <TabsTrigger value="comparison" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Compare</span>
          </TabsTrigger>
          <TabsTrigger value="planner" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Planner</span>
          </TabsTrigger>
          <TabsTrigger value="credit-note" className="gap-1.5">
            <Undo2 className="h-4 w-4" />
            <span className="hidden sm:inline">CN Reversal</span>
          </TabsTrigger>
          <TabsTrigger value="penalty" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Penalty</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Calendar</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <GSTSummaryReport />
        </TabsContent>

        <TabsContent value="liability" className="mt-4">
          <GSTLiabilityDashboard />
        </TabsContent>

        <TabsContent value="gstr1" className="mt-4">
          <GSTR1Report />
        </TabsContent>

        <TabsContent value="gstr3b" className="mt-4">
          <GSTR3BSummary />
        </TabsContent>

        <TabsContent value="itc-mismatch" className="mt-4">
          <ITCMismatchCenter />
        </TabsContent>

        <TabsContent value="comparison" className="mt-4">
          <PeriodComparison />
        </TabsContent>

        <TabsContent value="planner" className="mt-4">
          <TaxPaymentPlanner />
        </TabsContent>

        <TabsContent value="credit-note" className="mt-4">
          <CreditNoteReversalCalculator />
        </TabsContent>

        <TabsContent value="penalty" className="mt-4">
          <GSTPenaltyCalculator />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <GSTMonthCalendar />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GSTCompliance;
