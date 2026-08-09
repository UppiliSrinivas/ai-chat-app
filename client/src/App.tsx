import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import ChatPage from './pages/chat'
import { useChatStore } from './hooks/useChatStore'

export default function App() {
  const initSession = useChatStore((state) => state.initSession)

  // Warms the guest session as early as possible; ensureChatId falls back
  // to the same call on first send if this hasn't resolved yet.
  useEffect(() => {
    initSession()
  }, [initSession])

  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<ChatPage />} />
      </Routes>
    </BrowserRouter>
  )
}
