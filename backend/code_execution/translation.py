"""
Translation service for the multilingual interface.

Supports English <-> Filipino / Tagalog translation for research abstracts.

Primary provider:
  Hugging Face seq2seq translation models loaded locally through Transformers.

Fallback provider:
  Google Translate's public endpoint when the local model is not installed
  or cannot be loaded in the current environment.
"""

import hashlib
import json
import logging
import urllib.parse
import urllib.request
from contextlib import nullcontext

from django.conf import settings

logger = logging.getLogger(__name__)

GOOGLE_CHUNK_SIZE = 4500
HF_DEFAULT_CHUNK_SIZE = 1400
_HF_TRANSLATORS = {}


def _hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode()).hexdigest()


def _get_provider_order() -> list[str]:
    primary = getattr(settings, 'TRANSLATION_PROVIDER', 'huggingface').lower()
    fallback = getattr(settings, 'TRANSLATION_FALLBACK_PROVIDER', 'google').lower()
    providers = [primary]
    if fallback and fallback not in providers:
        providers.append(fallback)
    return providers


def _get_hf_model_name(source_lang: str, target_lang: str) -> str | None:
    models = getattr(settings, 'HF_TRANSLATION_MODELS', {})
    return models.get(f'{source_lang}:{target_lang}')


def _get_hf_chunk_size() -> int:
    return int(getattr(settings, 'HF_TRANSLATION_CHUNK_SIZE', HF_DEFAULT_CHUNK_SIZE))


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
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return ''.join(part[0] for part in data[0] if part[0])
    except Exception as exc:
        logger.warning('Google translation request failed: %s', exc)
        return ''


def _chunk_text(text: str, size: int) -> list[str]:
    """Split text into sentence-aware chunks below `size` characters."""
    chunks = []
    current = ''

    for sentence in text.replace('\n', ' \n ').split('. '):
        candidate = f'{current}. {sentence}' if current else sentence
        if len(candidate) > size and current:
            chunks.append(current.strip())
            current = sentence
        else:
            current = candidate

    if current:
        chunks.append(current.strip())

    return chunks or [text]


def _resolve_torch_device():
    requested = getattr(settings, 'HF_TRANSLATION_DEVICE', 'cpu').lower()

    try:
        import torch
    except Exception:
        return None, 'cpu'

    if requested == 'cuda' and torch.cuda.is_available():
        return torch, 'cuda'

    return torch, 'cpu'


def _load_hf_translator(source_lang: str, target_lang: str):
    cache_key = f'{source_lang}:{target_lang}'
    if cache_key in _HF_TRANSLATORS:
        return _HF_TRANSLATORS[cache_key]

    model_name = _get_hf_model_name(source_lang, target_lang)
    if not model_name:
        raise RuntimeError(f'No Hugging Face model configured for {cache_key}.')

    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    except Exception as exc:
        raise RuntimeError(
            'Transformers is not installed. Install torch, transformers, and sentencepiece.'
        ) from exc

    torch, device = _resolve_torch_device()
    cache_dir = getattr(settings, 'HF_TRANSLATION_CACHE_DIR', None)

    tokenizer = AutoTokenizer.from_pretrained(model_name, cache_dir=cache_dir)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name, cache_dir=cache_dir)

    if torch and device == 'cuda':
        model = model.to('cuda')

    model.eval()
    translator = {
        'model_name': model_name,
        'tokenizer': tokenizer,
        'model': model,
        'torch': torch,
        'device': device,
    }
    _HF_TRANSLATORS[cache_key] = translator
    return translator


def _hf_translate_chunk(text: str, source_lang: str, target_lang: str) -> tuple[str, str]:
    translator = _load_hf_translator(source_lang, target_lang)
    tokenizer = translator['tokenizer']
    model = translator['model']
    torch = translator['torch']
    device = translator['device']

    inputs = tokenizer(
        text,
        return_tensors='pt',
        truncation=True,
        max_length=512,
        padding=False,
    )

    if torch and device == 'cuda':
        inputs = {key: value.to('cuda') for key, value in inputs.items()}

    context = torch.no_grad() if torch else nullcontext()
    with context:
        outputs = model.generate(
            **inputs,
            max_new_tokens=512,
            num_beams=4,
            early_stopping=True,
        )

    translated = tokenizer.batch_decode(outputs, skip_special_tokens=True)[0].strip()
    return translated, translator['model_name']


def _translate_via_huggingface(text: str, source_lang: str, target_lang: str) -> tuple[str, str]:
    chunks = _chunk_text(text, _get_hf_chunk_size())
    translated_chunks = []
    model_name = _get_hf_model_name(source_lang, target_lang) or 'unknown'

    for chunk in chunks:
        translated, model_name = _hf_translate_chunk(chunk, source_lang, target_lang)
        if not translated:
            raise RuntimeError('Hugging Face translation returned an empty result.')
        translated_chunks.append(translated)

    return ' '.join(translated_chunks), model_name


def _translate_via_google(text: str, source_lang: str, target_lang: str) -> tuple[str, str]:
    chunks = _chunk_text(text, GOOGLE_CHUNK_SIZE)
    translated_chunks = []

    for chunk in chunks:
        translated = _google_translate_chunk(chunk, source_lang, target_lang)
        if not translated:
            raise RuntimeError('Google translation returned an empty result.')
        translated_chunks.append(translated)

    return ' '.join(translated_chunks), 'google-translate-public-endpoint'


def _translate_with_provider(provider: str, text: str, source_lang: str, target_lang: str) -> tuple[str, str]:
    if provider == 'huggingface':
        return _translate_via_huggingface(text, source_lang, target_lang)
    if provider == 'google':
        return _translate_via_google(text, source_lang, target_lang)
    raise RuntimeError(f'Unsupported translation provider: {provider}')


def translate_text(text: str, source_lang: str = 'en', target_lang: str = 'fil') -> dict:
    """
    Translate text with caching and provider fallback.

    Returns:
        {
            'translated': str,
            'source_lang': str,
            'target_lang': str,
            'cached': bool,
            'provider': str | None,
            'model': str | None,
            'error': str | None,
        }
    """
    if not text or not text.strip():
        return {
            'translated': '',
            'source_lang': source_lang,
            'target_lang': target_lang,
            'cached': False,
            'provider': None,
            'model': None,
            'error': 'Empty text provided.',
        }

    text_hash = _hash(text + source_lang + target_lang)

    try:
        from .models import TranslationCache

        cached = TranslationCache.objects.filter(source_text_hash=text_hash).first()
        if cached:
            return {
                'translated': cached.translated_text,
                'source_lang': source_lang,
                'target_lang': target_lang,
                'cached': True,
                'provider': 'cache',
                'model': None,
                'error': None,
            }
    except Exception as exc:
        logger.error('Cache lookup failed: %s', exc)

    last_error = None
    for provider in _get_provider_order():
        try:
            translated, model_name = _translate_with_provider(provider, text, source_lang, target_lang)
            break
        except Exception as exc:
            last_error = exc
            logger.warning('Translation provider %s failed: %s', provider, exc)
    else:
        return {
            'translated': text,
            'source_lang': source_lang,
            'target_lang': target_lang,
            'cached': False,
            'provider': None,
            'model': None,
            'error': 'AI translation service temporarily unavailable.',
        }

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
    except Exception as exc:
        logger.error('Cache save failed: %s', exc)

    return {
        'translated': translated,
        'source_lang': source_lang,
        'target_lang': target_lang,
        'cached': False,
        'provider': provider,
        'model': model_name,
        'error': None if not last_error else None,
    }
