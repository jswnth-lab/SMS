import { type SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900',
        'outline-none transition-shadow focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';
