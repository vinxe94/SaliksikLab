import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { BookOpen, Upload, Clock, CheckCircle, AlertCircle, XCircle, BarChart2 } from 'lucide-react'

const TYPE_LABELS = { thesis: 'Thesis', software: 'Software', sourcecode: 'Source Code', documentation: 'Docs', other: 'Other' }
const typeColor = { thesis: 'badge-blue', software: 'badge-green', sourcecode: 'badge-yellow', documentation: 'badge-gray', other: 'badge-gray' }

function MiniBar({ label, value, max, color }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                <span style={{ color: 'var(--text)' }}>{label}</span>
                <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{value}</span>
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6 }}>
                <div style={{ background: color || 'var(--accent)', borderRadius: 4, height: 6, width: `${pct}%`, transition: 'width 0.5s ease' }} />
            </div>
        </div>
    )
}
MiniBar.propTypes = { label: PropTypes.string, value: PropTypes.number, max: PropTypes.number, color: PropTypes.string }

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

    if (loading) return <div className="layout"><Sidebar /><div className="main-content"><div className="spinner" /></div></div>

    const maxType = stats?.by_type?.length > 0 ? Math.max(...stats.by_type.map(t => t.count)) : 1
    const maxDept = stats?.by_dept?.length > 0 ? Math.max(...stats.by_dept.map(d => d.count)) : 1

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Dashboard</h2>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Welcome back, {user?.first_name}</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/upload')}>
                        <Upload size={15} /> Upload Output
                    </button>
                </div>
                <div className="page-body">
                    {/* Stats Cards */}
                    <div className="stat-grid">
                        <div className="stat-card">
                            <span className="stat-value" style={{ color: 'var(--accent)' }}>{stats?.total ?? 0}</span>
                            <span className="stat-label"><BookOpen size={13} style={{ display: 'inline', marginRight: 4 }} />Total Outputs</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-value" style={{ color: 'var(--accent2)' }}>{stats?.approved ?? 0}</span>
                            <span className="stat-label"><CheckCircle size={13} style={{ display: 'inline', marginRight: 4 }} />Approved</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-value" style={{ color: 'var(--warning)' }}>{stats?.pending ?? 0}</span>
                            <span className="stat-label"><Clock size={13} style={{ display: 'inline', marginRight: 4 }} />Pending Review</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-value" style={{ color: 'var(--danger)' }}>{stats?.rejected ?? 0}</span>
                            <span className="stat-label"><XCircle size={13} style={{ display: 'inline', marginRight: 4 }} />Rejected</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-value">{stats?.my_uploads ?? 0}</span>
                            <span className="stat-label"><AlertCircle size={13} style={{ display: 'inline', marginRight: 4 }} />My Uploads</span>
                        </div>
                    </div>

                    {/* Analytics charts */}
                    {(stats?.by_type?.length > 0 || stats?.by_dept?.length > 0) && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                            {stats?.by_type?.length > 0 && (
                                <div className="card">
                                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <BarChart2 size={14} color="var(--accent)" /> By Output Type
                                    </h3>
                                    {stats.by_type.map(t => (
                                        <MiniBar key={t.output_type} label={TYPE_LABELS[t.output_type] || t.output_type} value={t.count} max={maxType} color="var(--accent)" />
                                    ))}
                                </div>
                            )}
                            {stats?.by_dept?.length > 0 && (
                                <div className="card">
                                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <BarChart2 size={14} color="var(--accent2)" /> By Department (Top 8)
                                    </h3>
                                    {stats.by_dept.map(d => (
                                        <MiniBar key={d.department} label={d.department || 'Unknown'} value={d.count} max={maxDept} color="var(--accent2)" />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <h3 style={{ fontSize: '1rem' }}>Recent Submissions</h3>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/repository')}>View all</button>
                    </div>

                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                        <table className="table">
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
                                    <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/repository/${item.id}`)}>
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
