import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Clock,
  FileText,
  LayoutDashboard,
  Package,
  PlusCircle,
  Search,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/ClerkAuthProvider';
import { cn } from '@/lib/utils';

/* ─────────────── Types ─────────────── */
type SearchResult = {
  id: string;
  type: 'feature' | 'invoice' | 'client' | 'vendor' | 'product' | 'recent';
  title: string;
  subtitle: string;
  route: string;
  amount?: number;
};

type CategoryFilter = 'all' | 'invoice' | 'client' | 'vendor' | 'product';

/* ─────────────── Constants ─────────────── */
const RECENT_KEY = 'universal_search_recent';
const MAX_RECENT = 5;

const FEATURE_RESULTS: SearchResult[] = [
  { id: 'dashboard',      type: 'feature', title: 'Dashboard',      subtitle: 'Overview of your business',    route: '/dashboard' },
  { id: 'clients',        type: 'feature', title: 'Clients',        subtitle: 'Manage customers',             route: '/clients' },
  { id: 'vendors',        type: 'feature', title: 'Vendors',        subtitle: 'Manage suppliers',             route: '/vendors' },
  { id: 'invoices',       type: 'feature', title: 'Invoices',       subtitle: 'View all sales invoices',      route: '/invoices' },
  { id: 'create-invoice', type: 'feature', title: 'Create Invoice', subtitle: 'New sales invoice',            route: '/create-invoice' },
  { id: 'expenses',       type: 'feature', title: 'Expenses',       subtitle: 'Track and review expenses',    route: '/expenses' },
  { id: 'inventory',      type: 'feature', title: 'Inventory',      subtitle: 'Products, stock & SKUs',       route: '/inventory' },
  { id: 'reports',        type: 'feature', title: 'Reports',        subtitle: 'Financial & compliance',       route: '/reports' },
  { id: 'cash-flow',      type: 'feature', title: 'Cash Flow',      subtitle: 'Projected cash movement',      route: '/reports/cash-flow-forecasting' },
  { id: 'settings',       type: 'feature', title: 'Settings',       subtitle: 'Workspace preferences',        route: '/settings' },
];

const CATEGORY_FILTERS: { label: string; value: CategoryFilter }[] = [
  { label: 'All',      value: 'all'     },
  { label: 'Invoices', value: 'invoice' },
  { label: 'Clients',  value: 'client'  },
  { label: 'Vendors',  value: 'vendor'  },
  { label: 'Products', value: 'product' },
];

const FEATURE_ICON_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  'dashboard':      { icon: <LayoutDashboard className="h-4 w-4" />, color: 'text-blue-500 bg-blue-500/10'    },
  'clients':        { icon: <Users           className="h-4 w-4" />, color: 'text-green-500 bg-green-500/10'  },
  'vendors':        { icon: <Building2       className="h-4 w-4" />, color: 'text-violet-500 bg-violet-500/10'},
  'invoices':       { icon: <FileText        className="h-4 w-4" />, color: 'text-blue-500 bg-blue-500/10'    },
  'create-invoice': { icon: <PlusCircle      className="h-4 w-4" />, color: 'text-primary bg-primary/10'      },
  'expenses':       { icon: <Wallet          className="h-4 w-4" />, color: 'text-orange-500 bg-orange-500/10'},
  'inventory':      { icon: <Package         className="h-4 w-4" />, color: 'text-amber-500 bg-amber-500/10'  },
  'reports':        { icon: <TrendingUp      className="h-4 w-4" />, color: 'text-emerald-500 bg-emerald-500/10'},
  'cash-flow':      { icon: <TrendingUp      className="h-4 w-4" />, color: 'text-emerald-500 bg-emerald-500/10'},
  'settings':       { icon: <Settings        className="h-4 w-4" />, color: 'text-slate-500 bg-slate-500/10'  },
};

/* ─────────────── Helpers ─────────────── */
const featureMatches = (query: string): SearchResult[] => {
  const q = query.trim().toLowerCase();
  if (!q) return FEATURE_RESULTS.slice(0, 6);
  return FEATURE_RESULTS.filter(({ title, subtitle }) =>
    `${title} ${subtitle}`.toLowerCase().includes(q)
  ).slice(0, 5);
};

const getRecentSearches = (): SearchResult[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
};

const saveRecentSearch = (item: SearchResult) => {
  try {
    const list = getRecentSearches().filter((r) => !(r.id === item.id && r.type === item.type));
    list.unshift({ ...item, type: 'recent' });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
};

/* ─────────────── Sub-components ─────────────── */
const HighlightMatch = ({ text, query }: { text: string; query: string }) => {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} className="bg-primary/20 text-primary rounded-sm px-0.5 font-semibold not-italic">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  );
};

const SkeletonItem = () => (
  <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
    <div className="h-8 w-8 flex-shrink-0 animate-pulse rounded-xl bg-muted/60" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3 w-2/5 animate-pulse rounded-full bg-muted/60" />
      <div className="h-2.5 w-3/5 animate-pulse rounded-full bg-muted/40" />
    </div>
  </div>
);

interface ResultItemProps {
  item: SearchResult;
  query: string;
  isActive: boolean;
  onSelect: (item: SearchResult) => void;
  icon: React.ReactNode;
  iconColor: string;
  badgeColor: string;
  showBadge?: boolean;
  showAmount?: boolean;
}

const ResultItem = ({ item, query, isActive, onSelect, icon, iconColor, badgeColor, showBadge, showAmount }: ResultItemProps) => (
  <button
    onClick={() => onSelect(item)}
    className={cn(
      'group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all duration-150',
      'border',
      isActive
        ? 'border-primary/20 bg-primary/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.55)]'
        : [
            'border-transparent',
            'hover:border-white/70 dark:hover:border-white/15',
            'hover:bg-white/65 dark:hover:bg-white/[0.06]',
            'hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]',
          ],
    )}
  >
    <div className={cn('flex-shrink-0 rounded-xl p-2 transition-colors', iconColor)}>
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <div className="mb-0.5 flex items-center gap-2">
        <span className="truncate text-sm font-medium">
          <HighlightMatch text={item.title} query={query} />
        </span>
        {showBadge && item.type !== 'recent' && item.type !== 'feature' && (
          <Badge className={cn('h-4 flex-shrink-0 border px-1.5 py-0 text-[10px]', badgeColor)}>
            {item.type}
          </Badge>
        )}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        <HighlightMatch text={item.subtitle} query={query} />
      </p>
      {showAmount && typeof item.amount === 'number' && (
        <p className="mt-0.5 text-xs font-semibold text-primary">₹{item.amount.toFixed(2)}</p>
      )}
    </div>
    <ArrowRight
      className={cn(
        'h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/25 transition-all duration-150',
        'group-hover:translate-x-0.5 group-hover:text-muted-foreground/60',
        isActive && 'translate-x-0.5 text-primary/50',
      )}
    />
  </button>
);

/* ─────────────── Main Component ─────────────── */
interface UniversalSearchDropdownProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UniversalSearchDropdown({ open: externalOpen, onOpenChange: externalOnOpenChange }: UniversalSearchDropdownProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;

  const setOpen = useCallback((val: boolean) => {
    setInternalOpen(val);
    externalOnOpenChange?.(val);
  }, [externalOnOpenChange]);

  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState<SearchResult[]>([]);
  const [loading, setLoading]           = useState(false);
  const [activeIndex, setActiveIndex]   = useState(-1);
  const [category, setCategory]         = useState<CategoryFilter>('all');
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);

  const inputRef  = useRef<HTMLInputElement>(null);
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;

  const navigate = useNavigate();
  const { user } = useAuth();

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

  const quickResults    = useMemo(() => featureMatches(query), [query]);
  const filteredResults = useMemo(
    () => category === 'all' ? results : results.filter((r) => r.type === category),
    [results, category],
  );

  /* All navigable items (for arrow-key nav) */
  const allItems = useMemo(() => {
    if (query.trim() === '') return [...recentSearches, ...quickResults];
    return [...quickResults, ...filteredResults];
  }, [query, quickResults, filteredResults, recentSearches]);

  /* Open / close side-effects */
  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      setQuery('');
      setResults([]);
      setActiveIndex(-1);
      setCategory('all');
    }
  }, [open]);

  /* Global ⌘K / Ctrl+K shortcut */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpenRef.current(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* Debounced DB search — re-runs only when query / user changes */
  useEffect(() => {
    if (!open || !user || !query.trim()) {
      if (!query.trim()) setResults([]);
      return;
    }

    const run = async () => {
      setLoading(true);
      const value = query.toLowerCase();
      const searchResults: SearchResult[] = [];

      try {
        const [{ data: invoices }, { data: clients }, { data: vendors }, { data: products }] =
          await Promise.all([
            supabase.from('invoices').select('id,invoice_number,client_name,total_amount')
              .eq('user_id', user.id).or(`invoice_number.ilike.%${value}%,client_name.ilike.%${value}%`).limit(5),
            supabase.from('clients').select('id,name,email,phone')
              .eq('user_id', user.id).or(`name.ilike.%${value}%,email.ilike.%${value}%`).limit(5),
            supabase.from('vendors').select('id,name,email,phone')
              .eq('user_id', user.id).or(`name.ilike.%${value}%,email.ilike.%${value}%`).limit(5),
            supabase.from('inventory').select('id,product_name,sku,selling_price')
              .eq('user_id', user.id).or(`product_name.ilike.%${value}%,sku.ilike.%${value}%`).limit(5),
          ]);

        (invoices as any[])?.forEach((inv) => searchResults.push({
          id: inv.id, type: 'invoice', title: inv.invoice_number,
          subtitle: inv.client_name, amount: inv.total_amount, route: '/invoices',
        }));
        (clients as any[])?.forEach((c) => searchResults.push({
          id: c.id, type: 'client', title: c.name,
          subtitle: c.email || c.phone || 'No contact info', route: '/clients',
        }));
        (vendors as any[])?.forEach((v) => searchResults.push({
          id: v.id, type: 'vendor', title: v.name,
          subtitle: v.email || v.phone || 'No contact info', route: '/vendors',
        }));
        (products as any[])?.forEach((p) => searchResults.push({
          id: p.id, type: 'product', title: p.product_name,
          subtitle: `SKU: ${p.sku || 'N/A'}`, amount: p.selling_price, route: '/inventory',
        }));

        setResults(searchResults);
      } catch (err) {
        console.error('Universal search error:', err);
      } finally {
        setLoading(false);
      }
    };

    const t = setTimeout(run, 220);
    return () => clearTimeout(t);
  }, [open, query, user]);

  const handleSelect = (item: SearchResult) => {
    saveRecentSearch(item);
    navigate(item.route);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, allItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        break;
      case 'Enter':
        if (activeIndex >= 0) {
          e.preventDefault();
          const item = allItems[activeIndex];
          if (item) handleSelect(item);
        }
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  };

  const getIcon = (type: SearchResult['type'], id?: string): React.ReactNode => {
    if (type === 'feature' && id && FEATURE_ICON_CONFIG[id]) return FEATURE_ICON_CONFIG[id].icon;
    const map: Record<string, React.ReactNode> = {
      invoice: <FileText   className="h-4 w-4" />,
      client:  <Users      className="h-4 w-4" />,
      vendor:  <Building2  className="h-4 w-4" />,
      product: <Package    className="h-4 w-4" />,
      recent:  <Clock      className="h-4 w-4" />,
    };
    return map[type] ?? <Search className="h-4 w-4" />;
  };

  const getIconColor = (type: SearchResult['type'], id?: string): string => {
    if (type === 'feature' && id && FEATURE_ICON_CONFIG[id]) return FEATURE_ICON_CONFIG[id].color;
    const map: Record<string, string> = {
      invoice: 'text-blue-500 bg-blue-500/10',
      client:  'text-green-500 bg-green-500/10',
      vendor:  'text-violet-500 bg-violet-500/10',
      product: 'text-orange-500 bg-orange-500/10',
      recent:  'text-muted-foreground bg-muted/40',
    };
    return map[type] ?? 'text-primary bg-primary/10';
  };

  const getBadgeColor = (type: SearchResult['type']): string => {
    const map: Record<string, string> = {
      invoice: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      client:  'bg-green-500/10 text-green-600 border-green-500/20',
      vendor:  'bg-violet-500/10 text-violet-600 border-violet-500/20',
      product: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    };
    return map[type] ?? 'bg-primary/10 text-primary border-primary/20';
  };

  /* ─────────────── Render ─────────────── */
  return (
    <Popover open={open} onOpenChange={setOpen}>

      {/* ── Glassmorphism trigger button ── */}
      <PopoverTrigger asChild>
        <button
          className={cn(
            'group flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium',
            'transition-all duration-200',
            /* glass surface */
            'border border-white/40 dark:border-white/10',
            'bg-white/60 dark:bg-white/[0.06]',
            'backdrop-blur-md',
            /* layered shadows: outer glow + inner top highlight */
            'shadow-[0_2px_12px_-4px_hsl(var(--primary)/0.14),inset_0_1px_0_0_rgba(255,255,255,0.75)]',
            'dark:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.07)]',
            /* hover lift */
            'hover:bg-white/80 dark:hover:bg-white/[0.10]',
            'hover:border-white/70 dark:hover:border-white/20',
            'hover:shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.26),inset_0_1px_0_0_rgba(255,255,255,0.90)]',
            'text-foreground/70 hover:text-foreground',
          )}
        >
          <Search className="h-4 w-4 text-primary/70 transition-colors duration-200 group-hover:text-primary" />
          <span>Search</span>
          <kbd className="ml-1 hidden items-center rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:flex">
            {isMac ? '⌘K' : 'Ctrl+K'}
          </kbd>
        </button>
      </PopoverTrigger>

      {/* ── Glassmorphism dropdown panel ── */}
      <PopoverContent
        align="end"
        sideOffset={10}
        className={cn(
          'w-[500px] overflow-hidden p-0',
          'rounded-[24px]',
          /* glass surface */
          'border border-white/50 dark:border-white/[0.09]',
          'bg-white/85 dark:bg-background/[0.88]',
          'backdrop-blur-3xl',
          /* depth shadows + inner top specular highlight */
          'shadow-[0_24px_64px_-12px_hsl(var(--primary)/0.18),0_8px_24px_-8px_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.90)]',
          'dark:shadow-[0_24px_64px_-12px_rgba(0,0,0,0.50),inset_0_1px_0_0_rgba(255,255,255,0.05)]',
        )}
      >

        {/* ── Search input ── */}
        <div className="relative border-b border-white/50 dark:border-white/[0.08] px-4 py-3.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIndex(-1); }}
              onKeyDown={handleKeyDown}
              placeholder="Search features, clients, vendors, invoices…"
              className={cn(
                'h-11 w-full rounded-full pl-10 pr-10',
                'border border-white/60 dark:border-white/[0.09]',
                'bg-white/60 dark:bg-white/[0.05]',
                'backdrop-blur-sm',
                'text-sm text-foreground placeholder:text-muted-foreground/55',
                'shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)]',
                'outline-none ring-0',
                'focus:ring-2 focus:ring-primary/25 focus:border-primary/40',
                'transition-all duration-200',
              )}
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setActiveIndex(-1); inputRef.current?.focus(); }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Category filter pills — appear while searching */}
          {query.trim() !== '' && (
            <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
              {CATEGORY_FILTERS.map((f) => {
                const count = f.value === 'all'
                  ? results.length
                  : results.filter((r) => r.type === f.value).length;
                return (
                  <button
                    key={f.value}
                    onClick={() => { setCategory(f.value); setActiveIndex(-1); }}
                    className={cn(
                      'flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150',
                      category === f.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : [
                            'border border-border/40',
                            'bg-white/50 dark:bg-white/[0.05]',
                            'text-muted-foreground hover:text-foreground',
                            'hover:bg-white/80 dark:hover:bg-white/[0.10]',
                          ],
                    )}
                  >
                    {f.label}
                    {count > 0 && f.value !== 'all' && (
                      <span className={cn(
                        'ml-1.5 rounded-full px-1.5 py-px text-[10px]',
                        category === f.value ? 'bg-white/20' : 'bg-muted/60',
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Results area ── */}
        <ScrollArea className="max-h-[380px]">
          <div className="space-y-3 px-3 py-3">

            {/* Recent searches — shown when input is empty */}
            {query.trim() === '' && recentSearches.length > 0 && (
              <section>
                <div className="flex items-center justify-between px-2 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Recent
                  </p>
                  <button
                    onClick={() => { localStorage.removeItem(RECENT_KEY); setRecentSearches([]); }}
                    className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-0.5">
                  {recentSearches.map((item, i) => (
                    <ResultItem
                      key={`recent-${i}`}
                      item={item}
                      query=""
                      isActive={activeIndex === i}
                      onSelect={handleSelect}
                      icon={getIcon(item.type, item.id)}
                      iconColor={getIconColor(item.type, item.id)}
                      badgeColor={getBadgeColor(item.type)}
                      showBadge
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Quick access / suggestions */}
            <section>
              <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {query.trim() ? 'Suggestions' : 'Quick Access'}
              </p>
              <div className="space-y-0.5">
                {quickResults.map((item, i) => {
                  const offset = query.trim() === '' ? recentSearches.length : 0;
                  return (
                    <ResultItem
                      key={item.id}
                      item={item}
                      query={query}
                      isActive={activeIndex === offset + i}
                      onSelect={handleSelect}
                      icon={getIcon(item.type, item.id)}
                      iconColor={getIconColor(item.type, item.id)}
                      badgeColor={getBadgeColor(item.type)}
                    />
                  );
                })}
              </div>
            </section>

            {/* DB records — shown while typing */}
            {query.trim() !== '' && (
              <section>
                <div className="flex items-center gap-2 px-2 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Matching Records
                  </p>
                  {!loading && filteredResults.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-px text-[10px] font-semibold text-primary">
                      {filteredResults.length}
                    </span>
                  )}
                </div>

                {loading && (
                  <div className="space-y-0.5">
                    <SkeletonItem /><SkeletonItem /><SkeletonItem />
                  </div>
                )}

                {!loading && filteredResults.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <div className="rounded-full bg-muted/40 p-3">
                      <Search className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No records for{' '}
                      <span className="font-medium text-foreground">"{query}"</span>
                    </p>
                  </div>
                )}

                {!loading && filteredResults.length > 0 && (
                  <div className="space-y-0.5">
                    {filteredResults.map((result, i) => (
                      <ResultItem
                        key={`${result.type}-${result.id}`}
                        item={result}
                        query={query}
                        isActive={activeIndex === quickResults.length + i}
                        onSelect={handleSelect}
                        icon={getIcon(result.type)}
                        iconColor={getIconColor(result.type)}
                        badgeColor={getBadgeColor(result.type)}
                        showBadge
                        showAmount
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </ScrollArea>

        {/* ── Footer — keyboard hints ── */}
        <div className={cn(
          'flex items-center gap-4 border-t border-white/50 dark:border-white/[0.08]',
          'bg-white/30 dark:bg-white/[0.03]',
          'px-4 py-2.5 text-[11px] text-muted-foreground',
        )}>
          {([['↑↓', 'navigate'], ['↵', 'open'], ['Esc', 'close']] as const).map(([key, label]) => (
            <span key={key} className="flex items-center gap-1">
              <kbd className="rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
                {key}
              </kbd>
              {label}
            </span>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default UniversalSearchDropdown;
