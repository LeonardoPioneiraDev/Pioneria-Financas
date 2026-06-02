'use client';

import { forwardRef, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends Omit<InputProps, 'type'> {
  iconClassName?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(({ className, iconClassName, ...props }, ref) => {
  const [mostrar, setMostrar] = useState(false);
  return (
    <div className="relative group">
      <Lock className={cn('absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-[#fbcc2c] dark:group-focus-within:text-yellow-400 transition-colors duration-300', iconClassName)} />
      <Input ref={ref} type={mostrar ? 'text' : 'password'} className={cn('pl-11 pr-11 h-12', className)} {...props} />
      <button
        type="button"
        onClick={() => setMostrar((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#fbcc2c] dark:text-gray-400 dark:hover:text-yellow-400 transition-all duration-300 hover:scale-110"
        aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {mostrar ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';
