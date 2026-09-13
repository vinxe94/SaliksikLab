import TemporaryHostingPanel from '../components/TemporaryHostingPanel'
import SubmissionAttachments from '../components/SubmissionAttachments'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import api, { apiUrl } from '../api/axios'
import { Shield, Users, CheckCircle, Clock, Download, XCircle, FileText, Plus, Upload, ClipboardList, RotateCcw } from 'lucide-react'

const ROLES = ['admin', 'faculty', 'student']

export default function AdminPage() {
    const navigate = useNavigate()
    const restoreInputRef = useRef(null)
    const [tab, setTab] = useState('requests')
    const [requests, setRequests] = useState([])
    const [outputs, setOutputs] = useState([])
    const [users, setUsers] = useState([])
    const [departments, setDepartments] = useState([])
    const [courses, setCourses] = useState([])
    const [loadingO, setLoadingO] = useState(true)
    const [loadingU, setLoadingU] = useState(true)
    const [academicLoading, setAcademicLoading] = useState(true)
    const [requestsLoading, setRequestsLoading] = useState(true)
    const [departmentName, setDepartmentName] = useState('')
    const [courseForm, setCourseForm] = useState({ name: '', department: '' })
    // Rejection modal state
    const [rejectTarget, setRejectTarget] = useState(null)   // output object
    const [rejectReason, setRejectReason] = useState('')
    const [rejectLoading, setRejectLoading] = useState(false)
    const [requestReview, setRequestReview] = useState(null)
    const [requestPreview, setRequestPreview] = useState(null)
    const [requestComment, setRequestComment] = useState('')
    const [requestResearchFile, setRequestResearchFile] = useState(null)
    const [requestSystemFile, setRequestSystemFile] = useState(null)
    const [requestSystemLink, setRequestSystemLink] = useState('')
    const [requestReviewLoading, setRequestReviewLoading] = useState(false)

    const loadRequests = useCallback(() => {
        setRequestsLoading(true)
        return api.get('/repository/submission-requests/?page_size=100')
            .then((response) => setRequests(response.data.results || response.data || []))
            .catch(() => toast.error('Failed to load submission requests.'))
            .finally(() => setRequestsLoading(false))
    }, [])

    useEffect(() => {
        api.get('/repository/?page_size=100')
            .then(r => setOutputs(r.data.results || []))
            .catch(() => toast.error('Failed to load outputs.'))
            .finally(() => setLoadingO(false))
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

    useEffect(() => {
        loadRequests()
    }, [loadRequests])

    const openRequestReview = (submission, action) => {
        setRequestPreview(null)
        setRequestReview({ submission, action })
        setRequestComment('')
        setRequestResearchFile(null)
        setRequestSystemFile(null)
        setRequestSystemLink(submission.proposed_system_link || '')
    }

    const submitRequestReview = async () => {
        if (!requestReview) return
        const { submission, action } = requestReview
        if (['reject', 'revision'].includes(action) && !requestComment.trim()) {
            toast.error('Add an administrator comment.')
            return
        }
        const needsPaper = submission.submission_type !== 'executable_system'
        const needsSystem = submission.submission_type !== 'research_paper'
        if (action === 'approve' && needsPaper && !submission.has_research_file && !requestResearchFile) {
            toast.error('Select the approved research PDF.')
            return
        }
        if (action === 'approve' && needsSystem && !submission.has_system_file && !requestSystemFile) {
            toast.error('Select the approved executable system ZIP.')
            return
        }

        setRequestReviewLoading(true)
        try {
            const body = new FormData()
            body.append('action', action)
            body.append('comment', requestComment.trim())
            if (requestResearchFile) body.append('research_file', requestResearchFile)
            if (requestSystemFile) body.append('system_file', requestSystemFile)
            if (requestSystemLink.trim()) body.append('system_link', requestSystemLink.trim())
            await api.post(`/repository/submission-requests/${submission.id}/review/`, body)
            toast.success(action === 'approve' ? (needsSystem ? 'Approved. Files published and the default system configuration saved.' : 'Request approved and research published.') : action === 'revision' ? 'Request returned for revision.' : 'Request rejected.')
            setRequestReview(null)
            await loadRequests()
        } catch (err) {
            const data = err.response?.data
            const message = data?.detail || data?.research_file?.[0] || data?.system_file?.[0] || data?.comment?.[0] || 'Request review failed.'
            toast.error(message)
        } finally {
            setRequestReviewLoading(false)
        }
    }

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
            const response = await fetch(apiUrl('/repository/export/csv/'), {
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
    const pendingRequests = requests.filter((item) => item.status === 'pending')

    const statusBadge = (o) => {
        if (o.is_approved) return <span className="badge badge-green">Approved</span>
        if (o.is_rejected) return <span className="badge" style={{ background: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }}>Rejected</span>
        return <span className="badge badge-yellow">Pending</span>
    }

    const requestStatusBadge = (submission) => {
        if (submission.status === 'approved') return <span className="badge badge-green">Approved</span>
        if (submission.status === 'rejected') return <span className="badge" style={{ background: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }}>Rejected</span>
        if (submission.status === 'revision_requested') return <span className="badge badge-yellow">Revision requested</span>
        return <span className="badge badge-blue">Queue #{submission.queue_position}</span>
    }

    const submissionTypeLabel = (value) => ({
        research_paper: 'Research paper',
        executable_system: 'Executable system',
        paper_and_system: 'Paper + system',
    }[value] || value)

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Shield size={20} color="var(--accent)" />
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Admin Panel</h2>
                            <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Process upload requests and manage published research</p>
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
                        {[['Upload Requests', requests.length, 'var(--accent)', <ClipboardList key="0" size={13} />],
                        ['Pending Requests', pendingRequests.length, 'var(--warning)', <Clock key="1" size={13} />],
                        ['Published', approved.length, 'var(--accent2)', <CheckCircle key="2" size={13} />],
                        ['Legacy Pending', pending.length, 'var(--warning)', <Clock key="3" size={13} />],
                        ['Rejected', rejected.length, 'var(--danger)', <XCircle key="4" size={13} />],
                        ['Users', users.length, 'var(--text)', <Users key="5" size={13} />]].map(([l, v, c, icon]) => (
                            <div key={l} className="stat-card">
                                <span className="stat-value" style={{ color: c }}>{v}</span>
                                <span className="stat-label">{icon} {l}</span>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div className="tabs-scroll" style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
                        {[['requests', 'Upload Requests'], ['outputs', 'Legacy Outputs'], ['users', 'User Management'], ['academic', 'Departments & Courses'], ['hosting', 'Temporary Hosting']].map(([key, label]) => (
                            <button key={key} onClick={() => setTab(key)} style={{ padding: '8px 20px', background: 'none', border: 'none', borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent', color: tab === key ? 'var(--accent)' : 'var(--text2)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', marginBottom: -1 }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {tab === 'hosting' && <TemporaryHostingPanel isAdmin />}

                    {tab === 'requests' && (
                        <div style={{ display: 'grid', gap: 12 }}>
                            <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
                                <strong>First-come, first-served queue</strong>
                                <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginTop: 4 }}>
                                    View the submitted files before deciding, and process queue #1 first. Approval publishes the attachments and saves an included ZIP as the research’s default system configuration.
                                </p>
                            </div>
                            <div className="table-scroll-card" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                                {requestsLoading ? <div className="spinner" /> : (
                                    <table className="table">
                                        <thead><tr><th>Queue</th><th>Requested</th><th>Title / requester</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
                                        <tbody>
                                            {requests.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>No upload requests.</td></tr>}
                                            {requests.map((submission) => {
                                                const isNext = submission.status === 'pending' && submission.queue_position === 1
                                                return (
                                                    <tr key={submission.id}>
                                                        <td style={{ fontWeight: 700 }}>{submission.queue_position ? `#${submission.queue_position}` : '—'}</td>
                                                        <td className="text-sm text-muted">{new Date(submission.queued_at).toLocaleString()}</td>
                                                        <td style={{ maxWidth: 280 }}>
                                                            <strong>{submission.title}</strong>
                                                            <div className="text-sm text-muted">{submission.requested_by?.full_name || submission.requested_by?.email} · {submission.author}</div>
                                                            {submission.admin_comment && <div className="text-sm" style={{ color: 'var(--text2)', marginTop: 4 }}>Comment: {submission.admin_comment}</div>}
                                                        </td>
                                                        <td><span className="badge badge-gray">{submissionTypeLabel(submission.submission_type)}</span></td>
                                                        <td>{requestStatusBadge(submission)}</td>
                                                        <td>
                                                            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 6 }} onClick={() => setRequestPreview(submission)}><FileText size={13} /> Review files</button>
                                                            {submission.status === 'pending' ? (
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                                    <button className="btn btn-sm" disabled={!isNext} title={!isNext ? 'Process the earlier request first' : ''} style={{ background: 'rgba(46,168,108,0.1)', color: 'var(--accent2)' }} onClick={() => openRequestReview(submission, 'approve')}>
                                                                        <CheckCircle size={13} /> Approve
                                                                    </button>
                                                                    <button className="btn btn-sm btn-ghost" disabled={!isNext} onClick={() => openRequestReview(submission, 'revision')}>
                                                                        <RotateCcw size={13} /> Revise
                                                                    </button>
                                                                    <button className="btn btn-sm" disabled={!isNext} style={{ background: 'rgba(248,81,73,0.1)', color: 'var(--danger)' }} onClick={() => openRequestReview(submission, 'reject')}>
                                                                        <XCircle size={13} /> Reject
                                                                    </button>
                                                                </div>
                                                            ) : submission.published_archive_id ? (
                                                                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/archives/${submission.published_archive_id}`)}>View publication</button>
                                                            ) : '—'}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'outputs' && (
                        <div className="table-scroll-card" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                            {loadingO ? <div className="spinner" /> : (
                                <table className="table">
                                    <thead><tr><th>Title</th><th>Author</th><th>Type</th><th>Year</th><th>Status</th><th>Actions</th></tr></thead>
                                    <tbody>
                                        {outputs.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>No outputs yet.</td></tr>}
                                        {outputs.map(o => (
                                            <tr key={o.id}>
                                                <td style={{ fontWeight: 600, maxWidth: 260 }} className="truncate"><span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => navigate('/repository')}>{o.title}</span></td>
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
                                                            fetch(apiUrl(`/repository/${o.id}/download/`), { headers: { Authorization: `Bearer ${token}` } })
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
                        <div className="table-scroll-card" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
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

                    {tab === 'academic' && (
                        <div className="admin-academic-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
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
                                <form className="admin-course-form" onSubmit={addCourse} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 14 }}>
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

            {requestPreview && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
                    <div role="dialog" aria-modal="true" aria-label="Review submitted files" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, width: '100%', maxWidth: 1000, maxHeight: '94vh', overflowY: 'auto', scrollbarGutter: 'stable' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                            <h3>{requestPreview.title}</h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => setRequestPreview(null)}>Close preview</button>
                        </div>
                        <p className="text-sm text-muted" style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{requestPreview.abstract || 'No abstract provided.'}</p>
                        {requestPreview.system_details && <p className="text-sm" style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}><strong>System details:</strong> {requestPreview.system_details}</p>}
                        <SubmissionAttachments key={requestPreview.id} submission={requestPreview} autoPreview />
                        {requestPreview.status === 'pending' && requestPreview.queue_position === 1 && <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => openRequestReview(requestPreview, 'approve')}><CheckCircle size={14} /> Approve request</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openRequestReview(requestPreview, 'revision')}><RotateCcw size={14} /> Return for revision</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openRequestReview(requestPreview, 'reject')}><XCircle size={14} /> Reject request</button>
                        </div>}
                    </div>
                </div>
            )}

            {requestReview && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
                    <div role="dialog" aria-modal="true" aria-label="Decide submission request" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 28, width: '100%', maxWidth: 960, maxHeight: '90vh', overflowY: 'auto', scrollbarGutter: 'stable' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6, textTransform: 'capitalize' }}>
                            {requestReview.action === 'revision' ? 'Return for revision' : `${requestReview.action} request`}
                        </h3>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: 16 }}>
                            Queue #1: <strong style={{ color: 'var(--text)' }}>{requestReview.submission.title}</strong>
                        </p>

                        <SubmissionAttachments key={requestReview.submission.id} submission={requestReview.submission} autoPreview />
                        {requestReview.action === 'approve' && requestReview.submission.has_system_file && <p className="text-sm" style={{ margin: '14px 0', color: 'var(--accent)' }}>The submitted ZIP will be saved as the default configuration for this research. You can run it from the published archive.</p>}

                        {requestReview.action === 'approve' && (
                            <div style={{ display: 'grid', gap: 14, marginBottom: 14 }}>
                                {requestReview.submission.submission_type !== 'executable_system' && !requestReview.submission.has_research_file && (
                                    <div className="form-group">
                                        <label className="form-label">Research paper (PDF) *</label>
                                        <input className="form-input" type="file" accept="application/pdf,.pdf" onChange={(event) => setRequestResearchFile(event.target.files[0] || null)} />
                                    </div>
                                )}
                                {requestReview.submission.submission_type !== 'research_paper' && (
                                    <>
                                        {!requestReview.submission.has_system_file && <div className="form-group">
                                            <label className="form-label">Executable system (ZIP) *</label>
                                            <input className="form-input" type="file" accept="application/zip,.zip" onChange={(event) => setRequestSystemFile(event.target.files[0] || null)} />
                                        </div>}
                                        <div className="form-group">
                                            <label className="form-label">Published system link</label>
                                            <input className="form-input" type="url" value={requestSystemLink} onChange={(event) => setRequestSystemLink(event.target.value)} placeholder="https://example.com/system" />
                                        </div>
                                        {requestReview.submission.system_details && (
                                            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12, fontSize: '0.85rem' }}>
                                                <strong>Student handoff details</strong>
                                                <p style={{ color: 'var(--text2)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{requestReview.submission.system_details}</p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">
                                Administrator comment {requestReview.action !== 'approve' && <span style={{ color: 'var(--danger)' }}>*</span>}
                            </label>
                            <textarea className="form-textarea" rows={4} value={requestComment} onChange={(event) => setRequestComment(event.target.value)} placeholder="Record the decision or revision instructions." autoFocus={requestReview.action !== 'approve'} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setRequestReview(null)} disabled={requestReviewLoading}>Cancel</button>
                            <button className="btn btn-primary btn-sm" onClick={submitRequestReview} disabled={requestReviewLoading}>
                                {requestReviewLoading ? 'Processing…' : 'Confirm decision'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
