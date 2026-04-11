import React, { useEffect, useMemo, useState } from "react";
import { CarFront, Gauge, MapPinned, Plus, ReceiptText, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CreateExpenseData } from "@/types/expenses";
import { useVendors } from "@/hooks/useVendors";

interface MileageLog {
  id: string;
  vendorId?: string;
  vendorName?: string;
  tripDate: string;
  vehicleName: string;
  tripPurpose: string;
  startLocation: string;
  endLocation: string;
  startKm: number;
  endKm: number;
  distanceKm: number;
  ratePerKm: number;
  amount: number;
}

interface MileageRecorderProps {
  onCreateDraft: (draft: Partial<CreateExpenseData> & { expense_date?: string }) => void;
}

const STORAGE_KEY = "aczen-mileage-logs";
const makeId = () => `mile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyForm = {
  vendorId: "",
  tripDate: new Date().toISOString().split("T")[0],
  vehicleName: "",
  tripPurpose: "",
  startLocation: "",
  endLocation: "",
  startKm: "",
  endKm: "",
  ratePerKm: "12",
};

const MileageRecorder: React.FC<MileageRecorderProps> = ({ onCreateDraft }) => {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [logs, setLogs] = useState<MileageLog[]>([]);
  const { data: vendors = [] } = useVendors();

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      setLogs(JSON.parse(saved));
    } catch {
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  }, [logs]);

  const projectedDistance = useMemo(() => {
    const start = Number(form.startKm);
    const end = Number(form.endKm);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
    return end - start;
  }, [form.endKm, form.startKm]);

  const projectedAmount = useMemo(() => projectedDistance * Number(form.ratePerKm || 0), [projectedDistance, form.ratePerKm]);

  const monthlyStats = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthLogs = logs.filter((log) => log.tripDate.startsWith(currentMonth));
    return {
      tripCount: monthLogs.length,
      distance: monthLogs.reduce((sum, log) => sum + log.distanceKm, 0),
      amount: monthLogs.reduce((sum, log) => sum + log.amount, 0),
    };
  }, [logs]);

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addLog = () => {
    const start = Number(form.startKm);
    const end = Number(form.endKm);
    const rate = Number(form.ratePerKm);

    if (!form.tripPurpose || !form.vehicleName || !form.startLocation || !form.endLocation || !form.tripDate) {
      toast({
        title: "Missing trip details",
        description: "Please fill vehicle, purpose, date, and locations before saving.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Number.isFinite(rate) || rate <= 0) {
      toast({
        title: "Invalid mileage values",
        description: "End reading must be greater than start reading, and rate per km must be positive.",
        variant: "destructive",
      });
      return;
    }

    const distance = end - start;
    const amount = Math.round(distance * rate * 100) / 100;

    const nextLog: MileageLog = {
      id: makeId(),
      vendorId: form.vendorId || undefined,
      vendorName: vendors.find((vendor) => vendor.id === form.vendorId)?.name,
      tripDate: form.tripDate,
      vehicleName: form.vehicleName,
      tripPurpose: form.tripPurpose,
      startLocation: form.startLocation,
      endLocation: form.endLocation,
      startKm: start,
      endKm: end,
      distanceKm: distance,
      ratePerKm: rate,
      amount,
    };

    setLogs((prev) => [nextLog, ...prev]);
    setForm(emptyForm);
    toast({
      title: "Mileage recorded",
      description: "Trip log saved locally and ready for expense conversion.",
    });
  };

  const deleteLog = (id: string) => {
    setLogs((prev) => prev.filter((log) => log.id !== id));
  };

  const createExpenseFromLog = (log: MileageLog) => {
    onCreateDraft({
      vendor_id: log.vendorId,
      vendor_name: log.vendorName || log.vehicleName,
      expense_date: log.tripDate,
      category_name: "Travel Expense",
      description: `Mileage reimbursement for ${log.tripPurpose}`,
      amount: log.amount,
      tax_amount: 0,
      payment_mode: "cash",
      bill_number: `MILE-${log.tripDate.replace(/-/g, "")}`,
      notes: `Trip: ${log.startLocation} to ${log.endLocation} | Distance: ${log.distanceKm} km | Rate: ₹${log.ratePerKm}/km`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Trips This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthlyStats.tripCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distance Logged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthlyStats.distance.toLocaleString()} km</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reimbursement Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{monthlyStats.amount.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CarFront className="h-5 w-5" />
            Mileage Recorder
          </CardTitle>
          <CardDescription>
            Log vehicle trips, calculate reimbursement automatically, and convert a trip into an expense draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Select value={form.vendorId} onValueChange={(value) => handleChange("vendorId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Trip Date</Label>
              <Input type="date" value={form.tripDate} onChange={(e) => handleChange("tripDate", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Input placeholder="Swift Dzire / Bike / Van" value={form.vehicleName} onChange={(e) => handleChange("vehicleName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Trip Purpose</Label>
              <Input placeholder="Client visit / material pickup" value={form.tripPurpose} onChange={(e) => handleChange("tripPurpose", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Rate Per Km</Label>
              <Input type="number" step="0.01" value={form.ratePerKm} onChange={(e) => handleChange("ratePerKm", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Start Location</Label>
              <Input value={form.startLocation} onChange={(e) => handleChange("startLocation", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Location</Label>
              <Input value={form.endLocation} onChange={(e) => handleChange("endLocation", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Start Odometer</Label>
              <Input type="number" step="0.1" value={form.startKm} onChange={(e) => handleChange("startKm", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Odometer</Label>
              <Input type="number" step="0.1" value={form.endKm} onChange={(e) => handleChange("endKm", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Gauge className="h-4 w-4" />
                Distance
              </div>
              <div className="mt-2 text-2xl font-semibold">{projectedDistance.toLocaleString()} km</div>
            </div>
            <div className="rounded-2xl border bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ReceiptText className="h-4 w-4" />
                Reimbursement
              </div>
              <div className="mt-2 text-2xl font-semibold">₹{projectedAmount.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPinned className="h-4 w-4" />
                Route
              </div>
              <div className="mt-2 text-sm font-medium">
                {form.startLocation || "Start"} to {form.endLocation || "End"}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={addLog}>
              <Plus className="mr-2 h-4 w-4" />
              Save Mileage Log
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved Mileage Logs</CardTitle>
          <CardDescription>Stored locally in this browser. No database setup required.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No mileage logs yet. Add your first trip above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">KM</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[180px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{format(new Date(log.tripDate), "dd MMM yyyy")}</TableCell>
                      <TableCell>{log.vendorName || "-"}</TableCell>
                      <TableCell>{log.vehicleName}</TableCell>
                      <TableCell>{log.tripPurpose}</TableCell>
                      <TableCell>{log.startLocation} to {log.endLocation}</TableCell>
                      <TableCell className="text-right">{log.distanceKm.toLocaleString()}</TableCell>
                      <TableCell className="text-right">₹{log.amount.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => createExpenseFromLog(log)}>
                            Create Expense
                          </Button>
                          <Button type="button" size="icon" variant="ghost" onClick={() => deleteLog(log.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MileageRecorder;
