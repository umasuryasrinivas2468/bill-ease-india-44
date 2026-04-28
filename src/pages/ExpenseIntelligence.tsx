import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SidebarTrigger } from '@/components/ui/sidebar';

import ExpenseIntelligenceRegister from '@/components/expenses/ExpenseIntelligenceRegister';
import CostCenterAllocator from '@/components/expenses/CostCenterAllocator';
import ExpenseLeakageDetector from '@/components/expenses/ExpenseLeakageDetector';
import VendorSpendAnalytics from '@/components/expenses/VendorSpendAnalytics';
import GSTInputCreditLayer from '@/components/expenses/GSTInputCreditLayer';
import EmployeeExpenseWallet from '@/components/expenses/EmployeeExpenseWallet';
import BudgetGuardrail from '@/components/expenses/BudgetGuardrail';
import SubscriptionAnalyzer from '@/components/expenses/SubscriptionAnalyzer';
import ExpenseFraudSignals from '@/components/expenses/ExpenseFraudSignals';

// Hub page for Expense Module deep features (#11 – #20, skipping #13).
const ExpenseIntelligence: React.FC = () => {
  return (
    <div className="flex-1 p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">Expense Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Register, cost centers, leakage, vendor spend, GST ITC, employee wallet, budgets,
            subscriptions, fraud signals.
          </p>
        </div>
      </div>

      <Tabs defaultValue="register" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="cost">Cost Centers</TabsTrigger>
          <TabsTrigger value="leakage">Leakage</TabsTrigger>
          <TabsTrigger value="vendor">Vendor Spend</TabsTrigger>
          <TabsTrigger value="itc">GST ITC</TabsTrigger>
          <TabsTrigger value="employee">Employee Wallet</TabsTrigger>
          <TabsTrigger value="budget">Budgets</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="fraud">Fraud</TabsTrigger>
        </TabsList>

        <TabsContent value="register"><ExpenseIntelligenceRegister /></TabsContent>
        <TabsContent value="cost"><CostCenterAllocator /></TabsContent>
        <TabsContent value="leakage"><ExpenseLeakageDetector /></TabsContent>
        <TabsContent value="vendor"><VendorSpendAnalytics /></TabsContent>
        <TabsContent value="itc"><GSTInputCreditLayer /></TabsContent>
        <TabsContent value="employee"><EmployeeExpenseWallet /></TabsContent>
        <TabsContent value="budget"><BudgetGuardrail /></TabsContent>
        <TabsContent value="subscriptions"><SubscriptionAnalyzer /></TabsContent>
        <TabsContent value="fraud"><ExpenseFraudSignals /></TabsContent>
      </Tabs>
    </div>
  );
};

export default ExpenseIntelligence;
