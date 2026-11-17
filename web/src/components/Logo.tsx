/**
 * The app's mark: a placeholder until the real Scorelights logo is drawn. The favicon's
 * dot beside the wordmark, "Score" heavy and "lights" regular. No Hue artwork: Hue's
 * developer terms bar its branding from any logo.
 */
export function Logo({ size = 28 }: { size?: number }) {
  const em = Math.round(size * 0.8);
  return (
    <span
      role="img"
      aria-label="Scorelights"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(em * 0.3),
        fontSize: em,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        whiteSpace: "nowrap",
      }}
    >
      <svg viewBox="0 0 64 64" width={em} height={em} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
        <circle cx="32" cy="32" r="26" fill="#f76707" />
      </svg>
      <span>
        <span style={{ fontWeight: 800 }}>Score</span>
        <span style={{ fontWeight: 400 }}>lights</span>
      </span>
    </span>
  );
}
