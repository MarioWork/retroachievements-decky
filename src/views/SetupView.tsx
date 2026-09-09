/**
 * First-run credential entry.
 *
 * There is no login flow to speak of: the RA Web API is not session based. The
 * username selects whose data to read, the key identifies us as an API consumer.
 * Both are validated by the backend against RA before anything is persisted, so
 * a typo fails here rather than silently breaking every later request.
 */

import {
  ButtonItem,
  Navigation,
  PanelSection,
  PanelSectionRow,
  TextField,
  ToggleField,
} from "@decky/ui";
import { useState, type ReactNode } from "react";

import type { useCredentials } from "../hooks/useCredentials";
import { describeError, type AppError } from "../types/result";

const RA_SETTINGS_URL = "https://retroachievements.org/settings";

interface Props {
  readonly credentials: ReturnType<typeof useCredentials>;
  /** Present when reached from the dashboard rather than on first run. */
  readonly onBack?: () => void;
}

export function SetupView({ credentials, onBack }: Props): ReactNode {
  const loaded = credentials.state.status === "loaded" ? credentials.state.credentials : null;

  const [username, setUsername] = useState(loaded?.username ?? "");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<AppError | null>(null);

  const canSubmit = username.trim() !== "" && apiKey.trim() !== "" && !credentials.saving;

  const submit = (): void => {
    setError(null);
    void credentials.save(username, apiKey).then((failure) => {
      setError(failure);
      if (failure === null) {
        setApiKey("");
        onBack?.();
      }
    });
  };

  return (
    <PanelSection title={onBack ? "Account" : "Connect RetroAchievements"}>
      {onBack ? (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={onBack}>
            ← Back
          </ButtonItem>
        </PanelSectionRow>
      ) : null}

      <PanelSectionRow>
        <div style={{ fontSize: "12px", color: "#9aa4ae", lineHeight: 1.4, paddingBottom: "6px" }}>
          Enter your RetroAchievements username and web API key. The key is stored on this Deck only
          and is never shown again.
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <TextField
          label="Username"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <TextField
          label="Web API key"
          value={apiKey}
          bIsPassword
          onChange={(event) => {
            setApiKey(event.target.value);
          }}
        />
      </PanelSectionRow>

      {error !== null ? (
        <PanelSectionRow>
          <div style={{ fontSize: "12px", color: "#e0a0a0", lineHeight: 1.4, padding: "4px 0" }}>
            {describeError(error)}
          </div>
        </PanelSectionRow>
      ) : null}

      <PanelSectionRow>
        <ButtonItem layout="below" disabled={!canSubmit} onClick={submit}>
          {credentials.saving ? "Checking…" : "Validate and save"}
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={() => {
            Navigation.NavigateToExternalWeb(RA_SETTINGS_URL);
          }}
        >
          Where do I find my key?
        </ButtonItem>
      </PanelSectionRow>

      {loaded?.hasKey === true ? (
        <>
          <PanelSectionRow>
            <ToggleField
              label="Unlock notifications"
              description="Show a toast when you earn an achievement. Polls RetroAchievements every couple of minutes while the plugin is loaded, so it costs a little battery."
              checked={loaded.notifyUnlocks}
              onChange={(checked) => {
                void credentials.setNotifications(checked);
              }}
            />
          </PanelSectionRow>

          <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={() => {
                void credentials.clear();
                setApiKey("");
              }}
            >
              Disconnect account
            </ButtonItem>
          </PanelSectionRow>
        </>
      ) : null}
    </PanelSection>
  );
}
