import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SidebarTrigger } from '@/components/ui/sidebar';

import RealProfitEngine from '@/components/reports/RealProfitEngine';
import ClientProfitabilityAnalyzer from '@/components/reports/ClientProfitabilityAnalyzer';
import CashConversionCycleDashboard from '@/components/reports/CashConversionCycleDashboard';
import BurnVsRevenueDashboard from '@/components/reports/BurnVsRevenueDashboard';
import MonthlyVarianceEngine from '@/components/reports/MonthlyVarianceEngine';
import AczenCFOLayer from '@/components/reports/AczenCFOLayer';

// Hub page for combined intelligence (#21 – #25) and AI premium layer (#26 – #30).
const AczenCFO: React.FC = () => {
  return (
    <div className="flex-1 p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">Aczen CFO</h1>
          <p className="text-sm text-muted-foreground">
            Real profit, client profitability, cash conversion cycle, burn vs revenue, monthly
            variance — and the AI premium layer (Ask Aczen CFO, recovery, cost cutting,
            cash crunch, founder pulse).
          </p>
        </div>
      </div>

      <Tabs defaultValue="cfo" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="cfo">AI CFO</TabsTrigger>
          <TabsTrigger value="profit">Real Profit</TabsTrigger>
          <TabsTrigger value="clients">Client Profitability</TabsTrigger>
          <TabsTrigger value="ccc">Cash Conversion</TabsTrigger>
          <TabsTrigger value="burn">Burn vs Revenue</TabsTrigger>
          <TabsTrigger value="variance">Variance</TabsTrigger>
        </TabsList>

        <TabsContent value="cfo"><AczenCFOLayer /></TabsContent>
        <TabsContent value="profit"><RealProfitEngine /></TabsContent>
        <TabsContent value="clients"><ClientProfitabilityAnalyzer /></TabsContent>
        <TabsContent value="ccc"><CashConversionCycleDashboard /></TabsContent>
        <TabsContent value="burn"><BurnVsRevenueDashboard /></TabsContent>
        <TabsContent value="variance"><MonthlyVarianceEngine /></TabsContent>
      </Tabs>
    </div>
  );
};

export default AczenCFO;
