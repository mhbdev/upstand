"use client";

import { Button } from "@upstand/ui/components/button";
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
import { Spinner } from "@upstand/ui/components/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@upstand/ui/components/tabs";
import { cn } from "@upstand/ui/lib/utils";
import React, { useId, useState } from "react";
import { toast } from "sonner";
import { AlertTriangleIcon, Pencil, Trash2Icon } from "@/components/huge-icons";
import {
  compressAndConvertToDataUri,
  PRESET_ICON_OPTIONS,
  validateImageFile,
} from "@/lib/icon-utils";

export interface EditableEntityIconProps {
  icon?: string | null;
  defaultIcon: React.ReactNode;
  entityName: string;
  entityType?: "project" | "resource";
  sizeClassName?: string;
  iconSizeClassName?: string;
  bgClassName?: string;
  onSaveIcon: (newIcon: string | null) => Promise<void>;
  disabled?: boolean;
}

export function RenderEntityIcon({
  icon,
  defaultIcon,
  className = "size-full object-cover rounded-[inherit]",
}: {
  icon?: string | null;
  defaultIcon: React.ReactNode;
  className?: string;
}) {
  if (!icon) {
    return <>{defaultIcon}</>;
  }

  if (icon.startsWith("preset:")) {
    const preset = PRESET_ICON_OPTIONS.find((p) => p.id === icon);
    if (preset) {
      return <span className="text-lg leading-none">{preset.emoji}</span>;
    }
  }

  if (
    icon.startsWith("data:image/") ||
    icon.startsWith("http://") ||
    icon.startsWith("https://")
  ) {
    return (
      <img
        src={icon}
        alt="Icon"
        className={className}
        onError={(e) => {
          // Fallback if image URL fails to load
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }

  return <>{defaultIcon}</>;
}

export function EditableEntityIcon({
  icon,
  defaultIcon,
  entityName,
  entityType = "project",
  sizeClassName = "size-9 rounded-(--radius-md)",
  bgClassName = "bg-primary/10 text-primary",
  onSaveIcon,
  disabled = false,
}: EditableEntityIconProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "presets" | "url">(
    "upload",
  );
  const [selectedIcon, setSelectedIcon] = useState<string | null>(icon ?? null);
  const [urlInput, setUrlInput] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fileInputId = useId();

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setSelectedIcon(icon ?? null);
    setValidationError(null);
    if (icon && (icon.startsWith("http://") || icon.startsWith("https://"))) {
      setUrlInput(icon);
      setActiveTab("url");
    } else if (icon && icon.startsWith("preset:")) {
      setActiveTab("presets");
    } else {
      setActiveTab("upload");
    }
    setModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setValidationError(null);
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setValidationError(validation.error || "Invalid file");
      return;
    }

    try {
      setIsProcessing(true);
      const dataUri = await compressAndConvertToDataUri(file, 256);
      setSelectedIcon(dataUri);
    } catch (err: any) {
      setValidationError(err.message || "Failed to process image file");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUrlApply = () => {
    setValidationError(null);
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setValidationError("Please enter a valid URL");
      return;
    }
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      setValidationError("URL must start with http:// or https://");
      return;
    }
    setSelectedIcon(trimmed);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSaveIcon(selectedIcon);
      toast.success(
        `Changed ${entityType} icon for "${entityName}" successfully`,
      );
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save icon");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    setSelectedIcon(null);
    try {
      setIsSaving(true);
      await onSaveIcon(null);
      toast.success(`Reset icon for "${entityName}" to default`);
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to reset icon");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div
        onClick={handleOpen}
        className={cn(
          "group/icon relative flex shrink-0 items-center justify-center overflow-hidden transition-all duration-200",
          sizeClassName,
          bgClassName,
          !disabled && "cursor-pointer hover:ring-2 hover:ring-primary/40",
        )}
        title={disabled ? undefined : `Click to change ${entityType} icon`}
      >
        <RenderEntityIcon icon={icon} defaultIcon={defaultIcon} />

        {!disabled && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-black/60 opacity-0 transition-opacity duration-200 backdrop-blur-[1px] group-hover/icon:opacity-100">
            <Pencil className="size-4 text-white" aria-hidden="true" />
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md rounded-2xl border border-border/50 bg-card shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold text-xl">
              Change Icon
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Customize icon for{" "}
              <span className="font-semibold text-foreground">{entityName}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Current Selected Preview */}
            <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-accent/20 p-3">
              <div
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-md)",
                  bgClassName,
                )}
              >
                <RenderEntityIcon
                  icon={selectedIcon}
                  defaultIcon={defaultIcon}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">
                  Icon Preview
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {selectedIcon
                    ? selectedIcon.startsWith("data:")
                      ? "Custom uploaded image"
                      : selectedIcon.startsWith("preset:")
                        ? `Preset: ${selectedIcon.slice(7)}`
                        : selectedIcon
                    : "Default icon"}
                </p>
              </div>
              {selectedIcon && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIcon(null)}
                  title="Clear custom icon"
                  className="size-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              )}
            </div>

            {validationError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-destructive text-xs">
                <AlertTriangleIcon className="size-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Selector Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v as any);
                setValidationError(null);
              }}
            >
              <TabsList className="grid w-full grid-cols-3 border border-border/40 bg-muted/30">
                <TabsTrigger value="upload" className="text-xs">
                  Upload File
                </TabsTrigger>
                <TabsTrigger value="presets" className="text-xs">
                  Presets
                </TabsTrigger>
                <TabsTrigger value="url" className="text-xs">
                  Image URL
                </TabsTrigger>
              </TabsList>

              {/* Upload Tab */}
              <TabsContent value="upload" className="space-y-3 pt-3">
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 p-6 text-center transition-colors hover:border-primary/50">
                  <Input
                    id={fileInputId}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Label
                    htmlFor={fileInputId}
                    className="flex cursor-pointer flex-col items-center gap-2"
                  >
                    {isProcessing ? (
                      <Spinner className="size-8 text-primary" />
                    ) : (
                      <div className="flex size-10 items-center justify-center rounded-(--radius-md) bg-primary/10 text-primary">
                        <Pencil className="size-5" />
                      </div>
                    )}
                    <span className="font-medium text-sm text-foreground">
                      Click to choose or drag image file
                    </span>
                    <span className="text-muted-foreground text-xs">
                      PNG, JPEG, WebP, GIF, or SVG (Max 2MB, resized to 256px)
                    </span>
                  </Label>
                </div>
              </TabsContent>

              {/* Presets Tab */}
              <TabsContent value="presets" className="space-y-3 pt-3">
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_ICON_OPTIONS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedIcon(preset.id);
                        setValidationError(null);
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-xl border p-2.5 transition-all hover:border-primary/50 hover:bg-accent/40",
                        selectedIcon === preset.id
                          ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30"
                          : "border-border/40 bg-card/50 text-foreground",
                      )}
                    >
                      <span className="text-xl">{preset.emoji}</span>
                      <span className="mt-1 font-medium text-[10px] text-muted-foreground truncate w-full text-center">
                        {preset.label}
                      </span>
                    </button>
                  ))}
                </div>
              </TabsContent>

              {/* URL Tab */}
              <TabsContent value="url" className="space-y-3 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="icon-url" className="text-xs">
                    Image Address (HTTP/HTTPS)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="icon-url"
                      placeholder="https://example.com/logo.png"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="border-border/40 focus:border-primary text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleUrlApply}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="flex flex-col-reverse justify-between gap-2 pt-4 sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSaving || !icon}
              onClick={handleResetToDefault}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Reset to Default
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || isProcessing}
                className="gap-2"
              >
                {isSaving && <Spinner className="size-3.5" />}
                Save Icon
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
