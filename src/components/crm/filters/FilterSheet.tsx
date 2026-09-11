// Sprint 11 · Onda 2 · T17 — on a phone the filters live in a bottom sheet.
//
// The bar keeps only the search box and a "Filtros (n)" button; the same
// controls open stacked in a drawer from the bottom of the screen.

import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

export function FilterSheet({ count, children }: { count: number; children: ReactNode }) {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros{count > 0 ? ` (${count})` : ""}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Filtros</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col items-stretch gap-2 overflow-y-auto px-4 pb-6 [&>*]:w-full">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
