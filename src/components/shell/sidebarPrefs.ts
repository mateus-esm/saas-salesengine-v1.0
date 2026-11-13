import { useCallback, useState } from "react";

export type SidebarMode = "icon" | "offcanvas";

const MODE_KEY = "rev.sidebar.mode";
const GROUPS_KEY = "rev.sidebar.groups";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* modo privado: a preferência só vale nesta sessão */
  }
}

export function readSidebarMode(): SidebarMode {
  return read(MODE_KEY) === "icon" ? "icon" : "offcanvas";
}

export function useSidebarMode(): [SidebarMode, (m: SidebarMode) => void] {
  const [mode, setModeState] = useState<SidebarMode>(readSidebarMode);
  const setMode = useCallback((m: SidebarMode) => {
    setModeState(m);
    write(MODE_KEY, m);
  }, []);
  return [mode, setMode];
}

export function readGroupState(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(read(GROUPS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveGroupState(id: string, open: boolean) {
  write(GROUPS_KEY, JSON.stringify({ ...readGroupState(), [id]: open }));
}

/** Lê o cookie do shadcn para a barra voltar como o usuário a deixou. */
export function readSidebarOpenCookie(): boolean {
  try {
    const m = document.cookie.match(/(?:^|;\s*)sidebar:state=(true|false)/);
    return m ? m[1] === "true" : true;
  } catch {
    return true;
  }
}
