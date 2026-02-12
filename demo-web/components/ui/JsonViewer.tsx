"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface JsonViewerProps {
  data: any;
  className?: string;
  collapsed?: boolean;
}

export function JsonViewer({ data, className, collapsed = false }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [data]);

  return (
    <div className={cn("relative rounded-xl bg-bg-secondary border border-border-default p-4 overflow-auto", className)}>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 rounded-md bg-bg-tertiary px-2 py-1 text-xs text-text-tertiary hover:text-text-primary border border-border-default transition-colors cursor-pointer"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="font-mono text-[13px] leading-relaxed">
        <JsonNode value={data} defaultCollapsed={collapsed} depth={0} />
      </pre>
    </div>
  );
}

function JsonNode({
  value,
  defaultCollapsed,
  depth,
}: {
  value: any;
  defaultCollapsed: boolean;
  depth: number;
}) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed && depth > 0);

  if (value === null) {
    return <span className="text-text-tertiary">null</span>;
  }

  if (typeof value === "boolean") {
    return <span className="text-accent">{String(value)}</span>;
  }

  if (typeof value === "number") {
    return <span className="text-warning">{value}</span>;
  }

  if (typeof value === "string") {
    return <span className="text-success">&quot;{value}&quot;</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-text-tertiary">{"[]"}</span>;

    if (isCollapsed) {
      return (
        <span>
          <button
            onClick={() => setIsCollapsed(false)}
            className="text-text-tertiary hover:text-text-primary cursor-pointer"
          >
            [{" "}...{value.length} items{" "}]
          </button>
        </span>
      );
    }

    const indent = "  ".repeat(depth + 1);
    const closingIndent = "  ".repeat(depth);

    return (
      <span>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-text-tertiary hover:text-text-primary cursor-pointer"
        >
          {"["}
        </button>
        {"\n"}
        {value.map((item, i) => (
          <span key={i}>
            {indent}
            <JsonNode value={item} defaultCollapsed={defaultCollapsed} depth={depth + 1} />
            {i < value.length - 1 ? "," : ""}
            {"\n"}
          </span>
        ))}
        {closingIndent}
        {"]"}
      </span>
    );
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return <span className="text-text-tertiary">{"{}"}</span>;

    if (isCollapsed) {
      return (
        <span>
          <button
            onClick={() => setIsCollapsed(false)}
            className="text-text-tertiary hover:text-text-primary cursor-pointer"
          >
            {"{ "}...{keys.length} keys{" }"}
          </button>
        </span>
      );
    }

    const indent = "  ".repeat(depth + 1);
    const closingIndent = "  ".repeat(depth);

    return (
      <span>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-text-tertiary hover:text-text-primary cursor-pointer"
        >
          {"{"}
        </button>
        {"\n"}
        {keys.map((key, i) => (
          <span key={key}>
            {indent}
            <span className="text-accent-purple">&quot;{key}&quot;</span>
            <span className="text-text-tertiary">: </span>
            <JsonNode value={value[key]} defaultCollapsed={defaultCollapsed} depth={depth + 1} />
            {i < keys.length - 1 ? "," : ""}
            {"\n"}
          </span>
        ))}
        {closingIndent}
        {"}"}
      </span>
    );
  }

  return <span className="text-text-tertiary">{String(value)}</span>;
}
