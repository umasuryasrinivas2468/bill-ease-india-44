import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { TrendingUp, Download, Settings, DollarSign, ArrowUp, ArrowDown, History, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useJournalsWithLines } from '@/hooks/useJournals';
import { useInvoices } from '@/hooks/useInvoices';

interface CashFlowData {
  month: string;
  openingBalance: number;
  inflows: number;
  outflows: number;
  closingBalance: number;
  isHistorical?: boolean;
}

interface ForecastAssumptions {
  growthRate: number; // Percentage growth in revenue
  expenseIncrease: number; // Percentage increase in expenses
  paymentDelays: number; // Days of payment delay
  forecastMonths: number; // Number of months to forecast (3-6)
}

const CashFlowForecasting = () => {
  const { toast } = useToast();
  const { data: journalData } = useJournalsWithLines();
  const { data: invoices = [] } = useInvoices();

  const [activeTab, setActiveTab] = useState<'historical' | 'forecast'>('forecast');
  const [assumptions, setAssumptions] = useState<ForecastAssumptions>({
    growthRate: 5, // 5% monthly growth
    expenseIncrease: 2, // 2% monthly expense increase
    paymentDelays: 30, // 30 days average payment delay
    forecastMonths: 6, // 6 months forecast
  });

  // Calculate current cash and bank balances
  const currentBalances = useMemo(() => {
    if (!journalData?.journals || !journalData?.lines || !journalData?.accounts) {
      return { cash: 0, bank: 0, total: 0 };
    }

    const { accounts, lines } = journalData;
    
    // Find cash and bank accounts
    const cashAccounts = accounts.filter(acc => 
      acc.account_type?.toLowerCase().includes('cash') || 
      acc.account_name?.toLowerCase().includes('cash')
    );
    
    const bankAccounts = accounts.filter(acc => 
      acc.account_type?.toLowerCase().includes('bank') || 
      acc.account_name?.toLowerCase().includes('bank')
    );

    // Calculate balances
    let cashBalance = 0;
    let bankBalance = 0;

    [...cashAccounts, ...bankAccounts].forEach(account => {
      const accountLines = lines.filter(line => line.account_id === account.id);
      const balance = accountLines.reduce((sum, line) => {
        return sum + (line.debit || 0) - (line.credit || 0);
      }, 0);
      
      if (cashAccounts.includes(account)) {
        cashBalance += balance;
      } else {
        bankBalance += balance;
      }
    });

    return {
      cash: cashBalance,
      bank: bankBalance,
      total: cashBalance + bankBalance
    };
  }, [journalData]);

  // Calculate receivables and payables
  const receivablesPayables = useMemo(() => {
    if (!journalData?.journals || !journalData?.lines || !journalData?.accounts) {
      return { receivables: 0, payables: 0 };
    }

    const { accounts, lines } = journalData;
    
    const receivableAccounts = accounts.filter(acc => 
      acc.account_type?.toLowerCase().includes('receivable') || 
      acc.account_name?.toLowerCase().includes('receivable') ||
      acc.account_name?.toLowerCase().includes('debtors')
    );
    
    const payableAccounts = accounts.filter(acc => 
      acc.account_type?.toLowerCase().includes('payable') || 
      acc.account_name?.toLowerCase().includes('payable') ||
      acc.account_name?.toLowerCase().includes('creditors')
    );

    let receivables = 0;
    let payables = 0;

    receivableAccounts.forEach(account => {
      const accountLines = lines.filter(line => line.account_id === account.id);
      receivables += accountLines.reduce((sum, line) => {
        return sum + (line.debit || 0) - (line.credit || 0);
      }, 0);
    });

    payableAccounts.forEach(account => {
      const accountLines = lines.filter(line => line.account_id === account.id);
      payables += accountLines.reduce((sum, line) => {
        return sum + (line.credit || 0) - (line.debit || 0);
      }, 0);
    });

    return { receivables, payables };
  }, [journalData]);

  // Calculate historical cash flow data for past 6 months
  const historicalCashFlow = useMemo(() => {
    const monthlyData: Record<string, { inflows: number; outflows: number }> = {};
    
    // From invoices
    invoices.forEach(invoice => {
      const date = new Date(invoice.invoice_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { inflows: 0, outflows: 0 };
      }
      
      if (invoice.status === 'paid') {
        monthlyData[monthKey].inflows += Number(invoice.total_amount);
      }
    });

    // Add journal entries for more accurate cash flow tracking
    if (journalData?.journals && journalData?.lines && journalData?.accounts) {
      const { journals, lines, accounts } = journalData;
      
      // Find cash and bank accounts for tracking actual cash movements
      const cashBankAccounts = accounts.filter(acc => 
        acc.account_type?.toLowerCase().includes('cash') || 
        acc.account_type?.toLowerCase().includes('bank') ||
        acc.account_name?.toLowerCase().includes('cash') ||
        acc.account_name?.toLowerCase().includes('bank')
      );

      journals.forEach(journal => {
        const date = new Date(journal.journal_date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { inflows: 0, outflows: 0 };
        }

        // Get journal lines for this journal
        const journalLines = lines.filter(line => line.journal_id === journal.id);
        
        journalLines.forEach(line => {
          const account = accounts.find(acc => acc.id === line.account_id);
          if (account && cashBankAccounts.includes(account)) {
            // If debit to cash/bank = inflow, if credit to cash/bank = outflow
            if (line.debit && line.debit > 0) {
              monthlyData[monthKey].inflows += line.debit;
            }
            if (line.credit && line.credit > 0) {
              monthlyData[monthKey].outflows += line.credit;
            }
          }
        });
      });
    }

    // Generate historical data for past 6 months
    const historicalData: CashFlowData[] = [];
    const currentDate = new Date();
    let runningBalance = currentBalances.total;

    // Start from 6 months ago
    for (let i = 6; i >= 1; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en', { month: 'short', year: 'numeric' });
      
      const monthData = monthlyData[monthKey] || { inflows: 0, outflows: 0 };
      
      // Calculate opening balance (working backwards from current balance)
      const netChange = monthData.inflows - monthData.outflows;
      const openingBalance = runningBalance - netChange;
      
      historicalData.push({
        month: monthName,
        openingBalance,
        inflows: monthData.inflows,
        outflows: monthData.outflows,
        closingBalance: runningBalance,
        isHistorical: true
      });
      
      runningBalance = openingBalance;
    }

    return {
      historicalData: historicalData.reverse(), // Reverse to get chronological order
      monthlyData
    };
  }, [invoices, journalData, currentBalances]);

  // Calculate historical monthly averages for forecasting
  const historicalAverages = useMemo(() => {
    const { monthlyData } = historicalCashFlow;
    
    // Calculate averages from available historical data
    const months = Object.keys(monthlyData).sort().slice(-6);
    const avgInflows = months.length > 0 
      ? months.reduce((sum, month) => sum + monthlyData[month].inflows, 0) / months.length 
      : 50000; // Default assumption
    
    const avgOutflows = months.length > 0
      ? months.reduce((sum, month) => sum + monthlyData[month].outflows, 0) / months.length
      : avgInflows * 0.7; // Assume 70% of inflows as outflows

    return { avgInflows, avgOutflows };
  }, [historicalCashFlow]);

  // Generate forecast data
  const forecastData = useMemo(() => {
    const forecast: CashFlowData[] = [];
    const { avgInflows, avgOutflows } = historicalAverages;
    let currentBalance = currentBalances.total;

    const currentDate = new Date();
    
    for (let i = 0; i < assumptions.forecastMonths; i++) {
      const forecastDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i + 1, 1);
      const monthName = forecastDate.toLocaleDateString('en', { month: 'short', year: 'numeric' });
      
      // Calculate projected inflows with growth
      let projectedInflows = avgInflows * Math.pow(1 + assumptions.growthRate / 100, i);
      
      // Add receivables collection (spread over forecast period with delays)
      if (i === 0) {
        projectedInflows += receivablesPayables.receivables * 0.6; // 60% collected in first month
      } else if (i === 1) {
        projectedInflows += receivablesPayables.receivables * 0.3; // 30% in second month
      } else if (i === 2) {
        projectedInflows += receivablesPayables.receivables * 0.1; // 10% in third month
      }
      
      // Calculate projected outflows with expense increase
      let projectedOutflows = avgOutflows * Math.pow(1 + assumptions.expenseIncrease / 100, i);
      
      // Add payables payments
      if (i === 0) {
        projectedOutflows += receivablesPayables.payables * 0.8; // 80% paid in first month
      } else if (i === 1) {
        projectedOutflows += receivablesPayables.payables * 0.2; // 20% in second month
      }
      
      const openingBalance = currentBalance;
      const closingBalance = openingBalance + projectedInflows - projectedOutflows;
      
      forecast.push({
        month: monthName,
        openingBalance,
        inflows: projectedInflows,
        outflows: projectedOutflows,
        closingBalance,
        isHistorical: false
      });
      
      currentBalance = closingBalance;
    }
    
    return forecast;
  }, [assumptions, currentBalances, receivablesPayables, historicalAverages]);

  const handleAssumptionChange = (key: keyof ForecastAssumptions, value: number) => {
    setAssumptions(prev => ({ ...prev, [key]: value }));
  };

  const handleExportForecast = () => {
    const dataToExport = activeTab === 'historical' ? historicalCashFlow.historicalData : forecastData;
    const csvData = [
      ['Month', 'Opening Balance', 'Inflows', 'Outflows', 'Closing Balance', 'Type'],
      ...dataToExport.map(row => [
        row.month,
        row.openingBalance.toFixed(2),
        row.inflows.toFixed(2),
        row.outflows.toFixed(2),
        row.closingBalance.toFixed(2),
        row.isHistorical ? 'Historical' : 'Forecast'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cash_flow_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Successful",
      description: `Cash flow ${activeTab} data has been downloaded as CSV file.`,
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Cash Flow Forecasting</h1>
            <p className="text-muted-foreground">Predict your future cash position and plan accordingly</p>
          </div>
        </div>
        <Button onClick={handleExportForecast} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export {activeTab === 'historical' ? 'Historical' : 'Forecast'}
        </Button>
      </div>

      {/* Current Position Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Cash & Bank</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ₹{currentBalances.total.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Cash: ₹{currentBalances.cash.toLocaleString()} | Bank: ₹{currentBalances.bank.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accounts Receivable</CardTitle>
            <ArrowUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              ₹{receivablesPayables.receivables.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Expected inflows</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accounts Payable</CardTitle>
            <ArrowDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ₹{receivablesPayables.payables.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Expected outflows</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Position</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              ₹{(currentBalances.total + receivablesPayables.receivables - receivablesPayables.payables).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">After AR/AP settlement</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Historical vs Forecast */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'historical' | 'forecast')} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="historical" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Historical Data (Past 6 Months)
          </TabsTrigger>
          <TabsTrigger value="forecast" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Forecast (Next {assumptions.forecastMonths} Months)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historical" className="space-y-6">
          <HistoricalDataView historicalData={historicalCashFlow.historicalData} />
        </TabsContent>

        <TabsContent value="forecast" className="space-y-6">
          <ForecastDataView 
            forecastData={forecastData} 
            assumptions={assumptions} 
            onAssumptionChange={handleAssumptionChange} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Historical Data View Component
const HistoricalDataView: React.FC<{ historicalData: CashFlowData[] }> = ({ historicalData }) => {
  return (
    <>
      {/* Historical Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Cash Flow Trend (Historical)</CardTitle>
          <CardDescription>
            Actual cash flow movements over the past 6 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`} />
              <Tooltip 
                formatter={(value: any, name: any) => [
                  `₹${Number(value).toLocaleString()}`,
                  name === 'closingBalance' ? 'Closing Balance' : name
                ]}
              />
              <Line 
                type="monotone" 
                dataKey="closingBalance" 
                stroke="#10b981" 
                strokeWidth={3}
                dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Historical Table */}
      <Card>
        <CardHeader>
          <CardTitle>Historical Cash Flow Details</CardTitle>
          <CardDescription>
            Month-by-month breakdown of actual cash movements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Opening Balance</TableHead>
                  <TableHead className="text-right">Actual Inflows</TableHead>
                  <TableHead className="text-right">Actual Outflows</TableHead>
                  <TableHead className="text-right">Closing Balance</TableHead>
                  <TableHead className="text-right">Net Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historicalData.map((row, index) => {
                  const netChange = row.closingBalance - row.openingBalance;
                  const isNegative = row.closingBalance < 0;
                  
                  return (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-right">₹{row.openingBalance.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-green-600">
                        +₹{row.inflows.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        -₹{row.outflows.toLocaleString()}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{row.closingBalance.toLocaleString()}
                      </TableCell>
                      <TableCell className={`text-right ${netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {netChange >= 0 ? '+' : ''}₹{netChange.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Historical Inflows vs Outflows Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Cash Flow Comparison (Historical)</CardTitle>
          <CardDescription>
            Comparison of actual cash inflows and outflows by month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`} />
              <Tooltip 
                formatter={(value: any, name: any) => [
                  `₹${Number(value).toLocaleString()}`,
                  name === 'inflows' ? 'Inflows' : 'Outflows'
                ]}
              />
              <Legend />
              <Bar dataKey="inflows" fill="#10b981" name="Inflows" />
              <Bar dataKey="outflows" fill="#ef4444" name="Outflows" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </>
  );
};

// Forecast Data View Component
const ForecastDataView: React.FC<{ 
  forecastData: CashFlowData[]; 
  assumptions: ForecastAssumptions;
  onAssumptionChange: (key: keyof ForecastAssumptions, value: number) => void;
}> = ({ forecastData, assumptions, onAssumptionChange }) => {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Forecast Assumptions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Forecast Assumptions
            </CardTitle>
            <CardDescription>
              Adjust these parameters to modify the forecast
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="growthRate">Monthly Revenue Growth (%)</Label>
              <Input
                id="growthRate"
                type="number"
                value={assumptions.growthRate}
                onChange={(e) => onAssumptionChange('growthRate', Number(e.target.value))}
                min="0"
                max="50"
                step="0.1"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="expenseIncrease">Monthly Expense Increase (%)</Label>
              <Input
                id="expenseIncrease"
                type="number"
                value={assumptions.expenseIncrease}
                onChange={(e) => onAssumptionChange('expenseIncrease', Number(e.target.value))}
                min="0"
                max="20"
                step="0.1"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="paymentDelays">Average Payment Delay (Days)</Label>
              <Input
                id="paymentDelays"
                type="number"
                value={assumptions.paymentDelays}
                onChange={(e) => onAssumptionChange('paymentDelays', Number(e.target.value))}
                min="0"
                max="90"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="forecastMonths">Forecast Period (Months)</Label>
              <Select 
                value={assumptions.forecastMonths.toString()} 
                onValueChange={(value) => onAssumptionChange('forecastMonths', Number(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Months</SelectItem>
                  <SelectItem value="4">4 Months</SelectItem>
                  <SelectItem value="5">5 Months</SelectItem>
                  <SelectItem value="6">6 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Forecast Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Cash Flow Trend</CardTitle>
            <CardDescription>
              Projected cash balance over the next {assumptions.forecastMonths} months
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`} />
                <Tooltip 
                  formatter={(value: any, name: any) => [
                    `₹${Number(value).toLocaleString()}`,
                    name === 'closingBalance' ? 'Closing Balance' : name
                  ]}
                />
                <Line 
                  type="monotone" 
                  dataKey="closingBalance" 
                  stroke="#8884d8" 
                  strokeWidth={3}
                  dot={{ fill: '#8884d8', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Cash Flow Forecast</CardTitle>
          <CardDescription>
            Monthly breakdown of expected cash inflows and outflows
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Opening Balance</TableHead>
                  <TableHead className="text-right">Expected Inflows</TableHead>
                  <TableHead className="text-right">Expected Outflows</TableHead>
                  <TableHead className="text-right">Closing Balance</TableHead>
                  <TableHead className="text-right">Net Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecastData.map((row, index) => {
                  const netChange = row.closingBalance - row.openingBalance;
                  const isNegative = row.closingBalance < 0;
                  
                  return (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-right">₹{row.openingBalance.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-green-600">
                        +₹{row.inflows.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        -₹{row.outflows.toLocaleString()}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{row.closingBalance.toLocaleString()}
                      </TableCell>
                      <TableCell className={`text-right ${netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {netChange >= 0 ? '+' : ''}₹{netChange.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Inflows vs Outflows Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Cash Flow Comparison</CardTitle>
          <CardDescription>
            Comparison of expected cash inflows and outflows by month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`} />
              <Tooltip 
                formatter={(value: any, name: any) => [
                  `₹${Number(value).toLocaleString()}`,
                  name === 'inflows' ? 'Inflows' : 'Outflows'
                ]}
              />
              <Legend />
              <Bar dataKey="inflows" fill="#10b981" name="Inflows" />
              <Bar dataKey="outflows" fill="#ef4444" name="Outflows" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </>
  );
};

export default CashFlowForecasting;