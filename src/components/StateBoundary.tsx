/**
 * Renders the four states every view must handle: loading, error, empty, loaded.
 *
 * Centralised so no view can quietly forget one and render a blank panel -- the
 * failure mode that makes a Decky plugin look broken rather than merely empty.
 */

import { ButtonItem, PanelSectionRow, Spinner } from "@decky/ui";
import type { ReactNode } from "react";

import type { AsyncState } from "../hooks/useAsyncResource";
import { describeError, formatAge, isCredentialProblem } from "../types/result";
import { useAccountRecovery } from "./AccountRecovery";

interface Props<T> {
  readonly state: AsyncState<T>;
  readonly children: (data: T) => ReactNode;
  readonly isEmpty?: (data: T) => boolean;
  readonly emptyMessage?: string;
  readonly onRetry?: () => void;
}

const noticeStyle = {
  padding: "4px 6px",
  margin: "2px 0 4px",
  fontSize: "11px",
  color: "#d9b562",
  background: "rgba(217, 181, 98, 0.1)",
  borderRadius: "3px",
  lineHeight: 1.35,
} as const;

const messageStyle = {
  padding: "8px 4px",
  fontSize: "13px",
  color: "#b0b8c0",
  lineHeight: 1.4,
} as const;

export function StateBoundary<T>({
  state,
  children,
  isEmpty,
  emptyMessage = "Nothing here yet.",
  onRetry,
}: Props<T>): ReactNode {
  const openAccount = useAccountRecovery();

  if (state.status === "loading") {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}>
        <Spinner style={{ width: "24px", height: "24px" }} />
      </div>
    );
  }

  if (state.status === "error") {
    // A credential failure cannot be retried into working -- offer the fix.
    const credentialProblem = isCredentialProblem(state.error);

    return (
      <>
        <div style={{ ...messageStyle, color: "#e0a0a0" }}>{describeError(state.error)}</div>

        {credentialProblem && openAccount !== null ? (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={openAccount}>
              Update your API key
            </ButtonItem>
          </PanelSectionRow>
        ) : null}

        {onRetry && !credentialProblem ? (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={onRetry}>
              Try again
            </ButtonItem>
          </PanelSectionRow>
        ) : null}
      </>
    );
  }

  if (isEmpty?.(state.data) === true) {
    return <div style={messageStyle}>{emptyMessage}</div>;
  }

  return (
    <>
      {/* Stale means the network failed but we had something cached. Showing it
          with its age beats an error screen when the Deck is away from wifi. */}
      {state.staleSeconds === null ? null : (
        <div style={noticeStyle}>
          {`Offline — showing data from ${formatAge(state.staleSeconds)}`}
        </div>
      )}

      {/* Distinct from stale: this data IS fresh, there is just less of it than
          exists. Saying the real total stops a short list reading as complete. */}
      {state.partialTotal === null ? null : (
        <div style={noticeStyle}>
          {`Couldn't load everything — showing part of ${String(state.partialTotal)}. Pull to refresh when you have a connection.`}
        </div>
      )}

      {children(state.data)}
    </>
  );
}
