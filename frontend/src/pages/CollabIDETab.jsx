/**
 * CollabIDETab
 *
 * Full collaborative IDE embedded inside a Collaboration Project.
 * Features:
 *  - Monaco Editor (syntax highlighting for 30+ languages)
 *  - File tree (project IDE files + imported repo files)
 *  - Create / Rename / Delete files
 *  - Save → auto-push Commit record
 *  - Open MR directly from IDE
 *  - Import files from linked Repository archives
 *  - Read-only mode for viewers
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/axios'
import toast from 'react-hot-toast'
import {
    File, FilePlus, FolderPlus, Trash2, Save,
    GitMerge, GitCommit, X, ChevronRight, ChevronDown,
    RefreshCw, Download, Upload, Play, Terminal,
    Eye, EyeOff, GitPullRequest, Loader, AlertCircle,
    BookOpen, FolderOpen, Code, Link2,
} from 'lucide-react'

// ── Language detection ────────────────────────────────────────────────────────
const EXT_TO_LANG = {
    py: 'python', js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp',
    go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
    html: 'html', htm: 'html', css: 'css', scss: 'scss',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    xml: 'xml', sql: 'sql', sh: 'shell', bash: 'shell',
    md: 'markdown', txt: 'plaintext', r: 'r',
    dockerfile: 'dockerfile', makefile: 'makefile',
    toml: 'toml', ini: 'ini', env: 'properties',
}

const FILE_ICONS = {
    py: '🐍', js: '📜', jsx: '⚛️', ts: '🔷', tsx: '⚛️',
    java: '☕', c: '🔧', cpp: '⚙️', cs: '🔵', go: '🔵',
    rs: '🦀', rb: '💎', php: '🐘', html: '🌐', htm: '🌐',
    css: '🎨', scss: '🎨', json: '📋', yaml: '📋', yml: '📋',
    xml: '📋', sql: '🗄️', sh: '🖥️', bash: '🖥️', md: '📝',
    txt: '📄', dockerfile: '🐳', makefile: '⚒️',
}

function getLanguage(path) {
    const ext = path.split('.').pop().toLowerCase()
    return EXT_TO_LANG[ext] || 'plaintext'
}

function getFileIcon(path) {
    const ext = path.split('.').pop().toLowerCase()
    return FILE_ICONS[ext] || '📄'
}

// ── File Tree ─────────────────────────────────────────────────────────────────
function buildTree(files) {
    const root = {}
    files.forEach(f => {
        const parts = f.path.split('/')
        let node = root
        parts.forEach((part, i) => {
            if (i === parts.length - 1) {
                node[part] = { _file: f }
            } else {
                node[part] = node[part] || { _dir: true }
                node = node[part]
            }
        })
    })
    return root
}

function TreeNode({ name, node, depth = 0, onSelect, selectedId, canWrite, onDelete }) {
    const [open, setOpen] = useState(true)

    if (node._file) {
        const f = node._file
        const isSelected = selectedId === f.id
        return (
            <div
                onClick={() => onSelect(f)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: `4px 8px 4px ${12 + depth * 16}px`,
                    cursor: 'pointer', borderRadius: 6,
                    background: isSelected ? 'rgba(27,94,32,0.15)' : 'transparent',
                    color: isSelected ? 'var(--accent)' : 'var(--text)',
                    fontSize: '0.82rem', transition: 'background 0.12s',
                    borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                    userSelect: 'none',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
            >
                <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{getFileIcon(name)}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 700 : 400 }}>{name}</span>
                {canWrite && (
                    <button
                        onClick={e => { e.stopPropagation(); onDelete(f) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0 2px', opacity: 0.6, flexShrink: 0 }}
                        title="Delete file"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>
        )
    }

    // Directory node
    const children = Object.entries(node).filter(([k]) => !k.startsWith('_')).sort(([a], [b]) => {
        const aIsDir = !node[a]._file
        const bIsDir = !node[b]._file
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
        return a.localeCompare(b)
    })

    return (
        <div>
            <div
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: `4px 8px 4px ${12 + depth * 16}px`,
                    cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                    color: 'var(--text2)', userSelect: 'none',
                    borderRadius: 6,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <FolderOpen size={13} style={{ color: '#e6a030', flexShrink: 0 }} />
                <span>{name}</span>
            </div>
            {open && children.map(([k, v]) => (
                <TreeNode
                    key={k}
                    name={k}
                    node={v}
                    depth={depth + 1}
                    onSelect={onSelect}
                    selectedId={selectedId}
                    canWrite={canWrite}
                    onDelete={onDelete}
                />
            ))}
        </div>
    )
}

// ── New File Modal ─────────────────────────────────────────────────────────────
function NewFileModal({ onClose, onCreate }) {
    const [path, setPath] = useState('')
    const [content, setContent] = useState('')

    const submit = () => {
        const p = path.trim()
        if (!p) return toast.error('File path is required.')
        if (!/^[a-zA-Z0-9]/.test(p)) return toast.error('Path must start with a letter or number.')
        onCreate({ path: p, content, language: getLanguage(p) })
    }

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 520 }}>
                <div className="modal-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FilePlus size={16} /> New File
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={18} />
                    </button>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="form-group">
                        <label className="form-label">File Path *</label>
                        <input
                            className="form-input"
                            value={path}
                            onChange={e => setPath(e.target.value)}
                            placeholder="e.g. src/main.py or README.md"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && submit()}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>
                            Language: <strong>{getLanguage(path || 'file.txt')}</strong>
                        </span>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Initial Content (optional)</label>
                        <textarea
                            className="form-textarea"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="# Start typing..."
                            rows={5}
                            style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
                        <button className="btn btn-primary btn-sm" onClick={submit}>
                            <FilePlus size={13} /> Create File
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Commit Modal ───────────────────────────────────────────────────────────────
function CommitModal({ file, onClose, onCommit }) {
    const [message, setMessage] = useState(`Update ${file?.path || 'file'}`)
    const [description, setDescription] = useState('')

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 500 }}>
                <div className="modal-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <GitCommit size={16} /> Commit Changes
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={18} />
                    </button>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{
                        background: 'rgba(27,94,32,0.06)', border: '1px solid rgba(27,94,32,0.15)',
                        borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text2)',
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <File size={13} /> <code style={{ fontFamily: 'monospace' }}>{file?.path}</code>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Commit Message *</label>
                        <input
                            className="form-input"
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Describe your changes..."
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Description (optional)</label>
                        <textarea
                            className="form-textarea"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="What changed and why?"
                            rows={3}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => onCommit({ message: message.trim(), description })}
                            disabled={!message.trim()}
                        >
                            <GitCommit size={13} /> Push Commit
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── MR from IDE Modal ──────────────────────────────────────────────────────────
function MRFromIDEModal({ file, onClose, onSubmit }) {
    const [title, setTitle] = useState(`Update ${file?.path || 'file'}`)
    const [description, setDescription] = useState('')

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 500 }}>
                <div className="modal-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <GitPullRequest size={16} /> Open Merge Request
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={18} />
                    </button>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {file && (
                        <div style={{
                            background: 'rgba(27,94,32,0.06)', border: '1px solid rgba(27,94,32,0.15)',
                            borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text2)',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <File size={13} /> Changes in <code style={{ fontFamily: 'monospace' }}>{file.path}</code>
                        </div>
                    )}
                    <div className="form-group">
                        <label className="form-label">MR Title *</label>
                        <input
                            className="form-input"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Short descriptive title"
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Description</label>
                        <textarea
                            className="form-textarea"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="What does this MR change?"
                            rows={3}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => onSubmit({ title: title.trim(), description })}
                            disabled={!title.trim()}
                        >
                            <GitPullRequest size={13} /> Open MR
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Import from Repo Modal ─────────────────────────────────────────────────────
function ImportRepoModal({ projectId, onClose, onImport }) {
    const [repos, setRepos] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedRepo, setSelectedRepo] = useState(null)
    const [files, setFiles] = useState([])
    const [loadingFiles, setLoadingFiles] = useState(false)
    const [selectedFile, setSelectedFile] = useState(null)
    const [prefix, setPrefix] = useState('')

    useEffect(() => {
        api.get(`/collab/projects/${projectId}/repos/`)
            .then(r => setRepos(r.data))
            .catch(() => toast.error('Could not load repositories.'))
            .finally(() => setLoading(false))
    }, [projectId])

    const loadRepoFiles = async (repo) => {
        setSelectedRepo(repo)
        setLoadingFiles(true)
        setFiles([])
        setSelectedFile(null)
        try {
            const r = await api.get(`/repository/repos/${repo.id}/browse/`)
            const entries = r.data.entries || []
            setFiles(entries.filter(e => e.type === 'file' && isTextFile(e.name)))
        } catch {
            toast.error('Could not browse repository files.')
        } finally {
            setLoadingFiles(false)
        }
    }

    const isTextFile = (name) => {
        const ext = name.split('.').pop().toLowerCase()
        return ['py', 'js', 'jsx', 'ts', 'tsx', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php',
            'html', 'htm', 'css', 'scss', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'sql',
            'sh', 'md', 'txt', 'r', 'env', 'gitignore'].includes(ext)
    }

    const importFile = async () => {
        if (!selectedFile || !selectedRepo) return
        try {
            const r = await api.get(`/repository/repos/${selectedRepo.id}/file-content/`, {
                params: { path: selectedFile.path },
                responseType: 'text',
                transformResponse: [(data) => data],
            })
            const content = typeof r.data === 'string' ? r.data : ''
            const importPath = prefix ? `${prefix.replace(/\/$/, '')}/${selectedFile.name}` : selectedFile.name
            onImport({ path: importPath, content, language: getLanguage(selectedFile.name) })
        } catch {
            toast.error('Could not read file content.')
        }
    }

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 680 }}>
                <div className="modal-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BookOpen size={16} /> Import from Repository
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={18} />
                    </button>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {loading ? <div className="spinner" style={{ margin: '20px auto' }} /> : (
                        repos.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '20px 0' }}>
                                <BookOpen size={36} style={{ opacity: 0.25, display: 'block', margin: '0 auto 10px' }} />
                                <p>No repositories linked to this project's owner yet.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 16, minHeight: 260 }}>
                                {/* Repo list */}
                                <div style={{ width: 220, borderRight: '1px solid var(--border)', paddingRight: 12, overflowY: 'auto' }}>
                                    <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 8 }}>Repositories</p>
                                    {repos.map(r => (
                                        <div
                                            key={r.id}
                                            onClick={() => loadRepoFiles(r)}
                                            style={{
                                                padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: '0.82rem',
                                                fontWeight: 600,
                                                background: selectedRepo?.id === r.id ? 'rgba(27,94,32,0.12)' : 'transparent',
                                                color: selectedRepo?.id === r.id ? 'var(--accent)' : 'var(--text)',
                                                marginBottom: 2, transition: 'background 0.12s',
                                            }}
                                            onMouseEnter={e => { if (selectedRepo?.id !== r.id) e.currentTarget.style.background = 'var(--bg3)' }}
                                            onMouseLeave={e => { if (selectedRepo?.id !== r.id) e.currentTarget.style.background = 'transparent' }}
                                        >
                                            📁 {r.title}
                                        </div>
                                    ))}
                                </div>

                                {/* File list */}
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    {!selectedRepo ? (
                                        <div style={{ color: 'var(--text2)', fontSize: '0.85rem', padding: '20px 0' }}>
                                            Select a repository to browse its files.
                                        </div>
                                    ) : loadingFiles ? (
                                        <div className="spinner" style={{ margin: '20px auto' }} />
                                    ) : files.length === 0 ? (
                                        <div style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                                            No importable text files found in this repository.
                                        </div>
                                    ) : (
                                        <div>
                                            <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 8 }}>
                                                Files — click to select
                                            </p>
                                            {files.map(f => (
                                                <div
                                                    key={f.path}
                                                    onClick={() => setSelectedFile(f)}
                                                    style={{
                                                        padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.81rem',
                                                        background: selectedFile?.path === f.path ? 'rgba(27,94,32,0.12)' : 'transparent',
                                                        color: selectedFile?.path === f.path ? 'var(--accent)' : 'var(--text)',
                                                        marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6,
                                                    }}
                                                    onMouseEnter={e => { if (selectedFile?.path !== f.path) e.currentTarget.style.background = 'var(--bg3)' }}
                                                    onMouseLeave={e => { if (selectedFile?.path !== f.path) e.currentTarget.style.background = 'transparent' }}
                                                >
                                                    <span>{getFileIcon(f.name)}</span>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    )}

                    {selectedFile && (
                        <div className="form-group">
                            <label className="form-label">Import Path Prefix (optional folder)</label>
                            <input
                                className="form-input"
                                value={prefix}
                                onChange={e => setPrefix(e.target.value)}
                                placeholder="e.g. imported/ (leave empty for root)"
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>
                                Will be imported as: <code style={{ fontFamily: 'monospace' }}>{prefix ? `${prefix.replace(/\/$/, '')}/${selectedFile.name}` : selectedFile.name}</code>
                            </span>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={importFile}
                            disabled={!selectedFile}
                        >
                            <Download size={13} /> Import File
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function LinkRepositoryModal({ project, onClose, onLinked }) {
    const [repos, setRepos] = useState([])
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [selectedRepoId, setSelectedRepoId] = useState(project?.linked_repository ? String(project.linked_repository) : '')

    useEffect(() => {
        api.get(`/collab/projects/${project.id}/repos/`)
            .then(r => {
                const items = r.data || []
                setRepos(items)
                if (!selectedRepoId && items.length > 0) {
                    const linked = items.find(item => item.is_linked)
                    setSelectedRepoId(String((linked || items[0]).id))
                }
            })
            .catch(() => toast.error('Could not load repositories.'))
            .finally(() => setLoading(false))
    }, [project.id])

    const linkAndSync = async () => {
        if (!selectedRepoId) return
        setSyncing(true)
        try {
            const { data } = await api.post(`/collab/projects/${project.id}/link-repository/`, {
                repository_id: Number(selectedRepoId),
                import_files: true,
                overwrite: true,
                clear_workspace: true,
            })
            toast.success(`Linked "${data.title}" and imported ${data.imported_files} files.`)
            onLinked(data)
            onClose()
        } catch (err) {
            const msg = err?.response?.data?.detail || 'Failed to link repository.'
            toast.error(msg)
        } finally {
            setSyncing(false)
        }
    }

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 560 }}>
                <div className="modal-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link2 size={16} /> Link Existing Repository
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={18} />
                    </button>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {loading ? (
                        <div className="spinner" style={{ margin: '20px auto' }} />
                    ) : repos.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '12px 0' }}>
                            <BookOpen size={34} style={{ opacity: 0.25, display: 'block', margin: '0 auto 10px' }} />
                            <p>No repositories available to link.</p>
                        </div>
                    ) : (
                        <>
                            <div className="form-group">
                                <label className="form-label">Repository</label>
                                <select
                                    className="form-select"
                                    value={selectedRepoId}
                                    onChange={e => setSelectedRepoId(e.target.value)}
                                >
                                    {repos.map(repo => (
                                        <option key={repo.id} value={repo.id}>
                                            {repo.title} (v{repo.current_version || 0}){repo.is_linked ? ' - currently linked' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text2)', lineHeight: 1.5 }}>
                                This pulls editable files from the selected repository&apos;s latest version into the IDE workspace so your team can edit and commit new versions directly from Collaboration.
                            </div>
                        </>
                    )}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={linkAndSync}
                            disabled={loading || syncing || !selectedRepoId}
                        >
                            {syncing ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={13} />}
                            Link and Sync
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Main IDE Tab ───────────────────────────────────────────────────────────────
export default function CollabIDETab({ project }) {
    const { user } = useAuth()
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeFile, setActiveFile] = useState(null)
    const [editorContent, setEditorContent] = useState('')
    const [isDirty, setIsDirty] = useState(false)
    const [saving, setSaving] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const [runnerMode, setRunnerMode] = useState('preview')
    const [runnerEntry, setRunnerEntry] = useState('')
    const [runnerStdin, setRunnerStdin] = useState('')
    const [previewHtml, setPreviewHtml] = useState('')
    const [runResult, setRunResult] = useState(null)
    const [runnerLoading, setRunnerLoading] = useState(false)

    const [showNewFile, setShowNewFile] = useState(false)
    const [showCommit, setShowCommit] = useState(false)
    const [showMR, setShowMR] = useState(false)
    const [showImport, setShowImport] = useState(false)
    const [showLinkRepo, setShowLinkRepo] = useState(false)
    const [linkedRepoMeta, setLinkedRepoMeta] = useState({
        id: project?.linked_repository || null,
        title: project?.linked_repository_title || '',
        version: project?.linked_repository_current_version || 0,
    })

    const editorRef = useRef(null)

    const canWrite = project.owner?.id === user?.id ||
        project.members?.some(m => m.user?.id === user?.id && (m.role === 'contributor' || m.role === 'owner'))

    useEffect(() => {
        setLinkedRepoMeta({
            id: project?.linked_repository || null,
            title: project?.linked_repository_title || '',
            version: project?.linked_repository_current_version || 0,
        })
    }, [project?.linked_repository, project?.linked_repository_title, project?.linked_repository_current_version])

    // ── Load files ──────────────────────────────────────────────────────────────
    const loadFiles = useCallback(() => {
        setLoading(true)
        api.get(`/collab/projects/${project.id}/ide-files/`)
            .then(r => setFiles(r.data))
            .catch(() => toast.error('Failed to load IDE files.'))
            .finally(() => setLoading(false))
    }, [project.id])

    const refreshLinkedRepositoryMeta = useCallback(() => {
        api.get(`/collab/projects/${project.id}/repos/`)
            .then(r => {
                const repos = r.data || []
                const linked = repos.find(repo => repo.is_linked)
                if (linked) {
                    setLinkedRepoMeta({
                        id: linked.id,
                        title: linked.title,
                        version: linked.current_version || 0,
                    })
                }
            })
            .catch(() => { })
    }, [project.id])

    useEffect(() => { loadFiles() }, [loadFiles])

    // ── Open file ───────────────────────────────────────────────────────────────
    const openFile = async (file) => {
        if (isDirty && activeFile) {
            const ok = window.confirm('You have unsaved changes. Discard them?')
            if (!ok) return
        }
        try {
            const { data } = await api.get(`/collab/projects/${project.id}/ide-files/${file.id}/`)
            setActiveFile(data)
            setEditorContent(data.content || '')
            setIsDirty(false)
        } catch {
            toast.error('Failed to open file.')
        }
    }

    // ── Create file ─────────────────────────────────────────────────────────────
    const createFile = async ({ path, content, language }) => {
        try {
            const { data } = await api.post(`/collab/projects/${project.id}/ide-files/`, {
                path, content, language,
            })
            toast.success(`Created ${path}`)
            setShowNewFile(false)
            setFiles(prev => [...prev, data])
            setActiveFile(data)
            setEditorContent(data.content || '')
            setIsDirty(false)
        } catch (err) {
            const msg = err?.response?.data?.path?.[0] || err?.response?.data?.detail || 'Failed to create file.'
            toast.error(msg)
        }
    }

    // ── Save file ───────────────────────────────────────────────────────────────
    const saveFile = async () => {
        if (!activeFile || !canWrite) return
        setSaving(true)
        try {
            const { data } = await api.patch(`/collab/projects/${project.id}/ide-files/${activeFile.id}/`, {
                content: editorContent,
                language: getLanguage(activeFile.path),
            })
            setActiveFile(data)
            setIsDirty(false)
            toast.success('File saved.')
        } catch {
            toast.error('Failed to save file.')
        } finally {
            setSaving(false)
        }
    }

    // ── Delete file ─────────────────────────────────────────────────────────────
    const deleteFile = async (file) => {
        if (!window.confirm(`Delete "${file.path}"?`)) return
        try {
            await api.delete(`/collab/projects/${project.id}/ide-files/${file.id}/`)
            toast.success(`Deleted ${file.path}`)
            setFiles(prev => prev.filter(f => f.id !== file.id))
            if (activeFile?.id === file.id) {
                setActiveFile(null)
                setEditorContent('')
                setIsDirty(false)
            }
        } catch {
            toast.error('Failed to delete file.')
        }
    }

    // ── Commit ──────────────────────────────────────────────────────────────────
    const pushCommit = async ({ message, description }) => {
        if (!activeFile) return
        // First save, then commit
        setSaving(true)
        try {
            await api.patch(`/collab/projects/${project.id}/ide-files/${activeFile.id}/`, {
                content: editorContent,
            })
            setIsDirty(false)
            await api.post(`/collab/projects/${project.id}/commits/`, { message, description })
            toast.success('💾 Changes saved & commit pushed!')
            setShowCommit(false)
            refreshLinkedRepositoryMeta()
        } catch {
            toast.error('Failed to push commit.')
        } finally {
            setSaving(false)
        }
    }

    // ── Open MR ─────────────────────────────────────────────────────────────────
    const openMR = async ({ title, description }) => {
        try {
            const { data } = await api.post(`/collab/projects/${project.id}/mrs/`, { title, description })
            toast.success(`🔀 MR #${data.number} opened!`)
            setShowMR(false)
        } catch {
            toast.error('Failed to open MR.')
        }
    }

    // ── Publish workspace to Repository ────────────────────────────────────────
    const publishWorkspace = async () => {
        setPublishing(true)
        try {
            const payload = {}
            if (!linkedRepoMeta.id) {
                payload.title = project.name
                payload.description = project.description || ''
            }
            const { data } = await api.post(`/collab/projects/${project.id}/publish-to-repo/`, payload)
            toast.success(`Published to Repository v${data.version}`)
            setLinkedRepoMeta({
                id: data.repository_id,
                title: data.title,
                version: data.version || 0,
            })
        } catch (err) {
            const msg = err?.response?.data?.detail || 'Failed to publish workspace.'
            toast.error(msg)
        } finally {
            setPublishing(false)
        }
    }

    const handleLinkedRepositorySynced = (data) => {
        setLinkedRepoMeta({
            id: data.repository_id,
            title: data.title,
            version: data.current_version || 0,
        })
        setActiveFile(null)
        setEditorContent('')
        setIsDirty(false)
        loadFiles()
    }

    const htmlEntries = files.filter(f => f.path.toLowerCase().endsWith('.html'))
    const pythonEntries = files.filter(f => f.path.toLowerCase().endsWith('.py'))

    useEffect(() => {
        if (activeFile?.path?.toLowerCase().endsWith('.html')) {
            setRunnerMode('preview')
            setRunnerEntry(activeFile.path)
            return
        }
        if (activeFile?.path?.toLowerCase().endsWith('.py')) {
            setRunnerMode('python')
            setRunnerEntry(activeFile.path)
            return
        }
        if (!runnerEntry) {
            if (htmlEntries.some(f => f.path === 'index.html')) {
                setRunnerEntry('index.html')
                setRunnerMode('preview')
            } else if (htmlEntries.length > 0) {
                setRunnerEntry(htmlEntries[0].path)
                setRunnerMode('preview')
            } else if (pythonEntries.length > 0) {
                setRunnerEntry(pythonEntries[0].path)
                setRunnerMode('python')
            }
        }
    }, [activeFile, files])

    const loadPreview = async (entryPath = runnerEntry) => {
        if (!entryPath) return
        setRunnerLoading(true)
        try {
            const { data } = await api.get(`/collab/projects/${project.id}/ide-preview/`, {
                params: { entry_file: entryPath },
            })
            setPreviewHtml(data.html || '')
            setRunResult(null)
        } catch (err) {
            const msg = err?.response?.data?.detail || 'Failed to load preview.'
            toast.error(msg)
            setPreviewHtml('')
        } finally {
            setRunnerLoading(false)
        }
    }

    const runPython = async (entryPath = runnerEntry) => {
        if (!entryPath) return
        setRunnerLoading(true)
        try {
            const payload = {
                entry_file: entryPath,
                stdin_input: runnerStdin,
            }
            if (activeFile?.path === entryPath) {
                payload.source_code = editorContent
            }

            const { data } = await api.post(`/collab/projects/${project.id}/ide-run/`, {
                ...payload,
            })
            setRunResult(data)
            setPreviewHtml('')
            if (data.status === 'success') {
                toast.success(`Ran ${data.entry_file}`)
            } else {
                toast.error('Python run finished with errors.')
            }
        } catch (err) {
            const msg = err?.response?.data?.detail || 'Failed to run Python file.'
            toast.error(msg)
            setRunResult(null)
        } finally {
            setRunnerLoading(false)
        }
    }

    // ── Import from repo ────────────────────────────────────────────────────────
    const importFile = async ({ path, content, language }) => {
        // Check if file with that path exists already
        const existing = files.find(f => f.path === path)
        if (existing) {
            // Update content
            try {
                await api.patch(`/collab/projects/${project.id}/ide-files/${existing.id}/`, { content })
                toast.success(`Updated ${path} from repository.`)
                setShowImport(false)
                loadFiles()
                openFile(existing)
            } catch {
                toast.error('Failed to update file.')
            }
        } else {
            await createFile({ path, content, language })
            setShowImport(false)
        }
    }

    // ── Keyboard shortcuts ──────────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                if (isDirty && activeFile && canWrite) saveFile()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isDirty, activeFile, canWrite, editorContent])

    const tree = buildTree(files)
    const treeEntries = Object.entries(tree).sort(([, a], [, b]) => {
        const aIsDir = !a._file; const bIsDir = !b._file
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
        return 0
    })

    return (
        <div style={{ display: 'flex', height: 'calc(100vh - 220px)', minHeight: 500, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg2)' }}>
            {/* ── Sidebar ── */}
            <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg)', flexShrink: 0 }}>

                {/* Sidebar header */}
                <div style={{
                    padding: '12px 10px 8px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <span style={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text2)' }}>
                        Explorer
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {canWrite && (
                            <>
                                <button
                                    onClick={() => setShowNewFile(true)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 3, borderRadius: 4 }}
                                    title="New File"
                                >
                                    <FilePlus size={14} />
                                </button>
                                <button
                                    onClick={() => setShowImport(true)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 3, borderRadius: 4 }}
                                    title="Import from Repository"
                                >
                                    <BookOpen size={14} />
                                </button>
                                <button
                                    onClick={() => setShowLinkRepo(true)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 3, borderRadius: 4 }}
                                    title="Link and sync existing repository"
                                >
                                    <Link2 size={14} />
                                </button>
                            </>
                        )}
                        <button
                            onClick={loadFiles}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 3, borderRadius: 4 }}
                            title="Refresh"
                        >
                            <RefreshCw size={13} />
                        </button>
                    </div>
                </div>

                {/* Project name */}
                <div style={{ padding: '8px 12px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Code size={12} /> {project.name}
                    </span>
                    {linkedRepoMeta.id && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text2)', fontWeight: 600 }}>
                            Linked: {linkedRepoMeta.title || `Repository #${linkedRepoMeta.id}`} · v{linkedRepoMeta.version || 0}
                        </span>
                    )}
                </div>

                {/* File tree */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 20 }}><Loader size={16} style={{ opacity: 0.4 }} /></div>
                    ) : files.length === 0 ? (
                        <div style={{ padding: '20px 12px', color: 'var(--text2)', fontSize: '0.8rem', textAlign: 'center' }}>
                            <FilePlus size={28} style={{ opacity: 0.25, display: 'block', margin: '0 auto 8px' }} />
                            <p>No files yet.</p>
                            {canWrite && <p style={{ marginTop: 4 }}>Click <strong>+</strong> to create one.</p>}
                        </div>
                    ) : (
                        treeEntries.map(([name, node]) => (
                            <TreeNode
                                key={name}
                                name={name}
                                node={node}
                                depth={0}
                                onSelect={openFile}
                                selectedId={activeFile?.id}
                                canWrite={canWrite}
                                onDelete={deleteFile}
                            />
                        ))
                    )}
                </div>

                {/* Role indicator */}
                <div style={{
                    padding: '8px 12px', borderTop: '1px solid var(--border)',
                    fontSize: '0.7rem', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5,
                }}>
                    {canWrite ? (
                        <><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4caf50', flexShrink: 0 }} /> Write access</>
                    ) : (
                        <><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9e9e9e', flexShrink: 0 }} /> Read-only</>
                    )}
                </div>
            </div>

            {/* ── Editor area ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

                {/* Editor toolbar */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                    borderBottom: '1px solid var(--border)', background: 'var(--bg2)',
                    flexShrink: 0, flexWrap: 'wrap',
                }}>
                    {activeFile ? (
                        <>
                            {/* File breadcrumb */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', flex: 1, minWidth: 120 }}>
                                <span style={{ fontSize: '1rem' }}>{getFileIcon(activeFile.path)}</span>
                                <code style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {activeFile.path}
                                </code>
                                {isDirty && (
                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }} title="Unsaved changes" />
                                )}
                                <span style={{
                                    fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999,
                                    background: 'var(--bg3)', color: 'var(--text2)', fontWeight: 600, flexShrink: 0,
                                }}>
                                    {getLanguage(activeFile.path)}
                                </span>
                            </div>

                            {canWrite && (
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={saveFile}
                                        disabled={!isDirty || saving}
                                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                        title="Save (Ctrl+S)"
                                    >
                                        {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                                        Save
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => { if (!isDirty || window.confirm('Save first, then commit?')) setShowCommit(true) }}
                                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                        title="Save & Commit"
                                    >
                                        <GitCommit size={12} /> Commit
                                    </button>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => setShowMR(true)}
                                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                        title="Open Merge Request"
                                    >
                                        <GitPullRequest size={12} /> New MR
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setShowLinkRepo(true)}
                                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                        title="Link this collaboration project to an existing repository"
                                    >
                                        <Link2 size={12} /> Link Repo
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={publishWorkspace}
                                        disabled={publishing || files.length === 0}
                                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                        title={linkedRepoMeta.id ? 'Push as new version to linked repository' : 'Publish collaboration workspace to Repository'}
                                    >
                                        {publishing ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} />}
                                        {linkedRepoMeta.id ? 'Push Version' : 'Publish'}
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => {
                                            const entry = activeFile?.path?.toLowerCase().endsWith('.html') ? activeFile.path : (runnerEntry || htmlEntries[0]?.path)
                                            if (entry) {
                                                setRunnerMode('preview')
                                                setRunnerEntry(entry)
                                                loadPreview(entry)
                                            } else {
                                                toast.error('Add an HTML entry file like index.html first.')
                                            }
                                        }}
                                        disabled={runnerLoading || htmlEntries.length === 0}
                                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                        title="Preview HTML/CSS/JS app"
                                    >
                                        <Eye size={12} /> Preview
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => {
                                            const entry = activeFile?.path?.toLowerCase().endsWith('.py') ? activeFile.path : (runnerEntry || pythonEntries[0]?.path)
                                            if (entry) {
                                                setRunnerMode('python')
                                                setRunnerEntry(entry)
                                                runPython(entry)
                                            } else {
                                                toast.error('Add a Python file like main.py first.')
                                            }
                                        }}
                                        disabled={runnerLoading || pythonEntries.length === 0}
                                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                        title="Run Python file"
                                    >
                                        <Play size={12} /> Run
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Terminal size={14} />
                            <span>Select a file to start editing</span>
                        </div>
                    )}
                </div>

                {/* Monaco Editor */}
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    {activeFile ? (
                        <>
                            <Editor
                                height="100%"
                                language={getLanguage(activeFile.path)}
                                value={editorContent}
                                onChange={(val) => {
                                    setEditorContent(val || '')
                                    setIsDirty(true)
                                }}
                                onMount={editor => { editorRef.current = editor }}
                                options={{
                                    readOnly: !canWrite,
                                    minimap: { enabled: files.length > 3 },
                                    fontSize: 13.5,
                                    fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
                                    fontLigatures: true,
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    wordWrap: 'on',
                                    smoothScrolling: true,
                                    cursorBlinking: 'smooth',
                                    cursorSmoothCaretAnimation: 'on',
                                    bracketPairColorization: { enabled: true },
                                    formatOnPaste: true,
                                    tabSize: 2,
                                    renderLineHighlight: 'line',
                                    scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                                    padding: { top: 16 },
                                    suggest: { preview: true },
                                    quickSuggestions: true,
                                }}
                                theme="vs-light"
                            />
                            {/* Read-only overlay notice */}
                            {!canWrite && (
                                <div style={{
                                    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                                    background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 999,
                                    padding: '4px 14px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 5,
                                    pointerEvents: 'none',
                                }}>
                                    <EyeOff size={11} /> Read-only — viewer access
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{
                            height: '100%', display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', color: 'var(--text2)',
                            background: 'var(--bg)',
                        }}>
                            <Code size={48} style={{ opacity: 0.12, marginBottom: 16 }} />
                            <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 6 }}>No file open</p>
                            <p style={{ fontSize: '0.85rem', marginBottom: 20, textAlign: 'center', maxWidth: 300 }}>
                                Select a file from the explorer, or create a new one to start collaborating.
                            </p>
                            {canWrite && (
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button className="btn btn-primary btn-sm" onClick={() => setShowNewFile(true)}>
                                        <FilePlus size={13} /> New File
                                    </button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(true)}>
                                        <BookOpen size={13} /> Import from Repository
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{
                    borderTop: '1px solid var(--border)',
                    background: 'var(--bg)',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    minHeight: 220,
                    maxHeight: 320,
                }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            IDE Runner
                        </span>
                        <select
                            value={runnerMode}
                            onChange={e => setRunnerMode(e.target.value)}
                            className="form-select"
                            style={{ width: 160, fontSize: '0.8rem', padding: '6px 10px' }}
                        >
                            <option value="preview">Web Preview</option>
                            <option value="python">Python Run</option>
                        </select>
                        <select
                            value={runnerEntry}
                            onChange={e => setRunnerEntry(e.target.value)}
                            className="form-select"
                            style={{ flex: 1, minWidth: 180, fontSize: '0.8rem', padding: '6px 10px' }}
                        >
                            <option value="">Select entry file</option>
                            {(runnerMode === 'preview' ? htmlEntries : pythonEntries).map(file => (
                                <option key={file.id} value={file.path}>{file.path}</option>
                            ))}
                        </select>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => runnerMode === 'preview' ? loadPreview() : runPython()}
                            disabled={runnerLoading || !runnerEntry}
                        >
                            {runnerLoading ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : (runnerMode === 'preview' ? <Eye size={13} /> : <Play size={13} />)}
                            {runnerMode === 'preview' ? 'Open Preview' : 'Run Python'}
                        </button>
                    </div>

                    {runnerMode === 'python' && (
                        <>
                            <textarea
                                className="form-textarea"
                                value={runnerStdin}
                                onChange={e => setRunnerStdin(e.target.value)}
                                onKeyDown={(e) => {
                                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !runnerLoading && runnerEntry) {
                                        e.preventDefault()
                                        runPython()
                                    }
                                }}
                                placeholder="Standard input (stdin) for your Python script. Separate lines for multiple inputs."
                                rows={3}
                                style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                            />
                            <div style={{ fontSize: '0.73rem', color: 'var(--text2)', marginTop: -4 }}>
                                Tip: Use one value per line for multiple <code>input()</code> calls. Press <code>Ctrl+Enter</code> to run.
                            </div>
                        </>
                    )}

                    <div style={{
                        flex: 1,
                        minHeight: 0,
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: runnerMode === 'preview' ? '#fff' : '#0f172a',
                    }}>
                        {runnerMode === 'preview' ? (
                            previewHtml ? (
                                <iframe
                                    title="Collaboration IDE Preview"
                                    srcDoc={previewHtml}
                                    style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                                    sandbox="allow-scripts allow-modals"
                                />
                            ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: '0.85rem' }}>
                                    Select an HTML entry like `index.html`, then open preview.
                                </div>
                            )
                        ) : (
                            <div style={{ height: '100%', overflow: 'auto', padding: 14, color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>
                                {runResult ? (
                                    `${runResult.stdout || ''}${runResult.stderr ? `\n${runResult.stderr}` : ''}`.trim() || 'Program finished with no output.'
                                ) : 'Run a Python entry file to see stdout/stderr here.'}
                            </div>
                        )}
                    </div>
                </div>

                {/* Status bar */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '4px 14px',
                    borderTop: '1px solid var(--border)', background: 'var(--accent)',
                    color: '#fff', fontSize: '0.7rem', flexShrink: 0,
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <GitCommit size={10} /> {project.commit_count || 0} commits
                    </span>
                    {activeFile && (
                        <>
                            <span>
                                {getLanguage(activeFile.path).toUpperCase()}
                            </span>
                            <span style={{ marginLeft: 'auto', opacity: 0.75 }}>
                                Last edited by {activeFile.last_edited_by?.full_name || '—'}
                            </span>
                        </>
                    )}
                    {!activeFile && (
                        <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
                            {files.length} file{files.length !== 1 ? 's' : ''} in workspace
                        </span>
                    )}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#69f0ae' }} />
                        Live
                    </span>
                </div>
            </div>

            {/* ── Modals ── */}
            {showNewFile && <NewFileModal onClose={() => setShowNewFile(false)} onCreate={createFile} />}
            {showCommit && activeFile && (
                <CommitModal file={activeFile} onClose={() => setShowCommit(false)} onCommit={pushCommit} />
            )}
            {showMR && (
                <MRFromIDEModal file={activeFile} onClose={() => setShowMR(false)} onSubmit={openMR} />
            )}
            {showImport && (
                <ImportRepoModal projectId={project.id} onClose={() => setShowImport(false)} onImport={importFile} />
            )}
            {showLinkRepo && (
                <LinkRepositoryModal
                    project={project}
                    onClose={() => setShowLinkRepo(false)}
                    onLinked={handleLinkedRepositorySynced}
                />
            )}
        </div>
    )
}
