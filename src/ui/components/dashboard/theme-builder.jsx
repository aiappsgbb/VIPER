"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Brush, ImagePlus, RotateCcw, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDashboardTheme } from "@/components/dashboard/theme-context";

function ColorInput({ id, label, value, onChange, description, textColor, mutedColor }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between text-sm font-medium" htmlFor={id} style={{ color: textColor }}>
        <span>{label}</span>
        <span className="text-xs font-normal" style={{ color: mutedColor }}>
          {value}
        </span>
      </label>
      <div className="flex items-center gap-3">
        <Input id={id} type="color" value={value} onChange={onChange} className="h-10 w-20 cursor-pointer" />
        {description ? (
          <p className="text-xs" style={{ color: mutedColor }}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function ThemeBuilder() {
  const { theme, updateTheme, resetTheme } = useDashboardTheme();
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef(null);

  const previewStyles = useMemo(
    () => ({
      background: `linear-gradient(135deg, ${theme.backgroundColor}, ${theme.surfaceColor})`,
      borderColor: theme.primaryColor,
      color: theme.textColor,
    }),
    [theme.backgroundColor, theme.surfaceColor, theme.primaryColor, theme.textColor],
  );

  const handleColorChange = (key) => (event) => {
    updateTheme({ [key]: event.target.value });
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateTheme({ logoDataUrl: reader.result });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    updateTheme({ logoDataUrl: null });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReset = () => {
    resetTheme();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Brush className="mr-2 h-4 w-4" />
          Theme
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Customize your dashboard</DialogTitle>
          <DialogDescription>
            Adjust the colours and add a logo to personalise the dashboard for your current session. Your selections are stored
            in your browser only.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-2">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold" style={{ color: theme.textColor }}>
              Branding
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              {theme.logoDataUrl ? (
                <div
                  className="relative h-20 w-20 overflow-hidden rounded-md border border-dashed"
                  style={{
                    borderColor: theme.primaryColor,
                    backgroundColor: theme.surfaceColor,
                  }}
                >
                  <Image
                    alt="Custom logo preview"
                    src={theme.logoDataUrl}
                    width={80}
                    height={80}
                    unoptimized
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed"
                  style={{
                    borderColor: theme.mutedTextColor,
                    color: theme.mutedTextColor,
                    backgroundColor: theme.surfaceColor,
                  }}
                >
                  <ImagePlus className="h-8 w-8" />
                </div>
              )}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={() => fileInputRef.current?.click()} size="sm">
                    <Upload className="mr-2 h-4 w-4" /> Upload logo
                  </Button>
                  {theme.logoDataUrl ? (
                    <Button type="button" variant="outline" size="sm" onClick={handleRemoveLogo}>
                      Remove
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs" style={{ color: theme.mutedTextColor }}>
                  PNG, JPG or SVG up to 2&nbsp;MB.
                </p>
              </div>
              <input ref={fileInputRef} className="sr-only" type="file" accept="image/*" onChange={handleFileChange} />
            </div>
          </section>
          <section className="space-y-4">
            <h3 className="text-sm font-semibold" style={{ color: theme.textColor }}>
              Colours
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorInput
                id="dashboard-theme-background"
                label="Background"
                value={theme.backgroundColor}
                onChange={handleColorChange("backgroundColor")}
                textColor={theme.textColor}
                mutedColor={theme.mutedTextColor}
              />
              <ColorInput
                id="dashboard-theme-surface"
                label="Surface"
                value={theme.surfaceColor}
                onChange={handleColorChange("surfaceColor")}
                textColor={theme.textColor}
                mutedColor={theme.mutedTextColor}
              />
              <ColorInput
                id="dashboard-theme-primary"
                label="Primary"
                value={theme.primaryColor}
                onChange={handleColorChange("primaryColor")}
                textColor={theme.textColor}
                mutedColor={theme.mutedTextColor}
              />
              <ColorInput
                id="dashboard-theme-accent"
                label="Accent"
                value={theme.accentColor}
                onChange={handleColorChange("accentColor")}
                textColor={theme.textColor}
                mutedColor={theme.mutedTextColor}
              />
              <ColorInput
                id="dashboard-theme-text"
                label="Text"
                value={theme.textColor}
                onChange={handleColorChange("textColor")}
                textColor={theme.textColor}
                mutedColor={theme.mutedTextColor}
              />
              <ColorInput
                id="dashboard-theme-muted-text"
                label="Muted text"
                value={theme.mutedTextColor}
                onChange={handleColorChange("mutedTextColor")}
                textColor={theme.textColor}
                mutedColor={theme.mutedTextColor}
              />
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold" style={{ color: theme.textColor }}>
              Preview
            </h3>
            <div className="overflow-hidden rounded-lg border" style={previewStyles}>
              <div
                className="flex items-center gap-4 px-6 py-4"
                style={{
                  backgroundColor: theme.surfaceColor,
                  borderBottom: `1px solid ${theme.primaryColor}`,
                }}
              >
                {theme.logoDataUrl ? (
                  <Image
                    alt="Preview logo"
                    src={theme.logoDataUrl}
                    width={40}
                    height={40}
                    unoptimized
                    className="h-10 w-10 rounded bg-white/70 object-contain p-1"
                  />
                ) : (
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded"
                    style={{ backgroundColor: theme.primaryColor, color: theme.surfaceColor }}
                  >
                    <Brush className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase tracking-wide" style={{ color: theme.mutedTextColor }}>
                    Signed in as
                  </p>
                  <p className="text-sm font-semibold" style={{ color: theme.textColor }}>
                    Jamie Doe
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 text-sm" style={{ color: theme.textColor }}>
                This is an example of how your customised dashboard will look. These changes only affect your browser.
              </div>
            </div>
          </section>
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={handleReset} className="justify-start">
            <RotateCcw className="mr-2 h-4 w-4" /> Reset to defaults
          </Button>
          <Button type="button" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
