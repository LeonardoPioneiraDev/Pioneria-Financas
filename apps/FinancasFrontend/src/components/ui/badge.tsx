import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors', {
  variants: {
    variant: {
      default: 'bg-pioneira-100 text-pioneira-900 dark:bg-yellow-500/20 dark:text-yellow-300',
      success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
      warning: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
      danger: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
      muted: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
