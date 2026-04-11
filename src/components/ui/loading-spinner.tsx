import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8'
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className, 
  ...props 
}) => {
  return (
    <div className={cn('inline-flex items-center justify-center', className)} {...props}>
      <Loader2 className={cn('animate-spin', sizeClasses[size])} />
    </div>
  );
};

export default LoadingSpinner;