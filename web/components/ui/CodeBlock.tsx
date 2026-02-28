import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  lang?: string;
  showDots?: boolean;
  className?: string;
}

export function CodeBlock({ code, lang, showDots = true, className }: CodeBlockProps) {
  return (
    <div className={cn("code-block overflow-hidden p-4 text-left", className)}>
      {showDots && (
        <div className="mb-2 flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-error/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-success/60" />
          {lang && <span className="ml-2 text-xs text-text-tertiary">{lang}</span>}
        </div>
      )}
      {!showDots && lang && (
        <div className="mb-2 text-xs text-text-tertiary">{lang}</div>
      )}
      <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed text-text-secondary">
        {highlightBlock(code)}
      </pre>
    </div>
  );
}

function highlightBlock(code: string): React.ReactNode {
  return code.split("\n").map((line, i) => (
    <div key={i}>
      {line
        .split(
          /(\/\/.*$|"[^"]*"|'[^']*'|\b(?:import|from|const|await|function|export|app|external|async|return)\b|\b(?:string|address|uint256|bytes32|uint8)\b)/gm
        )
        .map((part, j) => {
          if (!part) return null;
          if (part.startsWith("//")) {
            return (
              <span key={j} className="text-text-tertiary">
                {part}
              </span>
            );
          }
          if (/^["']/.test(part)) {
            return (
              <span key={j} className="text-success">
                {part}
              </span>
            );
          }
          if (
            /^(import|from|const|await|function|export|async|return|external|app)$/.test(
              part
            )
          ) {
            return (
              <span key={j} className="text-accent-purple">
                {part}
              </span>
            );
          }
          if (/^(string|address|uint256|bytes32|uint8)$/.test(part)) {
            return (
              <span key={j} className="text-accent">
                {part}
              </span>
            );
          }
          return <span key={j}>{part}</span>;
        })}
    </div>
  ));
}
