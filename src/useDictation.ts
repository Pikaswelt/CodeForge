import { useCallback, useEffect, useRef, useState } from 'react';

// Windows dictation via the native speech worker in the main process.
// Keeps exactly one result listener alive and cleans it up on stop/unmount.
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const detach = () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  };

  const stop = useCallback(() => {
    window.agentWorkspace?.stopSpeechRecognition?.().catch(() => {});
    detach();
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    const workspace = window.agentWorkspace;
    if (!workspace?.startSpeechRecognition || !workspace.onSpeechResult) {
      setError('Spracheingabe ist nur in der Desktop-App verfuegbar.');
      return;
    }
    setError('');
    detach();
    unsubscribeRef.current = workspace.onSpeechResult((payload) => {
      if (payload.type === 'final' && payload.text) {
        onTextRef.current(payload.text);
      } else if (payload.type === 'error') {
        setError(payload.error || 'Spracherkennung fehlgeschlagen.');
        detach();
        setListening(false);
      } else if (payload.type === 'stopped') {
        detach();
        setListening(false);
      }
    });
    setListening(true);
    const result = await workspace.startSpeechRecognition({ lang: navigator.language || 'de-DE' });
    if (!result.ok) {
      setError(result.error || 'Spracherkennung konnte nicht gestartet werden.');
      stop();
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else void start();
  }, [listening, start, stop]);

  return { listening, error, toggle, stop };
}
