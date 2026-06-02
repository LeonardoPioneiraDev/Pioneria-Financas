import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/90 dark:bg-gray-800/50 px-3 py-2 text-sm',
      'placeholder:text-gray-400 dark:placeholder:text-gray-500',
      'focus:outline-none focus:bg-white dark:focus:bg-gray-800 focus:border-pioneira-400 dark:focus:border-yellow-400',
      'focus:ring-2 focus:ring-pioneira-400/20 dark:focus:ring-yellow-400/20',
      'transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
