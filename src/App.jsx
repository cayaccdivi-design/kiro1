import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader, Sparkles } from 'lucide-react'
import Layout from './components/layout/Layout'
import { useAuthStore } from './store/useAuthStore'

// ── Eagerly bundled (small, hit on every navigation) ────────────────────
import Dashboard from './pages/Dashboard'
import AuthPage from './pages/AuthPage'
import ShopPage from './pages/ShopPage'
import GiftPage from './pages/GiftPage'
import ResourcesPage from './pages/ResourcesPage'
import IntroPage from './pages/IntroPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import SourcePage from './pages/SourcePage'
import DownloadsPage from './pages/DownloadsPage'
import TopupPage from './pages/TopupPage'

// ── Code-split (heavy / rarely visited) ─────────────────────────────────
// Each chunk gets its own JS bundle so the initial page load stays small.
// Wrapped in Suspense below.
const RemoveBgPage          = lazy(() => import('./pages/RemoveBgPage'))
const PsdEditorPage         = lazy(() => import('./pages/PsdEditorPage'))
const CollagePage           = lazy(() => import('./pages/CollagePage'))
const ComposerPage          = lazy(() => import('./pages/ComposerPage'))
const AdminComposerPage     = lazy(() => import('./pages/AdminComposerPage'))
const CustomerEditorPage    = lazy(() => import('./pages/CustomerEditorPage'))
const PhotopeaAdminPage     = lazy(() => import('./pages/PhotopeaAdminPage'))
const PhotopeaCustomerPage  = lazy(() => import('./pages/PhotopeaCustomerPage'))

function ProtectedRoute({ children }) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/auth" replace />
  return children
}

/* Lightweight branded fallback shown while a chunk is loading. */
function PageFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(110,75,255,0.18), rgba(77,208,255,0.12))',
            border: '1px solid rgba(110,75,255,0.3)',
          }}>
          <Sparkles size={24} className="text-brand-300" />
        </div>
        <Loader size={14} className="absolute -bottom-1 -right-1 text-brand-400 animate-spin" />
      </div>
      <p className="text-sm text-white/45">Đang tải trang…</p>
    </div>
  )
}

const lazy_ = (Component) => (
  <Suspense fallback={<PageFallback />}>
    <Component />
  </Suspense>
)

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/gift" element={<GiftPage />} />
        <Route path="/remove-bg" element={lazy_(RemoveBgPage)} />
        <Route path="/psd-editor" element={<ProtectedRoute>{lazy_(PsdEditorPage)}</ProtectedRoute>} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/collage" element={<ProtectedRoute>{lazy_(CollagePage)}</ProtectedRoute>} />
        <Route path="/topup" element={<ProtectedRoute><TopupPage /></ProtectedRoute>} />
        <Route path="/intro" element={<IntroPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/source" element={<SourcePage />} />
        <Route path="/downloads" element={<ProtectedRoute><DownloadsPage /></ProtectedRoute>} />
        <Route path="/composer" element={<ProtectedRoute>{lazy_(ComposerPage)}</ProtectedRoute>} />
        <Route path="/admin/composer" element={<ProtectedRoute>{lazy_(AdminComposerPage)}</ProtectedRoute>} />
        <Route path="/admin/photopea" element={<ProtectedRoute>{lazy_(PhotopeaAdminPage)}</ProtectedRoute>} />
      </Route>
      <Route path="/editor/:productId" element={<ProtectedRoute>{lazy_(CustomerEditorPage)}</ProtectedRoute>} />
      <Route path="/photopea/:productId" element={<ProtectedRoute>{lazy_(PhotopeaCustomerPage)}</ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
