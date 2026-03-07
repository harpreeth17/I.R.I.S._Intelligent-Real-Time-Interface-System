const COMMON_WORDS = [
  'the',
  'there',
  'their',
  'this',
  'that',
  'hello',
  'help',
  'please',
  'need',
  'water',
  'pain',
  'yes',
  'no',
  'thanks',
  'good',
  'morning',
  'afternoon',
  'night',
  'home',
  'doctor',
  'call',
  'family',
  'friend',
  'food',
  'music',
  'open',
  'close',
  'start',
  'stop',
];

export function getPredictions(text) {
  const tokens = text.toLowerCase().split(/\s+/);
  const prefix = tokens[tokens.length - 1] || '';

  if (!prefix) {
    return ['the', 'please', 'help', 'thanks'];
  }

  const matches = COMMON_WORDS.filter((word) => word.startsWith(prefix) && word !== prefix);
  return matches.slice(0, 4);
}

export function applyPrediction(text, prediction) {
  const tokens = text.split(/\s+/);
  tokens[tokens.length - 1] = prediction;
  return `${tokens.join(' ')} `;
}
