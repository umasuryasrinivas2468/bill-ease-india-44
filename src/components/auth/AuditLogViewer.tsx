/**
 * Audit Log Viewer Component
 * Displays audit trail for compliance tracking
 */

import React, { useState, useEffect } from 'react';
import { useAuditLog, AuditLog } from '@/hooks/useAuditLog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface AuditLogViewerProps {
  resourceType?: string;
  limit?: number;
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({
  resourceType,
  limit = 50,
}) => {
  const { fetchAuditLogs } = useAuditLog();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLogs = async () => {
      setIsLoading(true);
      const data = await fetchAuditLogs({ resourceType, limit });
      setLogs(data as AuditLog[]);
      setIsLoading(false);
    };
    loadLogs();
  }, [fetchAuditLogs, resourceType, limit]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Critical
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="secondary" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Warning
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <Info className="h-3 w-3" />
            Info
          </Badge>
        );
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'create':
        return <Badge variant="secondary">Create</Badge>;
      case 'update':
        return <Badge variant="default">Update</Badge>;
      case 'delete':
        return <Badge variant="destructive">Delete</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>User</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No audit logs found
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(log.createdAt), 'MMM d, yyyy HH:mm:ss')}
                  </TableCell>
                  <TableCell>{getActionBadge(log.action)}</TableCell>
                  <TableCell>
                    <span className="font-medium">{log.resourceType}</span>
                    {log.resourceId && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({log.resourceId.slice(0, 8)}...)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{getSeverityBadge(log.severity || 'info')}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.userId.slice(0, 12)}...
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default AuditLogViewer;
