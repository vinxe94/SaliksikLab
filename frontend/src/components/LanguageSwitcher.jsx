import { Languages } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import PropTypes from 'prop-types'

export default function LanguageSwitcher({ compact = false }) {
    const { locale, setLocale } = useLanguage()
    const label = locale === 'en' ? 'Switch to Filipino' : 'Lumipat sa Ingles'
    return (
        <button id="lang-switcher-btn" type="button" className={`language-switcher ${compact ? 'compact' : ''}`}
            onClick={() => setLocale(locale === 'en' ? 'fil' : 'en')} title={label} aria-label={label}>
            <Languages size={16} aria-hidden="true" />
            <span>{locale === 'en' ? 'English' : 'Filipino'}</span>
        </button>
    )
}

LanguageSwitcher.propTypes = { compact: PropTypes.bool }
