"use client";

import React, { useState } from "react";
import { Card, Button, Badge } from "@/components/ui/Primitives";

interface EmailEditorProps {
  initialTitle?: string;
  initialSubject?: string;
  initialBody?: string;
  onSave?: (data: { title: string; subject: string; body: string }) => void;
}

export function EmailEditor({
  initialTitle = "August Product Changelog Digest",
  initialSubject = "🚀 What's new in August: AI agent improvements & team workflows",
  initialBody = "Hi there,\n\nWe're excited to share our August product updates!\n\n- Adaptive thinking in Claude Opus 5\n- Live SSE event streaming & replayable agent runs\n- Human approval gates for campaign dispatches\n\nLet us know what you think!",
  onSave,
}: EmailEditorProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "preview_desktop" | "preview_mobile">("edit");
  const [title, setTitle] = useState(initialTitle);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  const handleSave = () => {
    onSave?.({ title, subject, body });
  };

  return (
    <Card className="p-5 space-y-4 max-w-4xl mx-auto border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center space-x-2">
          <Badge tone="brand">HTML Email Builder</Badge>
          <span className="text-xs text-muted-foreground">Visual WYSIWYG & Responsive Preview</span>
        </div>
        <div className="flex space-x-1 text-xs">
          <Button
            size="sm"
            variant={activeTab === "edit" ? "primary" : "ghost"}
            onClick={() => setActiveTab("edit")}
          >
            ✏️ Editor
          </Button>
          <Button
            size="sm"
            variant={activeTab === "preview_desktop" ? "primary" : "ghost"}
            onClick={() => setActiveTab("preview_desktop")}
          >
            🖥️ Desktop Preview
          </Button>
          <Button
            size="sm"
            variant={activeTab === "preview_mobile" ? "primary" : "ghost"}
            onClick={() => setActiveTab("preview_mobile")}
          >
            📱 Mobile Preview
          </Button>
        </div>
      </div>

      {activeTab === "edit" && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Campaign Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm p-2 rounded border border-border bg-background text-foreground"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Email Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full text-sm p-2 rounded border border-border bg-background text-foreground font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Email Body Content (Markdown / HTML)</label>
            <textarea
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full text-sm p-3 rounded border border-border bg-background text-foreground font-mono leading-relaxed"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button size="sm" onClick={handleSave}>
              Save Draft
            </Button>
          </div>
        </div>
      )}

      {activeTab === "preview_desktop" && (
        <div className="border border-border rounded p-6 bg-white text-gray-900 shadow-sm max-w-2xl mx-auto space-y-4">
          <div className="border-b pb-3 space-y-1">
            <div className="text-xs text-gray-500">From: Pulse Marketing &lt;marketing@pulse.dev&gt;</div>
            <div className="text-xs text-gray-500">Subject: <span className="font-semibold text-gray-900">{subject}</span></div>
          </div>
          <div className="prose text-sm space-y-3 leading-relaxed whitespace-pre-line">
            {body}
          </div>
          <div className="border-t pt-4 text-xs text-gray-400 text-center">
            Sent via Pulse AI Marketing Engine • <a href="#" className="underline">Unsubscribe</a>
          </div>
        </div>
      )}

      {activeTab === "preview_mobile" && (
        <div className="w-[360px] mx-auto border-8 border-gray-800 rounded-3xl p-4 bg-white text-gray-900 shadow-xl space-y-3">
          <div className="w-16 h-2 bg-gray-300 rounded-full mx-auto mb-2" />
          <div className="border-b pb-2 text-xs space-y-1">
            <div className="font-bold text-gray-800 truncate">{subject}</div>
            <div className="text-[10px] text-gray-500">Pulse Marketing</div>
          </div>
          <div className="text-xs space-y-2 leading-relaxed whitespace-pre-line">
            {body}
          </div>
          <div className="border-t pt-2 text-[10px] text-gray-400 text-center">
            Pulse Email • <a href="#" className="underline">Unsubscribe</a>
          </div>
        </div>
      )}
    </Card>
  );
}
