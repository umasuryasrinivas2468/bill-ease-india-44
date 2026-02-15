import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  Calculator, 
  FileText, 
  Download, 
  AlertCircle, 
  CheckCircle, 
  TrendingUp,
  DollarSign,
  FileCheck,
  Clock,
  Lightbulb,
  Shield,
  RefreshCw,
  ExternalLink,
  Calendar
} from 'lucide-react';
import { useAITaxAdvisor } from '@/hooks/useAITaxAdvisor';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ExportAnalysisDialog } from '@/components/ExportAnalysisDialog';
import type { TaxDeduction, TaxOptimizationSuggestion, AITaxAnalysisResult } from '@/types/aiTaxAdvisor';

const AIBusinessTaxAdvisor = () => {
  const [selectedFinancialYear, setSelectedFinancialYear] = useState('2024-25');
  const [activeTab, setActiveTab] = useState('generate');
  const [selectedAnalysis, setSelectedAnalysis] = useState<AITaxAnalysisResult | null>(null);
  
  const {
    useFinancialData,
    useAnalysisHistory,
    useGenerateAnalysis,
    getFinancialYearOptions
  } = useAITaxAdvisor();

  const { data: financialData, isLoading: loadingFinancialData } = useFinancialData(selectedFinancialYear);
  const { data: analysisHistory, isLoading: loadingHistory } = useAnalysisHistory();
  const generateAnalysis = useGenerateAnalysis();

  const financialYearOptions = getFinancialYearOptions();

  const handleGenerateAnalysis = async () => {
    if (!financialData) {
      return;
    }

    generateAnalysis.mutate({
      financialSummary: financialData,
      financialYear: selectedFinancialYear
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(2)}%`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">AI Business Tax Advisor</h1>
        </div>
        <p className="text-muted-foreground">
          Get AI-powered tax deduction recommendations and optimization strategies for your business
        </p>
      </div>

      {/* Financial Year Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Select Financial Year
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedFinancialYear} onValueChange={setSelectedFinancialYear}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select financial year" />
            </SelectTrigger>
            <SelectContent>
              {financialYearOptions.map((year) => (
                <SelectItem key={year} value={year}>
                  FY {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="generate">Generate Analysis</TabsTrigger>
          <TabsTrigger value="history">Analysis History</TabsTrigger>
          <TabsTrigger value="insights">Tax Insights</TabsTrigger>
        </TabsList>

        {/* Generate Analysis Tab */}
        <TabsContent value="generate" className="space-y-6">
          {/* Financial Summary */}
          {loadingFinancialData ? (
            <Card>
              <CardContent className="flex items-center justify-center p-8">
                <LoadingSpinner />
                <span className="ml-2">Loading financial data...</span>
              </CardContent>
            </Card>
          ) : financialData ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Financial Summary - FY {selectedFinancialYear}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(financialData.gross_turnover)}
                    </div>
                    <div className="text-sm text-muted-foreground">Gross Turnover</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(financialData.net_profit)}
                    </div>
                    <div className="text-sm text-muted-foreground">Net Profit</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {formatCurrency(Object.values(financialData.expenses).reduce((sum, val) => sum + val, 0))}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Expenses</div>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="space-y-4">
                  <h4 className="font-semibold">Key Expense Categories</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="font-medium">Salaries</div>
                      <div>{formatCurrency(financialData.expenses.salaries)}</div>
                    </div>
                    <div>
                      <div className="font-medium">Rent</div>
                      <div>{formatCurrency(financialData.expenses.rent)}</div>
                    </div>
                    <div>
                      <div className="font-medium">Utilities</div>
                      <div>{formatCurrency(financialData.expenses.utilities)}</div>
                    </div>
                    <div>
                      <div className="font-medium">Marketing</div>
                      <div>{formatCurrency(financialData.expenses.marketing)}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <Button 
                    onClick={handleGenerateAnalysis}
                    disabled={generateAnalysis.isPending}
                    size="lg"
                    className="w-full md:w-auto"
                  >
                    {generateAnalysis.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4 mr-2" />
                        Generate AI Tax Analysis
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No financial data found for the selected year. Please ensure you have recorded transactions and journals.
              </AlertDescription>
            </Alert>
          )}

          {/* AI Analysis Results */}
          {generateAnalysis.data && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5" />
                    Tax Analysis Results
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {formatCurrency(generateAnalysis.data.tax_calculation.gross_income)}
                      </div>
                      <div className="text-sm text-muted-foreground">Gross Income</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {formatCurrency(generateAnalysis.data.tax_calculation.total_deductions)}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Deductions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {formatCurrency(generateAnalysis.data.tax_calculation.tax_liability)}
                      </div>
                      <div className="text-sm text-muted-foreground">Tax Liability</div>
                    </div>
                  </div>

                  <div className="text-center mb-4">
                    <div className="text-lg">
                      <span className="text-muted-foreground">Effective Tax Rate: </span>
                      <span className="font-bold">{formatPercentage(generateAnalysis.data.tax_calculation.effective_tax_rate)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Eligible Deductions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Eligible Tax Deductions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {generateAnalysis.data.deductions.map((deduction, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{deduction.section}</Badge>
                              <h4 className="font-semibold">{deduction.title}</h4>
                            </div>
                            <p className="text-sm text-muted-foreground">{deduction.description}</p>
                            <p className="text-sm font-medium">{deduction.recommendation}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-600">
                              {formatCurrency(deduction.eligible_amount)}
                            </div>
                            {deduction.max_limit && (
                              <div className="text-xs text-muted-foreground">
                                Max: {formatCurrency(deduction.max_limit)}
                              </div>
                            )}
                          </div>
                        </div>
                        {deduction.documentation_required.length > 0 && (
                          <div className="mt-3">
                            <h5 className="text-xs font-medium text-muted-foreground mb-1">Required Documents:</h5>
                            <div className="flex flex-wrap gap-1">
                              {deduction.documentation_required.map((doc, docIndex) => (
                                <Badge key={docIndex} variant="secondary" className="text-xs">
                                  {doc}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Optimization Suggestions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    Tax Optimization Suggestions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {generateAnalysis.data.suggestions.map((suggestion, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge className={getPriorityColor(suggestion.priority)}>
                                {suggestion.priority.toUpperCase()} PRIORITY
                              </Badge>
                              <span className="text-sm text-muted-foreground">{suggestion.category}</span>
                            </div>
                            <h4 className="font-semibold">{suggestion.title}</h4>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-600">
                              ↓ {formatCurrency(suggestion.potential_savings)}
                            </div>
                            <div className="text-xs text-muted-foreground">Potential Savings</div>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{suggestion.description}</p>
                        <div>
                          <h5 className="text-sm font-medium mb-2">Implementation Steps:</h5>
                          <ul className="text-sm space-y-1">
                            {suggestion.implementation_steps.map((step, stepIndex) => (
                              <li key={stepIndex} className="flex items-start gap-2">
                                <div className="w-1 h-1 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {suggestion.deadline && (
                          <div className="mt-2">
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              {suggestion.deadline}
                            </Badge>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* AI Insights */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    AI Insights & Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{generateAnalysis.data.insights}</p>
                  
                  <Separator className="my-4" />
                  
                  <h4 className="font-semibold mb-2">Compliance Notes:</h4>
                  <ul className="space-y-1">
                    {generateAnalysis.data.compliance_notes.map((note, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <Shield className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Export Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5" />
                    Export Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    <ExportAnalysisDialog 
                      analysis={{
                        ...generateAnalysis.data,
                        id: 'current',
                        user_id: 'current',
                        financial_year: selectedFinancialYear,
                        analysis_date: new Date().toISOString().split('T')[0],
                        financial_summary: financialData!,
                        eligible_deductions: generateAnalysis.data.deductions,
                        optimization_suggestions: generateAnalysis.data.suggestions,
                        ai_insights: generateAnalysis.data.insights,
                        compliance_notes: generateAnalysis.data.compliance_notes,
                        disclaimer: "This is AI-generated tax advice for business deductions under the Indian Income Tax Act. Please consult a Chartered Accountant before filing returns.",
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      }}
                      trigger={
                        <Button variant="outline">
                          <Download className="h-4 w-4 mr-2" />
                          Export Analysis
                        </Button>
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Analysis History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Previous Tax Analyses</CardTitle>
              <CardDescription>View and compare your historical tax analyses</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex items-center justify-center p-8">
                  <LoadingSpinner />
                  <span className="ml-2">Loading analysis history...</span>
                </div>
              ) : analysisHistory && analysisHistory.length > 0 ? (
                <div className="space-y-4">
                  {analysisHistory.map((analysis) => (
                    <div key={analysis.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold">FY {analysis.financial_year}</h4>
                          <p className="text-sm text-muted-foreground">
                            Generated on {new Date(analysis.analysis_date).toLocaleDateString('en-IN')}
                          </p>
                          <div className="mt-2 flex gap-4 text-sm">
                            <span>Tax Liability: <strong>{formatCurrency(analysis.tax_calculation.tax_liability)}</strong></span>
                            <span>Total Deductions: <strong>{formatCurrency(analysis.tax_calculation.total_deductions)}</strong></span>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Analyses Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Generate your first AI tax analysis to see it here.
                  </p>
                  <Button onClick={() => setActiveTab('generate')}>
                    <Brain className="h-4 w-4 mr-2" />
                    Generate Analysis
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tax Insights Tab */}
        <TabsContent value="insights">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Key Tax Planning Tips</CardTitle>
                <CardDescription>General tax planning strategies for businesses in India</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Section 80C Benefits
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Maximize Employee Provident Fund contributions up to ₹1.5 lakhs for tax savings.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Business Expense Deductions
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Ensure all legitimate business expenses like rent, utilities, and salaries are properly claimed.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Depreciation Claims
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Claim depreciation on all business assets as per IT Act rates to reduce taxable income.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Section 35 R&D Expenses
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Research and development expenses can be claimed as weighted deductions.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Important Deadlines</CardTitle>
                <CardDescription>Don't miss these critical tax filing dates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div>
                      <h4 className="font-semibold">Income Tax Return Filing</h4>
                      <p className="text-sm text-muted-foreground">For businesses and individuals</p>
                    </div>
                    <Badge variant="outline">July 31st</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <h4 className="font-semibold">GST Returns</h4>
                      <p className="text-sm text-muted-foreground">Monthly GST filing</p>
                    </div>
                    <Badge variant="outline">20th of every month</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                    <div>
                      <h4 className="font-semibold">Advance Tax Payments</h4>
                      <p className="text-sm text-muted-foreground">Quarterly installments</p>
                    </div>
                    <Badge variant="outline">15th Jun, Sep, Dec, Mar</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Disclaimer */}
      <Alert className="border-yellow-200 bg-yellow-50">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Disclaimer:</strong> This is AI-generated tax advice for business deductions under the Indian Income Tax Act. 
          Please consult a Chartered Accountant before making any tax-related decisions or filing returns.
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default AIBusinessTaxAdvisor;