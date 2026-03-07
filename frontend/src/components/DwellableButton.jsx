import { useEffect, useRef, useState } from 'react';
import DwellRing from './DwellRing';

export default function DwellableButton({
  className = '',
  dwellDuration = 0.8,
  repeatCooldown = 1.0,
  requireExitBeforeRetrigger = true,
  onDwell,
  onClick,
  children,
  disabled = false,
  minSizeClass = 'min-h-[80px] min-w-[80px]',
}) {
  const [hovering, setHovering] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef(null);
  const lastTriggerRef = useRef(0);
  const needsExitRef = useRef(false);

  useEffect(() => {
    if (!hovering || disabled) {
      setProgress(0);
      startedAtRef.current = null;
      needsExitRef.current = false;
      return;
    }

    startedAtRef.current = performance.now();
    let frame = 0;

    const tick = () => {
      if (!startedAtRef.current) return;
      if (requireExitBeforeRetrigger && needsExitRef.current) {
        frame = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      if (now - lastTriggerRef.current < repeatCooldown * 1000) {
        frame = requestAnimationFrame(tick);
        return;
      }

      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      const ratio = Math.min(1, elapsed / Math.max(0.05, dwellDuration));
      setProgress(ratio);
      if (ratio >= 1) {
        onDwell?.();
        lastTriggerRef.current = performance.now();
        if (requireExitBeforeRetrigger) {
          needsExitRef.current = true;
        }
        startedAtRef.current = performance.now();
        setProgress(0);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hovering, disabled, dwellDuration, onDwell, repeatCooldown, requireExitBeforeRetrigger]);

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        setHovering(false);
        needsExitRef.current = false;
      }}
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border border-sky-300/20 bg-[#142445] text-slate-100 shadow-md transition duration-150 hover:border-sky-300/60 hover:shadow-glow ${minSizeClass} ${className}`}
    >
      <div className="relative z-10">{children}</div>
      {hovering && !disabled && (
        <div className="pointer-events-none absolute right-2 top-2 z-20">
          <DwellRing progress={progress} size={34} stroke={4} />
        </div>
      )}
    </button>
  );
}
