import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';

// ── shared types ────────────────────────────────────────────────────────────
type Kind = 'vendor' | 'client';

interface LedgerGroup {
  id: string;
  account_code: string;
  account_name: string;
  account_subgroup: string | null;
}

interface Suggestion {
  account_id: string;
  account_code: string;
  account_name: string;
  reason: string;
  rank: number;
}

interface Props {
  kind: Kind;
  value?: string | null;
  onChange: (accountId: string | null) => void;
  /** GST treatment of the party — used to bias smart suggestions. */
  gstTreatment?: string | null;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const SUGGEST_RPC: Record<Kind, string> = {
  vendor: 'suggest_vendor_ledgers',
  client: 'suggest_client_ledgers',
};

const ACCOUNT_TYPE: Record<Kind, 'Liability' | 'Asset'> = {
  vendor: 'Liability',
  client: 'Asset',
};

const DEFAULT_CODE: Record<Kind, string> = {
  vendor: '2160',  // Sundry Creditors
  client: '1170',  // Sundry Debtors
};

/**
 * Primary ledger picker for vendors and clients.
 *
 * Lists every group account of the right type (Liability for vendors, Asset
 * for clients) and surfaces a smart-suggestion row at the top — sourced
 * from `suggest_vendor_ledgers` / `suggest_client_ledgers`. Picking a value
 * controls which control group the party's auto-created sub-ledger lives
 * under in the Chart of Accounts.
 */
export default function PrimaryLedgerSelect({
  kind, value, onChange, gstTreatment, disabled,
  placeholder = 'Select primary ledger',
  className,
}: Props) {
  const { user } = useUser();
  const userId = user?.id;

  // All Liability/Asset group accounts the user can pick from.
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['ledger-groups', kind, userId],
    queryFn: async (): Promise<LedgerGroup[]> => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, account_code, account_name, account_subgroup')
        .eq('user_id', userId)
        .eq('account_type', ACCOUNT_TYPE[kind])
        .eq('is_group', true)
        .eq('is_active', true)
        .order('account_code', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LedgerGroup[];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  // Top-ranked suggestion is highlighted (and offered if the user hasn't
  // picked yet). We keep it cheap — single RPC call, no realtime.
  const { data: suggestions = [] } = useQuery({
    queryKey: ['ledger-suggestions', kind, userId, gstTreatment ?? null],
    queryFn: async (): Promise<Suggestion[]> => {
      const { data, error } = await supabase.rpc(SUGGEST_RPC[kind], {
        p_user_id: userId,
        p_gst_treatment: gstTreatment ?? null,
      });
      if (error) throw error;
      return (data ?? []) as Suggestion[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const topSuggestion = useMemo(
    () => suggestions.find((s) => s.rank === 1) ?? suggestions[0] ?? null,
    [suggestions]
  );

  const defaultGroup = useMemo(
    () => groups.find((g) => g.account_code === DEFAULT_CODE[kind]) ?? null,
    [groups, kind]
  );

  const effectiveValue = value ?? '';

  return (
    <div className={className}>
      <Select
        value={effectiveValue || '__none'}
        onValueChange={(v) => onChange(v === '__none' ? null : v)}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">
            <span className="text-muted-foreground">— Default ({defaultGroup?.account_name ?? (kind === 'vendor' ? 'Sundry Creditors' : 'Sundry Debtors')}) —</span>
          </SelectItem>

          {topSuggestion && (!effectiveValue || effectiveValue !== topSuggestion.account_id) && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1 text-xs">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Suggested
                </SelectLabel>
                <SelectItem value={topSuggestion.account_id}>
                  <span className="font-mono text-xs mr-2">{topSuggestion.account_code}</span>
                  {topSuggestion.account_name}
                  <span className="ml-2 text-[10px] text-muted-foreground">{topSuggestion.reason}</span>
                </SelectItem>
              </SelectGroup>
            </>
          )}

          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className="text-xs">All {kind === 'vendor' ? 'liability' : 'asset'} groups</SelectLabel>
            {groups.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No group accounts found. Run “Seed Default COA” on the Chart of Accounts page.
              </div>
            )}
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                <span className="font-mono text-xs mr-2">{g.account_code}</span>
                {g.account_name}
                {g.account_subgroup && (
                  <span className="ml-2 text-[10px] text-muted-foreground">{g.account_subgroup}</span>
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {topSuggestion && !effectiveValue && (
        <button
          type="button"
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-amber-700 hover:underline"
          onClick={() => onChange(topSuggestion.account_id)}
        >
          <Sparkles className="w-3 h-3" />
          Use suggestion: {topSuggestion.account_name}
        </button>
      )}
    </div>
  );
}

// ── small badge for list / detail views ────────────────────────────────────
export function LedgerMappedBadge({
  primaryName, subledgerCode, subledgerName,
}: {
  primaryName?: string | null;
  subledgerCode?: string | null;
  subledgerName?: string | null;
}) {
  if (!subledgerCode && !primaryName) return null;
  return (
    <Badge variant="outline" className="text-[10px] font-normal">
      {primaryName ?? 'Ledger'}
      {subledgerCode && (
        <span className="ml-1 text-muted-foreground font-mono">→ {subledgerCode}</span>
      )}
    </Badge>
  );
}
