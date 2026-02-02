import { LogOut, User, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function UserMenu() {
  const { profile, signOut } = useAuth();

  const initials = profile?.nome_completo
    ? profile.nome_completo
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-2 px-2 h-9 hover:bg-muted/50"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline text-sm font-medium text-foreground max-w-[120px] truncate">
            {profile?.nome_completo?.split(" ")[0] || "Usuário"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden md:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              {profile?.nome_completo || "Usuário"}
            </p>
            <p className="text-xs text-muted-foreground font-mono-data truncate">
              {profile?.email}
            </p>
            {profile?.role && profile.role !== "user" && (
              <Badge variant="outline" className="w-fit mt-1 text-[10px] capitalize">
                {profile.role.replace("_", " ")}
              </Badge>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOut}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
