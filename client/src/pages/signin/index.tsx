import { useEffect, useRef, useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from '../../hooks/useAuthStore'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export default function SignInPage() {
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle)
  const cancelUpgrade = useAuthStore((state) => state.cancelUpgrade)
  const user = useAuthStore((state) => state.user)
  const error = useAuthStore((state) => state.error)

  // Only a guest who has already sent something has chats to carry over;
  // someone who came straight here is simply signing in.
  const hasChatsToKeep = user !== null
  const heading = hasChatsToKeep ? 'Save your chats' : 'Welcome'
  const subheading = hasChatsToKeep
    ? 'Sign in and your existing chats come with you.'
    : 'Sign in to start chatting'

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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-black px-5 py-10">
      <div ref={columnRef} className="flex w-full max-w-xs flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-medium tracking-tight text-zinc-100">{heading}</h1>
          <p className="text-[15px] leading-6 text-zinc-400">{subheading}</p>
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

          {/* This page is only ever reached from the chat, so the way out of it
              is back to the chat. Being a guest is no longer a choice to offer. */}
          <button
            type="button"
            onClick={cancelUpgrade}
            className="w-full rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
          >
            Back to chat
          </button>
        </div>

        {error && (
          <p role="alert" className="text-center text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
