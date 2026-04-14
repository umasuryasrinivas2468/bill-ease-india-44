import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  ExternalLink,
  FileSignature,
  Search,
  ShoppingBag,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const shopifyUrl =
  "https://accounts.shopify.com/lookup?rid=d836eaba-c561-4ee7-8c9c-317b3c46cdb9&verify=1775379256-s1kJqI8GHowcCqBNmdqFI4gR%2Bi9Wxxm2bGR%2B1Mup9Fw%3D";

type AppCatalogItem = {
  name: string;
  tagline: string;
  description: string;
  status: string;
  badge: string;
  ctaLabel: string;
  ctaVariant: "default" | "outline";
  onClick?: () => void;
  icon: typeof ShoppingBag;
  iconClassName: string;
  tileClassName: string;
};

const Apps = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const apps = useMemo<AppCatalogItem[]>(
    () => [
      {
        name: "Aczen for E-Commerce",
        tagline: "Connect your online storefront and streamline order operations.",
        description:
          "Sync your e-commerce workflows with Aczen so your sales activity, customer activity, and day-to-day commerce operations stay easier to manage.",
        status: "Opens in a new window",
        badge: "Live",
        ctaLabel: "Open",
        ctaVariant: "default",
        onClick: () => window.open(shopifyUrl, "_blank", "noopener,noreferrer"),
        icon: ShoppingBag,
        iconClassName: "text-fuchsia-700",
        tileClassName: "from-fuchsia-100 via-rose-50 to-white",
      },
      {
        name: "Aczen Payroll",
        tagline: "Simplify salary, payslips, and payroll compliance.",
        description:
          "Designed for teams that want a cleaner way to manage employee payroll cycles, payout records, and payroll readiness from one place.",
        status: "Waitlist open",
        badge: "Waitlist",
        ctaLabel: "Join Waitlist",
        ctaVariant: "outline",
        icon: WalletCards,
        iconClassName: "text-sky-700",
        tileClassName: "from-sky-100 via-cyan-50 to-white",
      },
      {
        name: "Aczen Expense Card",
        tagline: "Control employee spending with smart company cards.",
        description:
          "Track business expenses with better visibility across teams, categories, and payment moments while improving spend control.",
        status: "Waitlist open",
        badge: "Waitlist",
        ctaLabel: "Join Waitlist",
        ctaVariant: "outline",
        icon: Banknote,
        iconClassName: "text-emerald-700",
        tileClassName: "from-emerald-100 via-lime-50 to-white",
      },
      {
        name: "Aczen Capital",
        tagline: "Fast business capital support for working cash needs.",
        description:
          "Share your interest and the Aczen team will review your requirement and connect with the right capital assistance flow.",
        status: "We will connect in 24 hours",
        badge: "Assisted",
        ctaLabel: "Request Callback",
        ctaVariant: "default",
        icon: BriefcaseBusiness,
        iconClassName: "text-amber-700",
        tileClassName: "from-amber-100 via-orange-50 to-white",
      },
      {
        name: "Aczen eSign",
        tagline: "Secure digital signing for business documents.",
        description:
          "Prepare agreements, approvals, and finance documents for digital execution with a simple signature workflow inside the Aczen ecosystem.",
        status: "Will be live soon",
        badge: "Coming Soon",
        ctaLabel: "Live Soon",
        ctaVariant: "outline",
        icon: FileSignature,
        iconClassName: "text-violet-700",
        tileClassName: "from-violet-100 via-purple-50 to-white",
      },
    ],
    []
  );

  const filteredApps = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return apps;

    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(query) ||
        app.tagline.toLowerCase().includes(query) ||
        app.description.toLowerCase().includes(query)
    );
  }, [apps, searchQuery]);

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary/80">
              Apps
            </p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Extend Aczen with connected business tools
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
              Explore Aczen products for commerce, payroll, spend management,
              capital, and digital signing. This page is static and ready to use
              without any database setup.
            </p>
          </div>

          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search apps..."
              className="h-11 rounded-full pl-10"
            />
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <Card className="border-0 bg-white shadow-sm ring-1 ring-border/60">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Available now</p>
              <p className="mt-2 text-3xl font-bold">1</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Ready to open immediately in a separate window.
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 bg-white shadow-sm ring-1 ring-border/60">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Waitlist products</p>
              <p className="mt-2 text-3xl font-bold">2</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Payroll and Expense Card are listed and marked as waitlist.
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 bg-white shadow-sm ring-1 ring-border/60">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Assisted / upcoming</p>
              <p className="mt-2 text-3xl font-bold">2</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Capital and eSign are shown with guided status messaging.
              </p>
            </CardContent>
          </Card>
        </div>

        {filteredApps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex min-h-[240px] flex-col items-center justify-center gap-3 p-10 text-center">
              <BadgeCheck className="h-10 w-10 text-primary" />
              <h2 className="text-xl font-semibold">No apps match this search</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Try a different keyword like `payroll`, `capital`, or `sign`.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredApps.map((app) => {
              const Icon = app.icon;

              return (
                <Card
                  key={app.name}
                  className="overflow-hidden border-0 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] ring-1 ring-border/60 transition-transform duration-200 hover:-translate-y-1"
                >
                  <CardContent className="p-0">
                    <div className={`${app.tileClassName} p-6`}>
                      <div className="mb-10 flex items-start justify-between gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-black shadow-sm">
                          <Icon className={`h-8 w-8 ${app.iconClassName}`} />
                        </div>
                        <Badge variant="secondary" className="rounded-full px-3 py-1">
                          {app.badge}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-semibold tracking-tight">
                          {app.name}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {app.tagline}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-5 p-6">
                      <p className="min-h-[72px] text-sm leading-6 text-muted-foreground">
                        {app.description}
                      </p>

                      <div className="rounded-2xl bg-muted/50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Status
                        </p>
                        <p className="mt-2 text-sm font-medium text-foreground">
                          {app.status}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          Aczen Business Apps
                        </span>
                        <Button
                          variant={app.ctaVariant}
                          onClick={app.onClick}
                          className="min-w-[150px]"
                        >
                          {app.ctaLabel}
                          {app.onClick ? <ExternalLink className="ml-2 h-4 w-4" /> : null}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Apps;
