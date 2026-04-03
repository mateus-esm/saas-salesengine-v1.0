// Legacy — AI Studio agora usa src/pages/ai-studio/AIStudioLayout.tsx
// Este arquivo é mantido para compatibilidade com imports existentes.
import { Navigate } from "react-router-dom";

export default function AIStudio() {
  return <Navigate to="/ai-studio/usage" replace />;
}
