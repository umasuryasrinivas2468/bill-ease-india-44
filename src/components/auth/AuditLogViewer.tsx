import React, { useState } from 'react';
import { useAuditLog, AuditLog, AuditSeverity } from '@/hooks/useAuditLog';
import { useOrganization } from '@/hooks/useOrganization';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  RefreshCw, 
  Eye, 
  AlertCircle, 
  AlertTriangle, 
  Info,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AuditLogViewerProps {
  organizationId?: string;
  className?: string;
}

const severityConfig: Record<AuditSeverity, { icon: React.ElementType; color: string; label: string }> = {
  info: { icon: Info, color: 'text-blue-500', label: 'Info' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', label: 'Warning' },
  critical: { icon: AlertCircle, color: 'text-red-500', label: 'Critical' },
};

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ 
  organizationId,
  className,
}) => {
  const { fetchLogs } = useAuditLog();
  const { currentOrganization } = useOrganization();
  
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchAction, setSearchAction] = useState('');
  const [resourceType, setResourceType] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const orgId = organizationId || currentOrganization?.id;

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await fetchLogs({
        organizationId: orgId,
        resourceType: resourceType !== 'all' ? resourceType : undefined,
        action: searchAction || undefined,
        startDate,
        endDate,
        limit: 100,
      });

      if (!error) {
        setLogs(data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    loadLogs();
  }, [orgId]);

  const handleSearch = () => {
    loadLogs();
  };

  const resourceTypes = [
    'all',
    'invoice',
    'quotation',
    'client',
    'vendor',
    'expense',
    'journal',
    'auth',
    'security',
    'user',
    'organization',
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium mb-1 block">Search Action</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search actions..."
              value={searchAction}
              onChange={(e) => setSearchAction(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="w-[180px]">
          <label className="text-sm font-medium mb-1 block">Resource Type</label>
          <Select value={resourceType} onValueChange={setResourceType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {resourceTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[160px]">
          <label className="text-sm font-medium mb-1 block">Start Date</label>
          <DatePicker date={startDate} setDate={setStartDate} />
        </div>

        <div className="w-[160px]">
          <label className="text-sm font-medium mb-1 block">End Date</label>
          <DatePicker date={endDate} setDate={setEndDate} />
        </div>

        <Button onClick={handleSearch} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Search
        </Button>
      </div>

      {/* Logs Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Severity</TableHead>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead className="w-[200px]">User</TableHead>
              <TableHead className="w-[80px]">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No audit logs found
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const severity = severityConfig[log.severity as AuditSeverity] || severityConfig.info;
                const SeverityIcon = severity.icon;

                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <SeverityIcon className={cn("h-4 w-4", severity.color)} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm:ss')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{log.resource_type}</span>
                        {log.resource_id && (
                          <span className="text-xs text-muted-foreground font-mono">
                            #{log.resource_id.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]">
                      {log.user_id}
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Audit Log Details</DialogTitle>
                          </DialogHeader>
                          <ScrollArea className="max-h-[600px]">
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-medium">Action</label>
                                  <p className="font-mono text-sm">{log.action}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Severity</label>
                                  <div className="flex items-center gap-2">
                                    <SeverityIcon className={cn("h-4 w-4", severity.color)} />
                                    <span>{severity.label}</span>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Timestamp</label>
                                  <p className="text-sm">
                                    {format(new Date(log.created_at), 'PPpp')}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">User ID</label>
                                  <p className="font-mono text-sm">{log.user_id}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Resource Type</label>
                                  <p className="text-sm">{log.resource_type}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Resource ID</label>
                                  <p className="font-mono text-sm">{log.resource_id || 'N/A'}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">IP Address</label>
                                  <p className="font-mono text-sm">{log.ip_address || 'N/A'}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Session ID</label>
                                  <p className="font-mono text-sm truncate">
                                    {log.session_id || 'N/A'}
                                  </p>
                                </div>
                              </div>

                              {log.old_values && (
                                <div>
                                  <label className="text-sm font-medium">Old Values</label>
                                  <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto">
                                    {JSON.stringify(log.old_values, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {log.new_values && (
                                <div>
                                  <label className="text-sm font-medium">New Values</label>
                                  <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto">
                                    {JSON.stringify(log.new_values, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <div>
                                  <label className="text-sm font-medium">Metadata</label>
                                  <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {log.user_agent && (
                                <div>
                                  <label className="text-sm font-medium">User Agent</label>
                                  <p className="text-xs text-muted-foreground break-all">
                                    {log.user_agent}
                                  </p>
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Showing {logs.length} log entries</span>
        <span>
          {logs.filter(l => l.severity === 'critical').length} critical,{' '}
          {logs.filter(l => l.severity === 'warning').length} warnings
        </span>
      </div>
    </div>
  );
};

export default AuditLogViewer;
