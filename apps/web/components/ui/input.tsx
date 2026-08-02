import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400',
        'outline-none transition-shadow focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
        invalid && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/15',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
        className
      )}
      {...props}
    />
  );
});
Input.displayName = 'Input';
