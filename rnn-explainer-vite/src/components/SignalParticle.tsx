export function SignalParticle({ path, color, replayKey }: { path: string; color: string; replayKey: string }) {
  return (
    <circle key={replayKey} r="7" fill={color} opacity="0.92">
      <animateMotion dur="760ms" repeatCount="1" fill="freeze" path={path} />
    </circle>
  );
}
