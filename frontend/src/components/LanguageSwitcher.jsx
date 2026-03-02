/**
 * LanguageSwitcher — a minimal toggle component rendered in the sidebar/header.
 * Switches the UI between English and Filipino via LanguageContext.
 */
import { useLanguage } from '../contexts/LanguageContext'
import PropTypes from 'prop-types'

const FLAGS = {
    en: '🇬🇧',
    fil: '🇵🇭',
}

const LABELS = {
    en: 'EN',
    fil: 'FIL',
}

export default function LanguageSwitcher({ compact = false }) {
    const { locale, setLocale } = useLanguage()

    const toggle = () => setLocale(locale === 'en' ? 'fil' : 'en')

    return (
        <button
            id="lang-switcher-btn"
            onClick={toggle}
            title={locale === 'en' ? 'Switch to Filipino' : 'Lumipat sa Ingles'}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(27,94,32,0.08)',
                border: '1px solid rgba(27,94,32,0.25)',
                borderRadius: 8,
                padding: compact ? '4px 10px' : '6px 14px',
                cursor: 'pointer',
                fontSize: compact ? '0.75rem' : '0.82rem',
                fontWeight: 600,
                color: 'var(--accent)',
                fontFamily: 'inherit',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(27,94,32,0.15)'
                e.currentTarget.style.borderColor = 'var(--accent)'
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(27,94,32,0.08)'
                e.currentTarget.style.borderColor = 'rgba(27,94,32,0.25)'
            }}
        >
            <span style={{ fontSize: compact ? '0.9rem' : '1rem' }}>{FLAGS[locale]}</span>
            {LABELS[locale]}
            <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>▼</span>
        </button>
    )
}

LanguageSwitcher.propTypes = {
    compact: PropTypes.bool,
}
