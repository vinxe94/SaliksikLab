/**
 * RepositoryRunner
 *
 * An embedded mini-IDE panel for the DetailPage that lets authenticated users
 * run uploaded code files (or the auto-detected entry point from a ZIP archive)
 * directly within SaliksikLab — using the same sandbox as Code Lab.
 *
 * Features:
 *  - Auto-detects all runnable files in the upload (calls /runnable/)
 *  - Loads the source code of the selected file for review before running
 *  - Optional stdin input
 *  - Live stdout / stderr output with status badge
 *  - Entry-point selector dropdown for archives with multiple source files
 *  - Collapsible panel to avoid cluttering the detail page
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Play, ChevronDown, ChevronUp, Terminal, AlertCircle, Clock, RotateCcw } from 'lucide-react'

// ── Language display config ───────────────────────────────────────────────────
const LANG_CFG = {
    python: { icon: '🐍', label: 'Python 3', color: '#3b82f6' },
    java: { icon: '☕', label: 'Java', color: '#f97316' },
    cpp: { icon: '⚙️', label: 'C++ 17', color: '#8b5cf6' },
}

const STATUS_STYLE = {
    success: { bg: 'rgba(46,125,50,0.12)', color: '#2E7D32', label: '✓ Success' },
    error: { bg: 'rgba(198,40,40,0.12)', color: '#c62828', label: '✗ Error' },
    timeout: { bg: 'rgba(230,81,0,0.12)', color: '#e65100', label: '⏰ Timeout' },
}

/**
 * Props:
 *   repositoryId  — the ResearchOutput pk
 *   fileId        — the specific OutputFile id (latest version)
 *   filename      — original filename (used to check if runnable at all)
 */
export default function RepositoryRunner({ repositoryId, fileId, filename }) {
    const [open, setOpen] = useState(false)
    const [runnable, setRunnable] = useState([])   // [{path, language}, …]
    const [loading, setLoading] = useState(false)
    const [checked, setChecked] = useState(false) // did we already call /runnable/?

    const [selectedEntry, setSelectedEntry] = useState('')   // path of chosen file
    const [sourceCode, setSourceCode] = useState('')
    const [sourceLoading, setSourceLoading] = useState(false)

    const [stdin, setStdin] = useState('')
    const [running, setRunning] = useState(false)
    const [result, setResult] = useState(null)
    const [activeTab, setActiveTab] = useState('output')
    const [lineCount, setLineCount] = useState(1)
    const textareaRef = useRef(null)

    // ── Fetch runnable file list when panel is first opened ───────────────────
    useEffect(() => {
        if (!open || checked) return
        setChecked(true)
        setLoading(true)

        const url = fileId
            ? `/repository/${repositoryId}/runnable/${fileId}/`
            : `/repository/${repositoryId}/runnable/`

        api.get(url)
            .then(r => {
                setRunnable(r.data.runnable_files || [])
                if (r.data.runnable_files?.length > 0) {
                    setSelectedEntry(r.data.runnable_files[0].path)
                }
            })
            .catch(() => setRunnable([]))
            .finally(() => setLoading(false))
    }, [open, checked, repositoryId, fileId])

    // ── Fetch source code when selected entry changes ─────────────────────────
    useEffect(() => {
        if (!selectedEntry) return
        setSourceCode('')
        setResult(null)
        setSourceLoading(true)

        const token = localStorage.getItem('access_token')
        const baseUrl = fileId
            ? `/api/repository/${repositoryId}/file-content/${fileId}/`
            : `/api/repository/${repositoryId}/file-content/`

        // Single-file repo — read file directly; archive — use ?path=
        const isArchive = /\.(zip|tar|gz|tgz|rar|bz2|xz|7z)$/i.test(filename || '')
        const url = isArchive
            ? `${baseUrl}?path=${encodeURIComponent(selectedEntry)}`
            : baseUrl

        fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.text())
            .then(text => {
                setSourceCode(text)
                setLineCount(text.split('\n').length)
            })
            .catch(() => setSourceCode('// Could not load source code.'))
            .finally(() => setSourceLoading(false))
    }, [selectedEntry, repositoryId, fileId, filename])

    // ── Update line count when user edits the code ────────────────────────────
    useEffect(() => {
        setLineCount(sourceCode.split('\n').length)
    }, [sourceCode])

    // ── Run ───────────────────────────────────────────────────────────────────
    const handleRun = useCallback(async () => {
        if (running) return
        setRunning(true)
        setResult(null)
        setActiveTab('output')

        const url = fileId
            ? `/repository/${repositoryId}/run/${fileId}/`
            : `/repository/${repositoryId}/run/`

        try {
            const { data } = await api.post(url, {
                stdin_input: stdin,
                entry_file: selectedEntry,
            })
            setResult(data)
            if (data.status === 'success') {
                toast.success(`Ran ${data.entry_file} · ${data.execution_time_ms?.toFixed(1)}ms`)
            } else if (data.status === 'timeout') {
                toast.error('Execution timed out (10s limit).')
            } else {
                toast.error('Program exited with an error.')
            }
        } catch (err) {
            const msg = err?.response?.data?.detail || 'Execution failed.'
            toast.error(msg)
        } finally {
            setRunning(false)
        }
    }, [running, repositoryId, fileId, stdin, selectedEntry])

    const handleKeyDown = useCallback((e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            handleRun()
        }
        if (e.key === 'Tab') {
            e.preventDefault()
            const ta = textareaRef.current
            const start = ta.selectionStart
            const end = ta.selectionEnd
            const newValue = sourceCode.substring(0, start) + '    ' + sourceCode.substring(end)
            setSourceCode(newValue)
            requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + 4
            })
        }
    }, [sourceCode, handleRun])

    // ── Decide if the "Run" panel should even appear ──────────────────────────
    // Hide entirely for PDFs, images, Word docs, etc. before even calling the API.
    const RUNNABLE_EXTS = /\.(py|java|cpp|cc|cxx|zip|tar|gz|tgz|rar|bz2|xz|7z)$/i
    if (filename && !RUNNABLE_EXTS.test(filename)) return null

    const selectedLang = runnable.find(r => r.path === selectedEntry)?.language || 'python'
    const langCfg = LANG_CFG[selectedLang] || LANG_CFG.python

    return (
        <div style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            marginBottom: 20,
            overflow: 'hidden',
        }}>
            {/* ── Panel header / toggle ─────────────────────────────────────── */}
            <button
                id="repo-runner-toggle"
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    color: 'var(--text)',
                    borderBottom: open ? '1px solid var(--border)' : 'none',
                    transition: 'background 0.15s',
                }}
            >
                <Terminal size={15} color="var(--accent)" />
                <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                    ▶ Run This Repository
                </span>
                <span style={{
                    marginLeft: 6,
                    background: 'rgba(27,94,32,0.1)',
                    color: 'var(--accent)',
                    border: '1px solid rgba(27,94,32,0.2)',
                    borderRadius: 999,
                    padding: '2px 10px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                }}>🔒 Sandboxed</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text2)' }}>
                    {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
            </button>

            {/* ── Panel body ────────────────────────────────────────────────── */}
            {open && (
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Loading state */}
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text2)', fontSize: '0.88rem' }}>
                            <div className="spinner" style={{ margin: '0 auto 10px' }} />
                            Scanning for runnable files…
                        </div>
                    )}

                    {/* No runnable files */}
                    {!loading && checked && runnable.length === 0 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: 'rgba(227,179,65,0.08)',
                            border: '1px solid rgba(227,179,65,0.3)',
                            borderRadius: 'var(--radius)',
                            padding: '12px 16px',
                            fontSize: '0.85rem', color: 'var(--text2)',
                        }}>
                            <AlertCircle size={16} color="#e3b341" />
                            No runnable source files found in this upload. Supported: <strong>.py, .java, .cpp</strong>
                        </div>
                    )}

                    {/* Main runner UI */}
                    {!loading && runnable.length > 0 && (
                        <>
                            {/* Entry-point selector + Run button row */}
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>

                                {/* Language badge */}
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    background: 'var(--bg3)', border: '1px solid var(--border)',
                                    borderRadius: 8, padding: '6px 14px',
                                    fontSize: '0.82rem', fontWeight: 600, color: langCfg.color,
                                }}>
                                    {langCfg.icon} {langCfg.label}
                                </span>

                                {/* Entry-point dropdown (only shown for archives with multiple files) */}
                                {runnable.length > 1 && (
                                    <select
                                        id="entry-file-select"
                                        value={selectedEntry}
                                        onChange={e => setSelectedEntry(e.target.value)}
                                        style={{
                                            flex: 1, minWidth: 160,
                                            background: 'var(--bg3)',
                                            border: '1px solid var(--border)',
                                            borderRadius: 8,
                                            color: 'var(--text)',
                                            padding: '7px 12px',
                                            fontSize: '0.82rem',
                                            fontFamily: 'inherit',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {runnable.map(r => (
                                            <option key={r.path} value={r.path}>
                                                {LANG_CFG[r.language]?.icon} {r.path}
                                            </option>
                                        ))}
                                    </select>
                                )}

                                {/* Clear & Run */}
                                <button
                                    id="run-repo-btn"
                                    onClick={handleRun}
                                    disabled={running || sourceLoading}
                                    style={{
                                        marginLeft: 'auto',
                                        display: 'inline-flex', alignItems: 'center', gap: 8,
                                        padding: '8px 22px',
                                        background: running ? 'rgba(27,94,32,0.5)' : 'var(--accent)',
                                        color: '#fff',
                                        border: 'none', borderRadius: 8, cursor: running ? 'not-allowed' : 'pointer',
                                        fontSize: '0.88rem', fontWeight: 700,
                                        fontFamily: 'inherit',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {running ? (
                                        <><span style={{ animation: 'spin 0.7s linear infinite', display: 'inline-block' }}>⏳</span> Running…</>
                                    ) : (
                                        <><Play size={14} fill="currentColor" /> Run <kbd style={{ opacity: 0.6, fontSize: '0.7rem', marginLeft: 4 }}>Ctrl+↵</kbd></>
                                    )}
                                </button>
                            </div>

                            {/* ── Code editor ──────────────────────────────── */}
                            <div style={{
                                border: '1px solid var(--border)',
                                borderRadius: 10,
                                overflow: 'hidden',
                                background: '#1e1e2e',
                            }}>
                                {/* Editor header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 14px',
                                    background: '#16162a',
                                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                                }}>
                                    <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                                        {selectedEntry || filename}
                                    </span>
                                    <button
                                        onClick={() => setSourceCode('')}
                                        style={{
                                            background: 'none', border: 'none',
                                            color: '#6b7280', cursor: 'pointer', fontSize: '0.75rem',
                                            display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <RotateCcw size={11} /> Reset
                                    </button>
                                </div>

                                {sourceLoading ? (
                                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af' }}>
                                        <div className="spinner" style={{ margin: '0 auto 8px' }} />
                                        Loading source…
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', maxHeight: 400, overflow: 'auto' }}>
                                        {/* Line numbers */}
                                        <div style={{
                                            padding: '12px 8px',
                                            color: '#4b5563',
                                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                            fontSize: '0.78rem', lineHeight: 1.6,
                                            minWidth: 42, textAlign: 'right',
                                            userSelect: 'none',
                                            borderRight: '1px solid rgba(255,255,255,0.07)',
                                            background: '#16162a',
                                        }}>
                                            {Array.from({ length: lineCount }, (_, i) => (
                                                <div key={i + 1} style={{ paddingRight: 8 }}>{i + 1}</div>
                                            ))}
                                        </div>
                                        {/* Editable code area */}
                                        <textarea
                                            ref={textareaRef}
                                            id="repo-code-editor"
                                            value={sourceCode}
                                            onChange={e => setSourceCode(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            spellCheck={false}
                                            autoComplete="off"
                                            style={{
                                                flex: 1,
                                                background: 'transparent',
                                                border: 'none', outline: 'none', resize: 'none',
                                                padding: '12px 14px',
                                                color: '#e2e8f0',
                                                fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                                                fontSize: '0.78rem', lineHeight: 1.6,
                                                tabSize: 4, caretColor: '#60a5fa',
                                                minHeight: 160,
                                                width: '100%',
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* ── Stdin input ───────────────────────────────── */}
                            <div>
                                <label style={{
                                    display: 'block', fontSize: '0.75rem',
                                    fontWeight: 700, color: 'var(--text2)',
                                    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
                                }}>
                                    📥 Standard Input (stdin)
                                </label>
                                <textarea
                                    id="repo-stdin"
                                    value={stdin}
                                    onChange={e => setStdin(e.target.value)}
                                    placeholder="Provide input for programs that use input() / Scanner / cin…"
                                    rows={2}
                                    style={{
                                        width: '100%', boxSizing: 'border-box',
                                        background: 'var(--bg3)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 8, color: 'var(--text)',
                                        padding: '8px 12px',
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: '0.8rem', resize: 'vertical', outline: 'none',
                                    }}
                                />
                            </div>

                            {/* ── Output panel ──────────────────────────────── */}
                            <div style={{
                                border: '1px solid var(--border)',
                                borderRadius: 10, overflow: 'hidden',
                                background: 'var(--bg3)',
                            }}>
                                {/* Tab bar */}
                                <div style={{
                                    display: 'flex',
                                    borderBottom: '1px solid var(--border)',
                                    background: 'var(--bg2)',
                                }}>
                                    {[
                                        { id: 'output', label: '📤 Output' },
                                        { id: 'errors', label: '⚠️ Errors' },
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            id={`repo-tab-${tab.id}`}
                                            onClick={() => setActiveTab(tab.id)}
                                            style={{
                                                padding: '8px 16px',
                                                background: 'transparent', border: 'none',
                                                borderBottom: activeTab === tab.id
                                                    ? '2px solid var(--accent)'
                                                    : '2px solid transparent',
                                                color: activeTab === tab.id ? 'var(--text)' : 'var(--text2)',
                                                cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                                                fontFamily: 'inherit',
                                            }}
                                        >
                                            {tab.label}
                                            {tab.id === 'errors' && result?.stderr && (
                                                <span style={{
                                                    marginLeft: 6, background: '#c62828', color: '#fff',
                                                    borderRadius: 999, padding: '1px 5px', fontSize: '0.65rem',
                                                }}>!</span>
                                            )}
                                        </button>
                                    ))}

                                    {/* Status badge */}
                                    {result && (
                                        <span style={{
                                            marginLeft: 'auto', alignSelf: 'center', marginRight: 12,
                                            background: STATUS_STYLE[result.status]?.bg,
                                            color: STATUS_STYLE[result.status]?.color,
                                            borderRadius: 999, padding: '2px 10px',
                                            fontSize: '0.7rem', fontWeight: 700,
                                        }}>
                                            {STATUS_STYLE[result.status]?.label}
                                        </span>
                                    )}
                                    {result && (
                                        <span style={{
                                            alignSelf: 'center', marginRight: 12,
                                            fontSize: '0.7rem', color: 'var(--text2)',
                                            display: 'flex', alignItems: 'center', gap: 4,
                                        }}>
                                            <Clock size={11} /> {result.execution_time_ms?.toFixed(1)}ms
                                        </span>
                                    )}
                                </div>

                                {/* Tab content */}
                                <div style={{ padding: 14, minHeight: 80, maxHeight: 320, overflow: 'auto' }}>
                                    {activeTab === 'output' && (
                                        result ? (
                                            <pre style={{
                                                color: 'var(--text)', margin: 0,
                                                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                                                fontSize: '0.8rem', lineHeight: 1.6,
                                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                            }}>
                                                {result.stdout
                                                    ? result.stdout
                                                    : <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>(no stdout output)</span>
                                                }
                                            </pre>
                                        ) : (
                                            <div style={{
                                                textAlign: 'center', padding: '24px 0',
                                                color: 'var(--text2)', fontSize: '0.85rem',
                                            }}>
                                                Press <strong>Run</strong> or <kbd style={{
                                                    background: 'var(--bg2)', border: '1px solid var(--border)',
                                                    borderRadius: 4, padding: '1px 5px', fontSize: '0.75rem',
                                                }}>Ctrl+↵</kbd> to execute.
                                            </div>
                                        )
                                    )}
                                    {activeTab === 'errors' && (
                                        <pre style={{
                                            color: result?.stderr ? '#f87171' : 'var(--text2)',
                                            margin: 0,
                                            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                                            fontSize: '0.8rem', lineHeight: 1.6,
                                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                            fontStyle: result?.stderr ? 'normal' : 'italic',
                                        }}>
                                            {result?.stderr || '(no errors)'}
                                        </pre>
                                    )}
                                </div>
                            </div>

                            {/* Sandbox note */}
                            <div style={{ fontSize: '0.72rem', color: 'var(--text2)', textAlign: 'right' }}>
                                🔒 Code runs in an isolated sandbox · 10s timeout · 128MB memory limit
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

RepositoryRunner.propTypes = {
    repositoryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    fileId: PropTypes.number,
    filename: PropTypes.string,
}

RepositoryRunner.defaultProps = {
    fileId: null,
    filename: '',
}
