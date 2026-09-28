import { useCallback, useEffect, useRef } from 'react';
import { finishDictation, registerVoiceTarget, toggleDictation, useVoiceState } from './voice';

// Connects a view to the shared Whisper voice engine: while mounted, the view
// receives dictated text (onText) and the optional "send" (onSubmit).
export function useDictation(onText: (text: string) => void, onSubmit?: () => void) {
  const state = useVoiceState();
  const onTextRef = useRef(onText);
  const onSubmitRef = useRef(onSubmit);
  onTextRef.current = onText;
  onSubmitRef.current = onSubmit;

  useEffect(
    () =>
      registerVoiceTarget({
        insert: (text) => onTextRef.current(text),
        submit: () => onSubmitRef.current?.(),
      }),
    [],
  );

  const stop = useCallback(() => {
    void finishDictation();
  }, []);

  return {
    listening: state.mode === 'dictating',
    busy: state.transcribing,
    level: state.level,
    error: state.error,
    toggle: toggleDictation,
    stop,
  };
}
