/**
 * Lets any view offer a way back to the Account screen.
 *
 * A rejected API key is the failure most likely to actually happen -- RA lets
 * you regenerate keys, and doing so silently invalidates the one stored on the
 * Deck. Without this, every panel would show "Try again" on a button that can
 * only ever fail again.
 *
 * A context rather than props because `StateBoundary` is nested three levels
 * deep in every view, and threading one callback through all of them would add
 * noise to components that otherwise know nothing about credentials.
 */

import { createContext, useContext, type ReactNode } from "react";

type Navigate = (() => void) | null;

const AccountRecoveryContext = createContext<Navigate>(null);

export function AccountRecoveryProvider({
  onOpenAccount,
  children,
}: {
  readonly onOpenAccount: Navigate;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <AccountRecoveryContext.Provider value={onOpenAccount}>
      {children}
    </AccountRecoveryContext.Provider>
  );
}

/** null when there is nowhere to send the user (e.g. already on setup). */
export function useAccountRecovery(): Navigate {
  return useContext(AccountRecoveryContext);
}
