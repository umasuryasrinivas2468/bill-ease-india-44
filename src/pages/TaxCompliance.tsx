import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Receipt, Calculator, FileText, Calendar, GitMerge,
  ShieldCheck, ArrowRight, Sparkles, MapPin,
} from 'lucide-react';
import TaxComplianceOverview from '@/components/tax-compliance/TaxComplianceOverview';
import TdsEnginePanel from '@/components/tax-compliance/TdsEnginePanel';
import ItcCenterPanel from '@/components/tax-compliance/ItcCenterPanel';
import ItrWorkspacePanel from '@/components/tax-compliance/ItrWorkspacePanel';
import TcsEnginePanel from '@/components/tax-compliance/TcsEnginePanel';
import GstrAutomationPanel from '@/components/tax-compliance/GstrAutomationPanel';
import UnifiedTaxDeterminationPanel from '@/components/tax-compliance/UnifiedTaxDeterminationPanel';
import AddressBookPanel from '@/components/tax-compliance/AddressBookPanel';
import { currentFy } from '@/services/taxComplianceService';
import { Building2, Truck, Wand2 } from 'lucide-react';

const TaxCompliance: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = params.tab || searchParams.get('tab') || 'overview';
  const [tab, setTabState] = useState(initialTab);
  const [fy, setFy] = useState(currentFy());

  useEffect(() => {
    setTabState(params.tab || searchParams.get('tab') || 'overview');
  }, [params.tab, searchParams]);

  const setTab = (nextTab: string) => {
    setTabState(nextTab);
    setSearchParams(nextTab === 'overview' ? {} : { tab: nextTab });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="md:hidden"/>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-emerald-600"/>
              Tax & Compliance Center
            </h1>
            <p className="text-muted-foreground text-sm">
              Unified TDS · ITC · GST · ITR · Compliance Calendar — fully wired to your books.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">FY</Label>
          <Input value={fy} onChange={e => setFy(e.target.value)} className="w-28 font-mono"/>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-11 gap-1 h-auto">
          <TabsTrigger value="overview" className="gap-1.5"><LayoutDashboard className="h-3.5 w-3.5"/>Overview</TabsTrigger>
          <TabsTrigger value="determine" className="gap-1.5"><Wand2 className="h-3.5 w-3.5"/>Tax Engine</TabsTrigger>
          <TabsTrigger value="addresses" className="gap-1.5"><MapPin className="h-3.5 w-3.5"/>Addresses</TabsTrigger>
          <TabsTrigger value="gst" className="gap-1.5"><FileText className="h-3.5 w-3.5"/>GST</TabsTrigger>
          <TabsTrigger value="gstr" className="gap-1.5"><Sparkles className="h-3.5 w-3.5"/>GSTR</TabsTrigger>
          <TabsTrigger value="itc" className="gap-1.5"><Calculator className="h-3.5 w-3.5"/>ITC</TabsTrigger>
          <TabsTrigger value="tds" className="gap-1.5"><Receipt className="h-3.5 w-3.5"/>TDS</TabsTrigger>
          <TabsTrigger value="tcs" className="gap-1.5"><Receipt className="h-3.5 w-3.5"/>TCS</TabsTrigger>
          <TabsTrigger value="itr" className="gap-1.5"><Sparkles className="h-3.5 w-3.5"/>ITR</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5"><Calendar className="h-3.5 w-3.5"/>Calendar</TabsTrigger>
          <TabsTrigger value="recon" className="gap-1.5"><GitMerge className="h-3.5 w-3.5"/>Reconcile</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <TaxComplianceOverview fy={fy} onNavigate={setTab}/>
        </TabsContent>

        <TabsContent value="determine" className="mt-6">
          <UnifiedTaxDeterminationPanel/>
        </TabsContent>

        <TabsContent value="addresses" className="mt-6">
          <AddressBookTabs/>
        </TabsContent>

        <TabsContent value="gst" className="mt-6">
          <GstShortcutHub onNavigateExternal={navigate}/>
        </TabsContent>

        <TabsContent value="gstr" className="mt-6">
          <GstrAutomationPanel/>
        </TabsContent>

        <TabsContent value="tcs" className="mt-6">
          <TcsEnginePanel fy={fy}/>
        </TabsContent>

        <TabsContent value="itc" className="mt-6">
          <ItcCenterPanel fy={fy}/>
        </TabsContent>

        <TabsContent value="tds" className="mt-6">
          <TdsEnginePanel fy={fy}/>
        </TabsContent>

        <TabsContent value="itr" className="mt-6">
          <ItrWorkspacePanel fy={fy}/>
        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
          <CalendarShortcuts onNavigateExternal={navigate}/>
        </TabsContent>

        <TabsContent value="recon" className="mt-6">
          <ReconciliationHub fy={fy} onNavigateExternal={navigate}/>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const AddressBookTabs: React.FC = () => {
  const [side, setSide] = useState<'customer' | 'vendor'>('customer');
  return (
    <div className="space-y-4">
      <Tabs value={side} onValueChange={v => setSide(v as 'customer' | 'vendor')}>
        <TabsList>
          <TabsTrigger value="customer" className="gap-1.5"><Building2 className="h-3.5 w-3.5"/>Customer Addresses</TabsTrigger>
          <TabsTrigger value="vendor" className="gap-1.5"><Truck className="h-3.5 w-3.5"/>Vendor Addresses</TabsTrigger>
        </TabsList>
        <TabsContent value="customer" className="mt-4"><AddressBookPanel partyType="customer"/></TabsContent>
        <TabsContent value="vendor" className="mt-4"><AddressBookPanel partyType="vendor"/></TabsContent>
      </Tabs>
    </div>
  );
};

const ShortcutCard: React.FC<{title: string; description: string; icon: any; onClick: () => void}> = ({title, description, icon: Icon, onClick}) => (
  <Card className="cursor-pointer hover:shadow transition" onClick={onClick}>
    <CardContent className="p-5 flex items-start gap-3">
      <div className="rounded-md bg-emerald-50 p-2 text-emerald-700"><Icon className="h-5 w-5"/></div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground self-center"/>
    </CardContent>
  </Card>
);

const GstShortcutHub: React.FC<{onNavigateExternal: (path: string) => void}> = ({onNavigateExternal}) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">GST Hub</CardTitle>
      <CardDescription>All GST surfaces in one place — wired to journals.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ShortcutCard icon={FileText} title="GST Dashboard" description="Liability, ITC, output GST, RCM" onClick={() => onNavigateExternal('/compliance/gst')}/>
        <ShortcutCard icon={FileText} title="GSTR-3B Filing" description="Monthly summary return" onClick={() => onNavigateExternal('/reports/gst3-filing')}/>
        <ShortcutCard icon={FileText} title="GSTR-2A" description="Supplier-side ITC details" onClick={() => onNavigateExternal('/compliance/gstr-2a')}/>
        <ShortcutCard icon={GitMerge} title="3-Way GST Reconciliation" description="Books vs 2A vs 2B" onClick={() => onNavigateExternal('/compliance/gst-reconciliation')}/>
        <ShortcutCard icon={Calculator} title="GST ITC Report" description="Period-wise ITC summary" onClick={() => onNavigateExternal('/reports/gst-itc')}/>
      </div>
    </CardContent>
  </Card>
);

const CalendarShortcuts: React.FC<{onNavigateExternal: (path: string) => void}> = ({onNavigateExternal}) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Compliance Calendar</CardTitle>
      <CardDescription>Stay ahead of GSTR-1 / 3B, TDS payments, ITR, and MCA filings.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ShortcutCard icon={Calendar} title="Master Compliance Calendar" description="~70 default Indian filings auto-seeded per FY" onClick={() => onNavigateExternal('/compliance')}/>
        <ShortcutCard icon={FileText} title="MCA Filing" description="AOC-4, MGT-7 corporate filings" onClick={() => onNavigateExternal('/compliance/mca')}/>
      </div>
    </CardContent>
  </Card>
);

const ReconciliationHub: React.FC<{fy: string; onNavigateExternal: (path: string) => void}> = ({fy, onNavigateExternal}) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Reconciliation Center</CardTitle>
      <CardDescription>Drift detection across GST / TDS / Books / 26AS / sub-ledgers.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ShortcutCard icon={GitMerge} title="GST 3-Way Recon" description="Books vs GSTR-2A vs GSTR-2B" onClick={() => onNavigateExternal('/compliance/gst-reconciliation')}/>
        <ShortcutCard icon={GitMerge} title="Bank Reconciliation" description="Statement vs journals" onClick={() => onNavigateExternal('/banking/reconciliation')}/>
        <ShortcutCard icon={GitMerge} title="Sub-ledger Manager" description="AR / AP control vs sub-ledger" onClick={() => onNavigateExternal('/accounting/sub-ledgers')}/>
        <ShortcutCard icon={FileText} title="TDS Books vs Returns" description={`FY ${fy} TDS engine reconciliation`} onClick={() => onNavigateExternal('/tax-compliance?tab=tds')}/>
      </div>
    </CardContent>
  </Card>
);

export default TaxCompliance;
