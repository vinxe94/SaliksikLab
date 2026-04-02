import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { useAuth } from '../contexts/AuthContext'
import { Download, CheckCircle, Clock, Trash2, RefreshCw, XCircle, AlertTriangle, Eye, X, RotateCcw, User, Plus } from 'lucide-react'
import AbstractTranslator from '../components/AbstractTranslator'
import FileExplorer from '../components/FileExplorer'
import RepositoryRunner from '../components/RepositoryRunner'

export default function DetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const [output, setOutput] = useState(null)
    const [versions, setVersions] = useState([])
    const [loading, setLoading] = useState(true)
    const [revFile, setRevFile] = useState(null)
    const [revNotes, setRevNotes] = useState('')
    const [revLoading, setRevLoading] = useState(false)
    const [showRevForm, setShowRevForm] = useState(false)
    const [rollbackLoading, setRollbackLoading] = useState(null)

    // Metadata fields for revision
    const [revMeta, setRevMeta] = useState({
        title: '', abstract: '', author: '', adviser: '',
        department: '', course: ''
    })
    const [revKeywords, setRevKeywords] = useState([])
    const [revKwInput, setRevKwInput] = useState('')
    const [revCoAuthors, setRevCoAuthors] = useState([])
    const [revCoInput, setRevCoInput] = useState('')

    // File viewer state
    const [viewerFile, setViewerFile] = useState(null)
    const [viewerContent, setViewerContent] = useState(null)
    const [viewerLoading, setViewerLoading] = useState(false)

    const load = () => {
        Promise.all([
            api.get(`/repository/${id}/`),
            api.get(`/repository/${id}/versions/`),
        ]).then(([o, v]) => {
            setOutput(o.data)
            setVersions(v.data.results || v.data)
        }).catch(() => navigate('/repository'))
            .finally(() => setLoading(false))
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load() }, [id])

    // Pre-fill revision metadata from current output when form opens
    useEffect(() => {
        if (showRevForm && output) {
            setRevMeta({
                title: output.title || '',
                abstract: output.abstract || '',
                author: output.author || '',
                adviser: output.adviser || '',
                department: output.department || '',
                course: output.course || '',
            })
            setRevKeywords(output.keywords || [])
            setRevCoAuthors(output.co_authors || [])
        }
    }, [showRevForm, output])

    const download = (fileId) => {
        const url = fileId ? `/api/repository/${id}/download/${fileId}/` : `/api/repository/${id}/download/`
        const token = localStorage.getItem('access_token')
        fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.blob()).then(blob => {
                const href = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = href; a.download = ''; a.click(); URL.revokeObjectURL(href)
                toast.success('Download started!')
                load()
            }).catch(() => toast.error('Download failed.'))
    }

    const getFileType = (filename) => {
        const ext = filename?.rsplit ? '' : (filename?.split('.').pop()?.toLowerCase() || '')
        if (ext === 'pdf') return 'pdf'
        if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'image'
        if (['txt', 'md', 'py', 'js', 'ts', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'rb',
            'html', 'css', 'json', 'xml', 'yaml', 'yml', 'csv'].includes(ext)) return 'text'
        return 'other'
    }

    const openViewer = async (fileId, filename) => {
        const type = getFileType(filename)
        if (type === 'other') {
            toast('This file type cannot be previewed. Downloading instead…')
            download(fileId)
            return
        }
        setViewerFile({ fileId, filename, type })
        setViewerContent(null)
        setViewerLoading(true)

        if (type === 'text') {
            try {
                const token = localStorage.getItem('access_token')
                const previewUrl = fileId
                    ? `/api/repository/${id}/preview/${fileId}/`
                    : `/api/repository/${id}/preview/`
                const res = await fetch(previewUrl, { headers: { Authorization: `Bearer ${token}` } })
                if (!res.ok) throw new Error()
                const text = await res.text()
                setViewerContent(text)
            } catch {
                toast.error('Failed to load file.')
                setViewerFile(null)
            }
        }
        setViewerLoading(false)
    }

    const closeViewer = () => {
        setViewerFile(null)
        setViewerContent(null)
    }

    const approve = async () => {
        await api.post(`/repository/${id}/approve/`, { action: 'approve' })
        toast.success('Output approved!')
        load()
    }

    const softDelete = async () => {
        if (!confirm('Delete this output? This cannot be undone.')) return
        await api.delete(`/repository/${id}/`)
        toast.success('Output deleted.')
        navigate('/repository')
    }

    const addRevKeyword = () => {
        const kw = revKwInput.trim()
        if (kw && !revKeywords.includes(kw)) setRevKeywords(k => [...k, kw])
        setRevKwInput('')
    }

    const addRevCoAuthor = () => {
        const ca = revCoInput.trim()
        if (ca && !revCoAuthors.includes(ca)) setRevCoAuthors(c => [...c, ca])
        setRevCoInput('')
    }

    const submitRevision = async e => {
        e.preventDefault()
        if (!revFile) { toast.error('Select a file.'); return }
        setRevLoading(true)
        const fd = new FormData()
        fd.append('file', revFile)
        fd.append('change_notes', revNotes)
        // Append metadata
        Object.entries(revMeta).forEach(([k, v]) => {
            if (v) fd.append(k, v)
        })
        revKeywords.forEach(k => fd.append('keywords', k))
        revCoAuthors.forEach(c => fd.append('co_authors', c))
        try {
            const { data } = await api.post(`/repository/${id}/revise/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            toast.success(`Revision v${data.version} uploaded! Status reset to Pending Review.`)
            setShowRevForm(false); setRevFile(null); setRevNotes('')
            load()
        } catch (err) {
            toast.error(err.response?.data?.file?.[0] || 'Revision failed.')
        } finally { setRevLoading(false) }
    }

    const rollback = async (version) => {
        if (!confirm(`Rollback to version ${version}? All newer versions will be permanently deleted.`)) return
        setRollbackLoading(version)
        try {
            await api.post(`/repository/${id}/rollback/`, { version })
            toast.success(`Rolled back to version ${version}.`)
            load()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Rollback failed.')
        } finally { setRollbackLoading(null) }
    }

    if (loading) return <div className="layout"><Sidebar /><div className="main-content"><div className="spinner" /></div></div>

    const isOwner = user?.id === output?.uploaded_by?.id
    const isAdmin = user?.role === 'admin'
    const canEdit = isOwner || isAdmin

    const typeMap = { thesis: 'Thesis', software: 'Software', sourcecode: 'Source Code', documentation: 'Documentation', other: 'Other' }

    const ALLOWED_EXT = '.pdf,.doc,.docx,.txt,.zip,.tar,.gz,.rar,.py,.js,.ts,.java,.c,.cpp,.h,.cs,.php,.rb,.html,.css,.json,.xml,.yaml,.yml,.md,.png,.jpg,.jpeg,.gif,.svg'

    const handleRevMeta = e => setRevMeta(m => ({ ...m, [e.target.name]: e.target.value }))

    const latestVersion = versions[0]?.version || 1

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {isAdmin && !output.is_approved && (
                            <button className="btn btn-sm" style={{ background: 'rgba(46,168,108,0.15)', color: 'var(--accent2)' }} onClick={approve}>
                                <CheckCircle size={14} /> Approve
                            </button>
                        )}
                        <button className="btn btn-sm" style={{ background: 'rgba(27,94,32,0.08)', color: 'var(--accent)' }} onClick={() => openViewer(versions[0]?.id, versions[0]?.original_filename)}>
                            <Eye size={14} /> Read Latest
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => download()}>
                            <Download size={14} /> Download Latest
                        </button>
                        {canEdit && (
                            <>
                                <button className="btn btn-ghost btn-sm" onClick={() => setShowRevForm(s => !s)}><RefreshCw size={14} /> Revise</button>
                                <button className="btn btn-danger btn-sm" onClick={softDelete}><Trash2 size={14} /></button>
                            </>
                        )}
                    </div>
                </div>
                <div className="page-body">

                    {/* Rejection Banner */}
                    {output.is_rejected && (isOwner || isAdmin) && (
                        <div style={{
                            background: 'rgba(248,81,73,0.08)',
                            border: '1px solid rgba(248,81,73,0.35)',
                            borderLeft: '4px solid var(--danger)',
                            borderRadius: 'var(--radius)',
                            padding: '14px 18px',
                            marginBottom: 20,
                            display: 'flex',
                            gap: 12,
                            alignItems: 'flex-start'
                        }}>
                            <AlertTriangle size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
                            <div>
                                <div style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 4 }}>Submission Not Approved</div>
                                <div style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.6 }}>{output.rejection_reason}</div>
                                {isOwner && (
                                    <p style={{ color: 'var(--text2)', fontSize: '0.82rem', marginTop: 6 }}>
                                        Please revise your file and use the <strong>Revise</strong> button to resubmit. Your submission will be sent back for review.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Inline File Viewer */}
                    {viewerFile && (
                        <div className="card" style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h3 style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Eye size={16} color="var(--accent)" /> Viewing: {viewerFile.filename}
                                </h3>
                                <button className="btn btn-ghost btn-sm" onClick={closeViewer} style={{ padding: '4px 8px' }}>
                                    <X size={16} />
                                </button>
                            </div>
                            {viewerLoading ? (
                                <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
                            ) : viewerFile.type === 'pdf' ? (
                                <iframe
                                    src={`/api/repository/${id}/preview/${viewerFile.fileId}/?token=${localStorage.getItem('access_token')}`}
                                    style={{ width: '100%', height: '70vh', border: '1px solid var(--border)', borderRadius: 8 }}
                                    title="PDF Viewer"
                                />
                            ) : viewerFile.type === 'image' ? (
                                <div style={{ textAlign: 'center', padding: 16, background: 'var(--bg3)', borderRadius: 8 }}>
                                    <img
                                        src={`/api/repository/${id}/preview/${viewerFile.fileId}/?token=${localStorage.getItem('access_token')}`}
                                        alt={viewerFile.filename}
                                        style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 6 }}
                                    />
                                </div>
                            ) : viewerFile.type === 'text' && viewerContent !== null ? (
                                <pre style={{
                                    background: 'var(--bg3)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                    padding: 16,
                                    overflow: 'auto',
                                    maxHeight: '70vh',
                                    fontSize: '0.82rem',
                                    lineHeight: 1.6,
                                    fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}>
                                    {viewerContent}
                                </pre>
                            ) : (
                                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text2)' }}>
                                    This file type cannot be previewed inline.
                                    <br />
                                    <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => download(viewerFile.fileId)}>
                                        <Download size={14} /> Download Instead
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* GitHub-style File Explorer */}
                    <FileExplorer
                        repositoryId={id}
                        fileId={versions[0]?.id}
                    />

                    {/* ▶ Repository Runner — run uploaded code in-browser */}
                    <RepositoryRunner
                        repositoryId={id}
                        fileId={versions[0]?.id}
                        filename={versions[0]?.original_filename}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
                        {/* Main column */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div className="card">
                                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                                    <span className="badge badge-blue">{typeMap[output.output_type]}</span>
                                    {output.is_approved
                                        ? <span className="badge badge-green"><CheckCircle size={11} style={{ marginRight: 4 }} />Approved</span>
                                        : output.is_rejected
                                            ? <span className="badge" style={{ background: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }}><XCircle size={11} style={{ marginRight: 4 }} />Rejected</span>
                                            : <span className="badge badge-yellow"><Clock size={11} style={{ marginRight: 4 }} />Pending Review</span>}
                                    <span className="badge badge-gray">v{latestVersion}</span>
                                </div>
                                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 16 }}>{output.title}</h1>
                                <div className="grid-2" style={{ marginBottom: 16 }}>
                                    {[
                                        ['Author(s)', output.author],
                                        ['Adviser', output.adviser || '—'],
                                        ['Department', output.department],
                                        ['Course / Program', output.course || '—'],
                                        ['Year', output.year],
                                    ].map(([l, v]) => (
                                        <div key={l}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{l}</div>
                                            <div style={{ fontWeight: 500 }}>{v}</div>
                                        </div>
                                    ))}
                                </div>
                                {output.co_authors?.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Co-Authors</div>
                                        <div className="tags-container">
                                            {output.co_authors.map(a => <span key={a} className="tag">{a}</span>)}
                                        </div>
                                    </div>
                                )}
                                {output.abstract && (
                                    <>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Abstract</div>
                                        <p style={{ lineHeight: 1.7, color: 'var(--text)', fontSize: '0.95rem' }}>{output.abstract}</p>
                                        <AbstractTranslator abstract={output.abstract} defaultSourceLang="en" />
                                    </>
                                )}
                                {output.keywords?.length > 0 && (
                                    <div style={{ marginTop: 16 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keywords</div>
                                        <div className="tags-container">{output.keywords.map(k => <span key={k} className="tag">{k}</span>)}</div>
                                    </div>
                                )}
                            </div>

                            {/* Revision form */}
                            {showRevForm && (
                                <div className="card">
                                    <h3 style={{ marginBottom: 6, fontSize: '0.95rem' }}>Submit Revision</h3>
                                    <div style={{
                                        background: 'rgba(227,179,65,0.08)',
                                        border: '1px solid rgba(227,179,65,0.3)',
                                        borderRadius: 'var(--radius)',
                                        padding: '10px 14px',
                                        marginBottom: 16,
                                        fontSize: '0.82rem',
                                        color: 'var(--text2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                    }}>
                                        <AlertTriangle size={14} color="rgb(227,179,65)" style={{ flexShrink: 0 }} />
                                        Submitting a revision will reset the approval status to <strong style={{ color: 'var(--text)', marginLeft: 3 }}>Pending Review</strong>.
                                    </div>
                                    <form onSubmit={submitRevision} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div className="form-group">
                                            <label className="form-label">New File *</label>
                                            <input type="file" accept={ALLOWED_EXT} className="form-input" onChange={e => setRevFile(e.target.files[0])} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Change Notes</label>
                                            <textarea className="form-textarea" rows={3} value={revNotes} onChange={e => setRevNotes(e.target.value)} placeholder="Describe what changed in this revision…" />
                                        </div>

                                        {/* Collapsible metadata section */}
                                        <details style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                                            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text2)', marginBottom: 12 }}>
                                                ✏️ Update Metadata (optional)
                                            </summary>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                                                <div className="form-group">
                                                    <label className="form-label">Title</label>
                                                    <input className="form-input" name="title" value={revMeta.title} onChange={handleRevMeta} />
                                                </div>
                                                <div className="grid-2">
                                                    <div className="form-group">
                                                        <label className="form-label">Author(s)</label>
                                                        <input className="form-input" name="author" value={revMeta.author} onChange={handleRevMeta} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Adviser</label>
                                                        <input className="form-input" name="adviser" value={revMeta.adviser} onChange={handleRevMeta} />
                                                    </div>
                                                </div>
                                                <div className="grid-2">
                                                    <div className="form-group">
                                                        <label className="form-label">Department</label>
                                                        <input className="form-input" name="department" value={revMeta.department} onChange={handleRevMeta} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Course / Program</label>
                                                        <input className="form-input" name="course" value={revMeta.course} onChange={handleRevMeta} />
                                                    </div>
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Abstract</label>
                                                    <textarea className="form-textarea" name="abstract" rows={3} value={revMeta.abstract} onChange={handleRevMeta} />
                                                </div>

                                                {/* Co-Authors */}
                                                <div className="form-group">
                                                    <label className="form-label">Co-Authors</label>
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <input className="form-input" value={revCoInput} onChange={e => setRevCoInput(e.target.value)} placeholder="Add co-author…" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRevCoAuthor())} />
                                                        <button type="button" className="btn btn-ghost btn-sm" onClick={addRevCoAuthor}><Plus size={16} /></button>
                                                    </div>
                                                    {revCoAuthors.length > 0 && (
                                                        <div className="tags-container" style={{ marginTop: 8 }}>
                                                            {revCoAuthors.map(c => (
                                                                <span key={c} className="tag">
                                                                    {c} <button type="button" onClick={() => setRevCoAuthors(cs => cs.filter(x => x !== c))}>×</button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Keywords */}
                                                <div className="form-group">
                                                    <label className="form-label">Keywords</label>
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <input className="form-input" value={revKwInput} onChange={e => setRevKwInput(e.target.value)} placeholder="Add keyword…" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRevKeyword())} />
                                                        <button type="button" className="btn btn-ghost btn-sm" onClick={addRevKeyword}><Plus size={16} /></button>
                                                    </div>
                                                    {revKeywords.length > 0 && (
                                                        <div className="tags-container" style={{ marginTop: 8 }}>
                                                            {revKeywords.map(k => (
                                                                <span key={k} className="tag">
                                                                    {k} <button type="button" onClick={() => setRevKeywords(kws => kws.filter(x => x !== k))}>×</button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </details>

                                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                            <button type="submit" className="btn btn-primary btn-sm" disabled={revLoading}>{revLoading ? 'Uploading…' : 'Submit Revision'}</button>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRevForm(false)}>Cancel</button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>

                        {/* Sidebar column */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Version History Panel */}
                            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                {/* Panel Header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
                                    borderBottom: '1px solid var(--border)',
                                    background: 'var(--bg2)',
                                }}>
                                    <RefreshCw size={14} color="var(--accent)" />
                                    <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Version History</span>
                                    <span className="badge badge-gray" style={{ marginLeft: 'auto', fontSize: '0.68rem', padding: '2px 8px' }}>
                                        {versions.length} version{versions.length !== 1 ? 's' : ''}
                                    </span>
                                </div>

                                {/* Version list */}
                                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                                    {versions.length === 0 && (
                                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>
                                            No files attached.
                                        </p>
                                    )}

                                    {versions.map((v, idx) => {
                                        const isCurrent = idx === 0
                                        const sizeMB = (v.file_size / 1024 / 1024).toFixed(2)
                                        const dateStr = new Date(v.uploaded_at).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric', year: 'numeric'
                                        })

                                        return (
                                            <div key={v.id}>
                                                {/* Divider between versions */}
                                                {idx > 0 && (
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        margin: '10px 0',
                                                    }}>
                                                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--text2)', letterSpacing: '0.04em' }}>OLDER</span>
                                                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                                                    </div>
                                                )}

                                                {/* Version card: current gets full boxed highlight; older get compact rows */}
                                                {isCurrent ? (
                                                    /* ── CURRENT VERSION — full card layout ── */
                                                    <div style={{
                                                        background: 'rgba(46,168,108,0.07)',
                                                        border: '1px solid rgba(46,168,108,0.28)',
                                                        borderRadius: 'var(--radius)',
                                                        padding: '12px 14px',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: 6,
                                                    }}>
                                                        {/* Version badge row */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{
                                                                fontWeight: 800, fontSize: '0.9rem',
                                                                color: 'var(--accent2)',
                                                            }}>v{v.version}</span>
                                                            <span style={{
                                                                fontSize: '0.65rem', fontWeight: 700,
                                                                background: 'rgba(46,168,108,0.18)',
                                                                color: 'var(--accent2)',
                                                                border: '1px solid rgba(46,168,108,0.35)',
                                                                borderRadius: 99, padding: '2px 8px',
                                                                letterSpacing: '0.04em',
                                                            }}>Current</span>
                                                        </div>

                                                        {/* Filename */}
                                                        <div style={{
                                                            fontWeight: 600, fontSize: '0.82rem',
                                                            color: 'var(--text)',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }} title={v.original_filename}>
                                                            📄 {v.original_filename}
                                                        </div>

                                                        {/* Meta row: size · date · uploader */}
                                                        <div style={{
                                                            fontSize: '0.73rem', color: 'var(--text2)',
                                                            display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
                                                        }}>
                                                            <span>{sizeMB} MB</span>
                                                            <span style={{ opacity: 0.4 }}>·</span>
                                                            <span>{dateStr}</span>
                                                            {v.uploaded_by_name && (
                                                                <>
                                                                    <span style={{ opacity: 0.4 }}>·</span>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                                        <User size={10} />{v.uploaded_by_name}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>

                                                        {/* Change notes */}
                                                        {v.change_notes && (
                                                            <div style={{
                                                                fontSize: '0.75rem', color: 'var(--text2)',
                                                                fontStyle: 'italic', lineHeight: 1.5,
                                                                borderLeft: '2px solid rgba(46,168,108,0.4)',
                                                                paddingLeft: 8,
                                                            }}>
                                                                {v.change_notes}
                                                            </div>
                                                        )}

                                                        {/* Actions pinned to bottom-right */}
                                                        <div style={{
                                                            display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 4,
                                                        }}>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                title="View / Read"
                                                                onClick={() => openViewer(v.id, v.original_filename)}
                                                                style={{ padding: '5px 10px', fontSize: '0.75rem', gap: 4, display: 'flex', alignItems: 'center' }}
                                                            >
                                                                <Eye size={13} /> View
                                                            </button>
                                                            <button
                                                                className="btn btn-primary btn-sm"
                                                                title="Download"
                                                                onClick={() => download(v.id)}
                                                                style={{ padding: '5px 10px', fontSize: '0.75rem', gap: 4, display: 'flex', alignItems: 'center' }}
                                                            >
                                                                <Download size={13} /> Download
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    /* ── OLDER VERSIONS — compact row layout ── */
                                                    <div style={{
                                                        background: 'var(--bg2)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: 'var(--radius)',
                                                        padding: '10px 12px',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: 4,
                                                    }}>
                                                        {/* Version label */}
                                                        <span style={{
                                                            fontWeight: 700, fontSize: '0.8rem',
                                                            color: 'var(--text2)',
                                                        }}>v{v.version}</span>

                                                        {/* Filename */}
                                                        <div style={{
                                                            fontWeight: 500, fontSize: '0.8rem',
                                                            color: 'var(--text)',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }} title={v.original_filename}>
                                                            {v.original_filename}
                                                        </div>

                                                        {/* Meta row */}
                                                        <div style={{
                                                            fontSize: '0.72rem', color: 'var(--text2)',
                                                            display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
                                                        }}>
                                                            <span>{sizeMB} MB</span>
                                                            <span style={{ opacity: 0.4 }}>·</span>
                                                            <span>{dateStr}</span>
                                                            {v.uploaded_by_name && (
                                                                <>
                                                                    <span style={{ opacity: 0.4 }}>·</span>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                                        <User size={10} />{v.uploaded_by_name}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>

                                                        {/* Change notes */}
                                                        {v.change_notes && (
                                                            <div style={{
                                                                fontSize: '0.73rem', color: 'var(--text2)',
                                                                fontStyle: 'italic', lineHeight: 1.5,
                                                                borderLeft: '2px solid var(--border)',
                                                                paddingLeft: 8,
                                                            }}>
                                                                {v.change_notes}
                                                            </div>
                                                        )}

                                                        {/* Actions: View · Download · Rollback */}
                                                        <div style={{
                                                            display: 'flex', justifyContent: 'flex-end',
                                                            alignItems: 'center', gap: 4, marginTop: 2,
                                                        }}>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                title="View"
                                                                onClick={() => openViewer(v.id, v.original_filename)}
                                                                style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3 }}
                                                            >
                                                                <Eye size={12} /> View
                                                            </button>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                title="Download"
                                                                onClick={() => download(v.id)}
                                                                style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3 }}
                                                            >
                                                                <Download size={12} /> Download
                                                            </button>
                                                            {isAdmin && (
                                                                <button
                                                                    className="btn btn-ghost btn-sm"
                                                                    title={`Rollback to v${v.version}`}
                                                                    onClick={() => rollback(v.version)}
                                                                    disabled={rollbackLoading === v.version}
                                                                    style={{
                                                                        padding: '4px 8px', fontSize: '0.72rem',
                                                                        color: '#e3b341',
                                                                        display: 'flex', alignItems: 'center', gap: 3,
                                                                    }}
                                                                >
                                                                    <RotateCcw size={12} />
                                                                    {rollbackLoading === v.version ? '…' : '↩ Rollback'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Info */}
                            <div className="card">
                                <h3 style={{ fontSize: '0.9rem', marginBottom: 12 }}>Info</h3>
                                {[
                                    ['Uploaded by', output.uploaded_by?.full_name || '—'],
                                    ['Uploaded', new Date(output.created_at).toLocaleDateString()],
                                    ['Last updated', new Date(output.updated_at).toLocaleDateString()],
                                    ['Downloads', output.download_count ?? 0],
                                ].map(([l, v]) => (
                                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 8 }}>
                                        <span style={{ color: 'var(--text2)' }}>{l}</span>
                                        <span style={{ fontWeight: 500 }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
