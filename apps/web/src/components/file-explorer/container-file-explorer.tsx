"use client";

import {
  Cancel01Icon,
  Download01Icon,
  File01Icon,
  FolderIcon,
  FolderOpenIcon,
  PlusSignIcon,
  RefreshIcon,
  Search01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@upstand/ui/components/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Spinner } from "@upstand/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@upstand/ui/components/table";
import { cn } from "@upstand/ui/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";

interface ContainerFileExplorerProps {
  resourceId: string;
}

export function ContainerFileExplorer({
  resourceId,
}: ContainerFileExplorerProps) {
  const queryClient = useQueryClient();
  const [currentPath, setCurrentPath] = useState("/");
  const [selectedContainer, setSelectedContainer] = useState<
    string | undefined
  >(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [editingFileContent, setEditingFileContent] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Modal dialog states
  const [newItemModal, setNewItemModal] = useState<"file" | "directory" | null>(
    null,
  );
  const [newItemParentPath, setNewItemParentPath] = useState<string>("/");
  const [newItemName, setNewItemName] = useState("");
  const [targetUploadPath, setTargetUploadPath] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch list of containers for resource filter
  const { data: containersData = [] } = useQuery(
    trpc.resource.getContainers.queryOptions({ id: resourceId }),
  );

  // Auto-sync selected container if stale or dead
  useEffect(() => {
    if (containersData.length > 0) {
      const exists = containersData.some(
        (c: { id: string; name: string }) =>
          c.id === selectedContainer ||
          c.id.startsWith(selectedContainer || "___") ||
          selectedContainer?.startsWith(c.id) ||
          c.name === selectedContainer,
      );
      if (!exists && containersData[0]) {
        setSelectedContainer(containersData[0].id);
      }
    }
  }, [containersData, selectedContainer]);

  // Fetch file list
  const {
    data: files = [],
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useQuery(
    trpc.containerFileManager.listFiles.queryOptions({
      resourceId,
      path: currentPath,
      containerId: selectedContainer,
    }),
  );

  // Search files query (active when search query > 1 char)
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    ...trpc.containerFileManager.searchFiles.queryOptions({
      resourceId,
      query: searchQuery,
      path: currentPath,
      containerId: selectedContainer,
    }),
    enabled: searchQuery.trim().length > 1,
  });

  // Read file query
  const { data: readFileData, isFetching: isReadingFile } = useQuery({
    ...trpc.containerFileManager.readFile.queryOptions({
      resourceId,
      path: selectedFilePath ?? "",
      containerId: selectedContainer,
    }),
    enabled: Boolean(selectedFilePath),
  });

  useEffect(() => {
    if (readFileData?.content !== undefined) {
      setEditingFileContent(readFileData.content);
      setHasUnsavedChanges(false);
    }
  }, [readFileData]);

  // Mutations
  const writeFileMutation = useMutation({
    ...trpc.containerFileManager.writeFile.mutationOptions(),
    onSuccess: () => {
      toast.success("File saved successfully ✅");
      setHasUnsavedChanges(false);
      refetch();
    },
    onError: (err) => {
      toast.error(`Save failed: ${err.message}`);
    },
  });

  const createItemMutation = useMutation({
    ...trpc.containerFileManager.createItem.mutationOptions(),
    onSuccess: () => {
      toast.success(
        `${newItemModal === "directory" ? "Folder" : "File"} created successfully`,
      );
      setNewItemModal(null);
      setNewItemName("");
      refetch();
    },
    onError: (err) => {
      toast.error(`Creation failed: ${err.message}`);
    },
  });

  const deleteItemMutation = useMutation({
    ...trpc.containerFileManager.deleteItem.mutationOptions(),
    onSuccess: () => {
      toast.success("Item deleted");
      if (selectedFilePath) {
        setSelectedFilePath(null);
      }
      refetch();
    },
    onError: (err) => {
      toast.error(`Deletion failed: ${err.message}`);
    },
  });

  const handleSaveFile = useCallback(() => {
    if (!selectedFilePath) return;
    writeFileMutation.mutate({
      resourceId,
      path: selectedFilePath,
      content: editingFileContent,
      containerId: selectedContainer,
    });
  }, [
    selectedFilePath,
    editingFileContent,
    selectedContainer,
    resourceId,
    writeFileMutation,
  ]);

  // Keyboard shortcut listener for Save (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        if (selectedFilePath && hasUnsavedChanges) {
          e.preventDefault();
          handleSaveFile();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFilePath, hasUnsavedChanges, handleSaveFile]);

  const handleDownloadFile = async (path: string, fileName: string) => {
    try {
      toast.loading("Preparing download...", { id: "downloading" });
      const result = await queryClient.fetchQuery(
        trpc.containerFileManager.readFile.queryOptions({
          resourceId,
          path,
          containerId: selectedContainer,
        }),
      );
      const blob = new Blob([result.content], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("File downloaded", { id: "downloading" });
    } catch (err: any) {
      toast.error(`Download failed: ${err.message}`, { id: "downloading" });
    }
  };

  const handleFileUploadSelect = (targetDir: string) => {
    setTargetUploadPath(targetDir);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadDir = targetUploadPath || currentPath;
    const destPath =
      uploadDir === "/"
        ? `/${file.name}`
        : `${uploadDir.replace(/\/$/, "")}/${file.name}`;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      writeFileMutation.mutate(
        {
          resourceId,
          path: destPath,
          content: content || "",
          containerId: selectedContainer,
        },
        {
          onSuccess: () => {
            toast.success(`Uploaded ${file.name} to ${destPath}`);
            refetch();
          },
        },
      );
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const pathParts = currentPath.split("/").filter(Boolean);
  const displayItems = searchQuery.trim().length > 1 ? searchResults : files;

  return (
    <div className="flex h-[750px] w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background shadow-xl">
      {/* Hidden File Input for Container Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      {/* VSCode Explorer Header & Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-border/70 border-b bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HugeiconsIcon icon={FolderOpenIcon} className="h-4 w-4" />
            </span>
            <span className="font-semibold text-sm tracking-tight">
              Container Volume Explorer
            </span>
          </div>

          {/* Container Selector Filter */}
          {containersData.length > 0 && (
            <Select
              items={[
                { value: "all", label: "All Containers / Default Volume" },
                ...containersData.map((c: any) => ({
                  value: c.id || c.name,
                  label: `🐳 ${c.name} (${c.id ? c.id.slice(0, 8) : "container"})`,
                })),
              ]}
              value={selectedContainer || "all"}
              onValueChange={(val) =>
                setSelectedContainer(
                  val === "all" ? undefined : (val as string),
                )
              }
            >
              <SelectTrigger
                size="sm"
                className="h-8 border-input bg-background font-medium text-xs"
              >
                <SelectValue placeholder="All Containers / Default Volume" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All Containers / Default Volume
                </SelectItem>
                {containersData.map((c: any) => (
                  <SelectItem key={c.id || c.name} value={c.id || c.name}>
                    🐳 {c.name} ({c.id ? c.id.slice(0, 8) : "container"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              setNewItemParentPath(currentPath);
              setNewItemModal("file");
            }}
            className="h-8 font-medium text-xs"
          >
            <HugeiconsIcon icon={PlusSignIcon} className="mr-1 h-3.5 w-3.5" />
            New File
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              setNewItemParentPath(currentPath);
              setNewItemModal("directory");
            }}
            className="h-8 font-medium text-xs"
          >
            <HugeiconsIcon icon={FolderIcon} className="mr-1 h-3.5 w-3.5" />
            New Folder
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => handleFileUploadSelect(currentPath)}
            className="h-8 font-medium text-xs"
          >
            <HugeiconsIcon icon={Upload01Icon} className="mr-1 h-3.5 w-3.5" />
            Upload File
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 w-8 p-0"
            title="Refresh Directory"
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              className={cn("h-4 w-4", isRefetching && "animate-spin")}
            />
          </Button>
        </div>
      </div>
      {/* Main VSCode Split Layout */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-12">
        {/* Left Sidebar: File Tree & Navigation */}
        <div className="flex flex-col border-border/70 border-r bg-card/30 md:col-span-4 lg:col-span-4">
          {/* Breadcrumb Path & Search */}
          <div className="space-y-2 border-border/50 border-b bg-muted/20 p-3">
            {/* Breadcrumb */}
            <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-muted-foreground text-xs">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPath("/")}
                  className={cn(
                    "rounded px-1.5 py-0.5 transition-colors hover:text-primary",
                    currentPath === "/" &&
                      "bg-accent/50 font-semibold text-foreground",
                  )}
                >
                  / (root)
                </button>
                {pathParts.map((part, index) => {
                  const subPath = `/${pathParts.slice(0, index + 1).join("/")}`;
                  const isLast = index === pathParts.length - 1;
                  return (
                    <span key={subPath} className="flex items-center gap-1">
                      <span>/</span>
                      <button
                        type="button"
                        onClick={() => setCurrentPath(subPath)}
                        className={cn(
                          "rounded px-1.5 py-0.5 transition-colors hover:text-primary",
                          isLast &&
                            "bg-accent/50 font-semibold text-foreground",
                        )}
                      >
                        {part}
                      </button>
                    </span>
                  );
                })}
              </div>

              {/* Volume Shortcuts Dropdown / Pills */}
              <div className="flex items-center gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setCurrentPath("/var/lib/postgresql/data")}
                  title="Jump to Postgres Data Volume"
                >
                  pgdata
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setCurrentPath("/var/lib/mysql")}
                  title="Jump to MySQL Data Volume"
                >
                  mysql
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setCurrentPath("/data")}
                  title="Jump to /data Volume"
                >
                  /data
                </Button>
              </div>
            </div>

            {/* Filter Input */}
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground"
              />
              <Input
                placeholder="Search files in container..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 bg-background pl-8 font-mono text-xs"
              />
            </div>
          </div>

          {/* Directory File List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading || isSearching ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
                <Spinner className="h-5 w-5" />
                <span>Reading container file system...</span>
              </div>
            ) : error ? (
              <div className="p-4 text-destructive text-xs">
                Error loading container files: {error.message}
              </div>
            ) : displayItems.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-xs">
                Directory is empty.
              </div>
            ) : (
              <ContextMenu>
                <ContextMenuTrigger
                  render={<div className="block min-h-full" />}
                >
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/30">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-8 font-semibold">
                          Name
                        </TableHead>
                        <TableHead className="h-8 w-20 text-right font-semibold">
                          Size
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayItems.map((file) => (
                        <ContextMenu key={file.path}>
                          <ContextMenuTrigger
                            render={
                              <TableRow
                                onClick={() => {
                                  if (file.type === "directory") {
                                    setCurrentPath(file.path);
                                  } else {
                                    setSelectedFilePath(file.path);
                                  }
                                }}
                                className={cn(
                                  "group cursor-pointer transition-colors hover:bg-accent/60",
                                  selectedFilePath === file.path &&
                                    "bg-accent font-medium text-accent-foreground",
                                )}
                              />
                            }
                          >
                            <TableCell className="flex items-center gap-2 truncate py-2 font-mono">
                              {file.type === "directory" ? (
                                <HugeiconsIcon
                                  icon={FolderIcon}
                                  className="h-4 w-4 shrink-0 text-amber-500"
                                />
                              ) : (
                                <HugeiconsIcon
                                  icon={File01Icon}
                                  className="h-4 w-4 shrink-0 text-sky-400"
                                />
                              )}
                              <span className="truncate">{file.name}</span>
                            </TableCell>
                            <TableCell className="py-2 text-right font-mono text-muted-foreground">
                              {file.type === "directory"
                                ? "--"
                                : `${Math.round(file.sizeBytes / 1024)} KB`}
                            </TableCell>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-48 font-mono text-xs">
                            {file.type === "directory" ? (
                              <ContextMenuItem
                                onClick={() => setCurrentPath(file.path)}
                              >
                                📂 Open Directory
                              </ContextMenuItem>
                            ) : (
                              <ContextMenuItem
                                onClick={() => setSelectedFilePath(file.path)}
                              >
                                📄 Open / Edit File
                              </ContextMenuItem>
                            )}
                            {file.type === "file" && (
                              <ContextMenuItem
                                onClick={() =>
                                  handleDownloadFile(file.path, file.name)
                                }
                              >
                                📥 Download File
                              </ContextMenuItem>
                            )}
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() =>
                                handleFileUploadSelect(
                                  file.type === "directory"
                                    ? file.path
                                    : currentPath,
                                )
                              }
                            >
                              📤 Upload File Here
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => {
                                setNewItemParentPath(
                                  file.type === "directory"
                                    ? file.path
                                    : currentPath,
                                );
                                setNewItemModal("file");
                              }}
                            >
                              📄 New File Here
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => {
                                setNewItemParentPath(
                                  file.type === "directory"
                                    ? file.path
                                    : currentPath,
                                );
                                setNewItemModal("directory");
                              }}
                            >
                              📁 New Folder Here
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => {
                                if (confirm(`Delete ${file.name}?`)) {
                                  deleteItemMutation.mutate({
                                    resourceId,
                                    path: file.path,
                                    containerId: selectedContainer,
                                  });
                                }
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                              🗑️ Delete
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      ))}
                    </TableBody>
                  </Table>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 font-mono text-xs">
                  <ContextMenuItem
                    onClick={() => handleFileUploadSelect(currentPath)}
                  >
                    📤 Upload File to {currentPath}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      setNewItemParentPath(currentPath);
                      setNewItemModal("file");
                    }}
                  >
                    📄 New File in {currentPath}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      setNewItemParentPath(currentPath);
                      setNewItemModal("directory");
                    }}
                  >
                    📁 New Folder in {currentPath}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )}
          </div>
        </div>
        {/* Right Main Editor Panel */}
        <div className="flex flex-col border-t bg-[#0d1117] text-slate-200 md:col-span-8 md:border-t-0 lg:col-span-8">
          {selectedFilePath ? (
            <div className="flex h-full flex-col">
              {/* Tab Header */}
              <div className="flex items-center justify-between border-slate-800 border-b bg-[#161b22] px-4 py-2">
                <div className="flex items-center gap-2 truncate font-mono text-sky-400 text-xs">
                  <HugeiconsIcon
                    icon={File01Icon}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="truncate font-semibold">
                    {selectedFilePath}
                  </span>
                  {hasUnsavedChanges && (
                    <span
                      className="h-2 w-2 rounded-full bg-amber-400"
                      title="Unsaved changes"
                    />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    onClick={handleSaveFile}
                    disabled={writeFileMutation.isPending || !hasUnsavedChanges}
                    className="h-7 bg-emerald-600 font-medium text-white text-xs hover:bg-emerald-700"
                  >
                    {writeFileMutation.isPending
                      ? "Saving..."
                      : "Save (Ctrl+S)"}
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      handleDownloadFile(
                        selectedFilePath,
                        selectedFilePath.split("/").pop() || "file",
                      )
                    }
                    className="h-7 border-slate-700 text-slate-300 text-xs hover:bg-slate-800"
                  >
                    <HugeiconsIcon
                      icon={Download01Icon}
                      className="h-3.5 w-3.5"
                    />
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setSelectedFilePath(null)}
                    className="h-7 w-7 p-0 text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Code Editor Body */}
              <div className="relative flex-1 overflow-hidden">
                {isReadingFile ? (
                  <div className="flex h-full items-center justify-center gap-2 text-slate-400 text-xs">
                    <Spinner className="h-5 w-5 text-sky-400" />
                    <span>Loading file contents...</span>
                  </div>
                ) : (
                  <textarea
                    value={editingFileContent}
                    onChange={(e) => {
                      setEditingFileContent(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    className="h-full w-full resize-none border-none bg-transparent p-4 font-mono text-slate-200 text-xs leading-relaxed outline-none focus:ring-0"
                    placeholder="Empty file content..."
                    spellCheck={false}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-slate-500">
              <HugeiconsIcon
                icon={FolderOpenIcon}
                className="h-12 w-12 text-slate-700"
              />
              <div className="space-y-1">
                <p className="font-semibold text-slate-400 text-sm">
                  No File Selected
                </p>
                <p className="max-w-sm text-xs">
                  Select a file from the explorer list or right-click to open,
                  upload, or create new files inside your container volume.
                </p>
              </div>
            </div>
          )}
        </div>
        ;
      </div>
      {/* Modal Dialog for New File / Folder */}
      <Dialog
        open={Boolean(newItemModal)}
        onOpenChange={(open) => !open && setNewItemModal(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              Create New {newItemModal === "directory" ? "Folder" : "File"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Path:{" "}
              <span className="font-mono font-semibold">
                {newItemParentPath}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="item-name" className="font-medium text-xs">
              Name
            </Label>
            <Input
              id="item-name"
              placeholder={
                newItemModal === "directory" ? "my-folder" : "config.env"
              }
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewItemModal(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!newItemName.trim() || !newItemModal) return;
                createItemMutation.mutate({
                  resourceId,
                  parentPath: newItemParentPath,
                  name: newItemName.trim(),
                  type: newItemModal,
                  containerId: selectedContainer,
                });
              }}
              disabled={createItemMutation.isPending || !newItemName.trim()}
            >
              {createItemMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      ;
    </div>
  );
}
