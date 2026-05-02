import { useEffect, useState } from 'react'

type Props = {
  speaking: boolean
  analyser: AnalyserNode | null
  bars?: number
}

export default function DJWaveform({ speaking, analyser, bars = 64 }: Props) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: bars }, (_, i) => 12 + (Math.sin(i * 0.42) * 0.5 + 0.5) * 56),
  )

  useEffect(() => {
    if (!analyser) return
    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0
    const tick = () => {
      analyser.getByteFrequencyData(data)
      const step = Math.max(1, Math.floor(data.length / bars))
      const next = new Array<number>(bars)
      for (let i = 0; i < bars; i++) {
        const v = data[i * step] ?? 0
        next[i] = 12 + (v / 255) * 76
      }
      setHeights(next)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [analyser, bars])

  return (
    <div className={`dj-waveform ${speaking ? 'is-speaking' : ''} ${analyser ? 'is-live' : ''}`}>
      {heights.map((h, i) => (
        <div key={i} className="dj-bar" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}
