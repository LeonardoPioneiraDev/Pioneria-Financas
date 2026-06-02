import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pioneira-400 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-pioneira-400 to-pioneira-300 hover:from-pioneira-500 hover:to-pioneira-600 dark:from-yellow-600 dark:to-amber-600 dark:hover:from-yellow-500 dark:hover:to-amber-500 text-gray-800 shadow-lg hover:shadow-xl hover:scale-[1.02]',
        outline:
          'border-2 border-gray-300 dark:border-gray-600 hover:border-pioneira-400 dark:hover:border-amber-500 bg-white/50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-200',
        ghost: 'hover:bg-pioneira-100/60 dark:hover:bg-yellow-500/10 text-gray-700 dark:text-gray-200',
        destructive: 'bg-red-600 hover:bg-red-500 text-white shadow-lg',
        link: 'text-pioneira-700 hover:text-pioneira-accent dark:text-yellow-400 dark:hover:text-yellow-300 underline-offset-2 hover:underline',
      },
      size: {
        default: 'h-10 px-4 text-sm',
        sm: 'h-9 px-3 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  },
);
Button.displayName = 'Button';

export { buttonVariants };
