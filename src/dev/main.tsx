/**
 * Harness entry point.
 *
 * Mounts the plugin's real content component in a 320px column -- roughly the
 * Quick Access panel's width -- so layout decisions here transfer to the Deck.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import Plugin from "../index";
import { UNLOCK_EVENT } from "../services/notifications";
import {
  emitForDev,
  FAULT_MODES,
  getFaultMode,
  setFaultMode,
  type FaultMode,
} from "./mocks/decky-api";

const container = document.getElementById("root");
if (container === null) throw new Error("dev harness: #root is missing");

// definePlugin is the identity function in the mock, so this is the real
// plugin descriptor -- same object Decky would receive.
const plugin = Plugin();

/**
 * Fires a fake backend unlock event so the toast can be seen and tuned without
 * deploying. The real one comes from `decky.emit` in the Python watcher, which
 * the browser has no way to run.
 */
function simulateUnlock(): void {
  const delivered = emitForDev(UNLOCK_EVENT, {
    id: 9002,
    title: "Charge Beam",
    description: "Obtain the Charge Beam",
    points: 10,
    badgeName: "112233",
    gameTitle: "Metroid Fusion",
    hardcore: true,
  });
  if (delivered === 0) {
    console.warn("No listener for", UNLOCK_EVENT, "- did definePlugin() run?");
  }
}

createRoot(container).render(
  <StrictMode>
    <div className="panel">
      <header className="panel-title">{plugin.titleView}</header>
      {plugin.content}
    </div>
  </StrictMode>,
);

/**
 * Harness control strip. Fault modes force the failure paths that are otherwise
 * hard to reach: you cannot easily revoke your own API key or unplug wifi mid-
 * request just to check the panel says something sensible.
 */
function buildControls(): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "dev-controls";

  const unlock = document.createElement("button");
  unlock.className = "dev-button";
  unlock.textContent = "Simulate unlock";
  unlock.addEventListener("click", simulateUnlock);

  const label = document.createElement("label");
  label.className = "dev-label";
  label.textContent = "Simulate error";

  const select = document.createElement("select");
  select.className = "dev-select";
  for (const { mode, label: text } of FAULT_MODES) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = text;
    select.append(option);
  }
  select.value = getFaultMode();
  select.addEventListener("change", () => {
    setFaultMode(select.value as FaultMode);
    // Views only refetch on mount or an explicit refresh, so reload to make the
    // new mode take effect everywhere at once.
    window.location.reload();
  });

  label.append(select);
  panel.append(unlock, label);
  return panel;
}

document.body.append(buildControls());
