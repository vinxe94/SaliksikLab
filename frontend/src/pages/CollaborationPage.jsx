/**
 * CollaborationPage
 *
 * GitHub / GitLab-inspired research collaboration hub for SaliksikLab.
 * Features:
 *  - Projects (create / list / select)
 *  - Member management (invite by email, assign roles)
 *  - Issues tracker (open / close / comment)
 *  - Merge Requests (open / merge / close / comment)
 *  - Commit log
 *  - In-app Notifications badge
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import toast from 'react-hot-toast'
import {
    GitBranch, GitMerge, GitPullRequest, Users, Bell, Plus,
    Circle, CheckCircle, XCircle, MessageSquare, Clock,
    ChevronRight, ArrowLeft, Loader, Hash, GitCommit, Search,
    UserPlus, Archive, X, RefreshCw
} from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────
const timeAgo = (iso) => {
    const d = new Date(iso)
    const s = Math.floor((Date.now() - d) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
}

const STATUS_CHIP = {
    open: { label: 'Open', color: '#2e7d32', bg: 'rgba(46,125,50,0.1)', Icon: Circle },
    in_progress: { label: 'In Progress', color: '#e65100', bg: 'rgba(230,81,0,0.1)', Icon: RefreshCw },
    closed: { label: 'Closed', color: '#9e9e9e', bg: 'rgba(0,0,0,0.07)', Icon: CheckCircle },
    merged: { label: 'Merged', color: '#7b1fa2', bg: 'rgba(123,31,162,0.1)', Icon: GitMerge },
}
const LABEL_COLORS = {
    bug: '#c62828', feature: '#1565c0', discussion: '#4a148c',
    question: '#e65100', documentation: '#2e7d32',
}
const ROLE_COLORS = {
    owner: '#1B5E20', contributor: '#1565c0', viewer: '#616161',
}

function StatusChip({ status }) {
    const cfg = STATUS_CHIP[status] || STATUS_CHIP.open
    const Icon = cfg.Icon
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: cfg.bg, color: cfg.color,
            borderRadius: 999, padding: '2px 10px',
            fontSize: '0.72rem', fontWeight: 700,
        }}>
            <Icon size={11} /> {cfg.label}
        </span>
    )
}

function Avatar({ name = '?', size = 30 }) {
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    const hue = (name.charCodeAt(0) * 53) % 360
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%',
            background: `hsl(${hue},55%,45%)`,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.36, fontWeight: 700, flexShrink: 0,
        }}>{initials}</div>
    )
}

function Modal({ title, onClose, children }) {
    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 600 }}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
    return (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => onChange(tab.id)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '10px 18px',
                        background: 'none', border: 'none',
                        borderBottom: active === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                        color: active === tab.id ? 'var(--accent)' : 'var(--text2)',
                        fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'all 0.15s',
                    }}
                >
                    {tab.icon} {tab.label}
                    {tab.count !== undefined && (
                        <span style={{
                            background: active === tab.id ? 'var(--accent)' : 'var(--bg3)',
                            color: active === tab.id ? '#fff' : 'var(--text2)',
                            borderRadius: 999, padding: '1px 7px', fontSize: '0.68rem', fontWeight: 700,
                        }}>{tab.count}</span>
                    )}
                </button>
            ))}
        </div>
    )
}

// ── Projects list ─────────────────────────────────────────────────────────────
function ProjectsList({ onSelect }) {
    const [projects, setProjects] = useState([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [form, setForm] = useState({ name: '', description: '' })

    const load = useCallback(() => {
        setLoading(true)
        api.get('/collab/projects/').then(r => setProjects(r.data.results || r.data)).catch(() => { }).finally(() => setLoading(false))
    }, [])

    useEffect(() => { load() }, [load])

    const create = async () => {
        if (!form.name.trim()) return toast.error('Project name is required.')
        try {
            const { data } = await api.post('/collab/projects/', form)
            toast.success('Project created!')
            setShowCreate(false)
            setForm({ name: '', description: '' })
            setProjects(p => [data, ...p])
        } catch { toast.error('Failed to create project.') }
    }

    if (loading) return <div className="spinner" />

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: '1.1rem' }}>🤝 Collaboration Projects</h2>
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                    <Plus size={15} /> New Project
                </button>
            </div>

            {projects.length === 0 ? (
                <div className="empty-state">
                    <GitBranch size={48} style={{ opacity: 0.3, margin: '0 auto 16px', display: 'block' }} />
                    <h3>No collaboration projects yet</h3>
                    <p style={{ marginTop: 8, fontSize: '0.9rem' }}>Create a project and invite your research team.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {projects.map(p => (
                        <div
                            key={p.id}
                            className="card"
                            style={{ cursor: 'pointer', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}
                            onClick={() => onSelect(p)}
                        >
                            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg,var(--accent),#43A047)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <GitBranch size={20} color="#fff" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.name}</div>
                                {p.description && <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
                                <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                                    {[
                                        { icon: <Users size={12} />, val: p.member_count, label: 'members' },
                                        { icon: <Circle size={12} />, val: p.open_issues, label: 'open issues' },
                                        { icon: <GitPullRequest size={12} />, val: p.open_mrs, label: 'open MRs' },
                                        { icon: <GitCommit size={12} />, val: p.commit_count, label: 'commits' },
                                    ].map(item => (
                                        <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', color: 'var(--text2)' }}>
                                            {item.icon} <strong>{item.val}</strong> {item.label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <ChevronRight size={18} color="var(--text2)" />
                        </div>
                    ))}
                </div>
            )}

            {showCreate && (
                <Modal title="✨ New Collaboration Project" onClose={() => setShowCreate(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="form-group">
                            <label className="form-label">Project Name *</label>
                            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Thesis on AI Ethics" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea className="form-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this project about?" rows={3} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
                            <button className="btn btn-primary btn-sm" onClick={create}>Create Project</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    )
}

// ── Issues tab ────────────────────────────────────────────────────────────────
function IssuesTab({ project }) {
    const { user } = useAuth()
    const [issues, setIssues] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('open')
    const [selected, setSelected] = useState(null)
    const [showNew, setShowNew] = useState(false)
    const [form, setForm] = useState({ title: '', body: '', label: '' })
    const [comment, setComment] = useState('')

    const load = useCallback(() => {
        setLoading(true)
        api.get(`/collab/projects/${project.id}/issues/?status=${filter}`)
            .then(r => setIssues(r.data.results || r.data))
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [project.id, filter])

    useEffect(() => { load() }, [load])

    const createIssue = async () => {
        if (!form.title.trim()) return toast.error('Title required.')
        try {
            const { data } = await api.post(`/collab/projects/${project.id}/issues/`, form)
            toast.success(`Issue #${data.number} opened!`)
            setShowNew(false); setForm({ title: '', body: '', label: '' }); load()
        } catch { toast.error('Failed to open issue.') }
    }

    const patchStatus = async (issue, newStatus) => {
        try {
            await api.patch(`/collab/projects/${project.id}/issues/${issue.number}/`, { status: newStatus })
            toast.success(`Issue ${newStatus}.`)
            load()
            if (selected?.number === issue.number) setSelected(null)
        } catch { toast.error('Failed.') }
    }

    const postComment = async () => {
        if (!comment.trim()) return
        try {
            await api.post(`/collab/projects/${project.id}/issues/${selected.number}/comments/`, { body: comment })
            setComment('')
            // refetch selected
            const { data } = await api.get(`/collab/projects/${project.id}/issues/${selected.number}/`)
            setSelected(data)
        } catch { toast.error('Failed to post comment.') }
    }

    if (selected) return (
        <div>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>
                <ArrowLeft size={14} /> Back to issues
            </button>
            <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <StatusChip status={selected.status} />
                    <h2 style={{ fontSize: '1.1rem', flex: 1 }}>#{selected.number} {selected.title}</h2>
                </div>
                {selected.label && (
                    <span style={{ background: LABEL_COLORS[selected.label] + '18', color: LABEL_COLORS[selected.label], borderRadius: 999, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700, marginBottom: 8, display: 'inline-block' }}>
                        {selected.label}
                    </span>
                )}
                <div style={{ color: 'var(--text2)', fontSize: '0.82rem', margin: '8px 0' }}>
                    Opened by <strong>{selected.author?.full_name}</strong> · {timeAgo(selected.created_at)}
                </div>
                {selected.body && <p style={{ fontSize: '0.9rem', lineHeight: 1.7, marginTop: 12 }}>{selected.body}</p>}
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                    {selected.status !== 'closed' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => patchStatus(selected, 'closed')}>
                            <CheckCircle size={14} /> Close Issue
                        </button>
                    )}
                    {selected.status !== 'in_progress' && selected.status !== 'closed' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => patchStatus(selected, 'in_progress')}>
                            <RefreshCw size={14} /> Mark In Progress
                        </button>
                    )}
                    {selected.status === 'closed' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => patchStatus(selected, 'open')}>
                            <Circle size={14} /> Reopen
                        </button>
                    )}
                </div>
            </div>

            {/* Comments */}
            <h4 style={{ marginBottom: 12, fontSize: '0.9rem' }}><MessageSquare size={14} style={{ verticalAlign: 'middle' }} /> {selected.comments?.length || 0} Comments</h4>
            {selected.comments?.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <Avatar name={c.author?.full_name} size={32} />
                    <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{c.author?.full_name} <span style={{ fontWeight: 400, color: 'var(--text2)' }}>· {timeAgo(c.created_at)}</span></div>
                        <p style={{ marginTop: 4, fontSize: '0.88rem' }}>{c.body}</p>
                    </div>
                </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Avatar name={user?.first_name + ' ' + user?.last_name} size={32} />
                <div style={{ flex: 1 }}>
                    <textarea className="form-textarea" value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment…" rows={3} style={{ marginBottom: 8 }} />
                    <button className="btn btn-primary btn-sm" onClick={postComment} disabled={!comment.trim()}>Comment</button>
                </div>
            </div>
        </div>
    )

    return (
        <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {['open', 'in_progress', 'closed'].map(s => (
                        <button key={s} onClick={() => setFilter(s)} style={{ padding: '6px 14px', background: filter === s ? 'var(--accent)' : 'transparent', color: filter === s ? '#fff' : 'var(--text2)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                            {s.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowNew(true)}>
                    <Plus size={14} /> New Issue
                </button>
            </div>

            {loading ? <div className="spinner" style={{ marginTop: 40 }} /> : issues.length === 0 ? (
                <div className="empty-state" style={{ padding: 60 }}>
                    <Circle size={40} style={{ opacity: 0.25, margin: '0 auto 12px', display: 'block' }} />
                    <p>No {filter} issues.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {issues.map(issue => (
                        <div
                            key={issue.id}
                            onClick={() => {
                                api.get(`/collab/projects/${project.id}/issues/${issue.number}/`).then(r => setSelected(r.data))
                            }}
                            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}
                        >
                            <StatusChip status={issue.status} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>#{issue.number} {issue.title}</span>
                                {issue.label && <span style={{ marginLeft: 8, background: LABEL_COLORS[issue.label] + '18', color: LABEL_COLORS[issue.label], borderRadius: 999, padding: '1px 8px', fontSize: '0.7rem', fontWeight: 700 }}>{issue.label}</span>}
                                <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: 3 }}>
                                    by {issue.author?.full_name} · {timeAgo(issue.created_at)}
                                </div>
                            </div>
                            {issue.comment_count > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text2)' }}>
                                    <MessageSquare size={13} /> {issue.comment_count}
                                </span>
                            )}
                            <ChevronRight size={15} color="var(--text2)" />
                        </div>
                    ))}
                </div>
            )}

            {showNew && (
                <Modal title="📝 Open New Issue" onClose={() => setShowNew(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div className="form-group">
                            <label className="form-label">Title *</label>
                            <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Short, descriptive title" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea className="form-textarea" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Describe the issue in detail…" rows={4} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Label</label>
                            <select className="form-select" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}>
                                <option value="">None</option>
                                {['bug', 'feature', 'discussion', 'question', 'documentation'].map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>Cancel</button>
                            <button className="btn btn-primary btn-sm" onClick={createIssue}>Open Issue</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    )
}

// ── Merge Requests tab ────────────────────────────────────────────────────────
function MRTab({ project }) {
    const { user } = useAuth()
    const [mrs, setMrs] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('open')
    const [selected, setSelected] = useState(null)
    const [showNew, setShowNew] = useState(false)
    const [form, setForm] = useState({ title: '', description: '' })
    const [comment, setComment] = useState('')

    const load = useCallback(() => {
        setLoading(true)
        api.get(`/collab/projects/${project.id}/mrs/?status=${filter}`)
            .then(r => setMrs(r.data.results || r.data))
            .catch(() => { }).finally(() => setLoading(false))
    }, [project.id, filter])

    useEffect(() => { load() }, [load])

    const createMR = async () => {
        if (!form.title.trim()) return toast.error('Title required.')
        try {
            const { data } = await api.post(`/collab/projects/${project.id}/mrs/`, form)
            toast.success(`MR #${data.number} opened!`)
            setShowNew(false); setForm({ title: '', description: '' }); load()
        } catch { toast.error('Failed to open MR.') }
    }

    const patchStatus = async (mr, newStatus) => {
        try {
            await api.patch(`/collab/projects/${project.id}/mrs/${mr.number}/`, { status: newStatus })
            toast.success(newStatus === 'merged' ? '🎉 Merged!' : `MR ${newStatus}.`)
            load()
            if (selected?.number === mr.number) setSelected(null)
        } catch { toast.error('Failed.') }
    }

    const postComment = async () => {
        if (!comment.trim()) return
        try {
            await api.post(`/collab/projects/${project.id}/mrs/${selected.number}/comments/`, { body: comment })
            setComment('')
            const { data } = await api.get(`/collab/projects/${project.id}/mrs/${selected.number}/`)
            setSelected(data)
        } catch { toast.error('Failed to post comment.') }
    }

    if (selected) return (
        <div>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>
                <ArrowLeft size={14} /> Back to MRs
            </button>
            <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                    <StatusChip status={selected.status} />
                    <h2 style={{ fontSize: '1.1rem', flex: 1 }}>!{selected.number} {selected.title}</h2>
                </div>
                <div style={{ color: 'var(--text2)', fontSize: '0.82rem' }}>
                    Opened by <strong>{selected.author?.full_name}</strong> · {timeAgo(selected.created_at)}
                    {selected.merged_at && <> · Merged {timeAgo(selected.merged_at)}</>}
                </div>
                {selected.description && <p style={{ fontSize: '0.9rem', lineHeight: 1.7, marginTop: 12 }}>{selected.description}</p>}
                {selected.status === 'open' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => patchStatus(selected, 'merged')}>
                            <GitMerge size={14} /> Merge
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => patchStatus(selected, 'closed')}>
                            <XCircle size={14} /> Close MR
                        </button>
                    </div>
                )}
            </div>
            <h4 style={{ marginBottom: 12, fontSize: '0.9rem' }}><MessageSquare size={14} style={{ verticalAlign: 'middle' }} /> {selected.comments?.length || 0} Review Comments</h4>
            {selected.comments?.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <Avatar name={c.author?.full_name} size={32} />
                    <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{c.author?.full_name} <span style={{ fontWeight: 400, color: 'var(--text2)' }}>· {timeAgo(c.created_at)}</span></div>
                        <p style={{ marginTop: 4, fontSize: '0.88rem' }}>{c.body}</p>
                    </div>
                </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Avatar name={user?.first_name + ' ' + user?.last_name} size={32} />
                <div style={{ flex: 1 }}>
                    <textarea className="form-textarea" value={comment} onChange={e => setComment(e.target.value)} placeholder="Leave a review comment…" rows={3} style={{ marginBottom: 8 }} />
                    <button className="btn btn-primary btn-sm" onClick={postComment} disabled={!comment.trim()}>Comment</button>
                </div>
            </div>
        </div>
    )

    return (
        <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {['open', 'merged', 'closed'].map(s => (
                        <button key={s} onClick={() => setFilter(s)} style={{ padding: '6px 14px', background: filter === s ? 'var(--accent)' : 'transparent', color: filter === s ? '#fff' : 'var(--text2)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                            {s}
                        </button>
                    ))}
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowNew(true)}>
                    <Plus size={14} /> New MR
                </button>
            </div>

            {loading ? <div className="spinner" style={{ marginTop: 40 }} /> : mrs.length === 0 ? (
                <div className="empty-state" style={{ padding: 60 }}>
                    <GitPullRequest size={40} style={{ opacity: 0.25, margin: '0 auto 12px', display: 'block' }} />
                    <p>No {filter} merge requests.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {mrs.map(mr => (
                        <div
                            key={mr.id}
                            onClick={() => api.get(`/collab/projects/${project.id}/mrs/${mr.number}/`).then(r => setSelected(r.data))}
                            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}
                        >
                            <StatusChip status={mr.status} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontWeight: 600 }}>!{mr.number} {mr.title}</span>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: 3 }}>
                                    by {mr.author?.full_name} · {timeAgo(mr.created_at)}
                                </div>
                            </div>
                            {mr.comment_count > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text2)' }}>
                                    <MessageSquare size={13} /> {mr.comment_count}
                                </span>
                            )}
                            <ChevronRight size={15} color="var(--text2)" />
                        </div>
                    ))}
                </div>
            )}

            {showNew && (
                <Modal title="🔀 Open Merge Request" onClose={() => setShowNew(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div className="form-group">
                            <label className="form-label">Title *</label>
                            <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Add Chapter 3 revisions" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea className="form-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What changes does this MR include?" rows={4} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>Cancel</button>
                            <button className="btn btn-primary btn-sm" onClick={createMR}>Open MR</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    )
}

// ── Commits tab ───────────────────────────────────────────────────────────────
function CommitsTab({ project }) {
    const [commits, setCommits] = useState([])
    const [loading, setLoading] = useState(true)
    const [showNew, setShowNew] = useState(false)
    const [form, setForm] = useState({ message: '', description: '' })

    const load = useCallback(() => {
        setLoading(true)
        api.get(`/collab/projects/${project.id}/commits/`)
            .then(r => setCommits(r.data.results || r.data))
            .catch(() => { }).finally(() => setLoading(false))
    }, [project.id])

    useEffect(() => { load() }, [load])

    const createCommit = async () => {
        if (!form.message.trim()) return toast.error('Commit message required.')
        try {
            await api.post(`/collab/projects/${project.id}/commits/`, form)
            toast.success('Commit pushed!')
            setShowNew(false); setForm({ message: '', description: '' }); load()
        } catch { toast.error('Failed.') }
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: '0.88rem', color: 'var(--text2)' }}>{commits.length} commits</span>
                <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
                    <GitCommit size={14} /> New Commit
                </button>
            </div>

            {loading ? <div className="spinner" style={{ marginTop: 40 }} /> : commits.length === 0 ? (
                <div className="empty-state" style={{ padding: 60 }}>
                    <GitCommit size={40} style={{ opacity: 0.25, margin: '0 auto 12px', display: 'block' }} />
                    <p>No commits yet. Push your first commit!</p>
                </div>
            ) : (
                <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />
                    {commits.map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: 14, marginBottom: 16, position: 'relative' }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                                <GitCommit size={14} color="#fff" />
                            </div>
                            <div style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <code style={{ background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--accent)' }}>{c.sha?.slice(0, 7)}</code>
                                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.message}</span>
                                </div>
                                {c.description && <p style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: 4 }}>{c.description}</p>}
                                <div style={{ fontSize: '0.75rem', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Avatar name={c.author?.full_name} size={18} />
                                    {c.author?.full_name} · {timeAgo(c.created_at)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showNew && (
                <Modal title="📦 Push New Commit" onClose={() => setShowNew(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div className="form-group">
                            <label className="form-label">Commit Message *</label>
                            <input className="form-input" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="e.g. Added methodology section" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea className="form-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional details…" rows={3} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>Cancel</button>
                            <button className="btn btn-primary btn-sm" onClick={createCommit}>Push Commit</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    )
}

// ── Members tab ───────────────────────────────────────────────────────────────
function MembersTab({ project }) {
    const [members, setMembers] = useState([])
    const [loading, setLoading] = useState(true)
    const [showInvite, setShowInvite] = useState(false)
    const [email, setEmail] = useState('')
    const [role, setRole] = useState('contributor')

    const load = useCallback(() => {
        setLoading(true)
        api.get(`/collab/projects/${project.id}/members/`)
            .then(r => setMembers(r.data))
            .catch(() => { }).finally(() => setLoading(false))
    }, [project.id])

    useEffect(() => { load() }, [load])

    const invite = async () => {
        if (!email.trim()) return toast.error('Email required.')
        try {
            await api.post(`/collab/projects/${project.id}/members/`, { email, role })
            toast.success('Member added!')
            setShowInvite(false); setEmail(''); load()
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to invite.')
        }
    }

    const remove = async (memberId) => {
        if (!window.confirm('Remove this member?')) return
        try {
            await api.delete(`/collab/projects/${project.id}/members/${memberId}/`)
            toast.success('Member removed.')
            load()
        } catch { toast.error('Failed.') }
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: '0.88rem', color: 'var(--text2)' }}>{members.length} members</span>
                <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(true)}>
                    <UserPlus size={14} /> Invite Member
                </button>
            </div>

            {/* Owner row */}
            <div style={{ background: 'rgba(27,94,32,0.06)', border: '1px solid rgba(27,94,32,0.2)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Avatar name={project.owner?.full_name} size={36} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{project.owner?.full_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{project.owner?.email} · {project.owner?.role}</div>
                </div>
                <span style={{ background: ROLE_COLORS.owner + '18', color: ROLE_COLORS.owner, borderRadius: 999, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700 }}>owner</span>
            </div>

            {loading ? <div className="spinner" style={{ marginTop: 40 }} /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {members.filter(m => m.user.id !== project.owner?.id).map(m => (
                        <div key={m.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Avatar name={m.user.full_name} size={36} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600 }}>{m.user.full_name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{m.user.email} · {m.user.role}</div>
                            </div>
                            <span style={{ background: (ROLE_COLORS[m.role] || '#616161') + '18', color: ROLE_COLORS[m.role] || '#616161', borderRadius: 999, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700 }}>{m.role}</span>
                            <button onClick={() => remove(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4 }} title="Remove">
                                <X size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {showInvite && (
                <Modal title="👤 Invite Team Member" onClose={() => setShowInvite(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div className="form-group">
                            <label className="form-label">Email Address *</label>
                            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@university.edu" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Role</label>
                            <select className="form-select" value={role} onChange={e => setRole(e.target.value)}>
                                <option value="contributor">Contributor — can create issues, MRs, commits</option>
                                <option value="viewer">Viewer — read-only access</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowInvite(false)}>Cancel</button>
                            <button className="btn btn-primary btn-sm" onClick={invite}>Send Invite</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    )
}

// ── Notifications panel ───────────────────────────────────────────────────────
function NotificationsPanel({ onClose }) {
    const [notifs, setNotifs] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.get('/collab/notifications/').then(r => setNotifs(r.data.results || r.data)).catch(() => { }).finally(() => setLoading(false))
    }, [])

    const markAll = async () => {
        await api.post('/collab/notifications/read/', {})
        setNotifs(n => n.map(x => ({ ...x, is_read: true })))
        toast.success('All marked as read.')
    }

    const NOTIF_ICONS = {
        issue_opened: '🐛', issue_closed: '✅', issue_comment: '💬',
        mr_opened: '🔀', mr_merged: '🎉', mr_closed: '❌', mr_comment: '🗨️',
        member_added: '👋', commit_pushed: '📦',
    }

    return (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: 'var(--bg2)', borderLeft: '1px solid var(--border)', zIndex: 999, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
            <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '1rem' }}>🔔 Notifications</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={markAll}>Mark all read</button>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {loading ? <div className="spinner" /> : notifs.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text2)', marginTop: 60 }}>
                        <Bell size={40} style={{ opacity: 0.2, margin: '0 auto 12px', display: 'block' }} />
                        <p>All caught up!</p>
                    </div>
                ) : notifs.map(n => (
                    <div key={n.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: 6, background: n.is_read ? 'transparent' : 'rgba(27,94,32,0.06)', border: n.is_read ? '1px solid transparent' : '1px solid rgba(27,94,32,0.15)' }}>
                        <div style={{ fontSize: '1.2rem', lineHeight: 1 }}>{NOTIF_ICONS[n.notif_type] || '📣'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: n.is_read ? 400 : 600 }}>{n.message}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginTop: 3 }}>{n.project_name} · {timeAgo(n.created_at)}</div>
                        </div>
                        {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 6 }} />}
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Project detail ────────────────────────────────────────────────────────────
function ProjectDetail({ project, onBack }) {
    const [tab, setTab] = useState('issues')

    const tabs = [
        { id: 'issues', label: 'Issues', icon: <Circle size={14} />, count: project.open_issues },
        { id: 'mrs', label: 'Merge Requests', icon: <GitPullRequest size={14} />, count: project.open_mrs },
        { id: 'commits', label: 'Commits', icon: <GitCommit size={14} />, count: project.commit_count },
        { id: 'members', label: 'Members', icon: <Users size={14} />, count: project.member_count },
    ]

    return (
        <div>
            {/* Project header */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={onBack}>
                    <ArrowLeft size={14} /> All Projects
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,var(--accent),#43A047)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <GitBranch size={22} color="#fff" />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.2rem' }}>{project.name}</h2>
                        {project.description && <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginTop: 2 }}>{project.description}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                        <span style={{ background: project.status === 'active' ? 'rgba(46,125,50,0.1)' : 'var(--bg3)', color: project.status === 'active' ? 'var(--accent2)' : 'var(--text2)', borderRadius: 999, padding: '3px 12px', fontSize: '0.75rem', fontWeight: 700 }}>
                            {project.status}
                        </span>
                    </div>
                </div>
            </div>

            <TabBar tabs={tabs} active={tab} onChange={setTab} />

            {tab === 'issues' && <IssuesTab project={project} />}
            {tab === 'mrs' && <MRTab project={project} />}
            {tab === 'commits' && <CommitsTab project={project} />}
            {tab === 'members' && <MembersTab project={project} />}
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CollaborationPage() {
    const [selectedProject, setSelectedProject] = useState(null)
    const [showNotifs, setShowNotifs] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)

    useEffect(() => {
        api.get('/collab/notifications/').then(r => {
            const notifs = r.data.results || r.data
            setUnreadCount(notifs.filter(n => !n.is_read).length)
        }).catch(() => { })
    }, [showNotifs])

    return (
        <div className="layout">
            <Sidebar />
            <main className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <header className="page-header">
                    <div>
                        <h1 style={{ fontSize: '1.2rem', marginBottom: 2 }}>🤝 Collaboration Hub</h1>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>
                            Git-style research collaboration for students, researchers &amp; faculty
                        </p>
                    </div>
                    <button
                        onClick={() => setShowNotifs(v => !v)}
                        style={{ position: 'relative', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontWeight: 600, fontSize: '0.85rem', fontFamily: 'inherit' }}
                    >
                        <Bell size={16} />
                        Notifications
                        {unreadCount > 0 && (
                            <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--danger)', color: '#fff', borderRadius: 999, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 800, padding: '0 4px' }}>
                                {unreadCount}
                            </span>
                        )}
                    </button>
                </header>

                <div className="page-body">
                    {selectedProject ? (
                        <ProjectDetail project={selectedProject} onBack={() => setSelectedProject(null)} />
                    ) : (
                        <ProjectsList onSelect={setSelectedProject} />
                    )}
                </div>
            </main>

            {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} />}
        </div>
    )
}
