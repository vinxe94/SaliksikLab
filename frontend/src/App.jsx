import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import CodePlaygroundPage from './pages/CodePlaygroundPage'
import CollaborationPage from './pages/CollaborationPage'
import ReportGenerationPage from './pages/ReportGenerationPage'
import AnalyticsPage from './pages/AnalyticsPage'
import PropTypes from 'prop-types'

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
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: '#21262d', color: '#e6edf3', border: '1px solid #30363d' },
              success: { style: { borderLeft: '3px solid #2ea86c' } },
              error: { style: { borderLeft: '3px solid #f85149' } },
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
            <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
            <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
            <Route path="/code-lab" element={<PrivateRoute><CodePlaygroundPage /></PrivateRoute>} />
            <Route path="/collaborate" element={<PrivateRoute><CollaborationPage /></PrivateRoute>} />
            <Route path="/reports" element={<AdminRoute><ReportGenerationPage /></AdminRoute>} />
            <Route path="/analytics" element={<AdminRoute><AnalyticsPage /></AdminRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  )
}
