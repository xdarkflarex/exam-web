/**
 * Minh Math Logo – ΣM
 * First M rotated to look like Sigma (Σ), second M normal
 */
export default function MinhMathLogo({ 
  size = 24, 
  className = '' 
}: { 
  size?: number
  className?: string 
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Σ (Sigma) - First M rotated/stylized */}
      <path
        d="M5 6h10L9.5 16L15 26H5L5 23h5.5l-4-7l4-7H5V6Z"
        fill="currentColor"
      />
      {/* M - Second letter */}
      <path
        d="M17 6h3l4 10l4-10h3v20h-3V13l-3.5 8h-1L20 13v13h-3V6Z"
        fill="currentColor"
      />
    </svg>
  )
}
