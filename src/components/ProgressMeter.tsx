/**
 * "34 / 56 · 61%" plus a bar. Own component rather than @decky/ui's
 * ProgressBarItem because this needs the counts and the percentage inline in a
 * narrow panel, not a labelled settings row.
 */

import type { ReactNode } from "react";

interface Props {
  readonly current: number;
  readonly total: number;
  readonly label?: string;
}

export function ProgressMeter({ current, total, label }: Props): ReactNode {
  const safeTotal = Math.max(0, total);
  const safeCurrent = Math.min(Math.max(0, current), safeTotal);
  const percent = safeTotal === 0 ? 0 : Math.round((safeCurrent / safeTotal) * 100);

  return (
    <div style={{ padding: "6px 0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "12px",
          color: "#c0c8d0",
          marginBottom: "4px",
        }}
      >
        <span>{label ?? `${String(safeCurrent)} / ${String(safeTotal)}`}</span>
        <span>{`${String(percent)}%`}</span>
      </div>
      <div
        style={{
          height: "6px",
          borderRadius: "3px",
          backgroundColor: "#1a1f26",
          overflow: "hidden",
        }}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          style={{
            width: `${String(percent)}%`,
            height: "100%",
            backgroundColor: percent === 100 ? "#5ba85b" : "#4b8ec8",
            transition: "width 200ms ease",
          }}
        />
      </div>
    </div>
  );
}
