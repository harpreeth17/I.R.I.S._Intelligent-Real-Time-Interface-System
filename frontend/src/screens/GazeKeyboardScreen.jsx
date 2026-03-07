import { useMemo, useState } from 'react';
import DwellableButton from '@/components/DwellableButton';
import { applyPrediction, getPredictions } from '@/utils/predictions';

const KEY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

export default function GazeKeyboardScreen({ dwellDuration = 0.8, repeatCooldown = 1.1 }) {
  const [text, setText] = useState('');
  const predictions = useMemo(() => getPredictions(text), [text]);

  const append = (key) => setText((prev) => `${prev}${key}`);

  const speak = () => {
    if (!window.speechSynthesis || !text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <section className="h-full rounded-3xl border border-sky-300/20 bg-[#101a31] p-6">
      <h2 className="text-xl font-semibold text-sky-100">Gaze Keyboard</h2>
      <p className="mb-4 text-sm text-slate-300">Dwell on keys to type. Predictions update after each keystroke.</p>

      <div className="mb-4 min-h-[120px] rounded-2xl border border-sky-300/20 bg-[#0b1226] p-4 text-lg text-slate-100">{text || '...'}</div>

      <div className="mb-4 grid grid-cols-4 gap-3">
        {predictions.map((word) => (
          <DwellableButton
            key={word}
            dwellDuration={dwellDuration}
            repeatCooldown={repeatCooldown}
            onDwell={() => setText((prev) => applyPrediction(prev || ' ', word))}
            onClick={() => setText((prev) => applyPrediction(prev || ' ', word))}
            className="text-lg"
          >
            {word}
          </DwellableButton>
        ))}
      </div>

      <div className="space-y-3">
        {KEY_ROWS.map((row, index) => (
          <div
            key={`row-${index}`}
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(80px, 1fr))` }}
          >
            {row.map((key) => (
              <DwellableButton
                key={key}
                dwellDuration={dwellDuration}
                repeatCooldown={repeatCooldown}
                onDwell={() => append(key.toLowerCase())}
                onClick={() => append(key.toLowerCase())}
                className="text-xl font-semibold"
              >
                {key}
              </DwellableButton>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_2fr_1fr_1fr] gap-3">
        <DwellableButton
          dwellDuration={dwellDuration}
          repeatCooldown={repeatCooldown}
          onDwell={() => setText((prev) => prev.slice(0, -1))}
          onClick={() => setText((prev) => prev.slice(0, -1))}
        >
          Backspace
        </DwellableButton>
        <DwellableButton dwellDuration={dwellDuration} repeatCooldown={repeatCooldown} onDwell={() => append(' ')} onClick={() => append(' ')}>
          Space
        </DwellableButton>
        <DwellableButton dwellDuration={dwellDuration} repeatCooldown={repeatCooldown} onDwell={() => append('\n')} onClick={() => append('\n')}>
          Enter
        </DwellableButton>
        <DwellableButton dwellDuration={dwellDuration} repeatCooldown={repeatCooldown} onDwell={speak} onClick={speak}>
          Speak
        </DwellableButton>
      </div>
    </section>
  );
}
