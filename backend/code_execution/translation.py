"""
Translation service for the multilingual interface.

Supported language pairs (initial):
  en -> fil  (English -> Filipino / Tagalog)
  fil -> en  (Filipino -> English)

Uses Google Translate's free public endpoint as a fallback when no paid
API key is available.  Results are cached in the database to reduce
round-trips.

AI-assisted translation of research abstracts utilises the same pipeline
with chunking for long texts exceeding the endpoint's character limit.
"""

import hashlib
import logging
import urllib.request
import urllib.parse
import json

logger = logging.getLogger(__name__)

CHUNK_SIZE = 4500   # Google Translate free endpoint safe limit


def _hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode()).hexdigest()


def _google_translate_chunk(text: str, source_lang: str, target_lang: str) -> str:
    """Translate a single chunk via Google Translate's unofficial JSON API."""
    lang_map = {'fil': 'tl', 'en': 'en'}
    sl = lang_map.get(source_lang, source_lang)
    tl = lang_map.get(target_lang, target_lang)

    params = urllib.parse.urlencode({
        'client': 'gtx',
        'sl': sl,
        'tl': tl,
        'dt': 't',
        'q': text,
    })
    url = f'https://translate.googleapis.com/translate_a/single?{params}'
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            # Response structure: [[["translated", "original", ...], ...], ...]
            parts = data[0]
            return ''.join(p[0] for p in parts if p[0])
    except Exception as exc:
        logger.warning(f"Translation request failed: {exc}")
        return ''


def _chunk_text(text: str, size: int) -> list:
    """Split text into sentence-aware chunks below `size` characters."""
    chunks = []
    current = ''
    for sentence in text.replace('\n', ' \n ').split('. '):
        if len(current) + len(sentence) + 2 > size:
            if current:
                chunks.append(current.strip())
            current = sentence
        else:
            current += ('. ' if current else '') + sentence
    if current:
        chunks.append(current.strip())
    return chunks or [text]


def translate_text(text: str, source_lang: str = 'en', target_lang: str = 'fil') -> dict:
    """
    Translate text with caching.

    Returns:
        {
            'translated': str,
            'source_lang': str,
            'target_lang': str,
            'cached': bool,
            'error': str | None,
        }
    """
    if not text or not text.strip():
        return {
            'translated': '',
            'source_lang': source_lang,
            'target_lang': target_lang,
            'cached': False,
            'error': 'Empty text provided.',
        }

    # Check cache
    try:
        from .models import TranslationCache
        text_hash = _hash(text + source_lang + target_lang)
        cached = TranslationCache.objects.filter(source_text_hash=text_hash).first()
        if cached:
            return {
                'translated': cached.translated_text,
                'source_lang': source_lang,
                'target_lang': target_lang,
                'cached': True,
                'error': None,
            }
    except Exception as e:
        logger.error(f"Cache lookup failed: {e}")
        text_hash = _hash(text)

    # Translate in chunks
    chunks = _chunk_text(text, CHUNK_SIZE)
    translated_chunks = []
    for chunk in chunks:
        result = _google_translate_chunk(chunk, source_lang, target_lang)
        if not result:
            return {
                'translated': text,
                'source_lang': source_lang,
                'target_lang': target_lang,
                'cached': False,
                'error': 'AI translation service temporarily unavailable.',
            }
        translated_chunks.append(result)

    translated = ' '.join(translated_chunks)

    # Store in cache
    try:
        from .models import TranslationCache
        TranslationCache.objects.get_or_create(
            source_text_hash=text_hash,
            defaults={
                'source_text': text[:5000],
                'source_lang': source_lang,
                'target_lang': target_lang,
                'translated_text': translated,
            }
        )
    except Exception as e:
        logger.error(f"Cache save failed: {e}")

    return {
        'translated': translated,
        'source_lang': source_lang,
        'target_lang': target_lang,
        'cached': False,
        'error': None,
    }
