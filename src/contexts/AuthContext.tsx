import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  email: string | null;
  nome_completo: string | null;
  equipe_id: string | null;
  chat_link_base: string | null;
  telefone: string | null;
  cpf: string | null;
  cargo: string | null;
  role?: string | null;
}

interface Equipe {
  id: string;
  nome: string;
  niche: string | null;
  gpt_maker_agent_id: string | null;
  limite_creditos: number;
  creditos_avulsos: number;
  webhook_secret: string | null;
  is_crm_agent_enabled: boolean;
  page_permissions?: Record<string, boolean>;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  equipe: Equipe | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshEquipe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [equipe, setEquipe] = useState<Equipe | null>(null);
  const [loading, setLoading] = useState(true);

  // useCallback com [] : só usa setters de state, que o React garante estáveis.
  // Precisa ser estável porque o efeito que registra o listener de auth roda
  // uma vez só — recriar a função a cada render faria ele resubscrever sempre.
  const fetchProfile = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      // Try fetching by user_id first (new schema), then by id (old schema)
      let { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      // If not found by user_id, try by id (backwards compatibility)
      if (!profileData && !profileError) {
        const result = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        profileData = result.data;
        profileError = result.error;
      }

      if (profileError) {
        console.error("Erro ao buscar perfil:", profileError);
        return;
      }

      if (profileData) {
        setProfile(profileData as Profile);

        if (profileData?.equipe_id) {
          const { data: equipeData, error: equipeError } = await supabase
            .from("equipes")
            .select("*")
            .eq("id", profileData.equipe_id)
            .maybeSingle();

          if (equipeError) {
            console.error("Erro ao buscar equipe:", equipeError);
          } else if (equipeData) {
            setEquipe(equipeData as unknown as Equipe);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // De quem é a sessão que já foi resolvida. É ref e não state porque quem lê
  // isto é o próprio callback do onAuthStateChange, que precisa do valor atual
  // e não do que existia quando ele foi registrado.
  const resolvedUserId = useRef<string | null>(null);

  /**
   * O ponto único por onde uma sessão entra — e a razão de ele existir.
   *
   * Voltar para o app depois de trocar de aba dispara TOKEN_REFRESHED. Antes,
   * TODO evento chamava fetchProfile(), que liga `loading`; e o ProtectedRoute
   * troca a árvore inteira por "Carregando..." enquanto `loading` for true.
   * Ou seja: React desmontava a página toda, o estado de cada componente
   * morria junto, e voltar montava tudo do zero. Era indistinguível de um
   * reload — porque na prática era um.
   *
   * O token mudou; o usuário não. Se o id é o mesmo, não há nada a rebuscar e
   * nada a desmontar.
   */
  const applySession = useCallback((session: Session | null) => {
    setSession(session);

    const nextId = session?.user?.id ?? null;

    // Identidade estável enquanto for a mesma pessoa: um objeto User novo a
    // cada refresh reexecuta todo useEffect que tem `user` nas dependências,
    // e a tela recarrega em cascata mesmo sem passar pelo spinner.
    setUser((prev) => (prev && prev.id === nextId ? prev : session?.user ?? null));

    if (!nextId) {
      resolvedUserId.current = null;
      setProfile(null);
      setEquipe(null);
      setLoading(false);
      return;
    }

    // Mesma pessoa de antes: só o token girou. Sair daqui sem mexer em
    // `loading` é o que mantém a página de pé.
    if (resolvedUserId.current === nextId) return;

    resolvedUserId.current = nextId;
    fetchProfile(nextId);
  }, [fetchProfile]);

  useEffect(() => {
    // Setup auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Fora do callback: chamar o cliente do Supabase de dentro dele pode
        // travar no lock interno.
        setTimeout(() => applySession(session), 0);
      }
    );

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => applySession(session));

    return () => subscription.unsubscribe();
  }, [applySession]);

  const signIn = async (email: string, password: string): Promise<{ error: AuthError | null }> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const refreshEquipe = async () => {
    if (!profile?.equipe_id) return;
    const { data: equipeData } = await supabase
      .from("equipes")
      .select("*")
      .eq("id", profile.equipe_id)
      .maybeSingle();
    if (equipeData) {
      setEquipe(equipeData as unknown as Equipe);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setEquipe(null);
    setSession(null);
    setUser(null);
    // Force redirect to login
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        equipe,
        loading,
        signIn,
        signOut,
        refreshEquipe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
