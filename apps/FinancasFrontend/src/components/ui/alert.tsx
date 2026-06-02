import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn('flex items-start gap-3 rounded-lg border p-4 text-sm', className)}
      {...props}
    />
  ),
);
Alert.displayName = 'Alert';

export const AlertIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" {...props} />
);

export const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm leading-relaxed mt-1', className)} {...props} />
  ),
);
AlertDescription.displayName = 'AlertDescription';
