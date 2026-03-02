/**
 * AbstractTranslator
 * 
 * AI-powered translation panel for research abstracts.
 * Appears on the repository detail page.
 *
 * Props:
 *   abstract  {string}  The original abstract text
 *   defaultSourceLang {string} 'en' or 'fil'
 */

import { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { useLanguage } from '../contexts/LanguageContext'
import api from '../api/axios'
import toast from 'react-hot-toast'

export default function AbstractTranslator({ abstract, defaultSourceLang = 'en' }) {
    const { t } = useLanguage()
    const [translating, setTranslating] = useState(false)
    const [translated, setTranslated] = useState(null)
    const [sourceLang, setSourceLang] = useState(defaultSourceLang)
    const [targetLang, setTargetLang] = useState(defaultSourceLang === 'en' ? 'fil' : 'en')
    const [error, setError] = useState(null)
    const [copied, setCopied] = useState(false)

    const handleTranslate = useCallback(async () => {
        if (!abstract?.trim()) {
            toast.error('No abstract to translate.')
            return
        }
        setTranslating(true)
        setError(null)
        try {
            const { data } = await api.post('/code/translate/', {
                text: abstract,
                source_lang: sourceLang,
                target_lang: targetLang,
            })
            if (data.error) {
                setError(data.error)
                return
            }
            setTranslated(data)
        } catch (err) {
            setError(err?.response?.data?.error || t('general.error'))
        } finally {
            setTranslating(false)
        }
    }, [abstract, sourceLang, targetLang, t])

    const swapLangs = () => {
        setSourceLang(targetLang)
        setTargetLang(sourceLang)
        setTranslated(null)
        setError(null)
    }

    const copy = async (text) => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const LANG_LABELS = { en: '🇬🇧 English', fil: '🇵🇭 Filipino' }

    return (
        <div style={{
            marginTop: 20,
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            background: 'var(--bg2)',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 18px',
                background: 'rgba(27,94,32,0.05)',
                borderBottom: '1px solid var(--border)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1.1rem' }}>🤖</span>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t('translate.aiPowered')}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{t('translate.title')}</div>
                    </div>
                </div>

                {/* Lang pair selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        background: 'var(--bg3)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '4px 10px', fontSize: '0.8rem', fontWeight: 600,
                    }}>
                        {LANG_LABELS[sourceLang]}
                    </span>
                    <button
                        id="swap-lang-btn"
                        onClick={swapLangs}
                        title="Swap languages"
                        style={{
                            background: 'none', border: '1px solid var(--border)',
                            borderRadius: 6, padding: '4px 8px',
                            cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text2)',
                            transition: 'all 0.2s',
                        }}
                    >
                        ⇄
                    </button>
                    <span style={{
                        background: 'var(--bg3)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '4px 10px', fontSize: '0.8rem', fontWeight: 600,
                    }}>
                        {LANG_LABELS[targetLang]}
                    </span>
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: 18 }}>
                {/* Original preview */}
                <div style={{ marginBottom: 14 }}>
                    <div style={{
                        fontSize: '0.72rem', fontWeight: 700, color: 'var(--text2)',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
                    }}>
                        {t('translate.original')} — {LANG_LABELS[sourceLang]}
                    </div>
                    <div style={{
                        background: 'var(--bg3)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '10px 14px',
                        fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text2)',
                        maxHeight: 100, overflow: 'auto',
                    }}>
                        {abstract?.slice(0, 300)}{abstract?.length > 300 ? '…' : ''}
                    </div>
                </div>

                {/* CTA */}
                {!translated && (
                    <button
                        id="translate-abstract-btn"
                        className="btn btn-primary"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={handleTranslate}
                        disabled={translating}
                    >
                        {translating ? (
                            <><span style={{ animation: 'spin 0.7s linear infinite', display: 'inline-block', marginRight: 6 }}>⏳</span>{t('translate.translating')}</>
                        ) : (
                            <>{targetLang === 'fil' ? t('translate.toFilipino') : t('translate.toEnglish')}</>
                        )}
                    </button>
                )}

                {/* Error */}
                {error && (
                    <div style={{
                        background: 'rgba(198,40,40,0.08)', border: '1px solid rgba(198,40,40,0.3)',
                        borderRadius: 8, padding: '10px 14px', color: 'var(--danger)', fontSize: '0.85rem',
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Translated result */}
                {translated && !error && (
                    <div>
                        <div style={{
                            fontSize: '0.72rem', fontWeight: 700, color: 'var(--text2)',
                            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <span>{t('translate.translated')} — {LANG_LABELS[targetLang]}
                                {translated.cached && (
                                    <span style={{ fontWeight: 400, marginLeft: 8, opacity: 0.6 }}>{t('translate.cached')}</span>
                                )}
                            </span>
                            <button
                                onClick={() => copy(translated.translated)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--text2)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4,
                                    padding: 0,
                                }}
                            >
                                {copied ? t('general.copied') : `📋 ${t('general.copy')}`}
                            </button>
                        </div>
                        <div style={{
                            background: 'rgba(27,94,32,0.05)', border: '1px solid rgba(27,94,32,0.2)',
                            borderRadius: 8, padding: '12px 14px',
                            fontSize: '0.9rem', lineHeight: 1.8, color: 'var(--text)',
                        }}>
                            {translated.translated}
                        </div>
                        <button
                            id="retranslate-btn"
                            className="btn btn-ghost btn-sm"
                            style={{ marginTop: 10 }}
                            onClick={() => { setTranslated(null); swapLangs() }}
                        >
                            🔄 {targetLang === 'en' ? t('translate.toFilipino') : t('translate.toEnglish')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

AbstractTranslator.propTypes = {
    abstract: PropTypes.string,
    defaultSourceLang: PropTypes.oneOf(['en', 'fil']),
}
