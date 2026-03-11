"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Activity } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

interface PendingRegionsSectionProps {
  pendingPostalCodes: string[];
  regionsOpen: boolean;
  onOpenChange: (open: boolean) => void;
  canAdd: boolean;
  canRemove: boolean;
  onAddPending: () => void;
  onRemovePending: () => void;
}

export function PendingRegionsSection({
  pendingPostalCodes,
  regionsOpen,
  onOpenChange,
  canAdd,
  canRemove,
  onAddPending,
  onRemovePending,
}: PendingRegionsSectionProps) {
  return (
    <Collapsible
      open={regionsOpen}
      onOpenChange={onOpenChange}
      className="space-y-2"
    >
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between h-7 px-2 text-xs font-semibold"
          />
        }
      >
        <span>Regionen ({pendingPostalCodes.length})</span>
        {regionsOpen ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        <Activity mode={pendingPostalCodes.length > 0 ? "visible" : "hidden"}>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-medium">Gefunden</span>
              <span className="text-xs text-muted-foreground">
                {pendingPostalCodes.length}
              </span>
            </div>
            <div className="max-h-20 overflow-y-auto space-y-0.5">
              {pendingPostalCodes.slice(0, 5).map((region: string) => (
                <div
                  key={region}
                  className="text-xs p-1 bg-muted rounded truncate"
                >
                  {region}
                </div>
              ))}
              <Activity
                mode={pendingPostalCodes.length > 5 ? "visible" : "hidden"}
              >
                <div className="text-xs text-muted-foreground text-center py-0.5">
                  +{pendingPostalCodes.length - 5}
                </div>
              </Activity>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Button
                variant="default"
                size="sm"
                onClick={onAddPending}
                className="h-6 text-xs"
                title="Gefundene zum aktiven Gebiet hinzufügen"
                disabled={!canAdd}
              >
                Hinzufügen
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onRemovePending}
                className="h-6 text-xs"
                title="Gefundene aus aktivem Layer entfernen"
                disabled={!canRemove}
              >
                Entfernen
              </Button>
            </div>
            <Separator />
          </div>
        </Activity>
      </CollapsibleContent>
    </Collapsible>
  );
}
