import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/ClerkAuthProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronRight, ChevronDown, Plus, Lock, LockOpen, Search, Eye,
  FolderTree, Settings2, Wand2, AlertTriangle, RefreshCw,
} from "lucide-react";

// ── types ──────────────────────────────────────────────────────────────────
type AccountType = "Asset" | "Liability" | "Equity" | "Income" | "Expense";
type CashFlowCategory = "Operating" | "Investing" | "Financing";

interface TreeRow {
  id: string;
  user_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_group: string | null;
  account_subgroup: string | null;
  is_group: boolean;
  is_active: boolean;
  opening_balance: number;
  display_order: number;
  parent_account_id: string | null;
  depth: number;
  path: string;
}

interface AccountRow extends TreeRow {
  gst_applicable: boolean;
  gst_rate: number | null;
  cost_center_applicable: boolean;
  cash_flow_category: CashFlowCategory | null;
  currency: string;
  reconciliation_required: boolean;
  allow_manual_journals: boolean;
  is_locked: boolean;
  description: string | null;
}

interface MappingRow {
  id: string;
  module: string;
  scenario_key: string;
  account_id: string;
}

interface Movement {
  line_id: string;
  entry_date: string;
  journal_number: string;
  journal_narration: string | null;
  debit: number;
  credit: number;
  line_narration: string | null;
}

const ACCOUNT_TYPES: AccountType[] = ["Asset", "Liability", "Equity", "Income", "Expense"];
const CASH_FLOW_OPTS: (CashFlowCategory | "None")[] = ["Operating", "Investing", "Financing", "None"];

// ── small helpers ──────────────────────────────────────────────────────────
const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n || 0);

const typeBadgeColor = (t: AccountType) => ({
  Asset: "bg-blue-100 text-blue-800",
  Liability: "bg-orange-100 text-orange-800",
  Equity: "bg-purple-100 text-purple-800",
  Income: "bg-emerald-100 text-emerald-800",
  Expense: "bg-red-100 text-red-800",
}[t]);

// Build child-by-parent index. Returns roots[] and children map.
function buildTree(rows: TreeRow[]) {
  const byParent = new Map<string | null, TreeRow[]>();
  for (const r of rows) {
    const k = r.parent_account_id;
    const arr = byParent.get(k) ?? [];
    arr.push(r);
    byParent.set(k, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.display_order - b.display_order || a.account_code.localeCompare(b.account_code));
  }
  return byParent;
}

// ──────────────────────────────────────────────────────────────────────────
export default function ChartOfAccounts() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AccountType | "All">("All");
  const [showInactive, setShowInactive] = useState(false);
  const [gstOnly, setGstOnly] = useState(false);

  // Tree state
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [glDrillId, setGlDrillId] = useState<string | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);

  // ── queries ──────────────────────────────────────────────────────────────
  const { data: tree, isLoading: treeLoading } = useQuery({
    queryKey: ["coa-tree", userId],
    queryFn: async (): Promise<TreeRow[]> => {
      const { data, error } = await supabase
        .from("v_account_tree")
        .select("*")
        .eq("user_id", userId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TreeRow[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const { data: accountsFull } = useQuery({
    queryKey: ["coa-accounts", userId],
    queryFn: async (): Promise<AccountRow[]> => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as AccountRow[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  // Auto-expand the first time data loads — top two levels.
  useEffect(() => {
    if (tree && tree.length && expanded.size === 0) {
      const next = new Set<string>();
      for (const r of tree) if (r.depth <= 1 && r.is_group) next.add(r.id);
      setExpanded(next);
    }
  }, [tree]);

  const selected = useMemo(
    () => (selectedId && accountsFull ? accountsFull.find((a) => a.id === selectedId) ?? null : null),
    [selectedId, accountsFull]
  );

  // ── filter tree ──────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!tree) return [] as TreeRow[];
    const accMap = new Map((accountsFull ?? []).map((a) => [a.id, a]));
    const q = search.trim().toLowerCase();

    const passes = (r: TreeRow) => {
      const full = accMap.get(r.id);
      if (!showInactive && !r.is_active) return false;
      if (typeFilter !== "All" && r.account_type !== typeFilter) return false;
      if (gstOnly && !(full?.gst_applicable)) return false;
      if (q && !(`${r.account_code} ${r.account_name} ${r.path}`.toLowerCase().includes(q))) return false;
      return true;
    };

    // Keep ancestors of matches so tree stays coherent.
    const keep = new Set<string>();
    const byId = new Map(tree.map((r) => [r.id, r]));
    for (const r of tree) {
      if (passes(r)) {
        keep.add(r.id);
        let p = r.parent_account_id;
        while (p) {
          keep.add(p);
          p = byId.get(p)?.parent_account_id ?? null;
        }
      }
    }
    return tree.filter((r) => keep.has(r.id));
  }, [tree, accountsFull, search, typeFilter, showInactive, gstOnly]);

  const treeIndex = useMemo(() => buildTree(filteredRows), [filteredRows]);
  const roots = treeIndex.get(null) ?? [];

  // ── mutations ────────────────────────────────────────────────────────────
  const seedDefaults = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("ensure_default_coa", { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Default COA seeded" });
      queryClient.invalidateQueries({ queryKey: ["coa-tree", userId] });
      queryClient.invalidateQueries({ queryKey: ["coa-accounts", userId] });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const toggleLock = useMutation({
    mutationFn: async (row: AccountRow) => {
      const { error } = await supabase
        .from("accounts")
        .update({ is_locked: !row.is_locked })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coa-accounts", userId] }),
    onError: (e: any) => toast({ title: "Lock toggle failed", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async (row: AccountRow) => {
      const { error } = await supabase
        .from("accounts")
        .update({ is_active: !row.is_active })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coa-tree", userId] });
      queryClient.invalidateQueries({ queryKey: ["coa-accounts", userId] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  // ── render helpers ───────────────────────────────────────────────────────
  const toggleExpand = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderRow = (r: TreeRow): React.ReactNode => {
    const children = treeIndex.get(r.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(r.id);
    const isSelected = selectedId === r.id;
    const full = accountsFull?.find((a) => a.id === r.id);

    return (
      <React.Fragment key={r.id}>
        <div
          className={`group flex items-center gap-1 px-2 py-1.5 rounded text-sm cursor-pointer ${
            isSelected ? "bg-accent" : "hover:bg-muted/60"
          } ${!r.is_active ? "opacity-50" : ""}`}
          style={{ paddingLeft: `${8 + r.depth * 18}px` }}
          onClick={() => setSelectedId(r.id)}
        >
          {hasChildren ? (
            <button
              className="p-0.5 hover:bg-muted rounded"
              onClick={(e) => { e.stopPropagation(); toggleExpand(r.id); }}
            >
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : <span className="w-4" />}

          <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">{r.account_code}</span>

          <span className={`flex-1 truncate ${r.is_group ? "font-semibold" : ""}`}>
            {r.account_name}
            {full?.is_locked && <Lock className="inline ml-1 w-3 h-3 text-orange-600" />}
            {full?.gst_applicable && (
              <span className="ml-1.5 text-[10px] px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded">GST</span>
            )}
          </span>

          <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeBadgeColor(r.account_type)}`}>
            {r.account_type}
          </span>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {r.is_group && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5"
                onClick={(e) => { e.stopPropagation(); setCreateParentId(r.id); setCreateOpen(true); }}
                title="Add child"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            )}
            {!r.is_group && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5"
                onClick={(e) => { e.stopPropagation(); setGlDrillId(r.id); }}
                title="View ledger"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
        {isOpen && children.map(renderRow)}
      </React.Fragment>
    );
  };

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chart of Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ledger-first, hierarchical accounting backbone. GST &amp; cost-center aware.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => seedDefaults.mutate()}
            disabled={seedDefaults.isPending}
          >
            <FolderTree className="w-4 h-4 mr-2" />
            Seed Default COA
          </Button>
          <Button variant="outline" onClick={() => setMappingOpen(true)}>
            <Wand2 className="w-4 h-4 mr-2" />
            Mapping Wizard
          </Button>
          <Button onClick={() => { setCreateParentId(null); setCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            New Account
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by code, name, or path…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All types</SelectItem>
              {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={gstOnly} onCheckedChange={setGstOnly} />
            GST only
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Show inactive
          </label>
          <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["coa-tree", userId] })}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 p-2 max-h-[70vh] overflow-auto">
          {treeLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
          {!treeLoading && roots.length === 0 && (
            <div className="p-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                {tree && tree.length > 0
                  ? "No accounts match your filters."
                  : "Your Chart of Accounts is empty."}
              </p>
              {(!tree || tree.length === 0) && (
                <Button size="sm" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
                  Seed Default COA
                </Button>
              )}
            </div>
          )}
          {roots.map(renderRow)}
        </Card>

        <Card className="lg:col-span-2 p-4 max-h-[70vh] overflow-auto">
          {!selected && (
            <div className="text-sm text-muted-foreground">
              Select an account to view its details, balances, and properties.
            </div>
          )}
          {selected && (
            <AccountDetails
              account={selected}
              onEdit={() => setEditingId(selected.id)}
              onDrill={() => setGlDrillId(selected.id)}
              onToggleLock={() => toggleLock.mutate(selected)}
              onToggleActive={() => toggleActive.mutate(selected)}
            />
          )}
        </Card>
      </div>

      {/* Dialogs */}
      <CreateAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        userId={userId}
        accounts={accountsFull ?? []}
        defaultParentId={createParentId}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["coa-tree", userId] });
          queryClient.invalidateQueries({ queryKey: ["coa-accounts", userId] });
        }}
      />

      <EditAccountDialog
        accountId={editingId}
        accounts={accountsFull ?? []}
        onClose={() => setEditingId(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["coa-tree", userId] });
          queryClient.invalidateQueries({ queryKey: ["coa-accounts", userId] });
        }}
      />

      <LedgerDrillDialog
        accountId={glDrillId}
        userId={userId}
        accounts={accountsFull ?? []}
        onClose={() => setGlDrillId(null)}
      />

      <MappingWizardDialog
        open={mappingOpen}
        onOpenChange={setMappingOpen}
        userId={userId}
        accounts={accountsFull ?? []}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Account details panel
// ══════════════════════════════════════════════════════════════════════════
function AccountDetails({
  account, onEdit, onDrill, onToggleLock, onToggleActive,
}: {
  account: AccountRow;
  onEdit: () => void;
  onDrill: () => void;
  onToggleLock: () => void;
  onToggleActive: () => void;
}) {
  // Live balance from v_account_tree_balance (rollup includes children for groups).
  const { data: balance } = useQuery({
    queryKey: ["coa-balance", account.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("v_account_tree_balance")
        .select("rollup_balance")
        .eq("id", account.id)
        .single();
      return Number(data?.rollup_balance ?? 0);
    },
    staleTime: 15_000,
  });

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground font-mono">{account.account_code}</div>
          <div className="text-lg font-semibold">{account.account_name}</div>
          <div className="text-xs text-muted-foreground">{account.path}</div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${typeBadgeColor(account.account_type)}`}>
          {account.account_type}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Balance" value={inr(balance ?? 0)} mono />
        <Stat label="Opening" value={inr(account.opening_balance)} mono />
        <Stat label="Group" value={account.account_subgroup || account.account_group || "—"} />
        <Stat label="Cash Flow" value={account.cash_flow_category || "—"} />
        <Stat label="Currency" value={account.currency} />
        <Stat label="GST" value={account.gst_applicable ? `Yes${account.gst_rate ? ` @ ${account.gst_rate}%` : ""}` : "No"} />
        <Stat label="Cost Center" value={account.cost_center_applicable ? "Yes" : "No"} />
        <Stat label="Reconcile" value={account.reconciliation_required ? "Required" : "Optional"} />
      </div>

      {account.description && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Description</div>
          <div className="text-sm">{account.description}</div>
        </div>
      )}

      <div className="flex gap-1 flex-wrap">
        {account.is_group && (
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">Group</span>
        )}
        {!account.is_active && (
          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">Inactive</span>
        )}
        {account.is_locked && (
          <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">Locked</span>
        )}
        {!account.allow_manual_journals && (
          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">No manual JV</span>
        )}
      </div>

      <div className="flex gap-2 flex-wrap pt-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Edit
        </Button>
        {!account.is_group && (
          <Button size="sm" variant="outline" onClick={onDrill}>
            <Eye className="w-3.5 h-3.5 mr-1.5" /> View Ledger
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onToggleLock}>
          {account.is_locked
            ? <><LockOpen className="w-3.5 h-3.5 mr-1.5" /> Unlock</>
            : <><Lock className="w-3.5 h-3.5 mr-1.5" /> Lock</>}
        </Button>
        <Button size="sm" variant="ghost" onClick={onToggleActive}>
          {account.is_active ? "Deactivate" : "Reactivate"}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-muted/40 rounded px-2 py-1.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Create / Edit form (shared inner)
// ══════════════════════════════════════════════════════════════════════════
interface AccountFormValue {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  parent_account_id: string | null;
  is_group: boolean;
  opening_balance: string;
  gst_applicable: boolean;
  gst_rate: string;
  cost_center_applicable: boolean;
  cash_flow_category: CashFlowCategory | "None";
  currency: string;
  reconciliation_required: boolean;
  allow_manual_journals: boolean;
  description: string;
}

const EMPTY_FORM: AccountFormValue = {
  account_code: "",
  account_name: "",
  account_type: "Asset",
  parent_account_id: null,
  is_group: false,
  opening_balance: "0",
  gst_applicable: false,
  gst_rate: "",
  cost_center_applicable: false,
  cash_flow_category: "Operating",
  currency: "INR",
  reconciliation_required: false,
  allow_manual_journals: true,
  description: "",
};

function AccountFormFields({
  value, setValue, accounts, excludeIds = [],
}: {
  value: AccountFormValue;
  setValue: (v: AccountFormValue) => void;
  accounts: AccountRow[];
  excludeIds?: string[];
}) {
  const parentOptions = useMemo(
    () => accounts
      .filter((a) => a.is_group && a.account_type === value.account_type && !excludeIds.includes(a.id))
      .sort((a, b) => a.account_code.localeCompare(b.account_code)),
    [accounts, value.account_type, excludeIds]
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-1">
        <label className="text-xs font-medium">Account Code *</label>
        <Input
          value={value.account_code}
          onChange={(e) => setValue({ ...value, account_code: e.target.value })}
          placeholder="e.g. 1110"
        />
      </div>
      <div className="col-span-1">
        <label className="text-xs font-medium">Account Type *</label>
        <Select
          value={value.account_type}
          onValueChange={(v) => setValue({ ...value, account_type: v as AccountType, parent_account_id: null })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-2">
        <label className="text-xs font-medium">Account Name *</label>
        <Input
          value={value.account_name}
          onChange={(e) => setValue({ ...value, account_name: e.target.value })}
          placeholder="e.g. HDFC Bank — Current"
        />
      </div>

      <div className="col-span-2">
        <label className="text-xs font-medium">Parent (group)</label>
        <Select
          value={value.parent_account_id ?? "__none"}
          onValueChange={(v) => setValue({ ...value, parent_account_id: v === "__none" ? null : v })}
        >
          <SelectTrigger><SelectValue placeholder="— Top level —" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— Top level —</SelectItem>
            {parentOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.account_code} · {p.account_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FormRow label="Is Group (folder)">
        <Switch
          checked={value.is_group}
          onCheckedChange={(c) => setValue({ ...value, is_group: c })}
        />
      </FormRow>
      <div>
        <label className="text-xs font-medium">Opening Balance</label>
        <Input
          type="number"
          step="0.01"
          disabled={value.is_group}
          value={value.opening_balance}
          onChange={(e) => setValue({ ...value, opening_balance: e.target.value })}
        />
      </div>

      <FormRow label="GST Applicable">
        <Switch
          checked={value.gst_applicable}
          onCheckedChange={(c) => setValue({ ...value, gst_applicable: c })}
        />
      </FormRow>
      <div>
        <label className="text-xs font-medium">GST Rate (%)</label>
        <Input
          type="number"
          step="0.01"
          disabled={!value.gst_applicable}
          value={value.gst_rate}
          onChange={(e) => setValue({ ...value, gst_rate: e.target.value })}
          placeholder="e.g. 18"
        />
      </div>

      <FormRow label="Cost Center Applicable">
        <Switch
          checked={value.cost_center_applicable}
          onCheckedChange={(c) => setValue({ ...value, cost_center_applicable: c })}
        />
      </FormRow>
      <div>
        <label className="text-xs font-medium">Cash Flow Category</label>
        <Select
          value={value.cash_flow_category}
          onValueChange={(v) => setValue({ ...value, cash_flow_category: v as any })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CASH_FLOW_OPTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-medium">Currency</label>
        <Input
          value={value.currency}
          onChange={(e) => setValue({ ...value, currency: e.target.value.toUpperCase() })}
          maxLength={3}
        />
      </div>
      <FormRow label="Reconciliation Required">
        <Switch
          checked={value.reconciliation_required}
          onCheckedChange={(c) => setValue({ ...value, reconciliation_required: c })}
        />
      </FormRow>

      <FormRow label="Allow Manual Journals">
        <Switch
          checked={value.allow_manual_journals}
          onCheckedChange={(c) => setValue({ ...value, allow_manual_journals: c })}
        />
      </FormRow>

      <div className="col-span-2">
        <label className="text-xs font-medium">Description / Notes</label>
        <Input
          value={value.description}
          onChange={(e) => setValue({ ...value, description: e.target.value })}
          placeholder="Optional"
        />
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between border rounded px-2 py-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Create dialog
// ══════════════════════════════════════════════════════════════════════════
function CreateAccountDialog({
  open, onOpenChange, userId, accounts, defaultParentId, onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  userId: string | undefined;
  accounts: AccountRow[];
  defaultParentId: string | null;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<AccountFormValue>(EMPTY_FORM);
  const [duplicates, setDuplicates] = useState<Array<{ id: string; account_code: string; account_name: string }>>([]);
  const [overrideDup, setOverrideDup] = useState(false);

  useEffect(() => {
    if (open) {
      const parent = defaultParentId ? accounts.find((a) => a.id === defaultParentId) : null;
      setForm({
        ...EMPTY_FORM,
        parent_account_id: defaultParentId,
        account_type: parent ? parent.account_type : "Asset",
      });
      setDuplicates([]);
      setOverrideDup(false);
    }
  }, [open, defaultParentId]);

  // Live duplicate check (debounced via simple delay).
  useEffect(() => {
    if (!open || !userId || form.account_name.trim().length < 3) {
      setDuplicates([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("find_duplicate_account", {
        p_user_id: userId,
        p_account_name: form.account_name.trim(),
        p_account_type: form.account_type,
      });
      setDuplicates((data ?? []) as any[]);
    }, 300);
    return () => clearTimeout(t);
  }, [form.account_name, form.account_type, open, userId]);

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: userId,
        account_code: form.account_code.trim(),
        account_name: form.account_name.trim(),
        account_type: form.account_type,
        parent_account_id: form.parent_account_id,
        is_group: form.is_group,
        opening_balance: form.is_group ? 0 : Number(form.opening_balance || 0),
        gst_applicable: form.gst_applicable,
        gst_rate: form.gst_applicable && form.gst_rate ? Number(form.gst_rate) : null,
        cost_center_applicable: form.cost_center_applicable,
        cash_flow_category: form.cash_flow_category === "None" ? null : form.cash_flow_category,
        currency: form.currency || "INR",
        reconciliation_required: form.reconciliation_required,
        allow_manual_journals: form.allow_manual_journals,
        description: form.description.trim() || null,
        is_active: true,
      };
      const { error } = await supabase.from("accounts").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Account created" });
      onCreated();
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const blockedByDup = duplicates.length > 0 && !overrideDup;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>New Account</DialogTitle>
          <DialogDescription>Create a ledger or sub-group. Required fields marked with *.</DialogDescription>
        </DialogHeader>

        <AccountFormFields value={form} setValue={setForm} accounts={accounts} />

        {duplicates.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
            <div className="flex items-center gap-2 text-amber-800 font-medium">
              <AlertTriangle className="w-4 h-4" />
              Possible duplicate{duplicates.length > 1 ? "s" : ""}
            </div>
            <ul className="mt-1 text-xs space-y-0.5 ml-6 list-disc">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <span className="font-mono">{d.account_code}</span> · {d.account_name}
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-2 mt-2 text-xs">
              <input type="checkbox" checked={overrideDup} onChange={(e) => setOverrideDup(e.target.checked)} />
              Create anyway
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={
              create.isPending ||
              !form.account_code.trim() ||
              !form.account_name.trim() ||
              blockedByDup
            }
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Edit dialog
// ══════════════════════════════════════════════════════════════════════════
function EditAccountDialog({
  accountId, accounts, onClose, onSaved,
}: {
  accountId: string | null;
  accounts: AccountRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const acc = accountId ? accounts.find((a) => a.id === accountId) ?? null : null;
  const [form, setForm] = useState<AccountFormValue>(EMPTY_FORM);

  useEffect(() => {
    if (acc) {
      setForm({
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        parent_account_id: acc.parent_account_id,
        is_group: acc.is_group,
        opening_balance: String(acc.opening_balance ?? 0),
        gst_applicable: acc.gst_applicable,
        gst_rate: acc.gst_rate != null ? String(acc.gst_rate) : "",
        cost_center_applicable: acc.cost_center_applicable,
        cash_flow_category: (acc.cash_flow_category ?? "None") as any,
        currency: acc.currency || "INR",
        reconciliation_required: acc.reconciliation_required,
        allow_manual_journals: acc.allow_manual_journals,
        description: acc.description ?? "",
      });
    }
  }, [accountId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!acc) return;
      const { error } = await supabase
        .from("accounts")
        .update({
          account_code: form.account_code.trim(),
          account_name: form.account_name.trim(),
          account_type: form.account_type,
          parent_account_id: form.parent_account_id,
          is_group: form.is_group,
          opening_balance: form.is_group ? 0 : Number(form.opening_balance || 0),
          gst_applicable: form.gst_applicable,
          gst_rate: form.gst_applicable && form.gst_rate ? Number(form.gst_rate) : null,
          cost_center_applicable: form.cost_center_applicable,
          cash_flow_category: form.cash_flow_category === "None" ? null : form.cash_flow_category,
          currency: form.currency || "INR",
          reconciliation_required: form.reconciliation_required,
          allow_manual_journals: form.allow_manual_journals,
          description: form.description.trim() || null,
        })
        .eq("id", acc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      onSaved();
      onClose();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={!!accountId} onOpenChange={(b) => !b && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
          {acc && (
            <DialogDescription className="font-mono text-xs">
              {acc.account_code} · {acc.account_name}
            </DialogDescription>
          )}
        </DialogHeader>

        {acc && (
          <>
            <AccountFormFields
              value={form}
              setValue={setForm}
              accounts={accounts}
              excludeIds={[acc.id]}
            />
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Ledger drill (GL movements for an account)
// ══════════════════════════════════════════════════════════════════════════
function LedgerDrillDialog({
  accountId, userId, accounts, onClose,
}: {
  accountId: string | null;
  userId: string | undefined;
  accounts: AccountRow[];
  onClose: () => void;
}) {
  const acc = accountId ? accounts.find((a) => a.id === accountId) ?? null : null;

  const { data: movements, isLoading } = useQuery({
    queryKey: ["coa-gl", accountId, userId],
    queryFn: async (): Promise<Movement[]> => {
      const { data, error } = await supabase
        .from("v_gl_movements")
        .select("line_id, entry_date, journal_number, journal_narration, debit, credit, line_narration")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .order("entry_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
    enabled: !!accountId && !!userId,
  });

  const totals = useMemo(() => {
    const m = movements ?? [];
    return {
      debit: m.reduce((s, x) => s + Number(x.debit || 0), 0),
      credit: m.reduce((s, x) => s + Number(x.credit || 0), 0),
    };
  }, [movements]);

  return (
    <Dialog open={!!accountId} onOpenChange={(b) => !b && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Ledger Movements</DialogTitle>
          {acc && (
            <DialogDescription className="font-mono text-xs">
              {acc.account_code} · {acc.account_name}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex gap-4 text-sm border-y py-2">
          <div>Debit total: <span className="font-mono">{inr(totals.debit)}</span></div>
          <div>Credit total: <span className="font-mono">{inr(totals.credit)}</span></div>
          <div>Net: <span className="font-mono">{inr(totals.debit - totals.credit)}</span></div>
        </div>

        {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && (movements?.length ?? 0) === 0 && (
          <div className="p-4 text-sm text-muted-foreground">No postings yet.</div>
        )}

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-2 py-1.5">Date</th>
                <th className="text-left px-2 py-1.5">Journal</th>
                <th className="text-left px-2 py-1.5">Narration</th>
                <th className="text-right px-2 py-1.5">Debit</th>
                <th className="text-right px-2 py-1.5">Credit</th>
              </tr>
            </thead>
            <tbody>
              {(movements ?? []).map((m) => (
                <tr key={m.line_id} className="border-b">
                  <td className="px-2 py-1.5 whitespace-nowrap font-mono text-xs">{m.entry_date}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap font-mono text-xs">{m.journal_number}</td>
                  <td className="px-2 py-1.5">{m.line_narration || m.journal_narration}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{m.debit ? inr(Number(m.debit)) : ""}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{m.credit ? inr(Number(m.credit)) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Mapping wizard — module/scenario → account_id editor
// ══════════════════════════════════════════════════════════════════════════
const KNOWN_MAPPINGS: Array<{ module: string; scenario_key: string; label: string; type: AccountType }> = [
  { module: "AR",        scenario_key: "ar_control",             label: "AR control account",        type: "Asset" },
  { module: "AR",        scenario_key: "customer_advances",      label: "Customer advances",         type: "Liability" },
  { module: "AP",        scenario_key: "ap_control",             label: "AP control account",        type: "Liability" },
  { module: "AP",        scenario_key: "vendor_advances",        label: "Vendor advances",           type: "Asset" },
  { module: "Banking",   scenario_key: "bank_default",           label: "Default bank",              type: "Asset" },
  { module: "Banking",   scenario_key: "cash_default",           label: "Default cash",              type: "Asset" },
  { module: "Sales",     scenario_key: "sales_revenue",          label: "Sales revenue",             type: "Income" },
  { module: "Sales",     scenario_key: "sales_returns",          label: "Sales returns",             type: "Income" },
  { module: "Purchase",  scenario_key: "purchase_expense",       label: "Purchase expense",          type: "Expense" },
  { module: "Purchase",  scenario_key: "purchase_returns",       label: "Purchase returns",          type: "Expense" },
  { module: "Inventory", scenario_key: "inventory_asset",        label: "Inventory asset",           type: "Asset" },
  { module: "Inventory", scenario_key: "cogs",                   label: "Cost of goods sold",        type: "Expense" },
  { module: "Inventory", scenario_key: "inventory_adjustments",  label: "Inventory adjustments",     type: "Expense" },
  { module: "GST",       scenario_key: "itc",                    label: "Input tax credit (single)", type: "Asset" },
  { module: "GST",       scenario_key: "output_gst",             label: "Output GST (single)",       type: "Liability" },
  { module: "GST",       scenario_key: "cgst_input",             label: "CGST input",                type: "Asset" },
  { module: "GST",       scenario_key: "sgst_input",             label: "SGST input",                type: "Asset" },
  { module: "GST",       scenario_key: "igst_input",             label: "IGST input",                type: "Asset" },
  { module: "GST",       scenario_key: "cess_input",             label: "Cess input",                type: "Asset" },
  { module: "GST",       scenario_key: "cgst_output",            label: "CGST output",               type: "Liability" },
  { module: "GST",       scenario_key: "sgst_output",            label: "SGST output",               type: "Liability" },
  { module: "GST",       scenario_key: "igst_output",            label: "IGST output",               type: "Liability" },
  { module: "GST",       scenario_key: "cess_output",            label: "Cess output",               type: "Liability" },
  { module: "GST",       scenario_key: "rcm_liability",          label: "RCM tax liability",         type: "Liability" },
  { module: "GST",       scenario_key: "output_gst_on_advances", label: "Output GST on advances",    type: "Liability" },
  { module: "TDS",       scenario_key: "tds_payable",            label: "TDS payable",               type: "Liability" },
  { module: "Equity",    scenario_key: "retained_earnings",      label: "Retained earnings",         type: "Equity" },
  { module: "Misc",      scenario_key: "round_off",              label: "Round-off",                 type: "Expense" },
  { module: "Misc",      scenario_key: "prepaid_expenses",       label: "Prepaid expenses",          type: "Asset" },
  { module: "Misc",      scenario_key: "fixed_assets",           label: "Fixed assets",              type: "Asset" },
];

function MappingWizardDialog({
  open, onOpenChange, userId, accounts,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  userId: string | undefined;
  accounts: AccountRow[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: mappings } = useQuery({
    queryKey: ["coa-mappings", userId],
    queryFn: async (): Promise<MappingRow[]> => {
      const { data, error } = await supabase
        .from("account_mapping")
        .select("id, module, scenario_key, account_id")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as MappingRow[];
    },
    enabled: !!userId && open,
  });

  const currentByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of mappings ?? []) m.set(r.scenario_key, r.account_id);
    return m;
  }, [mappings]);

  const [drafts, setDrafts] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (open && mappings) {
      const d: Record<string, string | null> = {};
      for (const k of KNOWN_MAPPINGS) d[k.scenario_key] = currentByKey.get(k.scenario_key) ?? null;
      setDrafts(d);
    }
  }, [open, mappings]);

  const upsertOne = useMutation({
    mutationFn: async ({ scenario_key, account_id, module }: { scenario_key: string; account_id: string | null; module: string }) => {
      if (!account_id) {
        await supabase.from("account_mapping").delete().eq("user_id", userId).eq("scenario_key", scenario_key);
        return;
      }
      const { error } = await supabase.from("account_mapping").upsert(
        { user_id: userId, module, scenario_key, account_id },
        { onConflict: "user_id,scenario_key" }
      );
      if (error) throw error;
    },
  });

  const saveAll = async () => {
    try {
      for (const k of KNOWN_MAPPINGS) {
        const next = drafts[k.scenario_key] ?? null;
        const prev = currentByKey.get(k.scenario_key) ?? null;
        if (next !== prev) {
          await upsertOne.mutateAsync({ scenario_key: k.scenario_key, account_id: next, module: k.module });
        }
      }
      toast({ title: "Mappings saved" });
      queryClient.invalidateQueries({ queryKey: ["coa-mappings", userId] });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  // Group by module for display.
  const grouped = useMemo(() => {
    const g: Record<string, typeof KNOWN_MAPPINGS> = {};
    for (const m of KNOWN_MAPPINGS) (g[m.module] = g[m.module] ?? []).push(m);
    return g;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Account Mapping Wizard</DialogTitle>
          <DialogDescription>
            Point each scenario to the ledger that should be hit when the journal engine posts. Empty mapping
            falls back to the system default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {Object.entries(grouped).map(([mod, items]) => (
            <div key={mod}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{mod}</div>
              <div className="grid grid-cols-2 gap-2">
                {items.map((m) => {
                  const candidates = accounts
                    .filter((a) => a.account_type === m.type && !a.is_group && a.is_active && !a.is_locked)
                    .sort((a, b) => a.account_code.localeCompare(b.account_code));
                  return (
                    <div key={m.scenario_key} className="border rounded p-2">
                      <div className="text-xs font-medium">{m.label}</div>
                      <div className="text-[10px] text-muted-foreground mb-1">{m.scenario_key}</div>
                      <Select
                        value={drafts[m.scenario_key] ?? "__none"}
                        onValueChange={(v) => setDrafts({ ...drafts, [m.scenario_key]: v === "__none" ? null : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="— Use default —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— Use default —</SelectItem>
                          {candidates.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.account_code} · {c.account_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={saveAll}>Save Mappings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
