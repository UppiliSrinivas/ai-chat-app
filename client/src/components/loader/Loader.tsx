export type LoaderProps = {
  /** What is being waited on — this is what assistive tech announces. */
  label?: string
}

export default function Loader({ label = 'Loading' }: LoaderProps) {
  return (
    <div role="status" aria-label={label} className="flex items-center justify-center">
      <span
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300"
      />
    </div>
  )
}
