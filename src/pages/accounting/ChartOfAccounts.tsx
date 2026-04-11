
import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/ClerkAuthProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type Account = {
  id: string;
  user_id: string;
  account_code: string;
  account_name: string;
  account_type: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  opening_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const ACCOUNT_TYPES: Account["account_type"][] = ["Asset", "Liability", "Equity", "Income", "Expense"];

export default function ChartOfAccounts() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    account_code: "",
    account_name: "",
    account_type: "Asset" as Account["account_type"],
    opening_balance: "",
  });

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("user_id", userId as string)
        .order("account_code", { ascending: true });
      if (error) throw error;
      return data as Account[];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: {
      account_code: string;
      account_name: string;
      account_type: Account["account_type"];
      opening_balance: number;
    }) => {
      const { error } = await supabase.from("accounts").insert([
        {
          user_id: userId,
          account_code: payload.account_code,
          account_name: payload.account_name,
          account_type: payload.account_type,
          opening_balance: payload.opening_balance,
        },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", userId] });
      toast({ title: "Account created" });
      setForm({
        account_code: "",
        account_name: "",
        account_type: "Asset",
        opening_balance: "",
      });
    },
    meta: {
      onError: (err: any) => {
        console.error("Create account error", err);
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.account_code || !form.account_name) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    const opening = Number(form.opening_balance || 0);
    addMutation.mutate({
      account_code: form.account_code.trim(),
      account_name: form.account_name.trim(),
      account_type: form.account_type,
      opening_balance: opening,
    });
  };

  const totalOpening = useMemo(
    () => (accounts || []).reduce((sum, a) => sum + Number(a.opening_balance || 0), 0),
    [accounts]
  );

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chart of Accounts</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your chart of accounts and account setup</p>
      </div>

      <Card className="p-4">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-1">
            <label className="text-sm font-medium">Account Code</label>
            <Input
              value={form.account_code}
              onChange={(e) => setForm((f) => ({ ...f, account_code: e.target.value }))}
              placeholder="1000"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Account Name</label>
            <Input
              value={form.account_name}
              onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
              placeholder="Cash"
            />
          </div>
          <div className="md:col-span-1">
            <label className="text-sm font-medium">Type</label>
            <Select
              value={form.account_type}
              onValueChange={(v) => setForm((f) => ({ ...f, account_type: v as Account["account_type"] }))}
            >
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1">
            <label className="text-sm font-medium">Opening Balance</label>
            <Input
              type="number"
              step="0.01"
              value={form.opening_balance}
              onChange={(e) => setForm((f) => ({ ...f, opening_balance: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          <div className="md:col-span-5 flex justify-end">
            <Button type="submit" disabled={addMutation.isPending}>Add Account</Button>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Accounts</h2>
          <div className="text-sm text-muted-foreground">Total opening balance: {totalOpening.toFixed(2)}</div>
        </div>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Opening Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={4}>Loading...</TableCell></TableRow>
              )}
              {!isLoading && (accounts || []).length === 0 && (
                <TableRow><TableCell colSpan={4}>No accounts yet. Add your first one above.</TableCell></TableRow>
              )}
              {(accounts || []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">{a.account_code}</TableCell>
                  <TableCell className="whitespace-nowrap">{a.account_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{a.account_type}</TableCell>
                  <TableCell className="text-right">{Number(a.opening_balance || 0).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

