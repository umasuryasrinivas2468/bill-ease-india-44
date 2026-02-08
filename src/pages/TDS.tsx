import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Percent, FileText, Calculator, Settings } from 'lucide-react';
import TDSSetup from '@/components/tds/TDSSetup';
import TDSReport from '@/components/tds/TDSReport';
import TDSTransactionForm from '@/components/tds/TDSTransactionForm';

const TDS = () => {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">TDS Management</h1>
            <p className="text-muted-foreground">
              Manage Tax Deducted at Source for compliance and reporting
            </p>
          </div>
        </div>
        <TDSTransactionForm />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="setup" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            TDS Setup
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* TDS Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5 text-blue-600" />
                  TDS Rules
                </CardTitle>
                <CardDescription>
                  Configure TDS rates for different payment categories
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Set up TDS rates based on Indian tax regulations for various types of payments.
                </p>
                <ul className="text-sm space-y-1">
                  <li>• Professional Fees - 10%</li>
                  <li>• Contractor Payments - 1-2%</li>
                  <li>• Rent Payments - 10%</li>
                  <li>• Commission - 5%</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-green-600" />
                  Auto Calculation
                </CardTitle>
                <CardDescription>
                  Automatic TDS calculation on transactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  TDS is automatically calculated using the formula:
                </p>
                <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                  TDS Amount = Transaction Amount × TDS Rate%<br/>
                  Net Payable = Transaction Amount - TDS Amount
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-600" />
                  Compliance Reports
                </CardTitle>
                <CardDescription>
                  Generate reports for government filing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Export TDS reports in Excel/CSV format for easy filing.
                </p>
                <ul className="text-sm space-y-1">
                  <li>• Monthly/Quarterly reports</li>
                  <li>• Category-wise breakdown</li>
                  <li>• Export to Excel/PDF</li>
                  <li>• Filing ready format</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common TDS management tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setActiveTab('setup')}>
                  <CardContent className="p-4 text-center">
                    <Settings className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                    <h4 className="font-medium">Setup TDS Rules</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure rates for payment categories
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:bg-gray-50 transition-colors">
                  <CardContent className="p-4 text-center">
                    <Calculator className="h-8 w-8 mx-auto mb-2 text-green-600" />
                    <h4 className="font-medium">Record Transaction</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add new TDS transaction
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setActiveTab('reports')}>
                  <CardContent className="p-4 text-center">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                    <h4 className="font-medium">View Reports</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Generate compliance reports
                    </p>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:bg-gray-50 transition-colors">
                  <CardContent className="p-4 text-center">
                    <Percent className="h-8 w-8 mx-auto mb-2 text-orange-600" />
                    <h4 className="font-medium">TDS Calculator</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Calculate TDS for any amount
                    </p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* TDS Information */}
          <Card>
            <CardHeader>
              <CardTitle>TDS Information</CardTitle>
              <CardDescription>
                Important information about Tax Deducted at Source
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3">Common TDS Sections</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Section 194J - Professional Services</span>
                      <span className="font-medium">10%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Section 194C - Contractor Payments</span>
                      <span className="font-medium">1-2%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Section 194I - Rent Payments</span>
                      <span className="font-medium">10%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Section 194H - Commission</span>
                      <span className="font-medium">5%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Section 194A - Interest</span>
                      <span className="font-medium">10%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Filing Deadlines</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">TDS Return:</span>
                      <span className="ml-2">By 7th of following month</span>
                    </div>
                    <div>
                      <span className="font-medium">TDS Payment:</span>
                      <span className="ml-2">By 7th of following month</span>
                    </div>
                    <div>
                      <span className="font-medium">TDS Certificate:</span>
                      <span className="ml-2">Within prescribed time limits</span>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-sm text-yellow-800">
                      <strong>Note:</strong> Late filing attracts penalties. 
                      Ensure timely compliance with TDS regulations.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup">
          <TDSSetup />
        </TabsContent>

        <TabsContent value="reports">
          <TDSReport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TDS;