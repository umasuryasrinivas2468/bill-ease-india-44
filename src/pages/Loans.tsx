import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { 
  HandCoins, 
  Building2, 
  Calculator, 
  Clock, 
  CheckCircle, 
  ExternalLink,
  ArrowRight,
  Percent,
  CreditCard,
  TrendingUp,
  Shield,
  Users,
  FileText
} from 'lucide-react';

const Loans = () => {
  const [selectedLoan, setSelectedLoan] = useState<string | null>(null);

  const loanTypes = [
    {
      id: 'business-loan',
      title: 'Business Loan',
      description: 'Quick funding for your business growth needs',
      features: [
        'Up to ₹5 Crore loan amount',
        'Interest rates starting from 11%',
        'Flexible repayment tenure up to 5 years',
        'Minimal documentation required',
        'Quick approval in 48-72 hours'
      ],
      eligibility: [
        'Business should be operational for minimum 3 years',
        'Annual turnover above ₹40 Lakhs',
        'Good credit score (700+)',
        'Profitable business for last 2 years'
      ],
      documents: [
        'Business registration documents',
        'Bank statements (last 12 months)',
        'ITR for last 2-3 years',
        'Financial statements',
        'Identity and address proof'
      ],
      benefits: [
        'No collateral required for loans up to ₹75 Lakhs',
        'Competitive interest rates',
        'Flexible EMI options',
        'Quick disbursal',
        'Dedicated relationship manager'
      ]
    },
    {
      id: 'working-capital',
      title: 'Working Capital Loan',
      description: 'Manage your day-to-day business operations smoothly',
      features: [
        'Credit limit up to ₹2 Crores',
        'Interest charged only on utilized amount',
        'Overdraft facility available',
        'Online account management',
        'Instant fund access'
      ],
      eligibility: [
        'Business vintage of 2+ years',
        'Minimum annual turnover of ₹25 Lakhs',
        'Regular cash flow',
        'Good banking relationship'
      ],
      documents: [
        'Business KYC documents',
        'Bank statements (6-12 months)',
        'GST returns',
        'Financial statements',
        'Trade licenses'
      ],
      benefits: [
        'Pay interest only on used amount',
        'Revolving credit facility',
        'No prepayment charges',
        'Digital banking access',
        'Flexible withdrawal options'
      ]
    },
    {
      id: 'equipment-loan',
      title: 'Equipment Financing',
      description: 'Finance your business equipment and machinery purchases',
      features: [
        'Loan amount up to 90% of equipment cost',
        'Tenure up to 7 years',
        'Competitive interest rates',
        'New and used equipment financing',
        'Quick processing'
      ],
      eligibility: [
        'Established business (1+ years)',
        'Good financial track record',
        'Equipment invoice required',
        'Adequate cash flow'
      ],
      documents: [
        'Equipment quotation/invoice',
        'Business registration',
        'Financial statements',
        'Bank statements',
        'Insurance documents'
      ],
      benefits: [
        'Equipment acts as collateral',
        'Tax benefits available',
        'Flexible repayment options',
        'Quick approval process',
        'Competitive rates'
      ]
    }
  ];

  const handleApplyLoan = (loanType: string) => {
    // Open the external link in a new window/tab
    window.open('https://aczenloan.vercel.app', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <HandCoins className="h-8 w-8 text-blue-600" />
              Business Loans
            </h1>
            <p className="text-muted-foreground">
              Get the funding your business needs to grow and succeed
            </p>
          </div>
        </div>
        <Button 
          onClick={() => handleApplyLoan('general')}
          className="bg-blue-600 hover:bg-blue-700"
          size="lg"
        >
          Apply Now
          <ExternalLink className="h-4 w-4 ml-2" />
        </Button>
      </div>

      {/* Key Benefits Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <CardContent className="p-4">
            <Clock className="h-8 w-8 mx-auto mb-3 text-green-600" />
            <h3 className="font-semibold mb-2 text-center">Quick Approval</h3>
            <p className="text-sm text-muted-foreground text-center">Get approved in 48-72 hours</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="p-4">
            <Percent className="h-8 w-8 mx-auto mb-3 text-blue-600" />
            <h3 className="font-semibold mb-2 text-center">Low Interest Rates</h3>
            <p className="text-sm text-muted-foreground text-center">Starting from 11% per annum</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="p-4">
            <FileText className="h-8 w-8 mx-auto mb-3 text-purple-600" />
            <h3 className="font-semibold mb-2 text-center">Minimal Documentation</h3>
            <p className="text-sm text-muted-foreground text-center">Simple and quick process</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="p-4">
            <Shield className="h-8 w-8 mx-auto mb-3 text-orange-600" />
            <h3 className="font-semibold mb-2 text-center">No Collateral</h3>
            <p className="text-sm text-muted-foreground text-center">Up to ₹75 Lakhs without security</p>
          </CardContent>
        </Card>
      </div>

      {/* Loan Types */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold">Choose Your Loan Type</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {loanTypes.map((loan) => (
            <Card key={loan.id} className="relative hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  {loan.title}
                </CardTitle>
                <CardDescription>{loan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-3 text-sm text-gray-800 dark:text-gray-200">Key Features</h4>
                  <ul className="text-sm space-y-2">
                    {loan.features.slice(0, 3).map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-left">
                        <CheckCircle className="h-3 w-3 text-green-600 mt-1 flex-shrink-0" />
                        <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <Button
                  onClick={() => handleApplyLoan(loan.id)}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  Apply for {loan.title}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => setSelectedLoan(selectedLoan === loan.id ? null : loan.id)}
                  className="w-full"
                >
                  View Details
                </Button>

                {selectedLoan === loan.id && (
                  <div className="mt-4 space-y-4 border-t pt-4 text-left">
                    <div>
                      <h5 className="font-semibold text-sm mb-3 text-gray-800 dark:text-gray-200">All Features</h5>
                      <ul className="text-xs space-y-2">
                        {loan.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <CheckCircle className="h-3 w-3 text-green-600 mt-1 flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div>
                      <h5 className="font-semibold text-sm mb-3 text-gray-800 dark:text-gray-200">Eligibility Criteria</h5>
                      <ul className="text-xs space-y-2">
                        {loan.eligibility.map((criteria, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <CheckCircle className="h-3 w-3 text-blue-600 mt-1 flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{criteria}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div>
                      <h5 className="font-semibold text-sm mb-3 text-gray-800 dark:text-gray-200">Required Documents</h5>
                      <ul className="text-xs space-y-2">
                        {loan.documents.map((doc, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <FileText className="h-3 w-3 text-purple-600 mt-1 flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{doc}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h5 className="font-semibold text-sm mb-3 text-gray-800 dark:text-gray-200">Key Benefits</h5>
                      <ul className="text-xs space-y-2">
                        {loan.benefits.map((benefit, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <TrendingUp className="h-3 w-3 text-green-600 mt-1 flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Process Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Simple Application Process</CardTitle>
          <CardDescription>Get your loan approved in just 4 easy steps</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-blue-600 font-bold">1</span>
              </div>
              <h4 className="font-semibold mb-2 text-center">Apply Online</h4>
              <p className="text-sm text-muted-foreground text-center">Fill out our simple online application form</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-blue-600 font-bold">2</span>
              </div>
              <h4 className="font-semibold mb-2 text-center">Document Upload</h4>
              <p className="text-sm text-muted-foreground text-center">Upload required documents securely</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-blue-600 font-bold">3</span>
              </div>
              <h4 className="font-semibold mb-2 text-center">Quick Verification</h4>
              <p className="text-sm text-muted-foreground text-center">Our team will verify your application</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-green-600 font-bold">4</span>
              </div>
              <h4 className="font-semibold mb-2 text-center">Get Funded</h4>
              <p className="text-sm text-muted-foreground text-center">Receive funds directly in your account</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA Section */}
      <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
        <CardContent className="p-8 text-center">
          <HandCoins className="h-16 w-16 mx-auto mb-4 text-blue-600" />
          <h2 className="text-2xl font-bold mb-4">Ready to Grow Your Business?</h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Don't let funding be a barrier to your business success. Apply now and get the capital you need 
            to expand, invest in equipment, or manage cash flow.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={() => handleApplyLoan('main-cta')}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700"
            >
              Apply for Loan Now
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
            <Button variant="outline" size="lg">
              <Calculator className="h-4 w-4 mr-2" />
              Calculate EMI
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Loans;