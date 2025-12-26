import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ModeToggle } from "@/components/ModeToggle";
import { Logo } from "@/components/Logo";

export const Header = () => {
  const { profile } = useAuth();
  const chatHref = profile?.chat_link_base || "/chat";
  const isExternalChatLink = chatHref.startsWith("http");

  return (
    <header className="border-b border-border bg-background sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/home" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Logo className="h-8" />
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            to="/home"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Início
          </Link>
          {isExternalChatLink ? (
            <a
              href={chatHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              Chat
            </a>
          ) : (
            <Link
              to={chatHref}
              className="text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              Chat
            </Link>
          )}
          <Link
            to="/crm"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            CRM
          </Link>
          <Link 
            to="/suporte" 
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Suporte
          </Link>
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
};
