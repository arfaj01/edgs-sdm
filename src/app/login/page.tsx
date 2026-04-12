'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useI18n, LanguageSwitcher } from '@/lib/i18n';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { t, isRTL } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError(t('login.invalidCredentials'));
        } else {
          setError(authError.message);
        }
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError(t('login.unexpectedError'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Left panel — branding */}
      <div
        className="hidden lg:flex lg:w-[52%] relative flex-col items-center justify-center p-12"
        style={{
          background: 'linear-gradient(160deg, #034040 0%, #045859 40%, #056565 70%, #03403f 100%)',
        }}
      >
        {/* Decorative pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'%3E%3Cpath d='M30 0L60 30L30 60L0 30z' /%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '30px 30px',
          }}
        />

        <div className="relative z-10 max-w-lg text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/momah-logo-stacked.png"
            alt="Ministry of Municipalities and Housing"
            className="mx-auto mb-8"
            style={{ height: '140px', width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
          />

          <h1 className="text-3xl font-bold text-white mb-3 leading-snug">
            {t('login.brandTitle') || t('app.fullName')}
          </h1>
          <p className="text-base text-white/70 leading-relaxed mb-10">
            {t('login.brandDesc') || t('app.subtitle')}
          </p>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 gap-4 text-start">
            {[
              { icon: '📋', label: t('login.feature1') || 'Workflow-driven engineering approvals' },
              { icon: '🔒', label: t('login.feature2') || 'Role-based access and audit trail' },
              { icon: '📊', label: t('login.feature3') || 'Real-time dashboards and SLA tracking' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/10 rounded-lg px-4 py-3">
                <span className="text-lg">{f.icon}</span>
                <span className="text-sm text-white/90">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer on panel */}
        <div className="absolute bottom-6 text-xs text-white/40">
          {t('app.name')} {t('app.version')}
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col">
        {/* Top bar with language */}
        <div className={`flex items-center justify-between px-6 py-4`}>
          <div className="lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/momah-logo-horizontal.png"
              alt="MOMAH"
              className="h-10 w-auto object-contain"
            />
          </div>
          <div className={`${isRTL ? 'mr-auto' : 'ml-auto'}`}>
            <LanguageSwitcher />
          </div>
        </div>

        {/* Center form */}
        <div className="flex-1 flex items-center justify-center px-6 pb-8">
          <div className="w-full max-w-[420px]">
            {/* Mobile logo + title */}
            <div className="lg:hidden text-center mb-8">
              <h1 className="text-xl font-bold mb-1" style={{ color: '#045859' }}>
                {t('login.title')}
              </h1>
              <p className="text-sm text-gray-500">{t('login.subtitle')}</p>
            </div>

            {/* Desktop header */}
            <div className="hidden lg:block mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: '#e6f2f2' }}
                >
                  <ShieldCheck className="w-5 h-5" style={{ color: '#045859' }} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{t('login.signIn')}</h2>
                  <p className="text-sm text-gray-500">{t('login.subtitle')}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Error */}
              {error && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
                  <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-red-800">{error}</span>
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('login.email')}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm bg-gray-50/50 focus:outline-none focus:ring-2 focus:bg-white transition-all"
                  style={{ '--tw-ring-color': '#045859' } as React.CSSProperties}
                  placeholder={t('login.emailPlaceholder')}
                  disabled={isLoading}
                  dir="ltr"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('login.password')}
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm bg-gray-50/50 focus:outline-none focus:ring-2 focus:bg-white transition-all pe-12"
                    style={{ '--tw-ring-color': '#045859' } as React.CSSProperties}
                    placeholder={t('login.passwordPlaceholder')}
                    disabled={isLoading}
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'left-3' : 'right-3'} text-gray-400 hover:text-gray-600 transition-colors`}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 text-white text-sm font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                style={{ backgroundColor: '#045859', '--tw-ring-color': '#045859' } as React.CSSProperties}
                onMouseOver={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#033e3e')}
                onMouseOut={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#045859')}
              >
                {isLoading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('login.signingIn')}
                  </span>
                ) : (
                  t('login.signIn')
                )}
              </button>
            </form>

            {/* Security note */}
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t('login.secureNote') || 'Secure ministry connection'}</span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="px-6 py-4 text-center text-xs text-gray-400 border-t border-gray-100">
          {t('app.name')} &mdash; {t('app.fullName')} &mdash; {t('app.version')}
        </div>
      </div>
    </div>
  );
}
