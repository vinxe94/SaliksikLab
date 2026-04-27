import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { BookOpen, Upload, Clock, CheckCircle, AlertCircle, XCircle, Activity, ArrowRight, FileText, RefreshCw, Eye, Link2 } from 'lucide-react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Pie } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

const TYPE_LABELS = { thesis: 'Thesis', software: 'Research PDF', sourcecode: 'Research PDF', documentation: 'Docs', other: 'Other' }
const typeColor = { thesis: 'badge-blue', software: 'badge-gray', sourcecode: 'badge-gray', documentation: 'badge-gray', other: 'badge-gray' }

const chartColors = {
  secondary: '#2E7D32',
  danger: '#c62828',
  vibrant: '#FF9800',
}

// Note: All CSS variables are defined in index.css

function timeAgo(iso) {
    if (!iso) return 'Recently'
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
    return `${Math.floor(diff / 604800)} weeks ago`
}

function fileKindLabel(filename = '') {
    return filename.includes('.') ? filename.split('.').pop().toUpperCase() : 'FILE'
}

function archiveStatusBadge(doc) {
    if (doc.is_approved) return <span className="badge badge-green">Approved</span>
    if (doc.is_rejected && doc.revision_comment && !doc.rejection_reason) return <span className="badge badge-yellow">Revision requested</span>
    if (doc.is_rejected) return <span className="badge" style={{ background: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }}>Rejected</span>
    return <span className="badge badge-yellow">Pending review</span>
}

function archiveActivity(doc) {
    if (doc.reviewed_at) {
        return { label: doc.is_approved ? 'Reviewed and approved' : 'Reviewed with feedback', icon: Eye, at: doc.reviewed_at }
    }
    if ((doc.version_count || 1) > 1) {
        return { label: `Version ${doc.current_version || doc.version_count} submitted`, icon: RefreshCw, at: doc.updated_at || doc.uploaded_at }
    }
    return { label: 'New archive uploaded', icon: FileText, at: doc.uploaded_at }
}

export default function DashboardPage() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [stats, setStats] = useState(null)
    const [recent, setRecent] = useState([])
    const [recentArchives, setRecentArchives] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        Promise.all([
            api.get('/repository/stats/'),
            api.get('/repository/?page_size=5'),
            api.get('/repository/archives/?page_size=12'),
        ]).then(([s, rec, archives]) => {
            setStats(s.data)
            setRecent(rec.data.results || [])
            const archiveItems = archives.data.results || archives.data || []
            setRecentArchives(
                archiveItems
                    .slice()
                    .sort((a, b) => new Date(archiveActivity(b).at || b.uploaded_at) - new Date(archiveActivity(a).at || a.uploaded_at))
                    .slice(0, 6)
            )
        }).finally(() => setLoading(false))
    }, [user])

    if (loading) return (
      <div className="layout">
        <Sidebar />
            <div className="main-content">
                <div className="skeleton-loader dashboard-skeleton">
            {/* Stats Cards Skeleton */}
            <div className="stat-grid">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="stat-card">
                  <div className="skeleton-text h-8 w-32" />
                  <div className="skeleton-text h-4 w-24" />
                </div>
              ))}
            </div>
            
            {/* Analytics Charts Skeleton */}
            <div className="dashboard-analytics-grid">
              <div className="card">
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity size={14} color="var(--accent)" /> Recent Archive Activity
                </h3>
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
              </div>
              <div className="card">
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={14} color="var(--accent2)" /> Archive Timeline
                </h3>
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
              </div>
              <div className="card">
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity size={14} color="var(--warning)" /> Review Breakdown
                </h3>
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
              </div>
            </div>
            
            {/* Recent Submissions Skeleton */}
            <div className="dashboard-section-head">
              <h3 style={{ fontSize: '1rem' }}>Recent Submissions</h3>
              <button className="btn btn-ghost btn-sm">View all</button>
            </div>
            <div className="dashboard-table-shell">
              <div className="skeleton-text h-8 w-full" style={{ margin: '12px 0' }} />
              <div className="skeleton-text h-8 w-full" style={{ margin: '12px 0' }} />
              <div className="skeleton-text h-8 w-full" style={{ margin: '12px 0' }} />
              <div className="skeleton-text h-8 w-full" style={{ margin: '12px 0' }} />
              <div className="skeleton-text h-8 w-full" style={{ margin: '12px 0' }} />
            </div>
          </div>
        </div>
      </div>
    )

    const statusSeries = [
        { label: 'Approved', value: stats?.approved ?? 0, color: chartColors.secondary },
        { label: 'Pending', value: stats?.pending ?? 0, color: chartColors.vibrant },
        { label: 'Rejected', value: stats?.rejected ?? 0, color: chartColors.danger },
    ]

    const totalReviewed = statusSeries.reduce((sum, item) => sum + item.value, 0)
    const reviewPieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    boxWidth: 8,
                    padding: 12,
                    font: { size: 11 },
                },
            },
            tooltip: {
                callbacks: {
                    label(context) {
                        const value = context.parsed || 0
                        const percent = totalReviewed ? Math.round((value / totalReviewed) * 100) : 0
                        return `${context.label}: ${value.toLocaleString()} (${percent}%)`
                    },
                },
            },
        },
    }

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div className="dashboard-heading">
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Dashboard</h2>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Welcome back, {user?.first_name}. Here&apos;s your repository snapshot.</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/upload')}>
                        <Upload size={15} /> Upload Output
                    </button>
                </div>
                <div className="page-body dashboard-page">
                    <section className="dashboard-hero">
                        <div className="dashboard-hero-copy">
                            <span className="dashboard-kicker">Repository overview</span>
                            <h3>Track submissions, approvals, and archive activity in one compact workspace.</h3>
                            <p>Everything important stays above the fold so you can review progress faster and jump straight into action.</p>
                        </div>
                        <div className="dashboard-hero-actions">
                            <div className="dashboard-hero-stat">
                                <span>Total records</span>
                                <strong>{stats?.total ?? 0}</strong>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/repository')}>
                                Open Repository <ArrowRight size={14} />
                            </button>
                        </div>
                    </section>

                    {/* Stats Cards */}
                    <div className="stat-grid">
                        <div className="stat-card dashboard-stat-card">
                            <span className="stat-value" style={{ color: 'var(--accent)' }}>{stats?.total ?? 0}</span>
                            <span className="stat-label"><BookOpen size={13} style={{ display: 'inline', marginRight: 4 }} />Total Outputs</span>
                            <span className="dashboard-stat-meta">Repository items currently stored</span>
                        </div>
                        <div className="stat-card dashboard-stat-card">
                            <span className="stat-value" style={{ color: 'var(--accent2)' }}>{stats?.approved ?? 0}</span>
                            <span className="stat-label"><CheckCircle size={13} style={{ display: 'inline', marginRight: 4 }} />Approved</span>
                            <span className="dashboard-stat-meta">Cleared and visible for use</span>
                        </div>
                        <div className="stat-card dashboard-stat-card">
                            <span className="stat-value" style={{ color: 'var(--warning)' }}>{stats?.pending ?? 0}</span>
                            <span className="stat-label"><Clock size={13} style={{ display: 'inline', marginRight: 4 }} />Pending Review</span>
                            <span className="dashboard-stat-meta">Awaiting moderation or validation</span>
                        </div>
                        <div className="stat-card dashboard-stat-card">
                            <span className="stat-value" style={{ color: 'var(--danger)' }}>{stats?.rejected ?? 0}</span>
                            <span className="stat-label"><XCircle size={13} style={{ display: 'inline', marginRight: 4 }} />Rejected</span>
                            <span className="dashboard-stat-meta">Needs revision before approval</span>
                        </div>
                        <div className="stat-card dashboard-stat-card">
                            <span className="stat-value">{stats?.my_uploads ?? 0}</span>
                            <span className="stat-label"><AlertCircle size={13} style={{ display: 'inline', marginRight: 4 }} />My Uploads</span>
                            <span className="dashboard-stat-meta">Outputs submitted from your account</span>
                        </div>
                    </div>

                     {/* Recent archive activity */}
                     {(recentArchives.length > 0 || totalReviewed > 0) && (
                         <section className="dashboard-analytics-grid dashboard-activity-grid">
                             <div className="dashboard-panel dashboard-panel-wide dashboard-panel-animated dashboard-archive-activity-panel">
                                 <div className="dashboard-panel-head">
                                     <div>
                                         <span className="dashboard-panel-kicker">Archive feed</span>
                                         <h3><Activity size={16} /> Recent Archive Activity</h3>
                                     </div>
                                     <button className="btn btn-ghost btn-sm" onClick={() => navigate('/repository')}>
                                         View all <ArrowRight size={14} />
                                     </button>
                                 </div>
                                 <div className="dashboard-archive-activity-list">
                                     {recentArchives.length === 0 && (
                                         <div className="empty-state compact">
                                             <h3>No archive activity yet</h3>
                                             <p>Uploads, reviews, and revised versions will appear here.</p>
                                         </div>
                                     )}
                                     {recentArchives.map((doc) => {
                                         const activity = archiveActivity(doc)
                                         const Icon = activity.icon
                                         return (
                                             <button
                                                 key={doc.id}
                                                 type="button"
                                                 className="dashboard-archive-activity-item"
                                                 onClick={() => navigate(`/archives/${doc.id}`)}
                                             >
                                                 <span className="dashboard-archive-activity-icon">
                                                     <Icon size={16} />
                                                 </span>
                                                 <span className="dashboard-archive-activity-copy">
                                                     <span className="dashboard-archive-activity-line">
                                                         <strong>{activity.label}</strong>
                                                         <span>{timeAgo(activity.at)}</span>
                                                     </span>
                                                     <span className="dashboard-archive-activity-title">{doc.title}</span>
                                                     <span className="repository-preview-meta">
                                                         <span className="language-chip">
                                                             <span className="language-dot" style={{ background: '#6e7781' }} />
                                                             {fileKindLabel(doc.original_filename)}
                                                         </span>
                                                         <span className="feed-meta-item">v{doc.current_version || 1}</span>
                                                         <span className="feed-meta-item">{doc.uploaded_by?.full_name || doc.uploaded_by?.email || 'Researcher'}</span>
                                                         {doc.system_link && <span className="feed-meta-item"><Link2 size={13} /> System linked</span>}
                                                         {archiveStatusBadge(doc)}
                                                     </span>
                                                 </span>
                                             </button>
                                         )
                                     })}
                                 </div>
                             </div>

                             {totalReviewed > 0 && (
                                 <div className="dashboard-panel dashboard-panel-animated dashboard-review-chart-panel">
                                     <div className="dashboard-panel-head">
                                         <div>
                                             <span className="dashboard-panel-kicker">Status</span>
                                             <h3><Activity size={16} /> Review Breakdown</h3>
                                         </div>
                                         <strong className="dashboard-panel-total">{totalReviewed}</strong>
                                     </div>
                                     <div className="dashboard-chart dashboard-chart-pie">
                                         <Pie
                                             data={{
                                                 labels: statusSeries.map((item) => item.label),
                                                 datasets: [{
                                                     data: statusSeries.map((item) => item.value),
                                                     backgroundColor: statusSeries.map((item) => item.color),
                                                     borderColor: '#f7faf7',
                                                     borderWidth: 2,
                                                 }],
                                             }}
                                             options={reviewPieOptions}
                                         />
                                     </div>
                                 </div>
                             )}
                         </section>
                     )}

<div className="dashboard-section-head">
                        <h3 style={{ fontSize: '1rem' }}>Recent Submissions</h3>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/repository')}>View all</button>
                    </div>

                    <div className="dashboard-table-shell">
                        <table className="table dashboard-table">
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Type</th>
                                    <th>Author</th>
                                    <th>Year</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recent.length === 0 && (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>No submissions yet.</td></tr>
                                )}
                                {recent.map(item => (
                                    <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/repository')}>
                                        <td style={{ fontWeight: 600, maxWidth: 280 }} className="truncate">{item.title}</td>
                                        <td><span className={`badge ${typeColor[item.output_type]}`}>{TYPE_LABELS[item.output_type]}</span></td>
                                        <td className="text-muted text-sm">{item.author}</td>
                                        <td className="text-muted text-sm">{item.year}</td>
                                        <td>
                                            {item.is_approved
                                                ? <span className="badge badge-green">Approved</span>
                                                : item.is_rejected
                                                    ? <span className="badge" style={{ background: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }}>Rejected</span>
                                                    : <span className="badge badge-yellow">Pending</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
