
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type MediaType = 'image' | 'audio' | 'video' | 'document';

interface UploadResult {
  url: string;
  type: MediaType;
}

export function useMediaUpload() {
  const [isUploading, setIsUploading] = useState(false);

  const determineMediaType = (file: File): MediaType => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.startsWith('video/')) return 'video';
    return 'document';
  };

  const uploadFile = async (file: File): Promise<UploadResult | null> => {
    setIsUploading(true);
    try {
      // 1. Validar tamanho (Max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Arquivo muito grande. Máximo 10MB.");
        return null;
      }

      // 2. Gerar nome único garantindo retenção do nome original (necessário para exibição correta no WPP)
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const fileName = `${Date.now()}_${sanitizedName}`;
      const filePath = `${fileName}`;

      // 3. Upload para Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 4. Gerar URL pública
      const { data } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      return {
        url: data.publicUrl,
        type: determineMediaType(file)
      };

    } catch (error) {
      console.error("Erro no upload:", error);
      toast.error("Erro ao enviar arquivo.");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadFile,
    isUploading
  };
}
