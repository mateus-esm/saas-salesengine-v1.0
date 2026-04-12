
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

// opus-recorder não tem tipos TypeScript oficiais
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Recorder from 'opus-recorder';

/** Máximo de espera após chamar stop() antes de desistir */
const STOP_TIMEOUT_MS = 6000;

/**
 * Hook de gravação de áudio que produz OGG+OPUS via WASM (opus-recorder).
 * Worker file em /public/encoderWorker.min.js.
 */
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const recorderRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const stopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cancelledRef = useRef(false);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  // Limpar tudo ao desmontar
  useEffect(() => {
    return () => {
      clearTimer();
      clearStopTimeout();
      try { recorderRef.current?.close(); } catch (_) { /* ignore */ }
    };
  }, []);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function clearStopTimeout() {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  }

  /** Resolve a promise pendente de stopRecording com o resultado fornecido */
  function settlePending(blob: Blob | null) {
    clearStopTimeout();
    const resolve = resolveRef.current;
    if (resolve) {
      resolveRef.current = null;
      resolve(blob);
    }
  }

  /** Limpa o estado de gravação na UI */
  function resetRecordingState() {
    setIsRecording(false);
    clearTimer();
  }

  const startRecording = async () => {
    try {
      cancelledRef.current = false;

      const recorder = new Recorder({
        encoderPath: '/encoderWorker.min.js',
        numberOfChannels: 1,
        encoderApplication: 2048,  // OPUS_APPLICATION_VOIP
        encoderBitRate: 32000,
        encoderSampleRate: 48000,
        maxFramesPerPage: 40,
        streamPages: false,        // Entrega tudo de uma vez no stop
      });

      // Dados prontos — sempre dispara antes de onstop (com streamPages: false)
      recorder.ondataavailable = (arrayBuffer: ArrayBuffer) => {
        if (cancelledRef.current) {
          settlePending(null);
          return;
        }
        const blob = new Blob([arrayBuffer], { type: 'audio/ogg;codecs=opus' });
        console.log('[AudioRecorder] OGG+OPUS pronto:', { size: blob.size });
        settlePending(blob);
      };

      // Gravação encerrada — garante limpeza de estado
      recorder.onstop = () => {
        resetRecordingState();
        // Caso ondataavailable não tenha disparado (ex: gravação < 1 frame)
        if (resolveRef.current) {
          console.warn('[AudioRecorder] onstop sem dados — resolvendo com null.');
          settlePending(null);
        }
      };

      // Erro no worker de encoding
      recorder.onerror = (e: Event) => {
        console.error('[AudioRecorder] Erro no worker de encoding:', e);
        resetRecordingState();
        settlePending(null);
        toast.error('Erro no encoding de áudio. Tente novamente.');
      };

      recorderRef.current = recorder;
      await recorder.start(); // Solicita microfone e inicia gravação

      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('[AudioRecorder] Erro ao iniciar gravação:', error);
      toast.error('Erro ao acessar microfone. Verifique as permissões.');
    }
  };

  const stopRecording = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!recorderRef.current) {
        resolve(null);
        return;
      }

      resolveRef.current = resolve;

      // Timeout de segurança: se nada acontecer em STOP_TIMEOUT_MS, desiste
      stopTimeoutRef.current = setTimeout(() => {
        console.error(`[AudioRecorder] Timeout ${STOP_TIMEOUT_MS}ms ao parar. Worker pode estar travado.`);
        resetRecordingState();
        settlePending(null);
        toast.error('Gravação travou. Tente novamente.');
      }, STOP_TIMEOUT_MS);

      try {
        recorderRef.current.stop();
      } catch (err) {
        console.error('[AudioRecorder] Exceção em recorder.stop():', err);
        resetRecordingState();
        settlePending(null);
      }
    });
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    try { recorderRef.current?.stop(); } catch (_) { /* ignore */ }
    resetRecordingState();
    settlePending(null);
  };

  return {
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
