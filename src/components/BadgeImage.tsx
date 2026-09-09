/**
 * An RA image that degrades to a neutral placeholder.
 *
 * Steam's CSP or a flaky connection can drop a remote image; a broken-image glyph
 * in a list of 60 achievements looks like a bug, so failures render as an empty
 * tile of the right size and the layout never shifts.
 */

import { useEffect, useState, type ReactNode } from "react";

interface Props {
  readonly src: string;
  readonly alt: string;
  readonly size: number;
  /** Locked achievements read as dimmer even before the _lock art loads. */
  readonly dimmed?: boolean;
}

export function BadgeImage({ src, alt, size, dimmed = false }: Props): ReactNode {
  const [failed, setFailed] = useState(false);

  // A new src deserves a fresh attempt, otherwise one failure poisons the slot
  // as the user scrolls a recycled row.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const box = {
    width: `${String(size)}px`,
    height: `${String(size)}px`,
    flex: `0 0 ${String(size)}px`,
    borderRadius: "4px",
    backgroundColor: "#1a1f26",
  } as const;

  if (src === "" || failed) {
    return <div style={box} aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => {
        setFailed(true);
      }}
      style={{
        ...box,
        objectFit: "cover",
        opacity: dimmed ? 0.45 : 1,
      }}
    />
  );
}
