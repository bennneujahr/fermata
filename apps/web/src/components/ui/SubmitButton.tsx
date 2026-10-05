"use client";
import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "./Button";
import type { IconName } from "./Icon";

/** Absenden-Knopf mit Ladezustand (für Server Actions in <form action>). */
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  block,
  icon,
  iconAfter,
  name,
  value,
  size,
}: {
  children: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  block?: boolean;
  icon?: IconName;
  iconAfter?: IconName;
  name?: string;
  value?: string;
  size?: "md" | "sm";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} block={block} icon={icon} iconAfter={iconAfter} loading={pending} name={name} value={value} size={size}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
