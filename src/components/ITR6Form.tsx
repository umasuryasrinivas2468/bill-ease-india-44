import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Download, FileJson, Building2, Calculator, FileCheck } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { 
  ITR6FormData, 
  ASSESSMENT_YEARS, 
  FILING_SECTIONS, 
  BUSINESS_CODES,
  DisallowableExpense,
  ExemptIncome,
  BroughtForwardLoss,
  AdvanceTaxPayment,
  SelfAssessmentTaxPayment,
  TDSDetail 
} from '@/types/itr6';
import { generateITR6Json, downloadITR6Json } from '@/utils/itr6Generator';
import { useEnhancedBusinessData } from '@/hooks/useEnhancedBusinessData';
import { useInvoices } from '@/hooks/useInvoices';
import { useExpenses } from '@/hooks/useExpenses';
import { toast } from 'sonner';

const formSchema = z.object({
  assessmentYear: z.string().min(1, 'Assessment year is required'),
  filingType: z.enum(['original', 'revised', 'belated']),
  filingSectionCode: z.number(),
  itrFilingDueDate: z.string().min(1, 'Filing due date is required'),
  section115BAA: z.boolean(),
  matApplicable: z.boolean(),
  startupDPIITFlag: z.boolean(),
  dpiitRecognitionNumber: z.string().optional(),
  interMinisterialCertFlag: z.boolean(),
  form2AccordPara5Flag: z.boolean(),
  msmeRegistered: z.boolean(),
  udyamNumber: z.string().optional(),
  auditApplicable: z.boolean(),
  auditType: z.string().optional(),
  auditSection: z.string().optional(),
  auditReportDate: z.string().optional(),
  form3CDStatus: z.boolean(),
  natureOfBusiness: z.enum(['services', 'trading', 'manufacturing']),
  businessCode: z.string().min(1, 'Business code is required'),
  signatoryName: z.string().min(1, 'Signatory name is required'),
  signatoryPAN: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'),
  signatoryDesignation: z.string().min(1, 'Designation is required'),
  signatoryPlace: z.string().min(1, 'Place is required'),
  signatoryDate: z.string().min(1, 'Date is required'),
});

export default function ITR6Form() {
  const { getBusinessInfo, getBankDetails, user } = useEnhancedBusinessData();
  const { data: invoices } = useInvoices();
  const { data: expenses } = useExpenses();
  
  const businessInfo = getBusinessInfo();
  const bankDetails = getBankDetails();

  const [disallowableExpenses, setDisallowableExpenses] = useState<DisallowableExpense[]>([]);
  const [exemptIncomes, setExemptIncomes] = useState<ExemptIncome[]>([]);
  const [broughtForwardLosses, setBroughtForwardLosses] = useState<BroughtForwardLoss[]>([]);
  const [advanceTax, setAdvanceTax] = useState<AdvanceTaxPayment[]>([]);
  const [selfAssessmentTax, setSelfAssessmentTax] = useState<SelfAssessmentTaxPayment[]>([]);
  const [tdsDetails, setTdsDetails] = useState<TDSDetail[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assessmentYear: '2026',
      filingType: 'original',
      filingSectionCode: 11,
      itrFilingDueDate: '2025-10-31',
      section115BAA: false,
      matApplicable: false,
      startupDPIITFlag: false,
      dpiitRecognitionNumber: '',
      interMinisterialCertFlag: false,
      form2AccordPara5Flag: false,
      msmeRegistered: false,
      udyamNumber: '',
      auditApplicable: false,
      auditType: '',
      auditSection: '143(2)',
      auditReportDate: '',
      form3CDStatus: false,
      natureOfBusiness: 'services',
      businessCode: '14005',
      signatoryName: businessInfo?.ownerName || '',
      signatoryPAN: '',
      signatoryDesignation: 'Director',
      signatoryPlace: businessInfo?.city || '',
      signatoryDate: new Date().toISOString().split('T')[0],
    },
  });

  const watchNatureOfBusiness = form.watch('natureOfBusiness');
  const watchStartupFlag = form.watch('startupDPIITFlag');
  const watchMsmeFlag = form.watch('msmeRegistered');
  const watchAuditFlag = form.watch('auditApplicable');

  // Calculate financial data from invoices and expenses
  const calculateFinancialData = () => {
    const totalRevenue = invoices?.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;
    const totalExpensesAmt = expenses?.reduce((sum, exp) => sum + (exp.total_amount || 0), 0) || 0;
    const cgst = invoices?.reduce((sum, inv) => sum + ((inv.gst_amount || 0) / 2), 0) || 0;
    const sgst = cgst;
    
    return {
      totalRevenue,
      totalExpenses: totalExpensesAmt,
      grossProfit: totalRevenue,
      netProfit: totalRevenue - totalExpensesAmt,
      totalAssets: 0,
      totalLiabilities: 0,
      shareCapital: 10000,
      reservesAndSurplus: totalRevenue - totalExpensesAmt,
      currentAssets: 0,
      currentLiabilities: 10000,
      fixedAssets: 0,
      cgst,
      sgst,
      igst: 0,
      expenseBreakdown: {
        salaries: 0,
        rent: 0,
        utilities: 0,
        professional: 0,
        travel: 0,
        depreciation: 0,
        other: totalExpensesAmt,
      },
    };
  };

  const addDisallowableExpense = () => {
    setDisallowableExpenses([...disallowableExpenses, { section: '', description: '', amount: 0 }]);
  };

  const addExemptIncome = () => {
    setExemptIncomes([...exemptIncomes, { section: '', description: '', amount: 0 }]);
  };

  const addBroughtForwardLoss = () => {
    setBroughtForwardLosses([...broughtForwardLosses, { assessmentYear: '', lossType: 'business', amount: 0 }]);
  };

  const addAdvanceTax = () => {
    setAdvanceTax([...advanceTax, { bsrCode: '', dateOfDeposit: '', serialNumber: '', amount: 0 }]);
  };

  const addSelfAssessmentTax = () => {
    setSelfAssessmentTax([...selfAssessmentTax, { bsrCode: '', dateOfDeposit: '', serialNumber: '', amount: 0 }]);
  };

  const addTdsDetail = () => {
    setTdsDetails([...tdsDetails, { tanOfDeductor: '', deductorName: '', grossAmount: 0, tdsDeducted: 0, tdsClaimedThisYear: 0 }]);
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!businessInfo) {
      toast.error('Please complete business information in settings first');
      return;
    }

    const formData: ITR6FormData = {
      assessmentYear: values.assessmentYear,
      filingType: values.filingType,
      filingSectionCode: values.filingSectionCode,
      itrFilingDueDate: values.itrFilingDueDate,
      section115BAA: values.section115BAA,
      matApplicable: values.matApplicable,
      startupDPIITFlag: values.startupDPIITFlag,
      dpiitRecognitionNumber: values.dpiitRecognitionNumber || '',
      interMinisterialCertFlag: values.interMinisterialCertFlag,
      form2AccordPara5Flag: values.form2AccordPara5Flag,
      msmeRegistered: values.msmeRegistered,
      udyamNumber: values.udyamNumber || '',
      auditApplicable: values.auditApplicable,
      auditType: values.auditType || '',
      auditSection: values.auditSection || '',
      auditReportDate: values.auditReportDate || '',
      form3CDStatus: values.form3CDStatus,
      natureOfBusiness: values.natureOfBusiness,
      businessCode: values.businessCode,
      signatoryName: values.signatoryName,
      signatoryPAN: values.signatoryPAN,
      signatoryDesignation: values.signatoryDesignation,
      signatoryPlace: values.signatoryPlace,
      signatoryDate: values.signatoryDate,
      disallowableExpenses,
      exemptIncomes,
      broughtForwardLosses,
      advanceTax,
      selfAssessmentTax,
      tdsDetails,
    };

    const financialData = calculateFinancialData();
    
    const enhancedBusinessInfo = {
      ...businessInfo,
      pan: (user?.unsafeMetadata as any)?.pan || '',
      cin: (user?.unsafeMetadata as any)?.cin || '',
      dateOfIncorporation: (user?.unsafeMetadata as any)?.dateOfIncorporation || '',
    };

    const directors = (user?.unsafeMetadata as any)?.directors || [];

    try {
      const itr6Json = generateITR6Json(
        formData,
        enhancedBusinessInfo,
        financialData,
        directors,
        bankDetails || undefined
      );

      const filename = `${businessInfo.businessName.replace(/\s+/g, '_')}_ITR6_AY${values.assessmentYear}`;
      downloadITR6Json(itr6Json, filename);
      toast.success('ITR-6 JSON generated successfully');
    } catch (error) {
      console.error('Error generating ITR-6:', error);
      toast.error('Failed to generate ITR-6 JSON');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileJson className="h-6 w-6" />
            ITR-6 Generator
          </h2>
          <p className="text-muted-foreground">Generate GSTN-compliant ITR-6 JSON for companies</p>
        </div>
        <Badge variant="outline" className="text-sm">
          {businessInfo?.businessName || 'No Business Info'}
        </Badge>
      </div>

      {/* Existing Data Info */}
      <Card className="bg-muted/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Auto-populated from Platform
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Company:</span>
            <p className="font-medium">{businessInfo?.businessName || 'N/A'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total Revenue:</span>
            <p className="font-medium">₹{calculateFinancialData().totalRevenue.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total Expenses:</span>
            <p className="font-medium">₹{calculateFinancialData().totalExpenses.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Net Profit:</span>
            <p className="font-medium">₹{calculateFinancialData().netProfit.toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Assessment Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assessment Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="assessmentYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assessment Year</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select AY" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ASSESSMENT_YEARS.map(ay => (
                          <SelectItem key={ay} value={ay}>AY {ay}-{parseInt(ay) + 1 - 2000}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="filingType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Filing Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="original">Original</SelectItem>
                        <SelectItem value="revised">Revised</SelectItem>
                        <SelectItem value="belated">Belated</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="filingSectionCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Filing Section</FormLabel>
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} defaultValue={field.value.toString()}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FILING_SECTIONS.map(sec => (
                          <SelectItem key={sec.code} value={sec.code.toString()}>{sec.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="itrFilingDueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Filing Due Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Tax Regime */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tax Regime Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Section 115BAA (New Tax Regime)</Label>
                  <p className="text-sm text-muted-foreground">Opt for 22% corporate tax rate without exemptions</p>
                </div>
                <FormField
                  control={form.control}
                  name="section115BAA"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>MAT (Section 115JB) Applicable</Label>
                  <p className="text-sm text-muted-foreground">Minimum Alternate Tax applicable</p>
                </div>
                <FormField
                  control={form.control}
                  name="matApplicable"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Startup/MSME Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Startup & MSME Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>DPIIT Recognized Startup</Label>
                    <FormField
                      control={form.control}
                      name="startupDPIITFlag"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  {watchStartupFlag && (
                    <FormField
                      control={form.control}
                      name="dpiitRecognitionNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>DPIIT Recognition Number</FormLabel>
                          <FormControl>
                            <Input placeholder="DIPP123456" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>MSME Registered</Label>
                    <FormField
                      control={form.control}
                      name="msmeRegistered"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  {watchMsmeFlag && (
                    <FormField
                      control={form.control}
                      name="udyamNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Udyam Number</FormLabel>
                          <FormControl>
                            <Input placeholder="UDYAM-XX-00-0000000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audit Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Audit Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Audit Applicable</Label>
                  <p className="text-sm text-muted-foreground">Is tax audit u/s 44AB applicable?</p>
                </div>
                <FormField
                  control={form.control}
                  name="auditApplicable"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              {watchAuditFlag && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                  <FormField
                    control={form.control}
                    name="auditSection"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Audit Section</FormLabel>
                        <FormControl>
                          <Input placeholder="143(2)" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="auditReportDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Audit Report Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center justify-between pt-6">
                    <Label>Form 3CD Filed</Label>
                    <FormField
                      control={form.control}
                      name="form3CDStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Nature of Business */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Nature of Business</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="natureOfBusiness"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="services">Services</SelectItem>
                        <SelectItem value="trading">Trading</SelectItem>
                        <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="businessCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Code</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BUSINESS_CODES[watchNatureOfBusiness]?.map(code => (
                          <SelectItem key={code.code} value={code.code}>{code.code} - {code.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Disallowable Expenses */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Disallowable Expenses (Not in P&L)</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addDisallowableExpense}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </CardHeader>
            <CardContent>
              {disallowableExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No disallowable expenses added</p>
              ) : (
                <div className="space-y-3">
                  {disallowableExpenses.map((exp, idx) => (
                    <div key={idx} className="grid grid-cols-4 gap-2 items-end">
                      <div>
                        <Label className="text-xs">Section</Label>
                        <Input
                          placeholder="40(a)(i)"
                          value={exp.section}
                          onChange={(e) => {
                            const updated = [...disallowableExpenses];
                            updated[idx].section = e.target.value;
                            setDisallowableExpenses(updated);
                          }}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Description</Label>
                        <Input
                          placeholder="Description"
                          value={exp.description}
                          onChange={(e) => {
                            const updated = [...disallowableExpenses];
                            updated[idx].description = e.target.value;
                            setDisallowableExpenses(updated);
                          }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-xs">Amount</Label>
                          <Input
                            type="number"
                            value={exp.amount}
                            onChange={(e) => {
                              const updated = [...disallowableExpenses];
                              updated[idx].amount = parseFloat(e.target.value) || 0;
                              setDisallowableExpenses(updated);
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mt-5"
                          onClick={() => setDisallowableExpenses(disallowableExpenses.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tax Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Tax Payments (As per Form 26AS)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Advance Tax */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="font-medium">Advance Tax Payments</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addAdvanceTax}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
                {advanceTax.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No advance tax payments</p>
                ) : (
                  <div className="space-y-2">
                    {advanceTax.map((tax, idx) => (
                      <div key={idx} className="grid grid-cols-5 gap-2 items-end">
                        <div>
                          <Label className="text-xs">BSR Code</Label>
                          <Input
                            placeholder="0001234"
                            value={tax.bsrCode}
                            onChange={(e) => {
                              const updated = [...advanceTax];
                              updated[idx].bsrCode = e.target.value;
                              setAdvanceTax(updated);
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Date</Label>
                          <Input
                            type="date"
                            value={tax.dateOfDeposit}
                            onChange={(e) => {
                              const updated = [...advanceTax];
                              updated[idx].dateOfDeposit = e.target.value;
                              setAdvanceTax(updated);
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Challan No.</Label>
                          <Input
                            placeholder="12345"
                            value={tax.serialNumber}
                            onChange={(e) => {
                              const updated = [...advanceTax];
                              updated[idx].serialNumber = e.target.value;
                              setAdvanceTax(updated);
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Amount</Label>
                          <Input
                            type="number"
                            value={tax.amount}
                            onChange={(e) => {
                              const updated = [...advanceTax];
                              updated[idx].amount = parseFloat(e.target.value) || 0;
                              setAdvanceTax(updated);
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setAdvanceTax(advanceTax.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* TDS Details */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="font-medium">TDS Details</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addTdsDetail}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
                {tdsDetails.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No TDS details</p>
                ) : (
                  <div className="space-y-2">
                    {tdsDetails.map((tds, idx) => (
                      <div key={idx} className="grid grid-cols-6 gap-2 items-end">
                        <div>
                          <Label className="text-xs">TAN</Label>
                          <Input
                            placeholder="ABCD12345E"
                            value={tds.tanOfDeductor}
                            onChange={(e) => {
                              const updated = [...tdsDetails];
                              updated[idx].tanOfDeductor = e.target.value;
                              setTdsDetails(updated);
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Deductor Name</Label>
                          <Input
                            value={tds.deductorName}
                            onChange={(e) => {
                              const updated = [...tdsDetails];
                              updated[idx].deductorName = e.target.value;
                              setTdsDetails(updated);
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Gross Amount</Label>
                          <Input
                            type="number"
                            value={tds.grossAmount}
                            onChange={(e) => {
                              const updated = [...tdsDetails];
                              updated[idx].grossAmount = parseFloat(e.target.value) || 0;
                              setTdsDetails(updated);
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">TDS Deducted</Label>
                          <Input
                            type="number"
                            value={tds.tdsDeducted}
                            onChange={(e) => {
                              const updated = [...tdsDetails];
                              updated[idx].tdsDeducted = parseFloat(e.target.value) || 0;
                              setTdsDetails(updated);
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Claimed This Year</Label>
                          <Input
                            type="number"
                            value={tds.tdsClaimedThisYear}
                            onChange={(e) => {
                              const updated = [...tdsDetails];
                              updated[idx].tdsClaimedThisYear = parseFloat(e.target.value) || 0;
                              setTdsDetails(updated);
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setTdsDetails(tdsDetails.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Authorized Signatory */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Authorized Signatory
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="signatoryName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="signatoryPAN"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PAN</FormLabel>
                    <FormControl>
                      <Input placeholder="ABCDE1234F" {...field} className="uppercase" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="signatoryDesignation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Designation</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="signatoryPlace"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Place</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="signatoryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end">
            <Button type="submit" size="lg" className="gap-2">
              <Download className="h-5 w-5" />
              Generate ITR-6 JSON
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
