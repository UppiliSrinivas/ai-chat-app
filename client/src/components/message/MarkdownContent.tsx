import { useState } from 'react'
import type { ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { highlightCode } from '../../lib/highlight'
import 'highlight.js/styles/github-dark.css'

type MarkdownContentProps = {
  content: string
}

const COPIED_RESET_DELAY_MS = 1500

function CodeBlock({ className, children }: ComponentProps<'code'>) {
  const [copied, setCopied] = useState(false)
  const code = String(children).replace(/\n$/, '')
  const language = /language-(\w+)/.exec(className ?? '')?.[1]
  const isBlock = code.includes('\n') || language !== undefined

  if (!isBlock) {
    return (
      <code className="rounded bg-zinc-700 px-1.5 py-0.5 text-[13px] text-zinc-100">
        {code}
      </code>
    )
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_RESET_DELAY_MS)
  }

  return (
    <div className="group/code relative my-2">
      <pre className="overflow-x-auto rounded-xl bg-zinc-900 p-3 text-[13px] leading-6">
        <code
          className={`hljs language-${language ?? 'plaintext'}`}
          dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
        />
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy code"
        className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 opacity-0 transition-opacity group-hover/code:opacity-100 hover:bg-zinc-800 hover:text-zinc-100"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  )
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="prose prose-invert max-w-none break-words text-[15px] leading-6 prose-p:my-2 prose-pre:bg-transparent prose-pre:p-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
