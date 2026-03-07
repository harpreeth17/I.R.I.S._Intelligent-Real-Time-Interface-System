export default function GazeCursor({ x = 0, y = 0 }) {
  return (
    <div
      className="pointer-events-none fixed z-50 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/80 bg-cyan-300/40 shadow-[0_0_30px_rgba(79,195,247,0.95)]"
      style={{ left: x, top: y }}
    >
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
    </div>
  );
}
