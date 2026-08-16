import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import ChatPage from './pages/chat'
import SignInPage from './pages/signin'
import { useAuthStore } from './hooks/useAuthStore'
import { useChatStore } from './hooks/useChatStore'

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
    if (status === 'signedOut') useChatStore.getState().reset()
  }, [status])

  // Render nothing until the cookie probe resolves, so a signed-in user
  // never sees the sign-in page flash before the redirect.
  if (status === 'checking') return <div className="min-h-svh bg-black" />

  // A guest mid-upgrade still holds a valid session, so this is deliberately
  // not a signed-out check — the cookie must survive for the server to link
  // the new identity to their existing chats.
  if (status === 'signedOut' || isUpgrading) return <SignInPage />

  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<ChatPage />} />
      </Routes>
    </BrowserRouter>
  )
}
