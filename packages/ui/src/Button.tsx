import type { ButtonHTMLAttributes, FC, ReactNode } from 'react';

/** Props for {@link Button} — extends a native `<button>` so events/aria pass through. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis. `primary` = the main call to action. */
  variant?: 'primary' | 'secondary';
  children: ReactNode;
}

/**
 * The platform's signature "sticker" button (§6b accessibility, crayon standard).
 *
 * Styling lives in `tokens.css` (`.edu-btn`) so it can use `:active`/`:focus-visible`
 * (the satisfying press-down + focus ring) — a host imports `@edu/ui/tokens.css` once.
 *
 * A11y: native `<button>` → keyboard + focus for free; min target is `--edu-tap-min`
 * (64px, well above the 44px WCAG floor, larger for kindergarten hands).
 */
export const Button: FC<ButtonProps> = ({ variant = 'primary', className, children, ...rest }) => {
  const cls = `edu-btn${variant === 'secondary' ? ' edu-btn--secondary' : ''}${className ? ' ' + className : ''}`;
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
};
