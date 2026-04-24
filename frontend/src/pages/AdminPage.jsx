import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { Shield, Users, BookOpen, CheckCircle, Clock, Download, XCircle, FileText, Plus, Upload } from 'lucide-react'

const ROLES = ['admin', 'faculty', 'student', 'researcher']

export default function AdminPage() {
    const navigate = useNavigate()
    const restoreInputRef = useRef(null)
    const [tab, setTab] = useState('outputs')
    const [outputs, setOutputs] = useState([])
    const [repositories, setRepositories] = useState([])
    const [users, setUsers] = useState([])
    const [departments, setDepartments] = useState([])
    const [courses, setCourses] = useState([])
    const [loadingO, setLoadingO] = useState(true)
    const [loadingR, setLoadingR] = useState(true)
    const [loadingU, setLoadingU] = useState(true)
    const [academicLoading, setAcademicLoading] = useState(true)
    const [departmentName, setDepartmentName] = useState('')
    const [courseForm, setCourseForm] = useState({ name: '', department: '' })
    // Rejection modal state
    const [rejectTarget, setRejectTarget] = useState(null)   // output object
    const [rejectReason, setRejectReason] = useState('')
    const [rejectLoading, setRejectLoading] = useState(false)

    useEffect(() => {
        api.get('/repository/?page_size=100')
            .then(r => setOutputs(r.data.results || []))
            .catch(() => toast.error('Failed to load outputs.'))
            .finally(() => setLoadingO(false))
        api.get('/repository/repos/?page_size=100')
            .then(r => setRepositories(r.data.results || []))
            .catch(() => toast.error('Failed to load repositories.'))
            .finally(() => setLoadingR(false))
        api.get('/auth/admin/users/')
            .then(r => setUsers(r.data))
            .catch(() => toast.error('Failed to load users.'))
            .finally(() => setLoadingU(false))
        Promise.all([
            api.get('/repository/departments/'),
            api.get('/repository/courses/'),
        ]).then(([deptRes, courseRes]) => {
            setDepartments(deptRes.data || [])
            setCourses(courseRes.data || [])
        }).catch(() => toast.error('Failed to load departments and courses.'))
            .finally(() => setAcademicLoading(false))
    }, [])

    const approve = async (id) => {
        await api.post(`/repository/${id}/approve/`, { action: 'approve' })
        setOutputs(os => os.map(o => o.id === id ? { ...o, is_approved: true, is_rejected: false, rejection_reason: '' } : o))
        toast.success('Output approved!')
    }

    const openRejectModal = (output) => {
        setRejectTarget(output)
        setRejectReason('')
    }

    const submitRejection = async () => {
        if (!rejectReason.trim()) { toast.error('Please provide a rejection reason.'); return }
        setRejectLoading(true)
        try {
            await api.post(`/repository/${rejectTarget.id}/approve/`, { action: 'reject', rejection_reason: rejectReason })
            setOutputs(os => os.map(o => o.id === rejectTarget.id ? { ...o, is_approved: false, is_rejected: true, rejection_reason: rejectReason } : o))
            toast.success('Output rejected with feedback sent.')
            setRejectTarget(null)
        } catch (err) {
            toast.error(err.response?.data?.rejection_reason || 'Rejection failed.')
        } finally {
            setRejectLoading(false)
        }
    }

    const updateRole = async (userId, role) => {
        await api.patch(`/auth/admin/users/${userId}/`, { role })
        setUsers(us => us.map(u => u.id === userId ? { ...u, role } : u))
        toast.success('Role updated.')
    }

    const toggleActive = async (u) => {
        await api.patch(`/auth/admin/users/${u.id}/`, { is_active: !u.is_active })
        setUsers(us => us.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x))
        toast.success(u.is_active ? 'User deactivated.' : 'User activated.')
    }

    const toggleApproveAccount = async (u) => {
        await api.post(`/auth/admin/users/${u.id}/approve/`)
        setUsers(us => us.map(x => x.id === u.id ? { ...x, is_account_approved: !u.is_account_approved } : x))
        toast.success(u.is_account_approved ? 'Account unapproved.' : 'Account approved!')
    }

    const backup = async () => {
        const { data } = await api.get('/repository/backup/')
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `backup_${Date.now()}.json`; a.click()
        URL.revokeObjectURL(url); toast.success('Backup downloaded!')
    }

    const restoreBackup = async (selectedFile) => {
        if (!selectedFile) return
        if (!confirm('Restore this backup? Existing matching records will be updated.')) {
            if (restoreInputRef.current) restoreInputRef.current.value = ''
            return
        }
        try {
            const fd = new FormData()
            fd.append('backup_file', selectedFile)
            const { data } = await api.post('/repository/restore/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            toast.success(`Backup restored: ${Object.values(data.restored || {}).reduce((sum, count) => sum + count, 0)} records processed.`)
            window.location.reload()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Restore failed.')
        } finally {
            if (restoreInputRef.current) restoreInputRef.current.value = ''
        }
    }

    const exportCSV = async () => {
        try {
            const token = localStorage.getItem('access_token')
            const response = await fetch('/api/repository/export/csv/', {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (!response.ok) throw new Error()
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = `outputs_${Date.now()}.csv`; a.click()
            URL.revokeObjectURL(url); toast.success('CSV exported!')
        } catch { toast.error('Export failed.') }
    }

    const addDepartment = async (e) => {
        e.preventDefault()
        if (!departmentName.trim()) return
        const { data } = await api.post('/repository/departments/', { name: departmentName.trim() })
        setDepartments((items) => [...items, data].sort((a, b) => a.name.localeCompare(b.name)))
        setDepartmentName('')
        toast.success('Department added.')
    }

    const addCourse = async (e) => {
        e.preventDefault()
        if (!courseForm.name.trim()) return
        const payload = { name: courseForm.name.trim(), department: courseForm.department || null }
        const { data } = await api.post('/repository/courses/', payload)
        setCourses((items) => [...items, data].sort((a, b) => a.name.localeCompare(b.name)))
        setCourseForm({ name: '', department: '' })
        toast.success('Course added.')
    }

    const toggleDepartment = async (department) => {
        const { data } = await api.patch(`/repository/departments/${department.id}/`, { is_active: !department.is_active })
        setDepartments((items) => items.map((item) => item.id === department.id ? data : item))
        toast.success(data.is_active ? 'Department activated.' : 'Department deactivated.')
    }

    const toggleCourse = async (course) => {
        const { data } = await api.patch(`/repository/courses/${course.id}/`, { is_active: !course.is_active })
        setCourses((items) => items.map((item) => item.id === course.id ? data : item))
        toast.success(data.is_active ? 'Course activated.' : 'Course deactivated.')
    }

    const pending = outputs.filter(o => !o.is_approved && !o.is_rejected)
    const approved = outputs.filter(o => o.is_approved)
    const rejected = outputs.filter(o => o.is_rejected)

    const statusBadge = (o) => {
        if (o.is_approved) return <span className="badge badge-green">Approved</span>
        if (o.is_rejected) return <span className="badge" style={{ background: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }}>Rejected</span>
        return <span className="badge badge-yellow">Pending</span>
    }

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Shield size={20} color="var(--accent)" />
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Admin Panel</h2>
                            <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Manage outputs and users</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={exportCSV}><FileText size={15} /> Export CSV</button>
                        <button className="btn btn-ghost btn-sm" onClick={backup}><Download size={15} /> Export JSON</button>
                        <input
                            ref={restoreInputRef}
                            type="file"
                            accept="application/json,.json"
                            hidden
                            onChange={(e) => restoreBackup(e.target.files[0])}
                        />
                        <button className="btn btn-ghost btn-sm" onClick={() => restoreInputRef.current?.click()}><Upload size={15} /> Restore JSON</button>
                    </div>
                </div>

                <div className="page-body">
                    <div className="stat-grid" style={{ marginBottom: 24 }}>
                        {[['Total Outputs', outputs.length, 'var(--accent)', <BookOpen key="1" size={13} />],
                        ['Approved', approved.length, 'var(--accent2)', <CheckCircle key="2" size={13} />],
                        ['Pending', pending.length, 'var(--warning)', <Clock key="3" size={13} />],
                        ['Rejected', rejected.length, 'var(--danger)', <XCircle key="4" size={13} />],
                        ['Users', users.length, 'var(--text)', <Users key="5" size={13} />]].map(([l, v, c, icon]) => (
                            <div key={l} className="stat-card">
                                <span className="stat-value" style={{ color: c }}>{v}</span>
                                <span className="stat-label">{icon} {l}</span>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
                        {[['outputs', 'Research Outputs'], ['repositories', 'Repositories'], ['users', 'User Management'], ['academic', 'Departments & Courses']].map(([key, label]) => (
                            <button key={key} onClick={() => setTab(key)} style={{ padding: '8px 20px', background: 'none', border: 'none', borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent', color: tab === key ? 'var(--accent)' : 'var(--text2)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', marginBottom: -1 }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {tab === 'outputs' && (
                        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                            {loadingO ? <div className="spinner" /> : (
                                <table className="table">
                                    <thead><tr><th>Title</th><th>Author</th><th>Type</th><th>Year</th><th>Status</th><th>Actions</th></tr></thead>
                                    <tbody>
                                        {outputs.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>No outputs yet.</td></tr>}
                                        {outputs.map(o => (
                                            <tr key={o.id}>
                                                <td style={{ fontWeight: 600, maxWidth: 260 }} className="truncate"><span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => navigate(`/repository/${o.id}`)}>{o.title}</span></td>
                                                <td className="text-sm text-muted">{o.author}</td>
                                                <td><span className="badge badge-blue text-xs">{o.output_type}</span></td>
                                                <td className="text-sm text-muted">{o.year}</td>
                                                <td>{statusBadge(o)}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        {!o.is_approved && (
                                                            <button className="btn btn-sm" style={{ background: 'rgba(46,168,108,0.1)', color: 'var(--accent2)' }} onClick={() => approve(o.id)}>
                                                                <CheckCircle size={13} /> Approve
                                                            </button>
                                                        )}
                                                        {!o.is_rejected && (
                                                            <button className="btn btn-sm" style={{ background: 'rgba(248,81,73,0.1)', color: 'var(--danger)' }} onClick={() => openRejectModal(o)}>
                                                                <XCircle size={13} /> Reject
                                                            </button>
                                                        )}
                                                        {o.is_approved && (
                                                            <button className="btn btn-sm" style={{ background: 'rgba(248,81,73,0.07)', color: 'var(--danger)', fontSize: '0.78rem' }} onClick={() => openRejectModal(o)}>
                                                                Unapprove
                                                            </button>
                                                        )}
                                                        <button className="btn btn-sm" style={{ background: 'rgba(27,94,32,0.08)', color: 'var(--accent)' }} title="Download latest file" onClick={(e) => {
                                                            e.stopPropagation()
                                                            const token = localStorage.getItem('access_token')
                                                            fetch(`/api/repository/${o.id}/download/`, { headers: { Authorization: `Bearer ${token}` } })
                                                                .then(r => r.blob()).then(blob => {
                                                                    const href = URL.createObjectURL(blob)
                                                                    const a = document.createElement('a')
                                                                    a.href = href; a.download = ''; a.click(); URL.revokeObjectURL(href)
                                                                    toast.success('Download started!')
                                                                }).catch(() => toast.error('Download failed.'))
                                                        }}>
                                                            <Download size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {tab === 'users' && (
                        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                            {loadingU ? <div className="spinner" /> : (
                                <table className="table">
                                    <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Account</th><th>Status</th><th>Joined</th></tr></thead>
                                    <tbody>
                                        {users.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>No users.</td></tr>}
                                        {users.map(u => (
                                            <tr key={u.id}>
                                                <td style={{ fontWeight: 600 }}>{u.first_name} {u.last_name}</td>
                                                <td className="text-sm text-muted">{u.email}</td>
                                                <td className="text-sm text-muted">{u.department || '—'}</td>
                                                <td>
                                                    <select value={u.role} onChange={e => updateRole(u.id, e.target.value)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px', fontSize: '0.82rem' }}>
                                                        {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                                                    </select>
                                                </td>
                                                <td>
                                                    {u.is_account_approved
                                                        ? <span className="badge badge-green">Approved</span>
                                                        : (
                                                            <button className="btn btn-sm" style={{ background: 'rgba(46,168,108,0.1)', color: 'var(--accent2)', fontSize: '0.78rem' }} onClick={() => toggleApproveAccount(u)}>
                                                                Approve Account
                                                            </button>
                                                        )}
                                                </td>
                                                <td>
                                                    <button className="btn btn-sm" style={{ background: u.is_active ? 'rgba(248,81,73,0.1)' : 'rgba(46,168,108,0.1)', color: u.is_active ? 'var(--danger)' : 'var(--accent2)' }} onClick={() => toggleActive(u)}>
                                                        {u.is_active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                </td>
                                                <td className="text-sm text-muted">{new Date(u.date_joined).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {tab === 'repositories' && (
                        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                            {loadingR ? <div className="spinner" /> : (
                                <table className="table">
                                    <thead><tr><th>Title</th><th>Owner</th><th>Status</th><th>Files</th><th>Linked Docs</th><th>Updated</th></tr></thead>
                                    <tbody>
                                        {repositories.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>No repositories yet.</td></tr>}
                                        {repositories.map((repo) => (
                                            <tr key={repo.id}>
                                                <td style={{ fontWeight: 600, maxWidth: 260 }} className="truncate">
                                                    <span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => navigate(`/repository/${repo.id}`)}>{repo.title}</span>
                                                </td>
                                                <td className="text-sm text-muted">{repo.created_by?.full_name || repo.created_by?.email || '—'}</td>
                                                <td>{repo.is_public ? <span className="badge badge-green">Public</span> : <span className="badge badge-gray">Private</span>}</td>
                                                <td className="text-sm text-muted">{repo.file_count ?? 0}</td>
                                                <td className="text-sm text-muted">{repo.linked_documents_count ?? 0}</td>
                                                <td className="text-sm text-muted">{new Date(repo.updated_at).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {tab === 'academic' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                            <div className="card">
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 14 }}>Departments</h3>
                                <form onSubmit={addDepartment} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                                    <input className="form-input" value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="New department" />
                                    <button className="btn btn-primary btn-sm" type="submit"><Plus size={14} /> Add</button>
                                </form>
                                {academicLoading ? <div className="spinner" /> : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {departments.map((department) => (
                                            <div key={department.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                                                <div>
                                                    <strong>{department.name}</strong>
                                                    <div>{department.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</div>
                                                </div>
                                                <button className="btn btn-sm btn-ghost" onClick={() => toggleDepartment(department)}>
                                                    {department.is_active ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="card">
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 14 }}>Courses</h3>
                                <form onSubmit={addCourse} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 14 }}>
                                    <input className="form-input" value={courseForm.name} onChange={(e) => setCourseForm((form) => ({ ...form, name: e.target.value }))} placeholder="New course" />
                                    <select className="form-input" value={courseForm.department} onChange={(e) => setCourseForm((form) => ({ ...form, department: e.target.value }))}>
                                        <option value="">No department</option>
                                        {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                                    </select>
                                    <button className="btn btn-primary btn-sm" type="submit"><Plus size={14} /> Add</button>
                                </form>
                                {academicLoading ? <div className="spinner" /> : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {courses.map((course) => (
                                            <div key={course.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                                                <div>
                                                    <strong>{course.name}</strong>
                                                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                                        <span className="badge badge-blue">{course.department_name || 'No department'}</span>
                                                        {course.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}
                                                    </div>
                                                </div>
                                                <button className="btn btn-sm btn-ghost" onClick={() => toggleCourse(course)}>
                                                    {course.is_active ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Rejection Modal */}
            {rejectTarget && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 28, width: '100%', maxWidth: 480 }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>
                            <XCircle size={16} style={{ marginRight: 8, color: 'var(--danger)', verticalAlign: 'middle' }} />
                            Reject Output
                        </h3>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: 16 }}>
                            You are rejecting: <strong style={{ color: 'var(--text)' }}>{rejectTarget.title}</strong>
                        </p>
                        <div className="form-group">
                            <label className="form-label">Reason for rejection <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <textarea
                                className="form-textarea"
                                rows={4}
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="Explain why this submission is not approved, so the uploader can revise and resubmit…"
                                autoFocus
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setRejectTarget(null)} disabled={rejectLoading}>Cancel</button>
                            <button className="btn btn-sm" style={{ background: 'rgba(248,81,73,0.15)', color: 'var(--danger)' }} onClick={submitRejection} disabled={rejectLoading}>
                                {rejectLoading ? 'Rejecting…' : 'Confirm Rejection'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
