type Props = {
  speaking: boolean
  bars?: number
}

// Static placeholder waveform. Real-time AnalyserNode wiring lands in a later commit.
export default function DJWaveform({ speaking, bars = 64 }: Props) {
  return (
    <div className={`dj-waveform ${speaking ? 'is-speaking' : ''}`}>
      {Array.from({ length: bars }).map((_, i) => {
        const seed = Math.sin(i * 0.42) * 0.5 + 0.5
        const h = 12 + seed * 56
        return <div key={i} className="dj-bar" style={{ height: `${h}%` }} />
      })}
    </div>
  )
}
