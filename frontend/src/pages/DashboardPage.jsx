import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { BookOpen, Upload, Clock, CheckCircle, AlertCircle, XCircle, BarChart2, PieChart, Activity, ArrowRight } from 'lucide-react'
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
import { Pie, Bar } from 'react-chartjs-2'

// Register Chart.js components
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const TYPE_LABELS = { thesis: 'Thesis', software: 'Research PDF', sourcecode: 'Research PDF', documentation: 'Docs', other: 'Other' }
const typeColor = { thesis: 'badge-blue', software: 'badge-gray', sourcecode: 'badge-gray', documentation: 'badge-gray', other: 'badge-gray' }

// Enhanced chart color palette with better contrast and vibrancy
const chartColors = {
  primary: '#1B5E20',      // Dark green (var(--accent))
  secondary: '#2E7D32',    // Medium green (var(--accent2))
  success: '#4CAF50',      // Green (var(--success))
  danger: '#c62828',       // Red (var(--danger))
  warning: '#e65100',      // Orange (var(--warning))
  info: '#2196F3',         // Blue (var(--info))
  vibrant: '#FF9800',      // Orange (additional vibrant color)
  purple: '#9C27B0',       // Purple (additional color for diversity)
  pink: '#E91E63',         // Pink (additional color)
  teal: '#009688',         // Teal (additional color)
  // High contrast colors for pie chart
  highContrast1: '#FF5252', // Bright red
  highContrast2: '#536DFE', // Bright blue
  highContrast3: '#FFD740', // Bright yellow
  highContrast4: '#FFAB40', // Amber
  highContrast5: '#FF4081', // Pink
  highContrast6: '#40C4FF', // Cyan
  highContrast7: '#7C4DFF', // Violet
  highContrast8: '#00E676', // Green
  highContrast9: '#FF5722'  // Deep orange
}

// Note: All CSS variables are defined in index.css

export default function DashboardPage() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [stats, setStats] = useState(null)
    const [recent, setRecent] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        Promise.all([
            api.get('/repository/stats/'),
            api.get('/repository/?page_size=5'),
        ]).then(([s, rec]) => {
            setStats(s.data)
            setRecent(rec.data.results || [])
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
                  <BarChart2 size={14} color="var(--accent)" /> By Output Type
                </h3>
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
                <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
              </div>
              <div className="card">
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BarChart2 size={14} color="var(--accent2)" /> By Department (Top 8)
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

    const compactPieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            animateRotate: true,
            animateScale: true,
            duration: 1100,
            easing: 'easeOutQuart',
            delay(context) {
                return context.type === 'data' ? context.dataIndex * 90 : 0
            }
        },
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    boxWidth: 8,
                    padding: 12,
                    font: { size: 11 }
                }
            },
            tooltip: {
                enabled: true,
                callbacks: {
                    label(context) {
                        return `${context.label}: ${context.parsed.toLocaleString()}`
                    }
                }
            }
        }
    }

    const compactBarOptions = {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        animation: {
            duration: 950,
            easing: 'easeOutQuart',
            delay(context) {
                return context.type === 'data' ? context.dataIndex * 70 : 0
            }
        },
        scales: {
            x: {
                beginAtZero: true,
                grid: { color: 'rgba(27, 94, 32, 0.08)' },
                ticks: { precision: 0, font: { size: 11 } }
            },
            y: {
                grid: { display: false },
                ticks: { font: { size: 11 } }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label(context) {
                        return `${context.parsed.x.toLocaleString()} outputs`
                    }
                }
            }
        }
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
                            <h3>Track submissions, approvals, and department activity in one compact workspace.</h3>
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

                     {/* Analytics charts */}
                     {(stats?.by_type?.length > 0 || stats?.by_dept?.length > 0 || totalReviewed > 0) && (
                         <section className="dashboard-analytics-grid">
                             {stats?.by_type?.length > 0 && (
                                 <div className="dashboard-panel dashboard-panel-animated">
                                     <div className="dashboard-panel-head">
                                         <div>
                                             <span className="dashboard-panel-kicker">Mix</span>
                                             <h3><PieChart size={16} /> Output Types</h3>
                                         </div>
                                     </div>
                                     <div className="dashboard-chart dashboard-chart-pie">
                                         <Pie
                                             data={{
                                                 labels: stats.by_type.map(t => TYPE_LABELS[t.output_type] || t.output_type),
                                                 datasets: [{
                                                     data: stats.by_type.map(t => t.count),
                                                     backgroundColor: [
                                                         chartColors.highContrast1,
                                                         chartColors.highContrast2,
                                                         chartColors.highContrast3,
                                                         chartColors.highContrast4,
                                                         chartColors.highContrast5,
                                                         chartColors.highContrast6,
                                                         chartColors.highContrast7,
                                                         chartColors.highContrast8,
                                                         chartColors.highContrast9
                                                     ].slice(0, stats.by_type.length),
                                                     borderWidth: 2,
                                                     borderColor: '#f0f0f0'
                                                 }]
                                             }}
                                             options={compactPieOptions}
                                         />
                                     </div>
                                 </div>
                             )}

                             {stats?.by_dept?.length > 0 && (
                                 <div className="dashboard-panel dashboard-panel-wide dashboard-panel-animated">
                                     <div className="dashboard-panel-head">
                                         <div>
                                             <span className="dashboard-panel-kicker">Activity</span>
                                             <h3><BarChart2 size={16} /> Top Departments</h3>
                                         </div>
                                     </div>
                                     <div className="dashboard-chart dashboard-chart-bar">
                                         <Bar
                                             data={{
                                                 labels: stats.by_dept.slice(0, 6).map(d => d.department || 'Unknown'),
                                                 datasets: [{
                                                     data: stats.by_dept.slice(0, 6).map(d => d.count),
                                                     backgroundColor: chartColors.vibrant,
                                                     borderColor: chartColors.primary,
                                                     borderWidth: 1,
                                                     borderRadius: 6
                                                 }]
                                             }}
                                             options={compactBarOptions}
                                         />
                                     </div>
                                 </div>
                             )}

                             {totalReviewed > 0 && (
                                 <div className="dashboard-panel dashboard-panel-animated">
                                     <div className="dashboard-panel-head">
                                         <div>
                                             <span className="dashboard-panel-kicker">Status</span>
                                             <h3><Activity size={16} /> Review Breakdown</h3>
                                         </div>
                                         <strong className="dashboard-panel-total">{totalReviewed}</strong>
                                     </div>
                                     <div className="dashboard-status-list">
                                         {statusSeries.map((item) => {
                                             const width = totalReviewed ? `${(item.value / totalReviewed) * 100}%` : '0%'
                                             return (
                                                 <div className="dashboard-status-row" key={item.label}>
                                                     <div className="dashboard-status-meta">
                                                         <span className="dashboard-status-dot" style={{ background: item.color }} />
                                                         <span>{item.label}</span>
                                                     </div>
                                                     <div className="dashboard-status-track">
                                                         <div className="dashboard-status-fill" style={{ width, background: item.color }} />
                                                     </div>
                                                     <strong>{item.value}</strong>
                                                 </div>
                                             )
                                         })}
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
