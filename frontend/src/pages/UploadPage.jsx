import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { UploadCloud, Link2, GitBranch, FileText } from 'lucide-react'

const ALLOWED_EXT = '.pdf,.doc,.docx,.txt,.zip,.tar,.gz,.rar,.py,.js,.ts,.java,.c,.cpp,.h,.cs,.php,.rb,.html,.css,.json,.xml,.yaml,.yml,.md,.png,.jpg,.jpeg,.gif,.svg'

export default function UploadPage() {
    const navigate = useNavigate()
    const fileRef = useRef()
    const [module, setModule] = useState('repository')
    const [loading, setLoading] = useState(false)
    const [dragging, setDragging] = useState(false)
    const [file, setFile] = useState(null)
    const [repositories, setRepositories] = useState([])

    const [repositoryForm, setRepositoryForm] = useState({ title: '', description: '' })
    const [archiveForm, setArchiveForm] = useState({
        title: '', abstract: '', author: '', department: '',
        course: '', year: new Date().getFullYear(), linked_repository_id: '',
    })

    useEffect(() => {
        api.get('/repository/repos/?page_size=100')
            .then((response) => setRepositories(response.data.results || []))
            .catch(() => setRepositories([]))
    }, [])

    const onDrop = (e) => {
        e.preventDefault()
        setDragging(false)
        const dropped = e.dataTransfer.files[0]
        if (dropped) setFile(dropped)
    }

    const submit = async (e) => {
        e.preventDefault()
        if (!file) {
            toast.error('Please select a file to upload.')
            return
        }
        setLoading(true)
        try {
            const fd = new FormData()
            let endpoint = '/repository/repos/'
            let nextPath = '/repository'

            if (module === 'repository') {
                fd.append('title', repositoryForm.title)
                fd.append('description', repositoryForm.description)
                fd.append('file', file)
            } else {
                endpoint = '/repository/archives/'
                fd.append('title', archiveForm.title)
                fd.append('abstract', archiveForm.abstract)
                fd.append('author', archiveForm.author)
                fd.append('department', archiveForm.department)
                fd.append('course', archiveForm.course)
                fd.append('year', archiveForm.year)
                if (archiveForm.linked_repository_id) {
                    fd.append('linked_repository_id', archiveForm.linked_repository_id)
                }
                fd.append('file', file)
            }

            const { data } = await api.post(endpoint, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            if (module === 'repository') {
                nextPath = `/repository/${data.id}`
                toast.success('Repository created.')
            } else {
                nextPath = `/archives/${data.id}`
                toast.success('Archive document uploaded.')
            }
            navigate(nextPath)
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Upload failed.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Create Repository or Archive</h2>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                            Store implementation files separately from finalized research documents.
                        </p>
                    </div>
                </div>
                <div className="page-body">
                    <div className="profile-tabs-bar" style={{ marginBottom: 18 }}>
                        <button type="button" className={`profile-tab ${module === 'repository' ? 'active' : ''}`} onClick={() => { setModule('repository'); setFile(null) }}>
                            <GitBranch size={15} /> Repository
                        </button>
                        <button type="button" className={`profile-tab ${module === 'archive' ? 'active' : ''}`} onClick={() => { setModule('archive'); setFile(null) }}>
                            <FileText size={15} /> Archive Document
                        </button>
                    </div>

                    <form onSubmit={submit} style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div
                            className={`dropzone ${dragging ? 'active' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={onDrop}
                            onClick={() => fileRef.current.click()}
                        >
                            <input ref={fileRef} type="file" accept={ALLOWED_EXT} hidden onChange={(e) => setFile(e.target.files[0])} />
                            <UploadCloud size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
                            {file ? (
                                <>
                                    <p style={{ fontWeight: 600, color: 'var(--text)' }}>{file.name}</p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </>
                            ) : (
                                <>
                                    <p>Drag & drop your file here, or <span style={{ color: 'var(--accent)' }}>browse</span></p>
                                    <p style={{ fontSize: '0.8rem', marginTop: 4 }}>
                                        {module === 'repository' ? 'ZIP or source code file for the repository module.' : 'PDF, DOCX, or report file for the archive module.'}
                                    </p>
                                </>
                            )}
                        </div>

                        {module === 'repository' ? (
                            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Repository Metadata</h3>
                                <div className="form-group">
                                    <label className="form-label">Title</label>
                                    <input className="form-input" value={repositoryForm.title} onChange={(e) => setRepositoryForm((f) => ({ ...f, title: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-textarea" rows={4} value={repositoryForm.description} onChange={(e) => setRepositoryForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe the source code, technical implementation, or system module." />
                                </div>
                            </div>
                        ) : (
                            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Archive Metadata</h3>
                                <div className="form-group">
                                    <label className="form-label">Title</label>
                                    <input className="form-input" value={archiveForm.title} onChange={(e) => setArchiveForm((f) => ({ ...f, title: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Abstract</label>
                                    <textarea className="form-textarea" rows={4} value={archiveForm.abstract} onChange={(e) => setArchiveForm((f) => ({ ...f, abstract: e.target.value }))} placeholder="Optional abstract or summary." />
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Author</label>
                                        <input className="form-input" value={archiveForm.author} onChange={(e) => setArchiveForm((f) => ({ ...f, author: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Year</label>
                                        <input className="form-input" type="number" value={archiveForm.year} onChange={(e) => setArchiveForm((f) => ({ ...f, year: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Department</label>
                                        <input className="form-input" value={archiveForm.department} onChange={(e) => setArchiveForm((f) => ({ ...f, department: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Course</label>
                                        <input className="form-input" value={archiveForm.course} onChange={(e) => setArchiveForm((f) => ({ ...f, course: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Linked Repository</label>
                                    <select className="form-select" value={archiveForm.linked_repository_id} onChange={(e) => setArchiveForm((f) => ({ ...f, linked_repository_id: e.target.value }))}>
                                        <option value="">No linked repository</option>
                                        {repositories.map((repo) => (
                                            <option key={repo.id} value={repo.id}>{repo.title}</option>
                                        ))}
                                    </select>
                                    <span className="dashboard-stat-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <Link2 size={13} /> Linking is optional but recommended for traceability.
                                    </span>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                <UploadCloud size={16} /> {loading ? 'Saving...' : module === 'repository' ? 'Create Repository' : 'Upload Archive'}
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
