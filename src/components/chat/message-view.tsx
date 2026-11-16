"use client";

import { useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, AudioLines, Check, Copy, FileText, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Message } from "@/types/chat";

type Props = {
  message: Message;
  streaming: boolean;
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onFeedback: (v: "up" | "down") => void;
  onSpeak: () => void;
};

export function MessageView({ message, streaming, copied, onCopy, onRegenerate, onFeedback, onSpeak }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const audioAction = () => { onSpeak(); setSpeaking(true); setTimeout(() => setSpeaking(false), 2400); };

  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-brand-600 text-white px-4 py-2.5 shadow-sm">
          {message.content && <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.attachments.map((f) =>
                f.type.startsWith("image/") ? (
                  <Image key={f.id} src={f.url} alt={f.name} width={320} height={192} unoptimized className="max-h-48 rounded-lg object-contain" />
                ) : (
                  <span key={f.id} className="inline-flex items-center gap-1 text-xs bg-white/20 rounded px-2 py-1">
                    <FileText size={12} /> {f.name}
                  </span>
                )
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 animate-fade-up">
      <div className="shrink-0 grid place-items-center w-8 h-8 rounded-full bg-brand-50 dark:bg-slate-800 border border-[var(--border)]">
        <Image src="/icon.png" alt="IIUM AI" width={18} height={15} />
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <div className="prose-chat text-[15px]">
          {message.content ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const inline = !className;
                  return inline ? (
                    <code className="inline-code" {...props}>{children}</code>
                  ) : (
                    <CodeBlock code={String(children).replace(/\n$/, "")} language={className?.replace("language-", "") || "text"} />
                  );
                },
                table({ children }) { return <div className="table-scroll"><table>{children}</table></div>; },
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <span className="inline-flex gap-1 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--fg-muted)] animate-blink" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--fg-muted)] animate-blink [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--fg-muted)] animate-blink [animation-delay:0.4s]" />
            </span>
          )}
        </div>

        {!streaming && message.content && (
          <div className="mt-2 flex items-center gap-0.5 text-[var(--fg-muted)]">
            <ActionBtn onClick={onCopy} icon={copied ? <Check size={13} /> : <Copy size={13} />} label={copied ? "Copied" : "Copy"} />
            <ActionBtn onClick={onRegenerate} icon={<ArrowLeft size={13} />} label="Regenerate" />
            <IconBtn active={message.feedback === "up"} onClick={() => onFeedback("up")} title="Good"><ThumbsUp size={13} /></IconBtn>
            <IconBtn active={message.feedback === "down"} onClick={() => onFeedback("down")} title="Poor"><ThumbsDown size={13} /></IconBtn>
            <IconBtn active={speaking} onClick={audioAction} title="Read aloud"><AudioLines size={13} /></IconBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] hover:bg-[var(--border)] transition">
      {icon}<span>{label}</span>
    </button>
  );
}

function IconBtn({ children, onClick, active, title }: { children: React.ReactNode; onClick: () => void; active?: boolean; title: string }) {
  return (
    <button onClick={onClick} title={title} className={`inline-flex items-center justify-center rounded-md p-1.5 hover:bg-[var(--border)] transition ${active ? "text-brand-600" : ""}`}>
      {children}
    </button>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[var(--border)] bg-slate-900 dark:bg-slate-950">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 dark:bg-slate-900 text-slate-300 text-[11.5px]">
        <span className="font-mono">{language}</span>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 hover:bg-slate-700"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
        <code className="font-mono text-slate-100">{code}</code>
      </pre>
    </div>
  );
}
