import type { HTMLAttributes, ReactNode } from "react";

// Older route components still use this wrapper. It intentionally has no
// observer or hidden pre-animation state: content always renders immediately.
export default function Reveal({
  children,
  className = "",
  as: Tag = "div",
  delay,
  ...rest
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "article" | "li" | "span";
} & HTMLAttributes<HTMLElement>) {
  void delay;
  return <Tag className={className} {...rest}>{children}</Tag>;
}
