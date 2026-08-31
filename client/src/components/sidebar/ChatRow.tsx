import { Trash2 } from 'lucide-react'

export type ChatRowProps = {
  title: string
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}

export default function ChatRow({ title, isActive, onSelect, onDelete }: ChatRowProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? 'page' : undefined}
        className={`w-full truncate rounded-lg py-2 pr-9 pl-3 text-left text-sm transition-colors duration-150 ${isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/70'}`}
      >
        {title}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        aria-label={`Delete "${title}"`}
        className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 opacity-0 transition-all duration-150 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
