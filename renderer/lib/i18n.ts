/**
 * i18n configuration for Ailo.
 *
 * Uses i18next + react-i18next with a single bundled English namespace.
 * To add a language, drop a file at renderer/locales/<lang>/translation.json
 * and add its tag to `supportedLngs`.
 *
 * All UI strings live in renderer/locales/en/translation.json.
 * Strings that come from external data (Fediverse post content, account
 * display names, filter titles, collection names, etc.) are NOT translated
 * here — they are user/server-generated content.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "../locales/en/translation.json";

i18n
  .use(initReactI18next)
  .init({
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en"],
    defaultNS: "translation",
    resources: {
      en: { translation: en },
    },
    interpolation: {
      // React already escapes values.
      escapeValue: false,
    },
    // Never send data to any external service.
    backend: undefined,
  });

export default i18n;
