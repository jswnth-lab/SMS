import { type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const VARIANTS = {
  info: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
} as const;

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof VARIANTS;
}

export function Alert({ className, variant = 'info', role = 'status', ...props }: AlertProps) {
  return (
    <div
      role={role}
      className={cn('rounded-md px-3 py-2 text-sm', VARIANTS[variant], className)}
      {...props}
    />
  );
}
