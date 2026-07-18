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
import { Label } from "@upstand/ui/components/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Code, Eye, EyeOff, Plus, Trash2 } from "@/components/huge-icons";

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
  const environmentVersion = resource?.envVars ?? "";
  const managedEnvironment = resource?.managedEnvironment ?? {};
  const managedEntries = Object.entries(managedEnvironment);

  useEffect(() => {
    if (environmentVersion) {
      try {
        const parsed = JSON.parse(environmentVersion || "{}");
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
  }, [environmentVersion]);

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
        {managedEntries.length > 0 ? (
          <div className="space-y-2 rounded-md border border-border/40 bg-muted/20 p-4">
            <div>
              <p className="font-medium text-sm">Managed database variables</p>
              <p className="text-muted-foreground text-xs">
                Upstand derives these from the database credentials. They are
                read-only here and are injected alongside the variables below.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {managedEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="flex min-w-0 items-center justify-between gap-3 rounded border border-border/30 bg-background/50 px-3 py-2"
                >
                  <span className="truncate font-medium font-mono text-xs">
                    {key}
                  </span>
                  <span className="font-mono text-muted-foreground text-xs">
                    {value ? "••••••••••••" : "Empty"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="resource-env-key">Variable name</Label>
            <Input
              id="resource-env-key"
              name="resource-env-key"
              autoComplete="off"
              spellCheck={false}
              placeholder="API_KEY…"
              value={newEnvKey}
              onChange={(e) =>
                setNewEnvKey(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""),
                )
              }
              className="border-border/40 bg-card/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resource-env-value">Value</Label>
            <Input
              id="resource-env-value"
              name="resource-env-value"
              autoComplete="off"
              placeholder="Value…"
              value={newEnvValue}
              onChange={(e) => setNewEnvValue(e.target.value)}
              className="border-border/40 bg-card/30"
            />
          </div>
          <Button
            type="button"
            onClick={addEnvVar}
            variant="outline"
            className="mt-auto gap-2 border-border/40 font-medium"
            disabled={!newEnvKey.trim()}
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
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`${isVisible ? "Hide" : "Show"} ${item.key} value`}
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
                            type="button"
                            onClick={() => editEnvVar(item.key, item.value)}
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:bg-muted/10"
                            aria-label={`Edit ${item.key}`}
                          >
                            <Code className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            onClick={() => deleteEnvVar(item.key)}
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Delete ${item.key}`}
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
