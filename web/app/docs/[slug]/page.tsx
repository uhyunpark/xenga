import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { mdxComponents } from "@/components/docs/mdx-components";

const DOCS = [
  "quickstart",
  "sdk-reference",
  "api-reference",
  "agent-guide",
  "seller-guide",
  "deployment",
  "erc-8004-comparison",
] as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS.map((slug) => ({ slug }));
}

function getDocPath(slug: string) {
  return path.resolve(process.cwd(), "..", "docs", `${slug}.md`);
}

function readDoc(slug: string) {
  const filePath = getDocPath(slug);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const content = readDoc(slug);
  if (!content) return { title: "Not Found — Xenga" };

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : slug;
  return { title: `${title} — Xenga` };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const content = readDoc(slug);
  if (!content) notFound();

  return (
    <div className="docs-content">
      <MDXRemote
        source={content}
        components={mdxComponents}
        options={{
          mdxOptions: {
            format: "md",
            remarkPlugins: [remarkGfm],
            rehypePlugins: [
              rehypeSlug,
              [
                rehypePrettyCode,
                {
                  theme: "github-light",
                  keepBackground: false,
                },
              ],
            ],
          },
        }}
      />
    </div>
  );
}
