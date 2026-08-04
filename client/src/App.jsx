import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'
import { streamChat } from './lib/chatStream'
import './App.css'

const starterMessages = [
  { id: 1, role: 'assistant', text: 'Hello! I am your simple chat companion. Ask me anything.' },
]

// `node` is destructured out so react-markdown's AST node never reaches the DOM.
const CodeBlock = ({ node: _node, inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '')
  const hasLanguage = !!match
  const language = match ? match[1] : 'javascript'
  const code = String(children).replace(/\n$/, '')

  // If inline or no language class, render as inline code
  if (inline || !hasLanguage) {
    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    )
  }

  // Render as highlighted code block
  let highlightedCode = code
  try {
    highlightedCode = hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    highlightedCode = code
  }

  return (
    <div className="code-block-container">
      <div className="code-block-header">{language}</div>
      <pre className="code-block">
        <code
          className={`hljs language-${language}`}
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
    </div>
  )
}

const MarkdownComponents = {
  code: CodeBlock,
  h1: ({ children }) => <h2 className="md-heading md-h1">{children}</h2>,
  h2: ({ children }) => <h3 className="md-heading md-h2">{children}</h3>,
  h3: ({ children }) => <h4 className="md-heading md-h3">{children}</h4>,
  h4: ({ children }) => <h5 className="md-heading md-h4">{children}</h5>,
  h5: ({ children }) => <h6 className="md-heading md-h5">{children}</h6>,
  h6: ({ children }) => <h6 className="md-heading md-h6">{children}</h6>,
  hr: () => <hr className="md-hr" />,
  p: ({ children }) => <p className="md-paragraph">{children}</p>,
  ul: ({ children }) => <ul className="md-list">{children}</ul>,
  ol: ({ children }) => <ol className="md-list md-ordered">{children}</ol>,
  li: ({ children }) => <li className="md-list-item">{children}</li>,
  blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="md-link">{children}</a>,
  strong: ({ children }) => <strong className="md-strong">{children}</strong>,
  em: ({ children }) => <em className="md-em">{children}</em>,
  table: ({ children }) => <table className="md-table">{children}</table>,
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,
}

function App() {
  const [messages, setMessages] = useState(starterMessages)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef(null)
  const messagesContainerRef = useRef(null)

  useEffect(() => {
    if (!inputRef.current) {
      return
    }

    inputRef.current.focus()
  }, [messages, isLoading])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) {
      return
    }

    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight
    })
  }, [messages, isLoading])

  const handleSubmit = async (event) => {
    event.preventDefault()

    const trimmedInput = input.trim()
    if (!trimmedInput || isLoading) {
      return
    }

    const userMessage = {
      id: Date.now(),
      role: 'user',
      text: trimmedInput,
    }

    const assistantMessageId = Date.now() + 1
    const assistantMessage = {
      id: assistantMessageId,
      role: 'assistant',
      text: '',
    }

    setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage])
    setInput('')
    setIsLoading(true)

    const history = messages
      .concat(userMessage)
      .map((entry) => ({ role: entry.role, content: entry.text }))

    const updateAssistant = (text) => {
      setMessages((currentMessages) =>
        currentMessages.map((msg) =>
          msg.id === assistantMessageId ? { ...msg, text } : msg
        )
      )
    }

    const { text, error } = await streamChat({
      message: trimmedInput,
      history,
      onDelta: updateAssistant,
    })

    if (error) {
      // Keep whatever streamed in before the failure so a mid-stream error
      // does not wipe out a partial answer.
      const notice = `⚠️ ${error}`
      updateAssistant(text ? `${text}\n\n${notice}` : notice)
    }

    setIsLoading(false)
  }

  return (
    <main className="app-shell">
      <section className="chat-card">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Demo chat</p>
            <h1>Simple Chat App</h1>
          </div>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              setMessages(starterMessages)
              setInput('')
            }}
          >
            Clear
          </button>
        </header>

        <div className="messages" ref={messagesContainerRef} aria-live="polite">
          {messages.map((message) => (
            <div key={message.id} className={`bubble ${message.role}`}>
              {message.role === 'assistant' ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={MarkdownComponents}
                >
                  {message.text}
                </ReactMarkdown>
              ) : (
                <span>{message.text}</span>
              )}
            </div>
          ))}
          {isLoading && !messages[messages.length - 1]?.text ? (
            <div className="bubble assistant loading">Thinking…</div>
          ) : null}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type a message..."
            aria-label="Message input"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading}>
            Send
          </button>
        </form>
      </section>
    </main>
  )
}

export default App
