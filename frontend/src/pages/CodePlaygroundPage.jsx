/**
 * CodePlaygroundPage
 * 
 * A full in-browser IDE supporting Python, Java, and C++ with:
 *  - Syntax-highlighted editor (via custom textarea + highlight overlay)
 *  - Secure sandbox execution via /api/code/execute/
 *  - Live stdout/stderr output panel
 *  - Execution time & status badges
 *  - Run history sidebar
 *  - Built-in sample programs for quick start
 *  - Multilingual UI via LanguageContext
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
    Activity,
    Clipboard,
    ClipboardList,
    Code2,
    Coffee,
    FileCode2,
    History,
    Inbox,
    LoaderCircle,
    Lock,
    Play,
    Shield,
    Timer,
    Trash2,
    TriangleAlert,
} from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import toast from 'react-hot-toast'

// ── Sample programs ───────────────────────────────────────────────────────────
const SAMPLES = {
    python: `# Python 3 – Fibonacci sequence
def fibonacci(n):
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result

n = int(input("How many Fibonacci numbers? "))
print("Fibonacci sequence:", fibonacci(n))
`,
    java: `// Java – Simple calculator
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.print("Enter two numbers: ");
        double a = sc.nextDouble();
        double b = sc.nextDouble();
        System.out.printf("Sum:      %.2f%n", a + b);
        System.out.printf("Product:  %.2f%n", a * b);
        System.out.printf("Quotient: %.2f%n", (b != 0 ? a / b : Double.NaN));
    }
}
`,
    cpp: `// C++17 – Bubble sort
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> arr(n);
    for (int& x : arr) cin >> x;

    // Bubble sort
    for (int i = 0; i < n - 1; i++)
        for (int j = 0; j < n - i - 1; j++)
            if (arr[j] > arr[j + 1])
                swap(arr[j], arr[j + 1]);

    cout << "Sorted: ";
    for (int x : arr) cout << x << " ";
    cout << endl;
    return 0;
}
`,
}

const SAMPLE_STDIN = {
    python: `8`,
    java: `12
4`,
    cpp: `5
9 3 7 1 4`,
}

// ── Language config ───────────────────────────────────────────────────────────
const LANG_CONFIG = {
    python: { label: 'Python 3', icon: Code2, color: '#3b82f6', ext: '.py' },
    java: { label: 'Java', icon: Coffee, color: '#f97316', ext: '.java' },
    cpp: { label: 'C++ 17', icon: FileCode2, color: '#8b5cf6', ext: '.cpp' },
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_STYLE = {
    success: { bg: 'rgba(46,125,50,0.12)', color: '#2E7D32', label: '✓ Success' },
    error: { bg: 'rgba(198,40,40,0.12)', color: '#c62828', label: '✗ Error' },
    timeout: { bg: 'rgba(230,81,0,0.12)', color: '#e65100', label: '⏰ Timeout' },
}

export default function CodePlaygroundPage() {
    const { t, locale } = useLanguage()

    const [language, setLanguage] = useState('python')
    const [code, setCode] = useState(SAMPLES.python)
    const [stdin, setStdin] = useState('')
    const [running, setRunning] = useState(false)
    const [result, setResult] = useState(null)
    const [history, setHistory] = useState([])
    const [activeTab, setActiveTab] = useState('output') // 'output' | 'errors' | 'history'
    const [lineCount, setLineCount] = useState(1)
    const textareaRef = useRef(null)

    const codeLooksInteractive = useCallback((source, lang) => {
        if (lang === 'python') return /\binput\s*\(/.test(source)
        if (lang === 'java') return /\bScanner\b|\bnext(Int|Double|Line|Float|Long|Short|Byte)\s*\(/.test(source)
        if (lang === 'cpp') return /\bcin\s*>>|\bgetline\s*\(/.test(source)
        return false
    }, [])

    // Compute line numbers whenever code changes
    useEffect(() => {
        setLineCount(code.split('\n').length)
    }, [code])

    // Load history on mount
    useEffect(() => {
        api.get('/code/history/').then(r => setHistory(r.data)).catch(() => { })
    }, [])

    const handleLanguageChange = useCallback((lang) => {
        setLanguage(lang)
        setCode(SAMPLES[lang])
        setStdin(SAMPLE_STDIN[lang] || '')
        setResult(null)
    }, [])

    const handleRun = useCallback(async () => {
        if (!code.trim()) {
            toast.error('Please write some code first.')
            return
        }
        if (codeLooksInteractive(code, language) && !stdin.trim()) {
            toast.error('This program looks like it needs input. Add values in the stdin panel first.')
            return
        }
        setRunning(true)
        setResult(null)
        setActiveTab('output')
        try {
            const { data } = await api.post('/code/execute/', {
                language,
                source_code: code,
                stdin_input: stdin,
            })
            setResult(data)
            if (data.status === 'success') {
                toast.success(`${t('code.status.success')} · ${data.execution_time_ms?.toFixed(1)}ms`)
            } else if (data.status === 'timeout') {
                toast.error(t('code.status.timeout'))
            } else {
                toast.error(t('code.status.error'))
            }
            // Refresh history
            api.get('/code/history/').then(r => setHistory(r.data)).catch(() => { })
        } catch (err) {
            toast.error(err?.response?.data?.error || t('general.error'))
        } finally {
            setRunning(false)
        }
    }, [code, language, stdin, t, codeLooksInteractive])

    const handleKeyDown = useCallback((e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            if (!running) handleRun()
        }
        // Handle Tab key in editor
        if (e.key === 'Tab') {
            e.preventDefault()
            const ta = textareaRef.current
            const start = ta.selectionStart
            const end = ta.selectionEnd
            const spaces = '    '
            const newValue = code.substring(0, start) + spaces + code.substring(end)
            setCode(newValue)
            // Restore cursor position
            requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + spaces.length
            })
        }
    }, [code, running, handleRun])

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            toast.success(t('general.copied'))
        })
    }

    const tabs = [
        { id: 'output', label: t('code.output'), icon: Play },
        { id: 'errors', label: t('code.stderr'), icon: TriangleAlert },
        { id: 'history', label: t('code.history'), icon: History },
    ]

    return (
        <div className="layout">
            <Sidebar />

            {/* ── Main ───────────────────────────────────────────────────── */}
            <main className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <header className="page-header">
                    <div>
                        <h1 style={{ fontSize: '1.2rem', marginBottom: 2 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <Code2 size={18} />
                                {t('code.title')}
                            </span>
                        </h1>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>{t('code.subtitle')}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {/* Sandbox badge */}
                        <span style={{
                            background: 'rgba(27,94,32,0.08)', color: 'var(--accent)',
                            border: '1px solid rgba(27,94,32,0.2)',
                            borderRadius: 999, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600,
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                            <Shield size={14} />
                            {t('code.sandbox')}
                        </span>
                    </div>
                </header>

                {/* Body */}
                <div className="page-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Language selector + run button */}
                    <div className="code-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div className="code-language-tabs" style={{ display: 'flex', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                            {Object.entries(LANG_CONFIG).map(([lang, cfg]) => (
                                (() => {
                                    const Icon = cfg.icon
                                    return (
                                <button
                                    key={lang}
                                    id={`lang-btn-${lang}`}
                                    onClick={() => handleLanguageChange(lang)}
                                    style={{
                                        padding: '8px 20px',
                                        background: language === lang ? cfg.color : 'transparent',
                                        color: language === lang ? '#fff' : 'var(--text2)',
                                        border: 'none', cursor: 'pointer',
                                        fontSize: '0.88rem', fontWeight: 600,
                                        fontFamily: 'inherit',
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        transition: 'all 0.2s',
                                        borderRight: '1px solid var(--border)',
                                    }}
                                >
                                    <Icon size={15} strokeWidth={2.2} /> {cfg.label}
                                </button>
                                    )
                                })()
                            ))}
                        </div>

                        <div className="code-action-row" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            <button
                                className="btn btn-ghost btn-sm"
                                id="load-sample-btn"
                                onClick={() => {
                                    setCode(SAMPLES[language])
                                    setStdin(SAMPLE_STDIN[language] || '')
                                }}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <ClipboardList size={15} />
                                    {t('code.loadSample')}
                                </span>
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                id="clear-editor-btn"
                                onClick={() => {
                                    setCode('')
                                    setStdin('')
                                }}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <Trash2 size={15} />
                                    {t('code.clearEditor')}
                                </span>
                            </button>
                            <button
                                className="btn btn-primary"
                                id="run-code-btn"
                                onClick={handleRun}
                                disabled={running}
                                style={{ minWidth: 140 }}
                            >
                                {running ? (
                                    <><LoaderCircle size={15} style={{ display: 'inline-block', animation: 'spin 0.7s linear infinite', marginRight: 4 }} /> {t('code.running')}</>
                                ) : (
                                    <><Play size={15} style={{ marginRight: 4 }} /> {t('code.run')} <kbd style={{ opacity: 0.6, fontSize: '0.7rem', marginLeft: 4 }}>Ctrl+↵</kbd></>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Editor + Output split pane */}
                    <div className="code-workspace-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1, minHeight: 480 }}>

                        {/* ── Code Editor ─────────────────────────────────────── */}
                        <div style={{
                            background: '#ffffff', borderRadius: 12,
                            border: '1px solid #e0e0e0',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        }}>
                            {/* Editor header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 16px',
                                background: '#f5f5f5', borderBottom: '1px solid #e0e0e0',
                            }}>
                                <span style={{
                                    color: LANG_CONFIG[language].color, fontWeight: 600,
                                    fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    {(() => {
                                        const LangIcon = LANG_CONFIG[language].icon
                                        return <LangIcon size={15} strokeWidth={2.2} />
                                    })()}
                                    {LANG_CONFIG[language].label}
                                    <span style={{ color: '#9e9e9e', fontWeight: 400 }}>main{LANG_CONFIG[language].ext}</span>
                                </span>
                                <button
                                    onClick={() => copyToClipboard(code)}
                                    style={{ background: 'none', border: 'none', color: '#9e9e9e', cursor: 'pointer', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                >
                                    <Clipboard size={14} />
                                    {t('general.copy')}
                                </button>
                            </div>

                            {/* Line numbers + textarea */}
                            <div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>
                                {/* Line numbers */}
                                <div style={{
                                    padding: '14px 8px',
                                    color: '#bdbdbd',
                                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                                    fontSize: '0.82rem',
                                    lineHeight: '1.6',
                                    minWidth: 42,
                                    textAlign: 'right',
                                    userSelect: 'none',
                                    borderRight: '1px solid #e8e8e8',
                                    background: '#fafafa',
                                }}>
                                    {Array.from({ length: lineCount }, (_, i) => (
                                        <div key={i + 1} style={{ paddingRight: 8 }}>{i + 1}</div>
                                    ))}
                                </div>

                                {/* Code textarea */}
                                <textarea
                                    ref={textareaRef}
                                    id="code-editor"
                                    value={code}
                                    onChange={e => setCode(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    spellCheck={false}
                                    autoComplete="off"
                                    style={{
                                        flex: 1,
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        resize: 'none',
                                        padding: '14px 16px',
                                        color: '#1a1a2e',
                                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                                        fontSize: '0.82rem',
                                        lineHeight: '1.6',
                                        tabSize: 4,
                                        caretColor: '#3b82f6',
                                        width: '100%',
                                    }}
                                />
                            </div>

                            {/* Stdin */}
                            <div style={{ borderTop: '1px solid #e0e0e0', padding: '12px 16px', background: '#f5f5f5' }}>
                                <label style={{ color: '#757575', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                    <Inbox size={14} />
                                    {t('code.stdin')}
                                </label>
                                <textarea
                                    id="stdin-input"
                                    value={stdin}
                                    onChange={e => setStdin(e.target.value)}
                                    placeholder={language === 'python' ? 'One value per prompt, e.g. 8' : language === 'java' ? 'Example:\n12\n4' : 'Example:\n5\n9 3 7 1 4'}
                                    rows={4}
                                    style={{
                                        width: '100%', background: '#ffffff', border: '1px solid #e0e0e0',
                                        borderRadius: 6, color: '#1a1a2e', padding: '8px 10px',
                                        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                                        fontSize: '0.8rem', resize: 'vertical', outline: 'none',
                                    }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                                    <span style={{ color: '#757575', fontSize: '0.73rem' }}>
                                        Use one line per prompt, or space-separated values for `cin` / `Scanner`.
                                    </span>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setStdin(SAMPLE_STDIN[language] || '')}
                                    >
                                        Load sample input
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ── Output Panel ─────────────────────────────────────── */}
                        <div style={{
                            background: '#ffffff', borderRadius: 12,
                            border: '1px solid #e0e0e0',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        }}>
                            {/* Tab bar */}
                            <div style={{
                                display: 'flex', gap: 0,
                                borderBottom: '1px solid #e0e0e0', background: '#f5f5f5',
                            }}>
                                {tabs.map(tab => {
                                    const TabIcon = tab.icon
                                    return (
                                    <button
                                        key={tab.id}
                                        id={`tab-${tab.id}`}
                                        onClick={() => setActiveTab(tab.id)}
                                        style={{
                                            padding: '10px 16px',
                                            background: 'transparent',
                                            border: 'none',
                                            borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                                            color: activeTab === tab.id ? '#1a1a2e' : '#9e9e9e',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            fontFamily: 'inherit',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            <TabIcon size={14} />
                                            {tab.label}
                                        </span>
                                        {tab.id === 'errors' && result?.stderr && (
                                            <span style={{
                                                marginLeft: 6, background: '#c62828', color: '#fff',
                                                borderRadius: 999, padding: '1px 6px', fontSize: '0.7rem',
                                            }}>!</span>
                                        )}
                                    </button>
                                    )
                                })}

                                {/* Status badge */}
                                {result && (
                                    <span style={{
                                        marginLeft: 'auto', alignSelf: 'center', marginRight: 12,
                                        background: STATUS_STYLE[result.status]?.bg,
                                        color: STATUS_STYLE[result.status]?.color,
                                        borderRadius: 999, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700,
                                    }}>
                                        {STATUS_STYLE[result.status]?.label}
                                    </span>
                                )}
                            </div>

                            {/* Tab content */}
                            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                                {/* Output tab */}
                                {activeTab === 'output' && (
                                    <div>
                                        {result ? (
                                            <>
                                                {/* Meta info */}
                                                <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.75rem', color: '#757575', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                        <Timer size={14} />
                                                        {t('code.execTime')}: <strong style={{ color: '#1a1a2e' }}>{result.execution_time_ms?.toFixed(1)}ms</strong>
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: '#757575', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                        <Activity size={14} />
                                                        {t('code.exitCode')}: <strong style={{ color: result.exit_code === 0 ? '#2e7d32' : '#c62828' }}>{result.exit_code}</strong>
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: '#757575', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                        <Inbox size={14} />
                                                        Input: <strong style={{ color: '#1a1a2e' }}>{stdin.trim() ? 'provided' : 'none'}</strong>
                                                    </span>
                                                    <button
                                                        onClick={() => copyToClipboard(result.stdout)}
                                                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#9e9e9e', cursor: 'pointer', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center' }}
                                                    >
                                                        <Clipboard size={14} />
                                                    </button>
                                                </div>
                                                <pre style={{
                                                    color: '#1a1a2e',
                                                    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                                                    fontSize: '0.82rem', lineHeight: 1.6,
                                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                                    margin: 0,
                                                }}>
                                                    {result.stdout || <span style={{ color: '#bdbdbd', fontStyle: 'italic' }}>(no output)</span>}
                                                </pre>
                                            </>
                                        ) : (
                                            <div style={{ textAlign: 'center', marginTop: 60, color: '#bdbdbd' }}>
                                                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                                                    <Play size={34} strokeWidth={1.8} />
                                                </div>
                                                <p style={{ fontSize: '0.9rem' }}>
                                                    {locale === 'fil' ? 'Pindutin ang "Patakbuhin" o Ctrl+Enter upang magsimula.' : 'Press Run or Ctrl+Enter to execute your code.'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Errors tab */}
                                {activeTab === 'errors' && (
                                    <pre style={{
                                        color: result?.stderr ? '#c62828' : '#bdbdbd',
                                        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                                        fontSize: '0.82rem', lineHeight: 1.6,
                                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                        margin: 0, fontStyle: result?.stderr ? 'normal' : 'italic',
                                    }}>
                                        {result?.stderr || '(no errors)'}
                                    </pre>
                                )}

                                {/* History tab */}
                                {activeTab === 'history' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {history.length === 0 ? (
                                            <p style={{ color: '#bdbdbd', fontStyle: 'italic', fontSize: '0.85rem' }}>No runs yet.</p>
                                        ) : (
                                            history.map(h => (
                                                (() => {
                                                    const HistoryIcon = LANG_CONFIG[h.language]?.icon || Code2
                                                    return (
                                                <div
                                                    key={h.id}
                                                    style={{
                                                        background: '#fafafa', border: '1px solid #e8e8e8',
                                                        borderRadius: 8, padding: '10px 12px',
                                                        display: 'flex', gap: 10, alignItems: 'center',
                                                    }}
                                                >
                                                    <span style={{ fontSize: '1rem', color: LANG_CONFIG[h.language]?.color || '#64748b', display: 'inline-flex' }}>
                                                        <HistoryIcon size={16} strokeWidth={2.2} />
                                                    </span>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{
                                                            color: '#1a1a2e', fontSize: '0.78rem',
                                                            fontFamily: 'monospace',
                                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        }}>
                                                            {h.source_code}
                                                        </div>
                                                        <div style={{ color: '#9e9e9e', fontSize: '0.7rem', marginTop: 2 }}>
                                                            {LANG_CONFIG[h.language]?.label} · {h.execution_time_ms?.toFixed(1)}ms · {new Date(h.created_at).toLocaleTimeString()}
                                                        </div>
                                                    </div>
                                                    <span style={{
                                                        background: STATUS_STYLE[h.status]?.bg,
                                                        color: STATUS_STYLE[h.status]?.color,
                                                        borderRadius: 999, padding: '1px 8px', fontSize: '0.68rem', fontWeight: 700,
                                                    }}>
                                                        {h.status}
                                                    </span>
                                                </div>
                                                    )
                                                })()
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer info bar */}
                            <div style={{
                                padding: '8px 16px', borderTop: '1px solid #e0e0e0', background: '#f5f5f5',
                                fontSize: '0.72rem', color: '#9e9e9e', display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                <Lock size={13} />
                                {t('code.sandboxInfo')}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
