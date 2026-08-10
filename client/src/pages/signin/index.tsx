import { useEffect, useRef, useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '../../hooks/useAuthStore'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export default function SignInPage() {
  const signInAsGuest = useAuthStore((state) => state.signInAsGuest)
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle)
  const isSubmitting = useAuthStore((state) => state.isSubmitting)
  const error = useAuthStore((state) => state.error)

  // Google renders its button in an iframe with a pixel width, so it can't
  // inherit a percentage — measure the column and pass the number through.
  const columnRef = useRef<HTMLDivElement>(null)
  const [buttonWidth, setButtonWidth] = useState(320)

  useEffect(() => {
    const column = columnRef.current
    if (!column) return

    const observer = new ResizeObserver(([entry]) => {
      setButtonWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(column)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-black px-5 py-10">
      <div ref={columnRef} className="flex w-full max-w-xs flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-medium tracking-tight text-zinc-100">Welcome</h1>
          <p className="text-[15px] leading-6 text-zinc-400">Sign in to start chatting</p>
        </div>

        <div className="flex w-full flex-col gap-4">
          {GOOGLE_CLIENT_ID && (
            <>
              <div className="flex justify-center [color-scheme:light]">
                <GoogleLogin
                  onSuccess={(response) => {
                    if (response.credential) signInWithGoogle(response.credential)
                  }}
                  onError={() => undefined}
                  theme="filled_black"
                  shape="pill"
                  size="large"
                  text="continue_with"
                  width={buttonWidth}
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-zinc-800" />
                <span className="text-xs text-zinc-500">or</span>
                <span className="h-px flex-1 bg-zinc-800" />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={signInAsGuest}
            disabled={isSubmitting}
            className="w-full rounded-full border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Signing in…' : 'Continue as guest'}
          </button>
        </div>

        {error && (
          <p role="alert" className="text-center text-sm text-red-400">
            {error}
          </p>
        )}

        <p className="text-center text-xs leading-5 text-zinc-500">
          Guest chats stay on this browser until you sign in with Google.
        </p>
      </div>
    </div>
  )
}
