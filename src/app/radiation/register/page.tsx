'use client'
import { useEffect, useState, useCallback } from 'react'
import { KUBUN_OPTIONS, RadiationRole } from '@/lib/radiationShiftEngine'

type Staff = { id: string; name: string; role: RadiationRole; sort_order: number }
type Req = { id: number; year: number; month: number; day: number; staff_id: string; kubun: string }
type Config = {
  anchor_monday: string
  sat_work_week0: boolean
  weekday_hayaban_week0: 'B' | 'C'
  sat_hayaban_first: 'B' | 'C'
}

const WD = ['日', '月', '火', '水', '木', '金', '土']

export default function RadiationRegisterPage() {
  const now = new Date()
  const [tab, setTab] = useState<'kibou' | 'staff' | 'rule'>('kibou')
  const [staff, setStaff] = useState<Staff[]>([])
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [reqs, setReqs] = useState<Req[]>([])
  const [config, setConfig] = useState<Config | null>(null)

  const fetchStaff = useCallback(async () => {
    const r = await fetch('/api/radiation/staff'); const d = await r.json()
    setStaff(Array.isArray(d) ? d : [])
  }, [])
  const fetchReqs = useCallback(async () => {
    const r = await fetch(`/api/radiation/requests?year=${year}&month=${month}`); const d = await r.json()
    setReqs(Array.isArray(d) ? d : [])
  }, [year, month])
  const fetchConfig = useCallback(async () => {
    const r = await fetch('/api/radiation/config'); const d = await r.json()
    if (!d.error) setConfig(d)
  }, [])

  useEffect(() => { fetchStaff(); fetchConfig() }, [fetchStaff, fetchConfig])
  useEffect(() => { fetchReqs() }, [fetchReqs])

  // ── 休み申請 ──
  const daysInMonth = new Date(year, month, 0).getDate()
  const reqMap: Record<string, string> = {}
  for (const r of reqs) reqMap[`${r.staff_id}-${r.day}`] = r.kubun
  const setReq = async (staff_id: string, day: number, kubun: string) => {
    await fetch('/api/radiation/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, day, staff_id, kubun }),
    })
    await fetchReqs()
  }

  // ── スタッフ氏名 ──
  const updateStaffField = (id: string, field: keyof Staff, value: unknown) =>
    setStaff(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  const commitStaff = async (s: Staff) => {
    await fetch('/api/radiation/staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s),
    })
    await fetchStaff()
  }

  // ── config ──
  const saveConfig = async (patch: Partial<Config>) => {
    const r = await fetch('/api/radiation/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    const d = await r.json(); if (!d.error) setConfig(d)
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
        <span className="font-semibold text-slate-700">🩻 放射線室シフト 設定</span>
        <a href="/radiation" className="text-sm text-blue-600 hover:underline">← シフト表に戻る</a>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <TabBtn id="kibou" label="休み申請" />
        <TabBtn id="staff" label="スタッフ" />
        <TabBtn id="rule" label="ローテーション設定" />
      </div>

      <div className="bg-white border border-t-0 border-slate-200 rounded-b-lg p-4">
        {/* ── 休み申請 ── */}
        {tab === 'kibou' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold">休み申請入力</h2>
              <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-slate-200 rounded px-2 py-1 text-sm">
                {[2025, 2026, 2027, 2028].map(y => <option key={y}>{y}</option>)}
              </select>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-slate-200 rounded px-2 py-1 text-sm">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
              </select>
              <span className="text-xs text-slate-400">空欄＝申請なし。全休／午前半休／午後半休を該当日に設定。</span>
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 border border-slate-200 px-2 py-1 min-w-[96px]">スタッフ</th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                      const wd = WD[new Date(year, month - 1, day).getDay()]
                      return <th key={day} className="border border-slate-200 px-0.5 py-1 min-w-[44px] text-center">{day}<br /><span className="text-[10px] text-slate-400">{wd}</span></th>
                    })}
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id}>
                      <td className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1 font-medium">
                        <span className="text-slate-400 mr-1">{s.role}</span>{s.name}
                      </td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                        const cur = reqMap[`${s.id}-${day}`] ?? ''
                        return (
                          <td key={day} className="border border-slate-200 p-0">
                            <select value={cur} onChange={e => setReq(s.id, day, e.target.value)}
                              className={`w-full h-full text-center text-[10px] border-0 px-0 py-1 ${cur ? 'bg-green-50' : ''}`}>
                              <option value=""></option>
                              {KUBUN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
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

        {/* ── スタッフ ── */}
        {tab === 'staff' && (
          <div>
            <h2 className="text-sm font-semibold mb-3">スタッフ（3名・役割A/B/C固定）</h2>
            <table className="border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50">
                  {['役割', '氏名'].map(h => <th key={h} className="border border-slate-200 px-3 py-1.5">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id}>
                    <td className="border border-slate-200 px-3 py-1 text-center font-semibold text-slate-500">{s.role}</td>
                    <td className="border border-slate-200 px-2 py-1">
                      <input value={s.name} onChange={e => updateStaffField(s.id, 'name', e.target.value)} onBlur={() => commitStaff(s)}
                        className="w-40 border border-slate-200 rounded px-2 py-1" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-2">
              ※ A=平日 8:00-17:00／土曜 8:30-12:30。B・C=平日 8:30-17:30（早番交代）／土曜 8:00-12:30・8:30-12:30（早番交代）。<br />
              ※ 氏名はフォーカスを外すと保存されます。
            </p>
          </div>
        )}

        {/* ── ローテーション設定 ── */}
        {tab === 'rule' && config && (
          <div className="max-w-xl">
            <h2 className="text-sm font-semibold mb-3">隔週ローテーションの基準</h2>
            <div className="flex flex-col gap-4 text-sm">
              <div className="flex items-center gap-3">
                <label className="w-44">基準の月曜日</label>
                <input type="date" value={config.anchor_monday}
                  onChange={e => setConfig({ ...config, anchor_monday: e.target.value })}
                  onBlur={() => saveConfig({ anchor_monday: config.anchor_monday })}
                  className="border border-slate-200 rounded px-2 py-1" />
                <span className="text-xs text-slate-400">この週を「週0」とみなします</span>
              </div>

              <div className="flex items-center gap-3">
                <label className="w-44">週0の土曜</label>
                <select value={config.sat_work_week0 ? '1' : '0'}
                  onChange={e => { const v = e.target.value === '1'; setConfig({ ...config, sat_work_week0: v }); saveConfig({ sat_work_week0: v }) }}
                  className="border border-slate-200 rounded px-2 py-1">
                  <option value="1">全員出勤</option>
                  <option value="0">全員休み</option>
                </select>
                <span className="text-xs text-slate-400">以降、隔週で反転</span>
              </div>

              <div className="flex items-center gap-3">
                <label className="w-44">週0の平日 早番</label>
                <select value={config.weekday_hayaban_week0}
                  onChange={e => { const v = e.target.value as 'B' | 'C'; setConfig({ ...config, weekday_hayaban_week0: v }); saveConfig({ weekday_hayaban_week0: v }) }}
                  className="border border-slate-200 rounded px-2 py-1">
                  <option value="B">B（{staff.find(s => s.role === 'B')?.name ?? '野田'}）</option>
                  <option value="C">C（{staff.find(s => s.role === 'C')?.name ?? '石橋'}）</option>
                </select>
                <span className="text-xs text-slate-400">毎週交代</span>
              </div>

              <div className="flex items-center gap-3">
                <label className="w-44">最初の出勤週の土曜早番</label>
                <select value={config.sat_hayaban_first}
                  onChange={e => { const v = e.target.value as 'B' | 'C'; setConfig({ ...config, sat_hayaban_first: v }); saveConfig({ sat_hayaban_first: v }) }}
                  className="border border-slate-200 rounded px-2 py-1">
                  <option value="B">B（{staff.find(s => s.role === 'B')?.name ?? '野田'}）8:00-12:30</option>
                  <option value="C">C（{staff.find(s => s.role === 'C')?.name ?? '石橋'}）8:00-12:30</option>
                </select>
                <span className="text-xs text-slate-400">全員出勤週ごとに交代</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-4">
              ※ 実際の運用と早番／土曜出勤がずれている場合は、上の設定を1つずらして合わせてください。<br />
              ※ 変更はフォーカスを外す／選択すると保存されます。再生成すると反映されます。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
