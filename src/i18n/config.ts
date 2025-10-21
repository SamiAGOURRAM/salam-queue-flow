import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import translationEN from '../locales/en/translation.json';
import translationFR from '../locales/fr/translation.json';
import translationAR from '../locales/ar/translation.json';

// Translation resources
const resources = {
  en: {
    translation: translationEN,
  },
  fr: {
    translation: translationFR,
  },
  ar: {
    translation: translationAR,
  },
};

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    resources,
    fallbackLng: 'en', // Default language
    debug: false, // Set to true for development debugging
    
    // Language detection options
    detection: {
      order: ['localStorage', 'navigator'], // Check localStorage first, then browser settings
      caches: ['localStorage'], // Cache the selected language in localStorage
      lookupLocalStorage: 'i18nextLng', // Key name in localStorage
    },

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    // Available languages
    supportedLngs: ['en', 'fr', 'ar'],
    
    // Namespace (we're using single namespace "translation")
    ns: ['translation'],
    defaultNS: 'translation',
  });

export default i18n;