"use client";

import { useState, useMemo } from "react";
import { useInspector } from "@/lib/protocol-inspector/context";
import { useAutoScroll } from "@/lib/protocol-inspector/useAutoScroll";
import { Badge } from "@/components/ui/Badge";
import { JsonViewer } from "@/components/ui/JsonViewer";
import { decodeBase64 } from "@/lib/utils";

export function HttpTrafficTab() {
  const { events } = useInspector();

  const httpEvents = useMemo(
    () => events.filter((e) => e.type === "http_request" || e.type === "http_response"),
    [events]
  );

  // Group into request/response pairs
  const pairs = useMemo(() => {
    const result: { request?: (typeof httpEvents)[0]; response?: (typeof httpEvents)[0] }[] = [];
    let current: (typeof result)[0] = {};

    for (const event of httpEvents) {
      if (event.type === "http_request") {
        if (current.request) {
          result.push(current);
          current = {};
        }
        current.request = event;
      } else {
        current.response = event;
        result.push(current);
        current = {};
      }
    }
    if (current.request) result.push(current);
    return result;
  }, [httpEvents]);

  const scrollRef = useAutoScroll(httpEvents.length);

  if (pairs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        No HTTP traffic yet. Make a purchase to see the x402 flow.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="space-y-3 overflow-y-auto max-h-full p-1">
      {pairs.map((pair, idx) => (
        <HttpPair key={idx} pair={pair} index={idx} />
      ))}
    </div>
  );
}

function HttpPair({
  pair,
  index,
}: {
  pair: { request?: any; response?: any };
  index: number;
}) {
  return (
    <div className="rounded-xl border border-border-default overflow-hidden animate-inspector-flash">
      {pair.request && <RequestBlock event={pair.request} index={index} />}
      {pair.response && <ResponseBlock event={pair.response} />}
    </div>
  );
}

function RequestBlock({ event, index }: { event: any; index: number }) {
  const { data } = event;
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 bg-accent/10 border-b border-border-default">
        <span className="text-xs font-semibold text-accent">REQUEST #{index + 1}</span>
        <span className="font-mono text-xs text-text-secondary">
          {data.method} {data.url}
        </span>
      </div>
      <div className="p-3 space-y-2">
        {data.headers && (
          <HeadersSection headers={data.headers} label="Headers" />
        )}
        {data.body && (
          <div>
            <span className="text-xs text-text-tertiary">Body</span>
            <JsonViewer data={data.body} collapsed />
          </div>
        )}
      </div>
    </div>
  );
}

function ResponseBlock({ event }: { event: any }) {
  const { data } = event;
  const status = data.status as number;
  const is402 = status === 402;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 border-b border-border-default ${
          is402 ? "bg-warning/10" : "bg-success/10"
        }`}
      >
        <span
          className={`text-xs font-semibold ${is402 ? "text-warning" : "text-success"}`}
        >
          RESPONSE
        </span>
        <Badge variant={is402 ? "warning" : "success"}>{status}</Badge>
      </div>
      <div className="p-3 space-y-2">
        {data.headers && (
          <HeadersSection headers={data.headers} label="Headers" />
        )}
        {data.body && (
          <div>
            <span className="text-xs text-text-tertiary">Body</span>
            <JsonViewer data={data.body} collapsed />
          </div>
        )}
      </div>
    </div>
  );
}

function HeadersSection({
  headers,
  label,
}: {
  headers: Record<string, string>;
  label: string;
}) {
  const [decodeMap, setDecodeMap] = useState<Record<string, boolean>>({});

  const base64Keys = Object.keys(headers).filter((k) => {
    const lower = k.toLowerCase();
    return lower === "x-payment" || lower === "x-payment-required" || lower === "x-payment-response";
  });

  const toggleDecode = (key: string) => {
    setDecodeMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div>
      <span className="text-xs text-text-tertiary">{label}</span>
      <div className="mt-1 space-y-1">
        {Object.entries(headers).map(([key, value]) => {
          const isBase64 = base64Keys.includes(key);
          const showDecoded = decodeMap[key];

          let decoded: any = null;
          if (isBase64 && showDecoded) {
            try {
              decoded = JSON.parse(decodeBase64(value));
            } catch {
              decoded = null;
            }
          }

          return (
            <div key={key} className="text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-accent-purple">{key}:</span>
                {isBase64 ? (
                  <button
                    onClick={() => toggleDecode(key)}
                    className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary hover:text-text-primary border border-border-default transition-colors cursor-pointer"
                  >
                    {showDecoded ? "Raw" : "Decoded"}
                  </button>
                ) : null}
              </div>
              {isBase64 && showDecoded && decoded ? (
                <JsonViewer data={decoded} className="mt-1" collapsed />
              ) : (
                <span className="font-mono text-text-secondary break-all">{value}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
