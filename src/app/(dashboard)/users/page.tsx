'use client'

/**
 * Users & Permissions page.
 *
 * Restricted to admin / department_director (and legacy 'owner').
 * Provides list view, search + filter, create / edit / activate /
 * deactivate, and project-membership management.
 *
 * Creating a user goes through the SECURITY DEFINER edge function
 * `admin-create-user`, which provisions the Supabase Auth identity
 * AND the public.users profile in a single atomic call. This means
 * an admin can onboard a user end-to-end without ever leaving the
 * page (no separate "Invite from dashboard" step).
 *
 * Project membership is editable from the same modal: any number of
 * projects can be assigned, and each membership is upserted into
 * project_members on save. The "global owner" / department director
 * is auto-attached to every project via a database trigger, so they
 * do not need to be explicitly assigned.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  UserPlus,
  Search,
  Edit3,
  CheckCircle2,
  XCircle,
  Shield,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { useI18n } from '@/lib/i18n'
import { useUser } from '@/hooks/use-user'
import { useSupabase } from '@/hooks/use-supabase'
import { cn } from '@/lib/utils'
import type { User, UserRole, Project } from '@/types/database'

// Canonical role list (legacy roles still shown if present in DB)
const CANONICAL_ROLES: UserRole[] = [
  'submitter',
  'technical_unit',
  'quality_unit',
  'project_manager',
  'department_director',
  'admin',
]

const LEGACY_ROLES: UserRole[] = ['consultant', 'project_coordinator', 'owner']

const DIRECTOR_OR_ADMIN: UserRole[] = ['admin', 'department_director', 'owner']

type FormState = {
  id?: string
  email: string
  password: string
  full_name: string
  full_name_ar: string
  role: UserRole
  organization: string
  phone: string
  is_active: boolean
  project_ids: string[]
}

const EMPTY_FORM: FormState = {
  email: '',
  password: '',
  full_name: '',
  full_name_ar: '',
  role: 'submitter',
  organization: '',
  phone: '',
  is_active: true,
  project_ids: [],
}

export default function UsersPage() {
  const { t, isRTL } = useI18n()
  const supabase = useSupabase()
  const { user: currentUser, isLoading: currentLoading } = useUser()

  const [users, setUsers] = useState<User[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [memberships, setMemberships] = useState<Record<string, string[]>>({}) // userId -> projectIds
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const canAccess =
    !currentLoading && currentUser && DIRECTOR_OR_ADMIN.includes(currentUser.role)

  // ── Load users + projects + memberships ──────────────────────
  useEffect(() => {
    if (!canAccess) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const [usersRes, projectsRes, membersRes] = await Promise.all([
          supabase
            .from('users')
            .select('*')
            .is('deleted_at', null)
            .order('created_at', { ascending: false }),
          supabase
            .from('projects')
            .select('id, code, name, name_ar')
            .is('deleted_at', null)
            .order('code'),
          supabase.from('project_members').select('user_id, project_id'),
        ])
        if (usersRes.error) throw usersRes.error
        if (projectsRes.error) throw projectsRes.error
        if (membersRes.error) throw membersRes.error

        const map: Record<string, string[]> = {}
        for (const m of (membersRes.data as { user_id: string; project_id: string }[]) || []) {
          if (!map[m.user_id]) map[m.user_id] = []
          map[m.user_id].push(m.project_id)
        }
        if (!cancelled) {
          setUsers((usersRes.data as User[]) || [])
          setProjects((projectsRes.data as Project[]) || [])
          setMemberships(map)
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [supabase, canAccess])

  // ── Derived / filtered list ──────────────────────────────────
  const filtered = useMemo(() => {
    let rows = users
    if (roleFilter !== 'all') rows = rows.filter((u) => u.role === roleFilter)
    if (statusFilter === 'active') rows = rows.filter((u) => u.is_active)
    if (statusFilter === 'inactive') rows = rows.filter((u) => !u.is_active)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(
        (u) =>
          (u.full_name || '').toLowerCase().includes(q) ||
          (u.full_name_ar || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.organization || '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [users, roleFilter, statusFilter, search])

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.is_active).length,
    }),
    [users]
  )

  // ── Handlers ─────────────────────────────────────────────────
  const startCreate = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  const startEdit = (u: User) => {
    setForm({
      id: u.id,
      email: u.email,
      password: '',
      full_name: u.full_name || '',
      full_name_ar: u.full_name_ar || '',
      role: u.role,
      organization: u.organization || '',
      phone: u.phone || '',
      is_active: u.is_active,
      project_ids: memberships[u.id] || [],
    })
    setFormError(null)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setFormError(null)
  }

  const toggleProjectAssignment = (projectId: string) => {
    setForm((prev) => {
      const has = prev.project_ids.includes(projectId)
      return {
        ...prev,
        project_ids: has
          ? prev.project_ids.filter((p) => p !== projectId)
          : [...prev.project_ids, projectId],
      }
    })
  }

  const handleSave = async () => {
    if (!form.email || !form.full_name || !form.role) {
      setFormError(t('common.required'))
      return
    }
    if (!form.id && (!form.password || form.password.length < 6)) {
      setFormError(t('users.passwordMinLength'))
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (form.id) {
        // ── EDIT existing user ──
        const { error } = await supabase
          .from('users')
          .update({
            full_name: form.full_name,
            full_name_ar: form.full_name_ar || null,
            role: form.role,
            organization: form.organization || null,
            phone: form.phone || null,
            is_active: form.is_active,
          })
          .eq('id', form.id)
        if (error) throw error

        // Sync project memberships: compute add / remove sets
        const current = new Set(memberships[form.id] || [])
        const next = new Set(form.project_ids)
        const toAdd = [...next].filter((p) => !current.has(p))
        const toRemove = [...current].filter((p) => !next.has(p))

        if (toAdd.length > 0) {
          const rows = toAdd.map((pid) => ({
            project_id: pid,
            user_id: form.id!,
            role: form.role,
          }))
          const { error: addErr } = await supabase
            .from('project_members')
            .upsert(rows, { onConflict: 'project_id,user_id' })
          if (addErr) throw addErr
        }
        if (toRemove.length > 0) {
          const { error: delErr } = await supabase
            .from('project_members')
            .delete()
            .eq('user_id', form.id)
            .in('project_id', toRemove)
          if (delErr) throw delErr
        }

        setUsers((prev) =>
          prev.map((u) =>
            u.id === form.id
              ? {
                  ...u,
                  full_name: form.full_name,
                  full_name_ar: form.full_name_ar,
                  role: form.role,
                  organization: form.organization,
                  phone: form.phone,
                  is_active: form.is_active,
                }
              : u
          )
        )
        setMemberships((prev) => ({ ...prev, [form.id!]: form.project_ids }))
        setSuccessMessage(t('users.updated'))
      } else {
        // ── CREATE new user via admin-create-user edge function ──
        const { data, error } = await supabase.functions.invoke('admin-create-user', {
          body: {
            email: form.email.trim().toLowerCase(),
            password: form.password,
            full_name: form.full_name,
            full_name_ar: form.full_name_ar,
            role: form.role,
            organization: form.organization,
            phone: form.phone,
            project_ids: form.project_ids,
          },
        })
        if (error) {
          // Surface body of non-2xx response if present
          let msg = error.message || 'Edge function failed'
          try {
            const ctx = (error as unknown as { context?: Response }).context
            if (ctx) {
              const body = await ctx.text()
              const parsed = JSON.parse(body)
              if (parsed?.error) msg = parsed.error
            }
          } catch {
            /* ignore parse failures */
          }
          throw new Error(msg)
        }
        if (!data?.success) {
          throw new Error(data?.error || 'Edge function failed')
        }

        const created = data.user as User
        setUsers((prev) => [created, ...prev])
        setMemberships((prev) => ({ ...prev, [created.id]: form.project_ids }))
        setSuccessMessage(t('users.created'))
      }
      setShowForm(false)
      setForm(EMPTY_FORM)
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('users.error'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (u: User) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !u.is_active })
        .eq('id', u.id)
      if (error) throw error
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, is_active: !u.is_active } : x))
      )
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }

  // ── Access guard ─────────────────────────────────────────────
  if (currentLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#045859' }} />
      </div>
    )
  }

  if (!canAccess) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div
          className="rounded-xl border p-6 flex items-start gap-4"
          style={{ borderColor: '#fecaca', backgroundColor: '#fef2f2' }}
        >
          <Shield className="w-8 h-8 flex-shrink-0" style={{ color: '#c05728' }} />
          <div>
            <h2 className="font-bold text-lg mb-1" style={{ color: '#991b1b' }}>
              {t('users.accessDenied')}
            </h2>
            <p className="text-sm" style={{ color: '#991b1b' }}>
              {t('users.restrictedAccessDesc')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
      />

      {successMessage && (
        <div
          className="flex items-center gap-3 p-4 rounded-lg border"
          style={{ borderColor: '#86efac', backgroundColor: '#f0fdf4' }}
        >
          <CheckCircle2 className="w-5 h-5" style={{ color: '#16a34a' }} />
          <span className="text-sm" style={{ color: '#14532d' }}>
            {successMessage}
          </span>
        </div>
      )}

      {loadError && (
        <div
          className="flex items-start gap-3 p-4 rounded-lg border"
          style={{ borderColor: '#fecaca', backgroundColor: '#fef2f2' }}
        >
          <AlertCircle className="w-5 h-5 mt-0.5" style={{ color: '#c05728' }} />
          <span className="text-sm" style={{ color: '#991b1b' }}>
            {loadError}
          </span>
        </div>
      )}

      {/* Stats + actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label={t('users.totalUsers')} value={stats.total} color="#045859" />
        <StatCard label={t('users.activeUsers')} value={stats.active} color="#87ba26" />
        <div className="flex items-center justify-end md:col-span-1">
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white shadow-sm"
            style={{ backgroundColor: '#045859' }}
          >
            <UserPlus className="w-4 h-4" />
            {t('users.createUser')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-1">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('users.searchPlaceholder')}
              className="w-full ps-9 pe-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#045859]"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#045859]"
          >
            <option value="all">{t('users.allRoles')}</option>
            {CANONICAL_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
            {LEGACY_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#045859]"
          >
            <option value="all">{t('users.allStatuses')}</option>
            <option value="active">{t('users.active')}</option>
            <option value="inactive">{t('users.inactive')}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-500">
            <Loader2 className="w-6 h-6 mx-auto animate-spin mb-3" style={{ color: '#045859' }} />
            {t('users.loadingUsers')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">{t('users.noUsers')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-xs font-semibold uppercase tracking-wide border-b-2"
                  style={{ backgroundColor: '#f0f7f7', borderColor: '#045859', color: '#045859' }}
                >
                  <th className="px-4 py-3 text-start">{t('users.fullName')}</th>
                  <th className="px-4 py-3 text-start">{t('users.email')}</th>
                  <th className="px-4 py-3 text-start">{t('users.role')}</th>
                  <th className="px-4 py-3 text-start">{t('users.organization')}</th>
                  <th className="px-4 py-3 text-start">{t('users.projects')}</th>
                  <th className="px-4 py-3 text-center">{t('users.status')}</th>
                  <th className="px-4 py-3 text-end">{t('users.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const userProjects = (memberships[u.id] || [])
                    .map((pid) => projects.find((p) => p.id === pid)?.code)
                    .filter(Boolean)
                  return (
                    <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {isRTL ? u.full_name_ar || u.full_name : u.full_name}
                        </div>
                        {!isRTL && u.full_name_ar && (
                          <div className="text-xs text-gray-500">{u.full_name_ar}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        <RolePill role={u.role} label={t(`roles.${u.role}`) || u.role} />
                      </td>
                      <td className="px-4 py-3 text-gray-700">{u.organization || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs">
                        {userProjects.length > 0 ? userProjects.join(', ') : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {u.is_active ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                            style={{ backgroundColor: '#dcfce7', color: '#166534' }}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {t('users.active')}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                            style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
                          >
                            <XCircle className="w-3 h-3" />
                            {t('users.inactive')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => startEdit(u)}
                            className="p-1.5 rounded hover:bg-gray-100"
                            title={t('users.editUser')}
                          >
                            <Edit3 className="w-4 h-4 text-gray-600" />
                          </button>
                          <button
                            onClick={() => toggleActive(u)}
                            className="text-xs px-2 py-1 rounded border"
                            style={{
                              borderColor: u.is_active ? '#c05728' : '#87ba26',
                              color: u.is_active ? '#c05728' : '#87ba26',
                            }}
                          >
                            {u.is_active ? t('users.deactivate') : t('users.activate')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeForm}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-5 py-4 border-b border-gray-200"
              style={{ backgroundColor: '#f0f7f7' }}
            >
              <h2 className="font-semibold text-base" style={{ color: '#045859' }}>
                {form.id ? t('users.editUser') : t('users.createUser')}
              </h2>
            </div>
            <div className="p-5 space-y-4">
              {formError && (
                <div
                  className="p-3 rounded-lg border text-sm"
                  style={{ borderColor: '#fecaca', backgroundColor: '#fef2f2', color: '#991b1b' }}
                >
                  {formError}
                </div>
              )}
              <FormField label={t('users.fullName')} required>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#045859]"
                />
              </FormField>
              <FormField label={t('users.fullNameAr')}>
                <input
                  value={form.full_name_ar}
                  dir="rtl"
                  onChange={(e) => setForm({ ...form, full_name_ar: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#045859]"
                />
              </FormField>
              <FormField label={t('users.email')} required>
                <input
                  type="email"
                  value={form.email}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })}
                  className={cn(
                    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#045859]',
                    form.id && 'bg-gray-50 text-gray-500'
                  )}
                />
              </FormField>
              {!form.id && (
                <FormField label={t('users.passwordLabel')} required>
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={t('users.passwordPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#045859] font-mono"
                  />
                </FormField>
              )}
              <div className="grid grid-cols-2 gap-4">
                <FormField label={t('users.role')} required>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#045859]"
                  >
                    {CANONICAL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`roles.${r}`)}
                      </option>
                    ))}
                    {LEGACY_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`roles.${r}`)} (legacy)
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label={t('users.status')}>
                  <select
                    value={form.is_active ? 'active' : 'inactive'}
                    onChange={(e) =>
                      setForm({ ...form, is_active: e.target.value === 'active' })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#045859]"
                  >
                    <option value="active">{t('users.active')}</option>
                    <option value="inactive">{t('users.inactive')}</option>
                  </select>
                </FormField>
              </div>
              <FormField label={t('users.organization')}>
                <input
                  value={form.organization}
                  onChange={(e) => setForm({ ...form, organization: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#045859]"
                />
              </FormField>
              <FormField label={t('users.phone')}>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#045859]"
                />
              </FormField>

              {/* Project assignments */}
              {projects.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-2">
                    {t('users.projectAssignments')}
                  </div>
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {projects.map((p) => {
                      const checked = form.project_ids.includes(p.id)
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProjectAssignment(p.id)}
                          />
                          <span className="font-mono text-xs text-gray-500">{p.code}</span>
                          <span className="text-gray-800">{isRTL ? p.name_ar : p.name}</span>
                        </label>
                      )
                    })}
                  </div>
                  {form.role === 'department_director' && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t('users.projectDirectorNote')}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={closeForm}
                className="px-4 py-2 rounded-lg font-medium text-gray-700 hover:bg-gray-50 text-sm"
              >
                {t('users.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white text-sm disabled:opacity-50"
                style={{ backgroundColor: '#045859' }}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? t('users.saving') : t('users.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-600 ms-1">*</span>}
      </div>
      {children}
    </label>
  )
}

function RolePill({ role, label }: { role: UserRole; label: string }) {
  const legacy = LEGACY_ROLES.includes(role)
  const bg = legacy ? '#f3f4f6' : '#e6f2f2'
  const color = legacy ? '#6b7280' : '#045859'
  return (
    <span
      className="inline-block px-2 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: bg, color }}
    >
      {label}
    </span>
  )
}
