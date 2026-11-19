import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
};

/** Shared interactive control; native button semantics are preserved. */
export function Button({variant='primary',className='',type='button',children,...props}:ButtonProps) {
  return <button type={type} className={`kp-button kp-button--${variant} ${className}`} {...props}>{children}</button>;
}
