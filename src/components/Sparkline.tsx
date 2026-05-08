interface SparklineProps {
  data: number[];
  height?: number;
  max?: number;
  className?: string;
}

export function Sparkline({ data, height = 60, max = 100, className }: SparklineProps): JSX.Element {
  const width = 300;
  const padding = 2;

  if (data.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block' }}
        className={className}
      >
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.25)"
          fontSize="10"
        >
          collecting...
        </text>
      </svg>
    );
  }

  const stepX = (width - padding * 2) / Math.max(1, data.length - 1);
  const points = data.map((v, i) => {
    const x = padding + i * stepX;
    const y = padding + (height - padding * 2) * (1 - Math.min(1, Math.max(0, v / max)));
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const pathLine = `M ${points.join(' L ')}`;
  const pathFill = `${pathLine} L ${(padding + (data.length - 1) * stepX).toFixed(2)},${
    height - padding
  } L ${padding.toFixed(2)},${height - padding} Z`;

  const last = data[data.length - 1];
  const accent =
    last >= 85 ? 'var(--danger)' : last >= 65 ? 'var(--warn)' : 'var(--accent)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
      className={className}
    >
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={pathFill} fill="url(#sparkfill)" />
      <path d={pathLine} fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
