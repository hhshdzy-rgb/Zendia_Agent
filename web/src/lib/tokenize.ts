// Splits a text string into highlight-able units. Each CJK character is
// its own unit (so karaoke highlight advances character-by-character on
// Chinese / Japanese / Korean), while Latin letters glue together into
// whitespace-separated words. Whitespace is preserved as its own entries
// so renderBody can lay it out without consuming a highlight slot.
//
// Examples:
//   tokenize("Hello world")       -> ["Hello", " ", "world"]
//   tokenize("凌晨,坂本龙一")     -> ["凌", "晨", ",", "坂", "本", "龙", "一"]
//   tokenize("Now playing 晴天")  -> ["Now", " ", "playing", " ", "晴", "天"]

const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x3000, 0x303f], // CJK Symbols and Punctuation
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xac00, 0xd7af], // Hangul Syllables
  [0xff00, 0xffef], // Halfwidth and Fullwidth Forms
]

function isCJK(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  for (const [lo, hi] of CJK_RANGES) {
    if (code >= lo && code <= hi) return true
  }
  return false
}

export function tokenize(text: string): string[] {
  const out: string[] = []
  let buf = ''
  const flush = () => {
    if (buf) {
      out.push(buf)
      buf = ''
    }
  }
  for (const ch of text) {
    if (/\s/.test(ch)) {
      flush()
      out.push(ch)
    } else if (isCJK(ch)) {
      flush()
      out.push(ch)
    } else {
      buf += ch
    }
  }
  flush()
  return out
}

/** Number of highlight slots in the text (everything except whitespace). */
export function countSpeakable(text: string): number {
  return tokenize(text).filter((t) => !/^\s+$/.test(t)).length
}
