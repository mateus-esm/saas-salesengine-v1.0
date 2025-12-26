import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const WhatsAppButton = () => {
  const handleClick = () => {
    window.open("https://wa.me/5585996487923", "_blank");
  };

  return (
    <Button
      onClick={handleClick}
      className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg bg-[#25D366] hover:bg-[#20BA59] text-white p-0 flex items-center justify-center z-50 transition-transform hover:scale-110"
      title="Conversar sobre melhorias no AdvAI"
    >
      <MessageCircle className="h-5 w-5" />
    </Button>
  );
};
