/**
 * Pure deterministic text analysis functions.
 * No external dependencies — works with any runtime.
 */

export interface AnalysisResult {
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  readingTimeMinutes: number;
  avgWordsPerSentence: number;
  keywords: { word: string; count: number }[];
  readabilityScore: number; // 0-100 Flesch-like
}

/** Common English stop words to exclude from keyword extraction */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "need", "must",
  "it", "its", "this", "that", "these", "those", "i", "you", "he", "she",
  "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
  "our", "their", "what", "which", "who", "whom", "when", "where", "why",
  "how", "not", "no", "nor", "as", "if", "then", "than", "too", "very",
  "just", "about", "above", "after", "again", "all", "also", "am", "any",
  "because", "before", "between", "both", "each", "few", "get", "got",
  "into", "more", "most", "other", "out", "over", "own", "same", "so",
  "some", "such", "up", "only", "now", "s", "t", "don", "re", "ve", "ll",
]);

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 2) return 1;

  let count = 0;
  const vowels = "aeiouy";
  let prevVowel = false;

  for (const ch of w) {
    const isVowel = vowels.includes(ch);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }

  // Adjust for silent e
  if (w.endsWith("e") && count > 1) count--;
  // Ensure at least 1 syllable
  return Math.max(count, 1);
}

export function analyzeText(text: string): AnalysisResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      wordCount: 0,
      sentenceCount: 0,
      paragraphCount: 0,
      readingTimeMinutes: 0,
      avgWordsPerSentence: 0,
      keywords: [],
      readabilityScore: 100,
    };
  }

  // Word extraction
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  // Sentence count (split on . ! ?)
  const sentences = trimmed
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 0);
  const sentenceCount = Math.max(sentences.length, 1);

  // Paragraph count (split on double newlines)
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0);
  const paragraphCount = Math.max(paragraphs.length, 1);

  // Reading time (average 238 words per minute)
  const readingTimeMinutes = Math.round((wordCount / 238) * 10) / 10;

  const avgWordsPerSentence =
    Math.round((wordCount / sentenceCount) * 10) / 10;

  // Keyword extraction
  const freq = new Map<string, number>();
  for (const word of words) {
    const normalized = word.toLowerCase().replace(/[^a-z0-9'-]/g, "");
    if (normalized.length < 3 || STOP_WORDS.has(normalized)) continue;
    freq.set(normalized, (freq.get(normalized) ?? 0) + 1);
  }
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  // Flesch Reading Ease approximation
  // 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
  let totalSyllables = 0;
  for (const word of words) {
    totalSyllables += countSyllables(word);
  }
  const rawScore =
    206.835 -
    1.015 * (wordCount / sentenceCount) -
    84.6 * (totalSyllables / wordCount);
  const readabilityScore = Math.round(Math.max(0, Math.min(100, rawScore)));

  return {
    wordCount,
    sentenceCount,
    paragraphCount,
    readingTimeMinutes,
    avgWordsPerSentence,
    keywords,
    readabilityScore,
  };
}
