import type { ComponentPropsWithoutRef } from "react";

function heading(Tag: "h1" | "h2" | "h3") {
  return function Heading(props: ComponentPropsWithoutRef<"h1">) {
    const { id, children, ...rest } = props;
    const sizes = {
      h1: "text-3xl font-bold mt-0 mb-6",
      h2: "text-xl font-semibold mt-10 mb-4",
      h3: "text-lg font-medium mt-8 mb-3",
    };
    return (
      <Tag id={id} className={`group scroll-mt-20 ${sizes[Tag]}`} {...rest}>
        {children}
        {id && (
          <a
            href={`#${id}`}
            className="ml-2 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
            aria-label={`Link to ${typeof children === "string" ? children : "section"}`}
          >
            #
          </a>
        )}
      </Tag>
    );
  };
}

function Pre(props: ComponentPropsWithoutRef<"pre">) {
  return (
    <pre
      className="code-block overflow-x-auto p-4 my-4 text-sm leading-relaxed"
      {...props}
    />
  );
}

function Code(props: ComponentPropsWithoutRef<"code">) {
  const isBlock =
    props.className?.includes("language-") ||
    (props as Record<string, unknown>)["data-language"];
  if (isBlock) return <code {...props} />;
  return (
    <code
      className="rounded bg-bg-tertiary px-1.5 py-0.5 font-mono text-[0.875em]"
      {...props}
    />
  );
}

function Table(props: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full text-sm" {...props} />
    </div>
  );
}

function Thead(props: ComponentPropsWithoutRef<"thead">) {
  return <thead className="border-b border-border-default" {...props} />;
}

function Th(props: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      className="px-3 py-2 text-left font-medium text-text-secondary"
      {...props}
    />
  );
}

function Td(props: ComponentPropsWithoutRef<"td">) {
  return (
    <td
      className="border-b border-border-default px-3 py-2 text-text-primary"
      {...props}
    />
  );
}

function Anchor(props: ComponentPropsWithoutRef<"a">) {
  return (
    <a className="text-accent hover:underline" {...props} />
  );
}

function Blockquote(props: ComponentPropsWithoutRef<"blockquote">) {
  return (
    <blockquote
      className="my-4 border-l-4 border-accent bg-bg-tertiary py-3 pl-4 pr-3 text-text-secondary [&>p]:m-0"
      {...props}
    />
  );
}

function Paragraph(props: ComponentPropsWithoutRef<"p">) {
  return <p className="my-3 leading-relaxed" {...props} />;
}

function Hr() {
  return <hr className="my-8 border-border-default" />;
}

function Ul(props: ComponentPropsWithoutRef<"ul">) {
  return <ul className="my-3 list-disc pl-6 space-y-1" {...props} />;
}

function Ol(props: ComponentPropsWithoutRef<"ol">) {
  return <ol className="my-3 list-decimal pl-6 space-y-1" {...props} />;
}

function Li(props: ComponentPropsWithoutRef<"li">) {
  return <li className="leading-relaxed" {...props} />;
}

function Strong(props: ComponentPropsWithoutRef<"strong">) {
  return <strong className="font-semibold" {...props} />;
}

export const mdxComponents = {
  h1: heading("h1"),
  h2: heading("h2"),
  h3: heading("h3"),
  pre: Pre,
  code: Code,
  table: Table,
  thead: Thead,
  th: Th,
  td: Td,
  a: Anchor,
  blockquote: Blockquote,
  p: Paragraph,
  hr: Hr,
  ul: Ul,
  ol: Ol,
  li: Li,
  strong: Strong,
};
