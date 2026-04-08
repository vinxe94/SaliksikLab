from unittest.mock import patch

from django.test import TestCase, override_settings

from .models import TranslationCache
from .translation import translate_text


@override_settings(
    TRANSLATION_PROVIDER='huggingface',
    TRANSLATION_FALLBACK_PROVIDER='google',
    HF_TRANSLATION_MODELS={
        'en:fil': 'Helsinki-NLP/opus-mt-en-tl',
        'fil:en': 'Helsinki-NLP/opus-mt-tl-en',
    },
)
class TranslationServiceTests(TestCase):
    @patch('code_execution.translation._translate_via_huggingface')
    def test_uses_huggingface_provider_when_available(self, mock_hf):
        mock_hf.return_value = ('Isang abstrak sa Filipino.', 'Helsinki-NLP/opus-mt-en-tl')

        result = translate_text('A research abstract.', 'en', 'fil')

        self.assertEqual(result['translated'], 'Isang abstrak sa Filipino.')
        self.assertEqual(result['provider'], 'huggingface')
        self.assertEqual(result['model'], 'Helsinki-NLP/opus-mt-en-tl')
        self.assertFalse(result['cached'])

    @patch('code_execution.translation._translate_via_google')
    @patch('code_execution.translation._translate_via_huggingface')
    def test_falls_back_to_google_when_huggingface_fails(self, mock_hf, mock_google):
        mock_hf.side_effect = RuntimeError('model unavailable')
        mock_google.return_value = ('Salin mula sa fallback.', 'google-translate-public-endpoint')

        result = translate_text('A research abstract.', 'en', 'fil')

        self.assertEqual(result['translated'], 'Salin mula sa fallback.')
        self.assertEqual(result['provider'], 'google')
        self.assertEqual(result['model'], 'google-translate-public-endpoint')

    @patch('code_execution.translation._translate_via_huggingface')
    def test_returns_cached_translation_without_reloading_provider(self, mock_hf):
        mock_hf.return_value = ('Nakasalin na abstrak.', 'Helsinki-NLP/opus-mt-en-tl')

        first = translate_text('Cached abstract.', 'en', 'fil')
        second = translate_text('Cached abstract.', 'en', 'fil')

        self.assertEqual(first['translated'], 'Nakasalin na abstrak.')
        self.assertTrue(second['cached'])
        self.assertEqual(second['provider'], 'cache')
        self.assertEqual(TranslationCache.objects.count(), 1)
        mock_hf.assert_called_once()
