'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
export default function Markdown({ children }: { children: string }) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ a: props => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{children}</ReactMarkdown></div>;
}
