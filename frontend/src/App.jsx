import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LanguageProvider } from './contexts/LanguageContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import RepositoryPage from './pages/RepositoryPage'
import UploadPage from './pages/UploadPage'
import ArchiveDetailPage from './pages/ArchiveDetailPage'
import ArchivePdfViewerPage from './pages/ArchivePdfViewerPage'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ReportGenerationPage from './pages/ReportGenerationPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SubmissionRequestPage from './pages/SubmissionRequestPage'
import PropTypes from 'prop-types'

function RouteEffects() {
  const { pathname } = useLocation()
  useEffect(() => {
    const pageNames = {
      '/login': 'Sign in', '/register': 'Create account', '/forgot-password': 'Reset your password',
      '/reset-password': 'Choose a new password', '/dashboard': 'Dashboard', '/repository': 'Research library',
      '/upload': 'Research submission', '/admin': 'Management', '/profile': 'Your profile',
      '/reports': 'Reports', '/analytics': 'Analytics',
    }
    const title = pageNames[pathname] || (pathname.startsWith('/archives/') ? 'Research archive' : 'Upload request')
    document.title = `${title} · Tukiva`
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spinner" style={{ marginTop: 120 }} />
  return user ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spinner" style={{ marginTop: 120 }} />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spinner" style={{ marginTop: 120 }} />
  return user ? <Navigate to="/dashboard" replace /> : children
}
GuestRoute.propTypes = { children: PropTypes.node }
PrivateRoute.propTypes = { children: PropTypes.node }
AdminRoute.propTypes = { children: PropTypes.node }

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <RouteEffects />
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: '#ffffff', color: '#20372e', border: '1px solid #dfe6df', borderRadius: '12px', boxShadow: '0 8px 32px #173e3318', fontSize: '13px', padding: '13px 16px', maxWidth: 'min(380px, calc(100vw - 32px))' },
              success: { iconTheme: { primary: '#286a50', secondary: '#ffffff' } },
              error: { iconTheme: { primary: '#b83d3d', secondary: '#ffffff' } },
            }}
          />
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
            <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
            <Route path="/reset-password" element={<GuestRoute><ResetPasswordPage /></GuestRoute>} />
            <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
            <Route path="/repository" element={<PrivateRoute><RepositoryPage /></PrivateRoute>} />
            <Route path="/repository/:id" element={<PrivateRoute><Navigate to="/repository" replace /></PrivateRoute>} />
            <Route path="/archives/:id" element={<PrivateRoute><ArchiveDetailPage /></PrivateRoute>} />
            <Route path="/archives/:id/view" element={<PrivateRoute><ArchivePdfViewerPage /></PrivateRoute>} />
            <Route path="/upload" element={<PrivateRoute><UploadPage /></PrivateRoute>} />
            <Route path="/submission-requests/:id" element={<PrivateRoute><SubmissionRequestPage /></PrivateRoute>} />
            <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
            <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
            <Route path="/reports" element={<AdminRoute><ReportGenerationPage /></AdminRoute>} />
            <Route path="/analytics" element={<AdminRoute><AnalyticsPage /></AdminRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  )
}
