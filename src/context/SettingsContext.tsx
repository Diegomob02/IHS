import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TRANSLATIONS } from '../utils/translations';

type Language = 'es' | 'en';
type Currency = 'USD' | 'MXN';

interface SettingsContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  currency: Currency;
  setCurrency: (curr: Currency) => void;
  exchangeRate: number; // MXN per 1 USD
  t: (key: keyof typeof TRANSLATIONS.es) => string;
  formatCurrency: (amountUSD: number) => string;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('es'); // Default to Spanish
  const [currency, setCurrency] = useState<Currency>('USD'); // Default to USD
  const [exchangeRate, setExchangeRate] = useState<number>(20.50); // Fallback default

  useEffect(() => {
    try {
      const savedLang = window.localStorage.getItem('ihs_language');
      if (savedLang === 'es' || savedLang === 'en') setLanguage(savedLang);
    } catch {
      // ignore
    }

    try {
      const savedCurrency = window.localStorage.getItem('ihs_currency');
      if (savedCurrency === 'USD' || savedCurrency === 'MXN') setCurrency(savedCurrency);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('ihs_language', language);
    } catch {
      // ignore
    }
    try {
      document.documentElement.lang = language;
    } catch {
      // ignore
    }
  }, [language]);

  useEffect(() => {
    try {
      window.localStorage.setItem('ihs_currency', currency);
    } catch {
      // ignore
    }
  }, [currency]);

  useEffect(() => {
    // Fetch real exchange rate
    const fetchRate = async () => {
      try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        if (data && data.rates && data.rates.MXN) {
          setExchangeRate(data.rates.MXN);
        }
      } catch (error) {
        console.error("Error fetching exchange rate, using fallback:", error);
      }
    };

    fetchRate();
  }, []);

  const t = (key: keyof typeof TRANSLATIONS.es) => {
    return TRANSLATIONS[language][key] || key;
  };

  const formatCurrency = (amountUSD: number) => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountUSD);
    } else {
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amountUSD * exchangeRate);
    }
  };

  return (
    <SettingsContext.Provider value={{ language, setLanguage, currency, setCurrency, exchangeRate, t, formatCurrency }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
