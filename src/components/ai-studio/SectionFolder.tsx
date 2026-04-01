import * as React from "react"
import { Folder } from "lucide-react"
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

interface SectionFolderProps {
  value: string
  title: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function SectionFolder({
  value,
  title,
  description,
  icon,
  children,
  className,
}: SectionFolderProps) {
  return (
    <AccordionItem value={value} className={cn("border border-border bg-card rounded-xl overflow-hidden shadow-sm mb-4", className)}>
      <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/50 transition-colors group relative">
        <div className="flex items-center gap-3 text-left w-full pr-8">
          <div className="p-2 bg-primary/10 text-primary rounded-lg group-hover:bg-primary/20 transition-colors">
            {icon || <Folder className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-card-foreground text-sm tracking-tight">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 font-normal">{description}</p>
            )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-5 pb-5 pt-2">
        {children}
      </AccordionContent>
    </AccordionItem>
  )
}
