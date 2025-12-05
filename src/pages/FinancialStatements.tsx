import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { FileText, Download, Building2, Calculator, BookOpen, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useEnhancedBusinessData } from '@/hooks/useEnhancedBusinessData';
import { 
  fetchFinancialData, 
  getFinancialYearOptions,
  CompanyDetails,
  FinancialData
} from '@/services/financialStatementsService';
import { generateFinancialStatementsPDF } from '@/utils/financialStatementsPDF';

const FinancialStatements = () => {
  const { user } = useUser();
  const { getBusinessInfo } = useEnhancedBusinessData();
  const businessInfo = getBusinessInfo();
  
  const [financialYear, setFinancialYear] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [financialData, setFinancialData] = useState<FinancialData | null>(null);
  
  // Company details form
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails>({
    companyName: businessInfo?.businessName || '',
    cin: '',
    pan: '',
    address: businessInfo ? `${businessInfo.address || ''}, ${businessInfo.city || ''}, ${businessInfo.state || ''}, ${businessInfo.pincode || ''}` : '',
    place: businessInfo?.city || '',
    dateOfIncorporation: '',
    ownerName: businessInfo?.ownerName || '',
    directorDIN: '',
    secondDirectorName: '',
    secondDirectorDIN: ''
  });
  
  const fyOptions = getFinancialYearOptions();
  
  useEffect(() => {
    if (businessInfo) {
      setCompanyDetails(prev => ({
        ...prev,
        companyName: businessInfo.businessName || prev.companyName,
        ownerName: businessInfo.ownerName || prev.ownerName,
        address: `${businessInfo.address || ''}, ${businessInfo.city || ''}, ${businessInfo.state || ''}, ${businessInfo.pincode || ''}`.replace(/^, |, $/g, ''),
      }));
    }
  }, [businessInfo]);
  
  const handleFetchData = async () => {
    if (!user?.id || !financialYear) {
      toast.error('Please select a financial year');
      return;
    }
    
    setLoading(true);
    try {
      const data = await fetchFinancialData(user.id, financialYear);
      setFinancialData(data);
      toast.success('Financial data loaded successfully');
    } catch (error) {
      console.error('Error fetching financial data:', error);
      toast.error('Failed to fetch financial data');
    } finally {
      setLoading(false);
    }
  };
  
  const handleGeneratePDF = () => {
    if (!financialData) {
      toast.error('Please fetch financial data first');
      return;
    }
    
    if (!companyDetails.companyName || !companyDetails.ownerName) {
      toast.error('Please fill in company name and owner name');
      return;
    }
    
    try {
      const doc = generateFinancialStatementsPDF(companyDetails, financialData, financialYear);
      doc.save(`Financial_Statements_${companyDetails.companyName.replace(/\s+/g, '_')}_${financialYear}.pdf`);
      toast.success('Financial statements PDF generated successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financial Statements Generator</h1>
        <p className="text-muted-foreground">Generate CA-grade financial statements including P&L, Balance Sheet, and more</p>
      </div>
      
      <Tabs defaultValue="setup" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 gap-2">
          <TabsTrigger value="setup" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden md:inline">Company Setup</span>
            <span className="md:hidden">Setup</span>
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden md:inline">Preview Data</span>
            <span className="md:hidden">Preview</span>
          </TabsTrigger>
          <TabsTrigger value="pnl" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            <span className="hidden md:inline">P&L Statement</span>
            <span className="md:hidden">P&L</span>
          </TabsTrigger>
          <TabsTrigger value="balance" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span className="hidden md:inline">Balance Sheet</span>
            <span className="md:hidden">Balance</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="setup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Company Details</CardTitle>
              <CardDescription>Enter your company information for the financial statements header</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    value={companyDetails.companyName}
                    onChange={(e) => setCompanyDetails(prev => ({ ...prev, companyName: e.target.value }))}
                    placeholder="ACZEN TECHNOLOGIES PRIVATE LIMITED"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cin">CIN Number</Label>
                  <Input
                    id="cin"
                    value={companyDetails.cin}
                    onChange={(e) => setCompanyDetails(prev => ({ ...prev, cin: e.target.value }))}
                    placeholder="U62013TS2024PTC184046"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pan">PAN Number</Label>
                  <Input
                    id="pan"
                    value={companyDetails.pan}
                    onChange={(e) => setCompanyDetails(prev => ({ ...prev, pan: e.target.value }))}
                    placeholder="ABACA4623P"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfIncorporation">Date of Incorporation</Label>
                  <Input
                    id="dateOfIncorporation"
                    type="date"
                    value={companyDetails.dateOfIncorporation}
                    onChange={(e) => setCompanyDetails(prev => ({ ...prev, dateOfIncorporation: e.target.value }))}
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="address">Registered Address</Label>
                  <Input
                    id="address"
                    value={companyDetails.address}
                    onChange={(e) => setCompanyDetails(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Flat No 101, Block 1, Deepthisri Nagar, Hyderabad, Telangana, 500050"
                  />
                </div>
              </div>
              
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold mb-3">Director Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ownerName">Director Name *</Label>
                    <Input
                      id="ownerName"
                      value={companyDetails.ownerName}
                      onChange={(e) => setCompanyDetails(prev => ({ ...prev, ownerName: e.target.value }))}
                      placeholder="BODAPATI UMA SURYA SRINIVAS"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="directorDIN">Director DIN</Label>
                    <Input
                      id="directorDIN"
                      value={companyDetails.directorDIN}
                      onChange={(e) => setCompanyDetails(prev => ({ ...prev, directorDIN: e.target.value }))}
                      placeholder="10575702"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secondDirectorName">Second Director Name (Optional)</Label>
                    <Input
                      id="secondDirectorName"
                      value={companyDetails.secondDirectorName}
                      onChange={(e) => setCompanyDetails(prev => ({ ...prev, secondDirectorName: e.target.value }))}
                      placeholder="BODAPATI SATYANARAYANA"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secondDirectorDIN">Second Director DIN</Label>
                    <Input
                      id="secondDirectorDIN"
                      value={companyDetails.secondDirectorDIN}
                      onChange={(e) => setCompanyDetails(prev => ({ ...prev, secondDirectorDIN: e.target.value }))}
                      placeholder="10575703"
                    />
                  </div>
                </div>
              </div>
              
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold mb-3">Financial Year Selection</h3>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 space-y-2">
                    <Label>Select Financial Year</Label>
                    <Select value={financialYear} onValueChange={setFinancialYear}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select FY" />
                      </SelectTrigger>
                      <SelectContent>
                        {fyOptions.map((fy) => (
                          <SelectItem key={fy} value={fy}>
                            FY {fy}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleFetchData} disabled={loading || !financialYear}>
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="mr-2 h-4 w-4" />
                          Fetch Financial Data
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Financial Data Preview</CardTitle>
              <CardDescription>Review the calculated financial figures before generating the PDF</CardDescription>
            </CardHeader>
            <CardContent>
              {financialData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h3 className="font-semibold text-lg border-b pb-2">Income</h3>
                      <div className="flex justify-between">
                        <span>Revenue from Operations</span>
                        <span className="font-medium">{formatCurrency(financialData.revenueFromOperations)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Other Income</span>
                        <span className="font-medium">{formatCurrency(financialData.otherIncome)}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t pt-2">
                        <span>Total Revenue</span>
                        <span>{formatCurrency(financialData.totalRevenue)}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <h3 className="font-semibold text-lg border-b pb-2">Expenses</h3>
                      <div className="flex justify-between">
                        <span>Employee Benefit Expense</span>
                        <span className="font-medium">{formatCurrency(financialData.employeeBenefitExpense)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Financial Costs</span>
                        <span className="font-medium">{formatCurrency(financialData.financialCosts)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Other Expenses</span>
                        <span className="font-medium">{formatCurrency(financialData.otherExpenses)}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t pt-2">
                        <span>Total Expenses</span>
                        <span>{formatCurrency(financialData.totalExpenses)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Profit Before Tax</p>
                        <p className={`text-xl font-bold ${financialData.profitBeforeTax >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(financialData.profitBeforeTax)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Tax Expense</p>
                        <p className="text-xl font-bold">{formatCurrency(financialData.taxExpense)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Net Profit/Loss</p>
                        <p className={`text-xl font-bold ${financialData.profitAfterTax >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(financialData.profitAfterTax)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <Button onClick={handleGeneratePDF} className="w-full md:w-auto" size="lg">
                    <Download className="mr-2 h-5 w-5" />
                    Generate Complete Financial Statements PDF
                  </Button>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No financial data loaded yet.</p>
                  <p className="text-sm">Go to Company Setup tab and fetch financial data first.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="pnl" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss Statement</CardTitle>
              <CardDescription>Detailed income and expense breakdown for the financial year</CardDescription>
            </CardHeader>
            <CardContent>
              {financialData ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Sr.No</th>
                        <th className="text-left py-2 px-3">Particulars</th>
                        <th className="text-center py-2 px-3">Note No</th>
                        <th className="text-right py-2 px-3">FY {financialYear}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2 px-3">I</td>
                        <td className="py-2 px-3">Revenue from Operations</td>
                        <td className="text-center py-2 px-3">5</td>
                        <td className="text-right py-2 px-3">{formatCurrency(financialData.revenueFromOperations)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3">II</td>
                        <td className="py-2 px-3">Other Income</td>
                        <td className="text-center py-2 px-3">6</td>
                        <td className="text-right py-2 px-3">{formatCurrency(financialData.otherIncome)}</td>
                      </tr>
                      <tr className="border-b bg-muted/30">
                        <td className="py-2 px-3">III</td>
                        <td className="py-2 px-3 font-semibold">Total Revenue (I+II)</td>
                        <td className="text-center py-2 px-3"></td>
                        <td className="text-right py-2 px-3 font-semibold">{formatCurrency(financialData.totalRevenue)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3">IV</td>
                        <td className="py-2 px-3 font-semibold">Expenses:</td>
                        <td className="text-center py-2 px-3"></td>
                        <td className="text-right py-2 px-3"></td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3"></td>
                        <td className="py-2 px-3 pl-6">Employee Benefit Expense</td>
                        <td className="text-center py-2 px-3"></td>
                        <td className="text-right py-2 px-3">{formatCurrency(financialData.employeeBenefitExpense)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3"></td>
                        <td className="py-2 px-3 pl-6">Financial Costs</td>
                        <td className="text-center py-2 px-3"></td>
                        <td className="text-right py-2 px-3">{formatCurrency(financialData.financialCosts)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3"></td>
                        <td className="py-2 px-3 pl-6">Depreciation</td>
                        <td className="text-center py-2 px-3"></td>
                        <td className="text-right py-2 px-3">{formatCurrency(financialData.depreciationExpense)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3"></td>
                        <td className="py-2 px-3 pl-6">Other Expenses</td>
                        <td className="text-center py-2 px-3">7</td>
                        <td className="text-right py-2 px-3">{formatCurrency(financialData.otherExpenses)}</td>
                      </tr>
                      <tr className="border-b bg-muted/30">
                        <td className="py-2 px-3"></td>
                        <td className="py-2 px-3 font-semibold">Total Expenses (IV)</td>
                        <td className="text-center py-2 px-3"></td>
                        <td className="text-right py-2 px-3 font-semibold">{formatCurrency(financialData.totalExpenses)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3">V</td>
                        <td className="py-2 px-3">Profit/(Loss) Before Tax</td>
                        <td className="text-center py-2 px-3"></td>
                        <td className={`text-right py-2 px-3 font-semibold ${financialData.profitBeforeTax >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(financialData.profitBeforeTax)}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-3">VI</td>
                        <td className="py-2 px-3">Tax Expense</td>
                        <td className="text-center py-2 px-3"></td>
                        <td className="text-right py-2 px-3">{formatCurrency(financialData.taxExpense)}</td>
                      </tr>
                      <tr className="bg-primary/10">
                        <td className="py-2 px-3">VII</td>
                        <td className="py-2 px-3 font-bold">Profit/(Loss) for the Period</td>
                        <td className="text-center py-2 px-3"></td>
                        <td className={`text-right py-2 px-3 font-bold ${financialData.profitAfterTax >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(financialData.profitAfterTax)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No data available. Please fetch financial data first.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="balance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Balance Sheet</CardTitle>
              <CardDescription>Assets, liabilities and equity position as at year end</CardDescription>
            </CardHeader>
            <CardContent>
              {financialData ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-bold text-lg mb-4 border-b pb-2">EQUITY & LIABILITIES</h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground">Shareholder's Funds</h4>
                        <div className="flex justify-between py-1">
                          <span>Share Capital</span>
                          <span>{formatCurrency(financialData.shareCapital)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Reserves & Surplus</span>
                          <span className={financialData.reservesAndSurplus >= 0 ? '' : 'text-red-600'}>
                            {formatCurrency(financialData.reservesAndSurplus)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground">Current Liabilities</h4>
                        <div className="flex justify-between py-1">
                          <span>Trade Payables</span>
                          <span>{formatCurrency(financialData.tradePayables)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Other Current Liabilities</span>
                          <span>{formatCurrency(financialData.otherCurrentLiabilities)}</span>
                        </div>
                      </div>
                      <div className="border-t pt-2">
                        <div className="flex justify-between font-bold">
                          <span>Total Equity & Liabilities</span>
                          <span>{formatCurrency(financialData.totalEquityAndLiabilities)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-bold text-lg mb-4 border-b pb-2">ASSETS</h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground">Non-Current Assets</h4>
                        <div className="flex justify-between py-1">
                          <span>Fixed Assets</span>
                          <span>{formatCurrency(financialData.fixedAssets)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Non-current Investments</span>
                          <span>{formatCurrency(financialData.nonCurrentInvestments)}</span>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-muted-foreground">Current Assets</h4>
                        <div className="flex justify-between py-1">
                          <span>Trade Receivables</span>
                          <span>{formatCurrency(financialData.tradeReceivables)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Cash & Bank</span>
                          <span>{formatCurrency(financialData.cashAndBank)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>Other Current Assets</span>
                          <span>{formatCurrency(financialData.otherCurrentAssets)}</span>
                        </div>
                      </div>
                      <div className="border-t pt-2">
                        <div className="flex justify-between font-bold">
                          <span>Total Assets</span>
                          <span>{formatCurrency(financialData.totalAssets)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No data available. Please fetch financial data first.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialStatements;
