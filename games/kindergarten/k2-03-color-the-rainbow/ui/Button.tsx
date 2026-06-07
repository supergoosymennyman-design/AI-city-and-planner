import type { ButtonHTMLAttributes, FC, ReactNode } from 'react';

/** Props for {@link Button} — extends a native `<button>` so events/aria pass through. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis. `primary` = the main call to action. */
  variant?: 'primary' | 'secondary';
  children: ReactNode;
}

/**
 * The glossy "sticker" button — this game's OWN copy (no shared @edu/ui package; the only
 * boundary is the vibe, docs/standards/kindergarten-ui-ux.md). Styling lives in `styles.css`
 * (`.edu-btn`) so `:active`/`:focus-visible` work (the press-down + focus ring).
 *
 * A11y: native `<button>` → keyboard + focus for free; min target is `--edu-tap-min` (64px,
 * well above the 44px WCAG floor, larger for kindergarten hands).
 */
export const Button: FC<ButtonProps> = ({ variant = 'primary', className, children, ...rest }) => {
  const cls = `edu-btn${variant === 'secondary' ? ' edu-btn--secondary' : ''}${className ? ' ' + className : ''}`;
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
};
