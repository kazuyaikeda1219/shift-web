'use client'
import { useEffect, useState, useCallback } from 'react'
import { KIBO_OPTIONS } from '@/lib/nurseShiftEngine'

type Staff = {
  id: string; name: string; qualification: string | null; night_ok: boolean
  night_role: string; max_night: number; max_consec: number; sort_order: number
  is_newbie: boolean; kokyu_override: number | null
}
type Ng = { id: number; staff_a: string; staff_b: string; note: string | null }
type Rule = { id: number; staff_id: string; rule_type: 'no_night_dow' | 'fixed_day_dow'; weekday: number }
type Req = { id: number; year: number; month: number; day: number; staff_id: string; symbol: string }
type Config = {
  need_mon: number; need_tue: number; need_wed: number; need_thu: number
  need_fri: number; need_sat: number; need_sun: number
  sei_count: number; day_sat: number; day_sun_holiday: number
  kokyu_target: number | null; seed: number | null
}

const ROLES = ['両方可', '夜正のみ', '夜副のみ']
const WD = ['日', '月', '火', '水', '木', '金', '土']
// 曜日条件の weekday: 0=月 .. 6=日
const RULE_WD = ['月', '火', '水', '木', '金', '土', '日']

export default function NurseRegisterPage() {
  const now = new Date()
  const [tab, setTab] = useState<'staff' | 'ng' | 'kibou' | 'rule'>('staff')
  const [staff, setStaff] = useState<Staff[]>([])
  const [ng, setNg] = useState<Ng[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [reqs, setReqs] = useState<Req[]>([])
  const [ngA, setNgA] = useState(''); const [ngB, setNgB] = useState(''); const [ngNote, setNgNote] = useState('')
  const [rules, setRules] = useState<Rule[]>([])
  const [ruleStaff, setRuleStaff] = useState<Staff | null>(null) // 条件モーダル対象

  const fetchStaff = useCallback(async () => {
    const r = await fetch('/api/nurse/staff'); const d = await r.json()
    setStaff(Array.isArray(d) ? d : [])
  }, [])
  const fetchRules = useCallback(async () => {
    const r = await fetch('/api/nurse/rules'); const d = await r.json()
    setRules(Array.isArray(d) ? d : [])
  }, [])
  const fetchNg = useCallback(async () => {
    const r = await fetch('/api/nurse/ng'); const d = await r.json()
    setNg(Array.isArray(d) ? d : [])
  }, [])
  const fetchConfig = useCallback(async () => {
    const r = await fetch('/api/nurse/config'); const d = await r.json()
    if (!d.error) setConfig(d)
  }, [])
  const fetchReqs = useCallback(async () => {
    const r = await fetch(`/api/nurse/requests?year=${year}&month=${month}`); const d = await r.json()
    setReqs(Array.isArray(d) ? d : [])
  }, [year, month])

  useEffect(() => { fetchStaff(); fetchNg(); fetchConfig(); fetchRules() }, [fetchStaff, fetchNg, fetchConfig, fetchRules])
  useEffect(() => { fetchReqs() }, [fetchReqs])

  // 曜日条件のトグル
  const hasRule = (staffId: string, type: Rule['rule_type'], wd: number) =>
    rules.some(r => r.staff_id === staffId && r.rule_type === type && r.weekday === wd)
  const toggleRule = async (staffId: string, type: Rule['rule_type'], wd: number) => {
    const on = !hasRule(staffId, type, wd)
    await fetch('/api/nurse/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId, rule_type: type, weekday: wd, on }),
    })
    await fetchRules()
  }
  const ruleCount = (staffId: string) => rules.filter(r => r.staff_id === staffId).length

  // ── スタッフ ──
  const saveStaff = async (s: Partial<Staff> & { id?: string }) => {
    await fetch('/api/nurse/staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s),
    })
    await fetchStaff()
  }
  const updateStaffField = (id: string, field: keyof Staff, value: unknown) => {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }
  const commitStaff = async (s: Staff) => { await saveStaff(s) }
  const addStaff = async () => {
    const sort = staff.length ? Math.max(...staff.map(s => s.sort_order)) + 1 : 1
    await saveStaff({ name: '新規看護師', night_ok: true, night_role: '両方可', max_night: 4, max_consec: 5, sort_order: sort })
  }
  const deleteStaff = async (id: string) => {
    if (!confirm('このスタッフを削除しますか？関連する希望休・シフトも削除されます。')) return
    await fetch(`/api/nurse/staff?id=${id}`, { method: 'DELETE' }); await fetchStaff()
  }

  // ── NG ──
  const addNg = async () => {
    if (!ngA || !ngB || ngA === ngB) return
    await fetch('/api/nurse/ng', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_a: ngA, staff_b: ngB, note: ngNote }),
    })
    setNgA(''); setNgB(''); setNgNote(''); await fetchNg()
  }
  const deleteNg = async (id: number) => {
    await fetch(`/api/nurse/ng?id=${id}`, { method: 'DELETE' }); await fetchNg()
  }
  const nameOf = (id: string) => staff.find(s => s.id === id)?.name ?? id

  // ── config ──
  const saveConfig = async (patch: Partial<Config>) => {
    const r = await fetch('/api/nurse/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    const d = await r.json(); if (!d.error) setConfig(d)
  }

  // ── 希望休 ──
  const daysInMonth = new Date(year, month, 0).getDate()
  const reqMap: Record<string, string> = {}
  for (const r of reqs) reqMap[`${r.staff_id}-${r.day}`] = r.symbol
  const setReq = async (staff_id: string, day: number, symbol: string) => {
    await fetch('/api/nurse/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, day, staff_id, symbol }),
    })
    await fetchReqs()
  }

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg ${tab === id ? 'bg-white border border-b-0 border-slate-200 text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}>
      {label}
    </button>
  )

  return (
    <div className="max-w-full">
      <div className="flex items-center gap-3 mb-4">
        <span className="font-semibold text-slate-700">👩‍⚕️ 看護師シフト 設定</span>
        <a href="/nurse" className="text-sm text-blue-600 hover:underline">← シフト表に戻る</a>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <TabBtn id="staff" label="スタッフ設定" />
        <TabBtn id="ng" label="夜勤NG組合せ" />
        <TabBtn id="kibou" label="希望休入力" />
        <TabBtn id="rule" label="人数ルール" />
      </div>

      <div className="bg-white border border-t-0 border-slate-200 rounded-b-lg p-4">
        {/* ── スタッフ設定 ── */}
        {tab === 'staff' && (
          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold">スタッフ一覧（{staff.length}名）</h2>
              <button onClick={addStaff} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded text-sm">＋ 追加</button>
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs w-full">
                <thead>
                  <tr className="bg-slate-50">
                    {['氏名', '資格/役職', '夜勤可', '夜勤役割', '最大夜勤/月', '連勤上限', '新人', '月公休', '曜日条件', ''].map(h => (
                      <th key={h} className="border border-slate-200 px-2 py-1.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id}>
                      <td className="border border-slate-200 px-1 py-1">
                        <input value={s.name} onChange={e => updateStaffField(s.id, 'name', e.target.value)} onBlur={() => commitStaff(s)}
                          className="w-28 border border-slate-200 rounded px-1 py-0.5" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <input value={s.qualification ?? ''} onChange={e => updateStaffField(s.id, 'qualification', e.target.value)} onBlur={() => commitStaff(s)}
                          className="w-24 border border-slate-200 rounded px-1 py-0.5" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <input type="checkbox" checked={s.night_ok} onChange={e => { updateStaffField(s.id, 'night_ok', e.target.checked); commitStaff({ ...s, night_ok: e.target.checked }) }} />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <select value={s.night_role} onChange={e => { updateStaffField(s.id, 'night_role', e.target.value); commitStaff({ ...s, night_role: e.target.value }) }}
                          className="border border-slate-200 rounded px-1 py-0.5">
                          {ROLES.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <input type="number" value={s.max_night} onChange={e => updateStaffField(s.id, 'max_night', Number(e.target.value))} onBlur={() => commitStaff(s)}
                          className="w-14 border border-slate-200 rounded px-1 py-0.5 text-center" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <input type="number" value={s.max_consec} onChange={e => updateStaffField(s.id, 'max_consec', Number(e.target.value))} onBlur={() => commitStaff(s)}
                          className="w-14 border border-slate-200 rounded px-1 py-0.5 text-center" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <input type="checkbox" checked={s.is_newbie} onChange={e => { updateStaffField(s.id, 'is_newbie', e.target.checked); commitStaff({ ...s, is_newbie: e.target.checked }) }} />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <input type="number" value={s.kokyu_override ?? ''} placeholder="全体"
                          onChange={e => updateStaffField(s.id, 'kokyu_override', e.target.value === '' ? null : Number(e.target.value))}
                          onBlur={() => commitStaff(s)}
                          className="w-14 border border-slate-200 rounded px-1 py-0.5 text-center" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <button onClick={() => setRuleStaff(s)}
                          className={`px-2 py-0.5 rounded border text-xs ${ruleCount(s.id) > 0 ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                          条件{ruleCount(s.id) > 0 ? `(${ruleCount(s.id)})` : ''}
                        </button>
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <button onClick={() => deleteStaff(s.id)} className="text-red-400 hover:text-red-600">削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              ※ 入力後、別のセルをクリック（フォーカスを外す）と保存されます。<br />
              ※ <b>新人</b>＝夜勤の必要人数（土5・他2〜3）にカウントしません（自動では夜勤に入れません）。<br />
              ※ <b>月公休</b>＝個別の月公休数。空欄なら全体設定（人数ルールタブ）に従います。<br />
              ※ <b>曜日条件</b>＝「特定曜日は夜勤不可」「毎週○曜は日勤固定」を設定します。
            </p>
          </div>
        )}

        {/* ── NG ── */}
        {tab === 'ng' && (
          <div>
            <h2 className="text-sm font-semibold mb-3">夜勤NG組み合わせ（同じ夜勤に入れない）</h2>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <select value={ngA} onChange={e => setNgA(e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-sm">
                <option value="">選択</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <span className="text-slate-400">×</span>
              <select value={ngB} onChange={e => setNgB(e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-sm">
                <option value="">選択</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input value={ngNote} onChange={e => setNgNote(e.target.value)} placeholder="備考（任意）" className="border border-slate-200 rounded px-2 py-1 text-sm" />
              <button onClick={addNg} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded text-sm">追加</button>
            </div>
            {ng.length === 0 ? <p className="text-sm text-slate-400">登録なし</p> : (
              <ul className="space-y-1">
                {ng.map(p => (
                  <li key={p.id} className="flex items-center gap-3 text-sm border border-slate-100 rounded px-3 py-1.5">
                    <span>{nameOf(p.staff_a)} × {nameOf(p.staff_b)}</span>
                    {p.note && <span className="text-xs text-slate-400">{p.note}</span>}
                    <button onClick={() => deleteNg(p.id)} className="ml-auto text-red-400 hover:text-red-600 text-xs">削除</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── 希望休 ── */}
        {tab === 'kibou' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold">希望休入力</h2>
              <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-slate-200 rounded px-2 py-1 text-sm">
                {[2025, 2026, 2027, 2028].map(y => <option key={y}>{y}</option>)}
              </select>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-slate-200 rounded px-2 py-1 text-sm">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
              </select>
              <span className="text-xs text-slate-400">空欄＝制約なし。年・✕・振 等を該当日に設定。</span>
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 border border-slate-200 px-2 py-1 min-w-[88px]">看護師</th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                      const wd = WD[new Date(year, month - 1, day).getDay()]
                      return <th key={day} className="border border-slate-200 px-0.5 py-1 min-w-[34px] text-center">{day}<br /><span className="text-[10px] text-slate-400">{wd}</span></th>
                    })}
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id}>
                      <td className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1 font-medium">{s.name}</td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                        const cur = reqMap[`${s.id}-${day}`] ?? ''
                        return (
                          <td key={day} className="border border-slate-200 p-0">
                            <select value={cur} onChange={e => setReq(s.id, day, e.target.value)}
                              className={`w-full h-full text-center text-[11px] border-0 px-0 py-1 ${cur ? 'bg-green-50' : ''}`}>
                              <option value=""></option>
                              {KIBO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 夜勤人数ルール ── */}
        {tab === 'rule' && config && (
          <div>
            <h2 className="text-sm font-semibold mb-3">夜勤の必要人数（曜日別）</h2>
            <table className="border-collapse text-sm mb-4">
              <thead>
                <tr className="bg-slate-50">
                  {['月', '火', '水', '木', '金', '土', '日'].map(w => <th key={w} className="border border-slate-200 px-3 py-1.5">{w}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {(['need_mon', 'need_tue', 'need_wed', 'need_thu', 'need_fri', 'need_sat', 'need_sun'] as const).map(k => (
                    <td key={k} className="border border-slate-200 px-2 py-1 text-center">
                      <input type="number" value={config[k]} min={0}
                        onChange={e => setConfig({ ...config, [k]: Number(e.target.value) })}
                        onBlur={() => saveConfig({ [k]: config[k] })}
                        className="w-14 border border-slate-200 rounded px-1 py-0.5 text-center" />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <div className="flex items-center gap-3 text-sm">
              <label>うち夜正（リーダー）人数</label>
              <input type="number" value={config.sei_count} min={0}
                onChange={e => setConfig({ ...config, sei_count: Number(e.target.value) })}
                onBlur={() => saveConfig({ sei_count: config.sei_count })}
                className="w-16 border border-slate-200 rounded px-1 py-0.5 text-center" />
            </div>
            <p className="text-xs text-slate-400 mt-1">※ 残りは夜副として配置されます。</p>

            <h2 className="text-sm font-semibold mt-6 mb-3">日勤の人数</h2>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-3">
                <label className="w-28">土曜の日勤</label>
                <input type="number" value={config.day_sat} min={0}
                  onChange={e => setConfig({ ...config, day_sat: Number(e.target.value) })}
                  onBlur={() => saveConfig({ day_sat: config.day_sat })}
                  className="w-16 border border-slate-200 rounded px-1 py-0.5 text-center" />
                <span className="text-slate-400">人</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="w-28">日曜・祝日の日勤</label>
                <input type="number" value={config.day_sun_holiday} min={0}
                  onChange={e => setConfig({ ...config, day_sun_holiday: Number(e.target.value) })}
                  onBlur={() => saveConfig({ day_sun_holiday: config.day_sun_holiday })}
                  className="w-16 border border-slate-200 rounded px-1 py-0.5 text-center" />
                <span className="text-slate-400">人</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              ※ 平日は人数を固定せず、各看護師の公休(✕)が月の目標日数で揃うように自動調整します。<br />
              ※ 土日祝で必要人数を満たせない日（希望休・夜勤明けが多い等）は、可能な人数だけ配置して警告を表示します。<br />
              ※ 変更後フォーカスを外すと保存されます。
            </p>
          </div>
        )}
      </div>

      {/* ── 曜日条件モーダル ── */}
      {ruleStaff && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setRuleStaff(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">曜日条件：{ruleStaff.name}</h3>
            <p className="text-xs text-slate-400 mb-4">該当する曜日をオンにしてください（即保存）。</p>

            <div className="mb-4">
              <div className="text-xs font-medium text-slate-600 mb-1">夜勤に入れない曜日</div>
              <div className="flex gap-1">
                {RULE_WD.map((w, wd) => {
                  const on = hasRule(ruleStaff.id, 'no_night_dow', wd)
                  return (
                    <button key={wd} onClick={() => toggleRule(ruleStaff.id, 'no_night_dow', wd)}
                      className={`w-9 py-1.5 rounded text-xs font-medium border ${on ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                      {w}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mb-2">
              <div className="text-xs font-medium text-slate-600 mb-1">日勤固定の曜日</div>
              <div className="flex gap-1">
                {RULE_WD.map((w, wd) => {
                  const on = hasRule(ruleStaff.id, 'fixed_day_dow', wd)
                  return (
                    <button key={wd} onClick={() => toggleRule(ruleStaff.id, 'fixed_day_dow', wd)}
                      className={`w-9 py-1.5 rounded text-xs font-medium border ${on ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                      {w}
                    </button>
                  )
                })}
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              ※ 「日勤固定」は希望休が優先されます（希望休が入っている日は日勤になりません）。
            </p>
            <div className="flex justify-end mt-4">
              <button onClick={() => setRuleStaff(null)} className="px-4 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-sm">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
