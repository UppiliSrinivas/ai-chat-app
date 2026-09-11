import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import ChatPage from './pages/chat'
import Loader from './components/loader/Loader'
import SignInPage from './pages/signin'
import { useAuthStore } from './hooks/useAuthStore'
import { useChatStore } from './hooks/useChatStore'
import { useProjectStore } from './hooks/useProjectStore'

export default function App() {
  const status = useAuthStore((state) => state.status)
  const isUpgrading = useAuthStore((state) => state.isUpgrading)
  const checkSession = useAuthStore((state) => state.checkSession)

  useEffect(() => {
    checkSession()
  }, [checkSession])

  // Clears any in-memory chat list/messages from a previous session so the
  // next person to sign in on this browser never sees them.
  useEffect(() => {
    if (status === 'signedOut') {
      useChatStore.getState().reset()
      useProjectStore.getState().reset()
    }
  }, [status])

  // Neither page renders until the cookie probe resolves, so a signed-in user
  // never sees the sign-in screen flash before the redirect. A loader rather
  // than an empty screen, which on a slow connection reads as broken.
  if (status === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-black">
        <Loader label="Checking your session" />
      </div>
    )
  }

  // Sign-in is only ever reached deliberately now: someone with no session
  // gets the chat, and their guest account is created on the first message. A
  // guest mid-upgrade keeps that cookie, which is what lets the server link
  // the new identity to their existing chats.
  if (isUpgrading) return <SignInPage />

  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<ChatPage />} />
      </Routes>
    </BrowserRouter>
  )
}
