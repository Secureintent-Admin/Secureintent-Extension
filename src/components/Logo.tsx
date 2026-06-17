/**
 * SecureIntent "/i" mark. The white stroke uses `currentColor` so it inherits
 * the surrounding text color; the accent stroke + dot are brand mint (#72FFFF).
 * Inlined (not an <img>) so it renders crisply inside the closed shadow DOM.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 250 250" fill="none" aria-hidden="true">
      <path d="M 50,195 L 110,75" stroke="currentColor" strokeWidth="28" strokeLinecap="round" />
      <path d="M 130,195 L 160,135" stroke="#72FFFF" strokeWidth="28" strokeLinecap="round" />
      <circle cx="190" cy="75" r="14" fill="#72FFFF" />
    </svg>
  );
}
