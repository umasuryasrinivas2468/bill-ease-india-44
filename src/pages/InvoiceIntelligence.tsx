import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SidebarTrigger } from '@/components/ui/sidebar';

import InvoiceControlRegister from '@/components/reports/InvoiceControlRegister';
import InvoiceLifecycleTracker from '@/components/reports/InvoiceLifecycleTracker';
import CollectionPriorityEngine from '@/components/reports/CollectionPriorityEngine';
import InvoiceRiskDetector from '@/components/reports/InvoiceRiskDetector';
import RevenueRecognitionPanel from '@/components/reports/RevenueRecognitionPanel';
import SmartReminderConfig from '@/components/reports/SmartReminderConfig';
import CustomerCreditExposure from '@/components/reports/CustomerCreditExposure';
import ConversionFunnel from '@/components/reports/ConversionFunnel';
import BillingBehaviorScore from '@/components/reports/BillingBehaviorScore';

// Hub page for Invoice Record List deep features (#1 – #10).
// Partial Payment Engine (#6) lives in the existing /invoices page.
const InvoiceIntelligence: React.FC = () => {
  return (
    <div className="flex-1 p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">Invoice Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Central register, lifecycle, collection priority, risk, revenue recognition, reminders,
            credit exposure, conversion funnel, billing behavior.
          </p>
        </div>
      </div>

      <Tabs defaultValue="register" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="priority">Collection Priority</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="revrec">Revenue Recognition</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="credit">Credit Exposure</TabsTrigger>
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
          <TabsTrigger value="behavior">Behavior Score</TabsTrigger>
        </TabsList>

        <TabsContent value="register"><InvoiceControlRegister /></TabsContent>
        <TabsContent value="lifecycle"><InvoiceLifecycleTracker /></TabsContent>
        <TabsContent value="priority"><CollectionPriorityEngine /></TabsContent>
        <TabsContent value="risk"><InvoiceRiskDetector /></TabsContent>
        <TabsContent value="revrec"><RevenueRecognitionPanel /></TabsContent>
        <TabsContent value="reminders"><SmartReminderConfig /></TabsContent>
        <TabsContent value="credit"><CustomerCreditExposure /></TabsContent>
        <TabsContent value="funnel"><ConversionFunnel /></TabsContent>
        <TabsContent value="behavior"><BillingBehaviorScore /></TabsContent>
      </Tabs>
    </div>
  );
};

export default InvoiceIntelligence;
