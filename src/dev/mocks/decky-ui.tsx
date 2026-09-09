/**
 * Harness stand-ins for the @decky/ui primitives, styled to approximate Steam's
 * Quick Access panel. Aliased in by vite.config.ts; never bundled.
 *
 * These are close enough to judge layout, hierarchy and copy. They deliberately
 * do NOT emulate gamepad focus, so D-pad reachability still has to be checked on
 * the Deck itself.
 */

import type { ChangeEventHandler, CSSProperties, ReactNode } from "react";

export const staticClasses = { Title: "dev-title" };

interface PanelSectionProps {
  readonly title?: string;
  readonly children: ReactNode;
}

export function PanelSection({ title, children }: PanelSectionProps): ReactNode {
  return (
    <section style={{ padding: "8px 12px", borderBottom: "1px solid #1f252c" }}>
      {title !== undefined ? (
        <h2
          style={{
            margin: "0 0 6px",
            fontSize: "11px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#7a838c",
          }}
        >
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export function PanelSectionRow({ children }: { readonly children: ReactNode }): ReactNode {
  return <div style={{ padding: "2px 0" }}>{children}</div>;
}

interface ButtonItemProps {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly layout?: string;
}

export function ButtonItem({ children, onClick, disabled = false }: ButtonItemProps): ReactNode {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "100%",
        padding: "8px 10px",
        margin: "3px 0",
        borderRadius: "3px",
        border: "none",
        background: disabled ? "#232a32" : "#2d3742",
        color: disabled ? "#5d666f" : "#ffffff",
        fontSize: "13px",
        textAlign: "left",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

interface FocusableProps {
  readonly children: ReactNode;
  readonly onActivate?: () => void;
  readonly style?: CSSProperties;
}

export function Focusable({ children, onActivate, style }: FocusableProps): ReactNode {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onActivate?.();
      }}
      style={{ cursor: onActivate ? "pointer" : "default", ...style }}
    >
      {children}
    </div>
  );
}

interface TextFieldProps {
  readonly label?: ReactNode;
  readonly value?: string;
  readonly bIsPassword?: boolean;
  readonly bShowClearAction?: boolean;
  readonly onChange?: ChangeEventHandler<HTMLInputElement>;
}

export function TextField({ label, value, bIsPassword, onChange }: TextFieldProps): ReactNode {
  return (
    <label style={{ display: "block", margin: "4px 0" }}>
      {label !== undefined ? (
        <span style={{ display: "block", fontSize: "11px", color: "#7a838c", marginBottom: "3px" }}>
          {label}
        </span>
      ) : null}
      <input
        type={bIsPassword === true ? "password" : "text"}
        value={value ?? ""}
        onChange={onChange}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "7px 8px",
          borderRadius: "3px",
          border: "1px solid #2d3742",
          background: "#12171d",
          color: "#ffffff",
          fontSize: "13px",
        }}
      />
    </label>
  );
}

interface DropdownOption {
  readonly data: unknown;
  readonly label: ReactNode;
}

interface DropdownItemProps {
  readonly label?: ReactNode;
  readonly rgOptions: readonly DropdownOption[];
  readonly selectedOption: unknown;
  readonly onChange?: (option: DropdownOption) => void;
}

export function DropdownItem({
  label,
  rgOptions,
  selectedOption,
  onChange,
}: DropdownItemProps): ReactNode {
  // Steam renders a context menu; a <select> is the closest browser equivalent
  // and keeps the option list keyboard-reachable.
  return (
    <label style={{ display: "block", margin: "4px 0" }}>
      {label !== undefined ? (
        <span style={{ display: "block", fontSize: "11px", color: "#7a838c", marginBottom: "3px" }}>
          {label}
        </span>
      ) : null}
      <select
        value={String(selectedOption)}
        onChange={(event) => {
          const picked = rgOptions.find((option) => String(option.data) === event.target.value);
          if (picked !== undefined) onChange?.(picked);
        }}
        style={{
          width: "100%",
          padding: "7px 8px",
          borderRadius: "3px",
          border: "1px solid #2d3742",
          background: "#12171d",
          color: "#ffffff",
          fontSize: "13px",
        }}
      >
        {rgOptions.map((option) => (
          <option key={String(option.data)} value={String(option.data)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ToggleFieldProps {
  readonly label?: ReactNode;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange?: (checked: boolean) => void;
}

export function ToggleField({ label, checked, disabled, onChange }: ToggleFieldProps): ReactNode {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        margin: "4px 0",
        fontSize: "13px",
        color: disabled === true ? "#5d666f" : "#ffffff",
      }}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
    </label>
  );
}

export function Spinner({ style }: { readonly style?: CSSProperties }): ReactNode {
  return (
    <div
      style={{
        width: "24px",
        height: "24px",
        border: "2px solid #2d3742",
        borderTopColor: "#4b8ec8",
        borderRadius: "50%",
        animation: "ra-spin 700ms linear infinite",
        ...style,
      }}
    />
  );
}

export const Navigation = {
  NavigateToExternalWeb: (url: string): void => {
    window.open(url, "_blank", "noopener");
  },
};
