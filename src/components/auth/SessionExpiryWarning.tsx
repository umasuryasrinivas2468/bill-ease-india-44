import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSessionExpiry } from '@/hooks/useConcurrentUserManagement';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SessionExpiryWarningProps {
  organizationId?: string;
  className?: string;
}

/**
 * Component that warns users when their session is about to expire
 * Allows them to extend their session or logout
 */
export const SessionExpiryWarning: React.FC<SessionExpiryWarningProps> = ({
  organizationId,
  className,
}) => {
  const { isExpiring, timeRemaining, extendSession } = useSessionExpiry(organizationId);

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return 'Now';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AlertDialog open={isExpiring}>
      <AlertDialogContent className={className}>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <AlertDialogTitle>Session Expiring Soon</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Your session will expire in <span className="font-semibold text-foreground">{formatTime(timeRemaining)}</span>.
            Do you want to continue working or logout?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-2">
          <AlertDialogCancel>Logout</AlertDialogCancel>
          <AlertDialogAction onClick={extendSession}>
            Continue Working
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default SessionExpiryWarning;
