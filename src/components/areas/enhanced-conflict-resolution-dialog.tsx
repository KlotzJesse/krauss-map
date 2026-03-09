"use client";

import {
  IconAlertTriangle,
  IconArrowRight,
  IconGitMerge,
} from "@tabler/icons-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ConflictItem {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  type: "layer" | "postal_code" | "area";
}

interface EnhancedConflictResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictItem[];
  onResolve: (resolution: Record<string, "local" | "remote" | "merge">) => void;
  isLoading?: boolean;
}

export function EnhancedConflictResolutionDialog({
  open,
  onOpenChange,
  conflicts,
  onResolve,
  isLoading = false,
}: EnhancedConflictResolutionDialogProps) {
  const [resolutions, setResolutions] = useState<
    Record<string, "local" | "remote" | "merge">
  >({});
  const [strategy, setStrategy] = useState<"local" | "remote" | "manual">(
    "manual"
  );

  const handleStrategySelect = (newStrategy: "local" | "remote" | "manual") => {
    setStrategy(newStrategy);
    if (newStrategy !== "manual") {
      const newResolutions: Record<string, "local" | "remote" | "merge"> = {};
      conflicts.forEach((conflict) => {
        newResolutions[conflict.field] = newStrategy;
      });
      setResolutions(newResolutions);
    }
  };

  const handleResolve = () => {
    onResolve(resolutions);
  };

  const formatValue = (value: unknown) => {
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const hasUnresolvedConflicts =
    Object.keys(resolutions).length < conflicts.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconAlertTriangle className="h-5 w-5 text-orange-500" />
            Resolve Conflicts
          </DialogTitle>
          <DialogDescription>
            Changes were made by another user. Choose which changes to keep.
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-orange-50 dark:bg-orange-900/10 border-orange-200">
          <IconAlertTriangle className="h-4 w-4 text-orange-500" />
          <AlertDescription>
            {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""}{" "}
            detected. You must resolve{" "}
            {hasUnresolvedConflicts ? "all conflicts" : "them"} before saving.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="conflicts" className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="conflicts">
              Conflicts ({conflicts.length})
            </TabsTrigger>
            <TabsTrigger value="strategy">Quick Resolution</TabsTrigger>
          </TabsList>

          <TabsContent value="conflicts" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {conflicts.map((conflict, index) => (
                  <div
                    key={conflict.field}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {conflict.type.replace("_", " ")}
                        </Badge>
                        <span className="font-medium">{conflict.field}</span>
                      </div>
                      {resolutions[conflict.field] && (
                        <Badge variant="secondary">
                          Resolved: {resolutions[conflict.field]}
                        </Badge>
                      )}
                    </div>

                    <RadioGroup
                      value={resolutions[conflict.field] || ""}
                      onValueChange={(value) =>
                        setResolutions({
                          ...resolutions,
                          [conflict.field]: value as "local" | "remote",
                        })
                      }
                    >
                      <div className="grid grid-cols-2 gap-4">
                        {/* Your Changes */}
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value="local"
                              id={`local-${index}`}
                            />
                            <Label
                              htmlFor={`local-${index}`}
                              className="font-medium text-blue-600"
                            >
                              Your Changes
                            </Label>
                          </div>
                          <div className="pl-6 p-3 bg-blue-50 dark:bg-blue-900/10 rounded border border-blue-200">
                            <pre className="text-xs overflow-auto">
                              {formatValue(conflict.localValue)}
                            </pre>
                          </div>
                        </div>

                        {/* Their Changes */}
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value="remote"
                              id={`remote-${index}`}
                            />
                            <Label
                              htmlFor={`remote-${index}`}
                              className="font-medium text-green-600"
                            >
                              Their Changes
                            </Label>
                          </div>
                          <div className="pl-6 p-3 bg-green-50 dark:bg-green-900/10 rounded border border-green-200">
                            <pre className="text-xs overflow-auto">
                              {formatValue(conflict.remoteValue)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </RadioGroup>

                    {conflict.type === "postal_code" && (
                      <div className="mt-3">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="merge" id={`merge-${index}`} />
                          <Label
                            htmlFor={`merge-${index}`}
                            className="font-medium text-purple-600"
                          >
                            <IconGitMerge className="h-4 w-4 inline mr-1" />
                            Merge Both (combine postal codes)
                          </Label>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="strategy" className="mt-4">
            <div className="space-y-4 p-4">
              <h3 className="font-medium text-lg">Quick Resolution Strategy</h3>
              <p className="text-sm text-muted-foreground">
                Apply the same resolution strategy to all conflicts at once.
              </p>

              <RadioGroup
                value={strategy}
                onValueChange={(value) =>
                  handleStrategySelect(value as "local" | "remote" | "manual")
                }
              >
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 p-3 border rounded hover:bg-accent">
                    <RadioGroupItem value="local" id="strategy-local" />
                    <Label
                      htmlFor="strategy-local"
                      className="flex-1 cursor-pointer"
                    >
                      <div>
                        <div className="font-medium">Keep Your Changes</div>
                        <div className="text-sm text-muted-foreground">
                          Discard all remote changes and keep your local
                          modifications
                        </div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 p-3 border rounded hover:bg-accent">
                    <RadioGroupItem value="remote" id="strategy-remote" />
                    <Label
                      htmlFor="strategy-remote"
                      className="flex-1 cursor-pointer"
                    >
                      <div>
                        <div className="font-medium">Accept Their Changes</div>
                        <div className="text-sm text-muted-foreground">
                          Discard your changes and accept all remote
                          modifications
                        </div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 p-3 border rounded hover:bg-accent">
                    <RadioGroupItem value="manual" id="strategy-manual" />
                    <Label
                      htmlFor="strategy-manual"
                      className="flex-1 cursor-pointer"
                    >
                      <div>
                        <div className="font-medium">Manual Resolution</div>
                        <div className="text-sm text-muted-foreground">
                          Review and resolve each conflict individually
                        </div>
                      </div>
                    </Label>
                  </div>
                </div>
              </RadioGroup>

              {strategy !== "manual" && (
                <Alert className="mt-4">
                  <AlertDescription>
                    {strategy === "local"
                      ? "All conflicts will be resolved by keeping your changes."
                      : "All conflicts will be resolved by accepting their changes."}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleResolve}
            disabled={hasUnresolvedConflicts || isLoading}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                Resolving...
              </>
            ) : (
              <>
                <IconArrowRight className="h-4 w-4 mr-2" />
                Apply Resolution
                {!hasUnresolvedConflicts &&
                  ` (${Object.keys(resolutions).length})`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
