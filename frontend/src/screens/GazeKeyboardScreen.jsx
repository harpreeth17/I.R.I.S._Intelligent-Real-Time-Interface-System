import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DwellableButton from '@/components/DwellableButton';
import { applyPrediction, getPredictions } from '@/utils/predictions';

const KEY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

export default function GazeKeyboardScreen({
  dwellDuration = 0.8,
  repeatCooldown = 1.1,
  text = '',
  setText,
}) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const recognitionRef = useRef(null);
  const voiceActiveRef = useRef(false);
  const predictions = useMemo(() => getPredictions(text), [text]);

  const append = useCallback((key) => setText?.((prev) => `${prev}${key}`), [setText]);
  const replaceText = useCallback((nextText) => setText?.(nextText), [setText]);

  const stopVoice = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    voiceActiveRef.current = false;
    try {
      recognition.stop();
    } catch (_error) {
      // Ignore stop races.
    }
  }, []);

  const ensureRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('Voice input is not supported in this browser');
      return null;
    }

    if (recognitionRef.current) {
      return recognitionRef.current;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript || '';
        }
      }

      const spoken = finalTranscript.trim();
      if (!spoken) return;

      const command = spoken.toLowerCase();
      if (command === 'space') {
        append(' ');
        setVoiceError(null);
        return;
      }
      if (command === 'backspace') {
        replaceText((prev) => prev.slice(0, -1));
        setVoiceError(null);
        return;
      }
      if (command === 'enter' || command === 'new line') {
        append('\n');
        setVoiceError(null);
        return;
      }
      if (command === 'clear text' || command === 'clear') {
        replaceText('');
        setVoiceError(null);
        return;
      }

      const normalized = spoken
        .replace(/\bcomma\b/gi, ',')
        .replace(/\bperiod\b/gi, '.')
        .replace(/\bquestion mark\b/gi, '?')
        .replace(/\bexclamation mark\b/gi, '!')
        .replace(/\bnew line\b/gi, '\n');

      replaceText((prev) => `${prev}${prev.endsWith(' ') || prev.endsWith('\n') || prev.length === 0 ? '' : ' '}${normalized}`);
      setVoiceError(null);
    };

    recognition.onerror = (event) => {
      setVoiceError(event.error || 'Voice input error');
      voiceActiveRef.current = false;
      setVoiceEnabled(false);
    };

    recognition.onend = () => {
      if (!voiceActiveRef.current) {
        return;
      }

      try {
        recognition.start();
      } catch (_error) {
        // Ignore restart races.
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [append, replaceText]);

  const startVoice = useCallback(() => {
    const recognition = ensureRecognition();
    if (!recognition) {
      setVoiceEnabled(false);
      return;
    }

    try {
      voiceActiveRef.current = true;
      setVoiceError(null);
      recognition.start();
    } catch (error) {
      voiceActiveRef.current = false;
      setVoiceEnabled(false);
      setVoiceError(error?.message || 'Unable to start voice input');
    }
  }, [ensureRecognition]);

  useEffect(() => {
    return () => {
      voiceActiveRef.current = false;
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.abort();
        } catch (_error) {
          // Ignore cleanup errors.
        }
      }
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!voiceEnabled) {
      stopVoice();
    }
  }, [stopVoice, voiceEnabled]);

  const toggleVoice = useCallback(() => {
    if (voiceEnabled) {
      setVoiceEnabled(false);
      stopVoice();
      return;
    }

    setVoiceEnabled(true);
    void startVoice();
  }, [startVoice, stopVoice, voiceEnabled]);

  const speak = () => {
    if (!window.speechSynthesis || !text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-3xl border border-sky-300/20 bg-[#101a31] p-5 lg:p-6">
      <h2 className="text-xl font-semibold text-sky-100">Gaze Keyboard</h2>
      <p className="mb-3 text-sm text-slate-300">Dwell on keys to type. Voice typing is available for dictation and simple commands.</p>

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-300/20 bg-[#0b1226] p-3 text-sm text-slate-200">
        <button
          type="button"
          onClick={toggleVoice}
          className={`min-h-[52px] rounded-xl border px-4 ${voiceEnabled ? 'border-teal-300/40 bg-teal-300/20 text-teal-100' : 'border-sky-300/25 bg-sky-300/10 text-slate-100'}`}
        >
          {voiceEnabled ? 'Stop Voice' : 'Start Voice'}
        </button>
        <span>{window.SpeechRecognition || window.webkitSpeechRecognition ? 'Voice input ready' : 'Voice input is not supported in this browser'}</span>
        {voiceError && <span className="text-rose-200">{voiceError}</span>}
      </div>

      <div className="mb-3 h-24 overflow-y-auto rounded-2xl border border-sky-300/20 bg-[#0b1226] p-4 text-lg text-slate-100 lg:h-28">
        {text || '...'}
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2">
        {predictions.map((word) => (
          <DwellableButton
            key={word}
            dwellDuration={dwellDuration}
            repeatCooldown={repeatCooldown}
            onDwell={() => setText((prev) => applyPrediction(prev || ' ', word))}
            onClick={() => setText((prev) => applyPrediction(prev || ' ', word))}
            className="min-h-[60px] text-base"
            minSizeClass="min-h-[60px] min-w-0"
          >
            {word}
          </DwellableButton>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {KEY_ROWS.map((row, index) => (
          <div
            key={`row-${index}`}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
          >
            {row.map((key) => (
              <DwellableButton
                key={key}
                dwellDuration={dwellDuration}
                repeatCooldown={repeatCooldown}
                onDwell={() => append(key.toLowerCase())}
                onClick={() => append(key.toLowerCase())}
                className="min-h-[58px] text-lg font-semibold"
                minSizeClass="min-h-[58px] min-w-0"
              >
                {key}
              </DwellableButton>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_2fr_1fr_1fr] gap-2">
        <DwellableButton
          dwellDuration={dwellDuration}
          repeatCooldown={repeatCooldown}
          onDwell={() => setText((prev) => prev.slice(0, -1))}
          onClick={() => setText((prev) => prev.slice(0, -1))}
          className="min-h-[58px]"
          minSizeClass="min-h-[58px] min-w-0"
        >
          Backspace
        </DwellableButton>
        <DwellableButton
          dwellDuration={dwellDuration}
          repeatCooldown={repeatCooldown}
          onDwell={() => append(' ')}
          onClick={() => append(' ')}
          className="min-h-[58px]"
          minSizeClass="min-h-[58px] min-w-0"
        >
          Space
        </DwellableButton>
        <DwellableButton
          dwellDuration={dwellDuration}
          repeatCooldown={repeatCooldown}
          onDwell={() => append('\n')}
          onClick={() => append('\n')}
          className="min-h-[58px]"
          minSizeClass="min-h-[58px] min-w-0"
        >
          Enter
        </DwellableButton>
        <DwellableButton
          dwellDuration={dwellDuration}
          repeatCooldown={repeatCooldown}
          onDwell={speak}
          onClick={speak}
          className="min-h-[58px]"
          minSizeClass="min-h-[58px] min-w-0"
        >
          Speak
        </DwellableButton>
      </div>
    </section>
  );
}
