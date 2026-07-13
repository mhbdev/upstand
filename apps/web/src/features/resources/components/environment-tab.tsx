"use client";

import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Input } from "@upstand/ui/components/input";
import { Code, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface EnvironmentTabProps {
  resource: any;
  updateResource: any;
  isUpdatingResource: boolean;
}

export function EnvironmentTab({
  resource,
  updateResource,
  isUpdatingResource,
}: EnvironmentTabProps) {
  const [envList, setEnvList] = useState<Array<{ key: string; value: string }>>(
    [],
  );
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [visibleEnvKeys, setVisibleEnvKeys] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    if (resource) {
      try {
        const parsed = JSON.parse(resource.envVars || "{}");
        setEnvList(
          Object.entries(parsed).map(([key, value]) => ({
            key,
            value: String(value),
          })),
        );
      } catch {
        setEnvList([]);
      }
    }
  }, [resource]);

  const addEnvVar = () => {
    if (!newEnvKey.trim()) return;
    const key = newEnvKey.trim();
    const updated = [...envList];
    const index = updated.findIndex((e) => e.key === key);
    if (index > -1) {
      updated[index].value = newEnvValue;
      toast.success(`Updated key ${key}`);
    } else {
      updated.push({ key, value: newEnvValue });
    }
    setEnvList(updated);
    setNewEnvKey("");
    setNewEnvValue("");
  };

  const editEnvVar = (key: string, value: string) => {
    setNewEnvKey(key);
    setNewEnvValue(value);
  };

  const deleteEnvVar = (key: string) => {
    setEnvList(envList.filter((e) => e.key !== key));
  };

  const saveEnvVars = () => {
    const obj: Record<string, string> = {};
    for (const item of envList) {
      if (item.key.trim()) {
        obj[item.key.trim()] = item.value;
      }
    }
    updateResource(
      { id: resource.id, envVars: JSON.stringify(obj) },
      {
        onSuccess: () =>
          toast.success("Environment variables saved successfully"),
      },
    );
  };

  return (
    <Card className="border border-border/40 bg-card/20">
      <CardHeader>
        <CardTitle className="font-semibold text-lg">
          Environment Variables
        </CardTitle>
        <CardDescription className="text-muted-foreground text-sm">
          Define configuration variables injected into container processes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 border-border/20 border-t pt-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Key (e.g. API_KEY)"
            value={newEnvKey}
            onChange={(e) =>
              setNewEnvKey(
                e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""),
              )
            }
            className="border-border/40 bg-card/30"
          />
          <Input
            placeholder="Value"
            value={newEnvValue}
            onChange={(e) => setNewEnvValue(e.target.value)}
            className="border-border/40 bg-card/30"
          />
          <Button
            onClick={addEnvVar}
            variant="outline"
            className="gap-2 border-border/40 font-medium"
          >
            <Plus className="size-4" /> Add Variable
          </Button>
        </div>

        {envList.length > 0 ? (
          <div className="mt-6 overflow-hidden border border-border/20 bg-card/10">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-border/20 border-b bg-muted/10 text-muted-foreground text-xs uppercase">
                  <th className="p-3">Environment Key</th>
                  <th className="p-3">Injected Value</th>
                  <th className="w-16 p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {envList.map((item) => {
                  const isVisible = visibleEnvKeys[item.key];
                  return (
                    <tr
                      key={item.key}
                      className="border-border/10 border-b hover:bg-muted/5"
                    >
                      <td className="p-3 font-mono font-semibold text-foreground">
                        {item.key}
                      </td>
                      <td className="p-3 font-mono text-zinc-300">
                        <span className="flex items-center gap-2">
                          <span className="flex-1 select-all break-all">
                            {item.value ? (
                              isVisible ? (
                                item.value
                              ) : (
                                "••••••••••••"
                              )
                            ) : (
                              <span className="text-zinc-600 italic">
                                Empty
                              </span>
                            )}
                          </span>
                          {item.value && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setVisibleEnvKeys((prev) => ({
                                  ...prev,
                                  [item.key]: !prev[item.key],
                                }))
                              }
                              className="size-7 text-muted-foreground hover:bg-muted/10 hover:text-foreground"
                            >
                              {isVisible ? (
                                <EyeOff className="size-3.5" />
                              ) : (
                                <Eye className="size-3.5" />
                              )}
                            </Button>
                          )}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex justify-center gap-1">
                          <Button
                            onClick={() => editEnvVar(item.key, item.value)}
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:bg-muted/10"
                          >
                            <Code className="size-3.5" />
                          </Button>
                          <Button
                            onClick={() => deleteEnvVar(item.key)}
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No environment variables defined yet.
          </div>
        )}

        <div className="flex justify-end border-border/20 border-t pt-4">
          <Button
            onClick={saveEnvVars}
            disabled={isUpdatingResource}
            className="font-medium"
          >
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
