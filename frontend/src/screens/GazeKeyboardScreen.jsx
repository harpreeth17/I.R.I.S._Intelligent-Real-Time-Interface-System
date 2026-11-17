import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DwellableButton from '@/components/DwellableButton';
import { applyPrediction, getPredictions } from '@/utils/predictions';

const KEY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

const VOICE_ERROR_MESSAGES = {
  'not-allowed': 'Microphone permission was denied. Allow microphone access for IRIS in Windows Settings and restart voice input.',
  'service-not-allowed': 'Speech recognition is blocked by the speech service. Check microphone permissions and network access.',
  'audio-capture': 'No microphone is available. Connect a microphone and check Windows input settings.',
  network: 'The external speech service could not be reached. Check network access or use the gaze keyboard.',
  'no-speech': 'No speech was detected. Select Start Voice and speak clearly.',
};

function getVoiceErrorMessage(error) {
  const code = error?.error || error?.name;
  return VOICE_ERROR_MESSAGES[code] || error?.message || code || 'Voice input failed. Use the gaze keyboard instead.';
}

export default function GazeKeyboardScreen({
  dwellDuration = 0.8,
  repeatCooldown = 1.1,
  keyboardSize = 'large',
  text = '',
  setText,
}) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [voiceState, setVoiceState] = useState('idle');
  const recognitionRef = useRef(null);
  const voiceActiveRef = useRef(false);
  const voiceRequestRef = useRef(0);
  const voiceErrorRef = useRef(false);
  const predictions = useMemo(() => getPredictions(text), [text]);
  const speechRecognitionAvailable =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const sizeConfig = {
    small: {
      gap: 'gap-1',
      key: 'min-h-[52px] text-base',
      action: 'min-h-[52px] text-sm',
      prediction: 'min-h-[52px] text-sm',
    },
    medium: {
      gap: 'gap-2',
      key: 'min-h-[60px] text-lg',
      action: 'min-h-[60px] text-base',
      prediction: 'min-h-[60px] text-base',
    },
    large: {
      gap: 'gap-3',
      key: 'min-h-[68px] text-xl',
      action: 'min-h-[68px] text-base',
      prediction: 'min-h-[68px] text-lg',
    },
  }[keyboardSize] || {
    gap: 'gap-3',
    key: 'min-h-[68px] text-xl',
    action: 'min-h-[68px] text-base',
    prediction: 'min-h-[68px] text-lg',
  };

  const append = useCallback((key) => setText?.((prev) => `${prev}${key}`), [setText]);
  const replaceText = useCallback((nextText) => setText?.(nextText), [setText]);

  const requestMicrophoneAccess = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      voiceErrorRef.current = true;
      setVoiceState('error');
      setVoiceError(getVoiceErrorMessage(error));
      setVoiceEnabled(false);
      return false;
    }
  }, []);

  const stopVoice = useCallback(() => {
    voiceRequestRef.current += 1;
    const recognition = recognitionRef.current;
    if (!recognition) return;

    voiceActiveRef.current = false;
    try {
      recognition.stop();
    } catch (_error) {
      // Ignore stop races.
    }
    setVoiceState('idle');
  }, []);

  const ensureRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceState('unsupported');
      setVoiceError('Voice input is not supported in this Electron environment. Use the gaze keyboard instead.');
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
    recognition.onstart = () => {
      voiceErrorRef.current = false;
      setVoiceState('listening');
      setVoiceError(null);
    };
    recognition.onaudiostart = () => setVoiceState('listening');
    recognition.onspeechend = () => setVoiceState('processing');

    recognition.onresult = (event) => {
      setVoiceState('processing');
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript || '';
        }
      }

      const spoken = finalTranscript.trim();
      if (!spoken) {
        setVoiceState('listening');
        return;
      }

      const command = spoken.toLowerCase();
      if (command === 'space') {
        append(' ');
        setVoiceError(null);
        setVoiceState('success');
        return;
      }
      if (command === 'backspace') {
        replaceText((prev) => prev.slice(0, -1));
        setVoiceError(null);
        setVoiceState('success');
        return;
      }
      if (command === 'enter' || command === 'new line') {
        append('\n');
        setVoiceError(null);
        setVoiceState('success');
        return;
      }
      if (command === 'clear text' || command === 'clear') {
        replaceText('');
        setVoiceError(null);
        setVoiceState('success');
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
      setVoiceState('success');
    };

    recognition.onerror = (event) => {
      voiceErrorRef.current = true;
      setVoiceState('error');
      setVoiceError(getVoiceErrorMessage(event));
      voiceActiveRef.current = false;
      setVoiceEnabled(false);
    };

    recognition.onend = () => {
      if (!voiceActiveRef.current) {
        if (!voiceErrorRef.current) setVoiceState('idle');
        return;
      }

      try {
        setVoiceState('processing');
        recognition.start();
      } catch (_error) {
        setVoiceState('error');
        setVoiceError('Voice input stopped unexpectedly. Select Start Voice to try again.');
        voiceActiveRef.current = false;
        setVoiceEnabled(false);
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [append, replaceText]);

  const startVoice = useCallback(async (requestId) => {
    const recognition = ensureRecognition();
    if (!recognition) {
      setVoiceEnabled(false);
      return;
    }

    if (!(await requestMicrophoneAccess())) return;
    if (requestId !== voiceRequestRef.current) return;

    try {
      voiceErrorRef.current = false;
      voiceActiveRef.current = true;
      setVoiceState('processing');
      setVoiceError(null);
      recognition.start();
    } catch (error) {
      voiceActiveRef.current = false;
      setVoiceEnabled(false);
      setVoiceState('error');
      setVoiceError(getVoiceErrorMessage(error));
    }
  }, [ensureRecognition, requestMicrophoneAccess]);

  useEffect(() => {
    return () => {
      voiceActiveRef.current = false;
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onstart = null;
        recognition.onaudiostart = null;
        recognition.onspeechend = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
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
      voiceErrorRef.current = false;
      setVoiceEnabled(false);
      stopVoice();
      setVoiceState('idle');
      return;
    }

    const requestId = voiceRequestRef.current + 1;
    voiceRequestRef.current = requestId;
    setVoiceState('processing');
    setVoiceEnabled(true);
    void startVoice(requestId);
  }, [startVoice, stopVoice, voiceEnabled]);

  const speak = () => {
    if (!window.speechSynthesis || !text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-sky-300/20 bg-[#101a31] p-4 lg:p-6">
      <h2 className="iris-heading font-semibold text-sky-100">Gaze Keyboard</h2>
      <p className="mb-3 text-base text-slate-300">Dwell on keys to type. Voice typing is available for dictation and simple commands.</p>

      <div className="mb-3 flex min-h-[76px] flex-wrap items-start gap-3 rounded-2xl border border-sky-300/20 bg-[#0b1226] p-4 text-sm text-slate-200">
        <button
          type="button"
          onClick={toggleVoice}
          disabled={!speechRecognitionAvailable}
          className={`min-h-[52px] rounded-xl border px-4 ${voiceEnabled ? 'border-teal-300/40 bg-teal-300/20 text-teal-100' : 'border-sky-300/25 bg-sky-300/10 text-slate-100'} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {voiceEnabled ? 'Stop Voice' : 'Start Voice'}
        </button>
        <div className="min-w-0 flex-1 space-y-1 leading-5">
          <div aria-live="polite">
            {!speechRecognitionAvailable
              ? 'Voice input unavailable; use the gaze keyboard.'
              : voiceState === 'listening'
                ? 'Listening...'
                : voiceState === 'processing'
                  ? 'Processing speech...'
                  : voiceState === 'success'
                    ? 'Text added'
                    : voiceState === 'error'
                      ? 'Voice input error'
                      : 'Voice input ready'}
          </div>
          {voiceError && <p className="break-words text-rose-200">{voiceError}</p>}
        </div>
      </div>

      <div className={`flex min-h-0 flex-1 flex-col justify-end overflow-y-auto ${sizeConfig.gap}`}>
        <textarea
          value={text}
          onChange={(event) => setText?.(event.target.value)}
          placeholder="Start typing with gaze or voice..."
          aria-label="Gaze keyboard text"
          wrap="soft"
          className="min-h-[140px] max-h-[34vh] flex-1 resize-none overflow-y-auto rounded-2xl border border-sky-300/20 bg-[#0b1226] p-4 text-lg leading-7 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50"
        />

        <div className={`grid grid-cols-2 sm:grid-cols-4 ${sizeConfig.gap}`}>
        {predictions.map((word) => (
          <DwellableButton
            key={word}
            dwellDuration={dwellDuration}
            repeatCooldown={repeatCooldown}
            onDwell={() => setText((prev) => applyPrediction(prev || ' ', word))}
            onClick={() => setText((prev) => applyPrediction(prev || ' ', word))}
            className={sizeConfig.prediction}
            minSizeClass={`${sizeConfig.prediction} min-w-0`}
          >
            {word}
          </DwellableButton>
        ))}
        </div>

      <div className={`flex flex-col ${sizeConfig.gap}`}>
        {KEY_ROWS.map((row, index) => (
          <div
            key={`row-${index}`}
            className={`grid ${sizeConfig.gap}`}
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
          >
            {row.map((key) => (
              <DwellableButton
                key={key}
                dwellDuration={dwellDuration}
                repeatCooldown={repeatCooldown}
                onDwell={() => append(key.toLowerCase())}
                onClick={() => append(key.toLowerCase())}
                className={`${sizeConfig.key} font-semibold`}
                minSizeClass={`${sizeConfig.key} min-w-0`}
              >
                {key}
              </DwellableButton>
            ))}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-2 sm:grid-cols-[1fr_2fr_1fr_1fr] ${sizeConfig.gap}`}>
        <DwellableButton
          dwellDuration={dwellDuration}
          repeatCooldown={repeatCooldown}
          onDwell={() => setText((prev) => prev.slice(0, -1))}
          onClick={() => setText((prev) => prev.slice(0, -1))}
          className={sizeConfig.action}
          minSizeClass={`${sizeConfig.action} min-w-0`}
        >
          Backspace
        </DwellableButton>
        <DwellableButton
          dwellDuration={dwellDuration}
          repeatCooldown={repeatCooldown}
          onDwell={() => append(' ')}
          onClick={() => append(' ')}
          className={sizeConfig.action}
          minSizeClass={`${sizeConfig.action} min-w-0`}
        >
          Space
        </DwellableButton>
        <DwellableButton
          dwellDuration={dwellDuration}
          repeatCooldown={repeatCooldown}
          onDwell={() => append('\n')}
          onClick={() => append('\n')}
          className={sizeConfig.action}
          minSizeClass={`${sizeConfig.action} min-w-0`}
        >
          Enter
        </DwellableButton>
        <DwellableButton
          dwellDuration={dwellDuration}
          repeatCooldown={repeatCooldown}
          onDwell={speak}
          onClick={speak}
          className={sizeConfig.action}
          minSizeClass={`${sizeConfig.action} min-w-0`}
        >
          Speak
        </DwellableButton>
      </div>
      </div>
    </section>
  );
}
