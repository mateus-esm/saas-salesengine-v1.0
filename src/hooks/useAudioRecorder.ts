
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

// Formatos preferidos em ordem de prioridade para compatibilidade com WhatsApp
const PREFERRED_MIME_TYPES = [
  'audio/ogg;codecs=opus',   // WhatsApp nativo (voice note)
  'audio/ogg',                // OGG genérico
  'audio/mp4',                // Aceito pelo WhatsApp
  'audio/webm;codecs=opus',   // Chrome default (NÃO aceito como PTT pelo WPP)
  'audio/webm',               // Fallback final
];

function getBestMimeType(): string {
  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      console.log('[AudioRecorder] Usando mimeType:', mimeType);
      return mimeType;
    }
  }
  console.warn('[AudioRecorder] Nenhum formato preferido suportado, usando default do browser');
  return '';  // Deixa o browser decidir
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const actualMimeTypeRef = useRef<string>('audio/webm');

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeType = getBestMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      
      mediaRecorderRef.current = new MediaRecorder(stream, options);
      actualMimeTypeRef.current = mediaRecorderRef.current.mimeType || mimeType || 'audio/webm';
      console.log('[AudioRecorder] MediaRecorder iniciado com:', actualMimeTypeRef.current);
      
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

    } catch (error) {
      console.error("Erro ao acessar microfone:", error);
      toast.error("Erro ao acessar microfone. Verifique as permissões.");
    }
  };

  const stopRecording = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const usedMime = actualMimeTypeRef.current;
        const blob = new Blob(chunksRef.current, { type: usedMime });
        console.log('[AudioRecorder] Blob criado:', { type: blob.type, size: blob.size });
        // Limpar tracks
        mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
        resolve(blob);
      };

      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    });
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    chunksRef.current = [];
  };

  return {
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
    cancelRecording
  };
}
