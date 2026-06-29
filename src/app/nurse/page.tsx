'use client'
import { useEffect, useState, useCallback } from 'react'
import { SHIFT_OPTIONS, WEEKDAY_JP } from '@/lib/nurseShiftEngine'
import { getHolidaySet } from '@/lib/holidays'

type Staff = {
  id: string; name: string; night_ok: boolean
  night_role: string; max_night: number; max_consec: number; sort_order: number
}
type ShiftRow = { date: string; staff_id: string; symbol: string; is_draft?: boolean }
type Config = {
  need_mon: number; need_tue: number; need_wed: number; need_thu: number
  need_fri: number; need_sat: number; need_sun: number
  sei_count: number; day_sat: number; day_sun_holiday: number
  kokyu_target: number | null; seed: number | null
}

// 記号の表示色（基準記号で色分け）
function symColor(sym: string): string {
  const base = sym.replace(/\//g, '')
  switch (base) {
    case '日': return 'bg-white border-slate-200 text-slate-700'
    case '夜正': return 'bg-indigo-200 border-indigo-400 text-indigo-900 font-bold'
    case '夜副': return 'bg-indigo-100 border-indigo-300 text-indigo-800'
    case '非': return 'bg-violet-50 border-violet-200 text-violet-500'
    case '✕': return 'bg-slate-200 border-slate-300 text-slate-500'
    case '年': return 'bg-green-100 border-green-300 text-green-700'
    case '振': return 'bg-teal-100 border-teal-300 text-teal-700'
    case '付': return 'bg-amber-100 border-amber-300 text-amber-700'
    case '看': return 'bg-rose-100 border-rose-300 text-rose-700'
    case '特': return 'bg-pink-100 border-pink-300 text-pink-700'
    default: return 'bg-slate-50 border-slate-200 text-slate-300'
  }
}

const WD = ['日', '月', '火', '水', '木', '金', '土'] // getDay()

export default function NursePage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [staff, setStaff] = useState<Staff[]>([])
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [isDraft, setIsDraft] = useState<boolean | null>(null)
  const [editCell, setEditCell] = useState<{ date: string; sid: string; sym: string } | null>(null)
  const [editSym, setEditSym] = useState('')
  const [kokyuInput, setKokyuInput] = useState<string>('')
  const [seedInput, setSeedInput] = useState<string>('')
  const [drafts, setDrafts] = useState<string[]>([])
  const [selectedPattern, setSelectedPattern] = useState('')
  const [viewingDraft, setViewingDraft] = useState(false)
  const [showDraftModal, setShowDraftModal] = useState(false)
  const [newPatternName, setNewPatternName] = useState('')
  const holidays = getHolidaySet()

  const fetchStaff = useCallback(async () => {
    const r = await fetch('/api/nurse/staff')
    const d = await r.json()
    setStaff(Array.isArray(d) ? d : [])
  }, [])

  const fetchConfig = useCallback(async () => {
    const r = await fetch('/api/nurse/config')
    const d = await r.json()
    if (!d.error) {
      setConfig(d)
      setKokyuInput(d.kokyu_target ?? '')
      setSeedInput(d.seed ?? '')
    }
  }, [])

  const fetchShifts = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/nurse/shift?year=${year}&month=${month}`)
    const d = await r.json()
    const list: ShiftRow[] = Array.isArray(d.shifts) ? d.shifts : []
    setShifts(list)
    setIsDraft(list.length > 0 ? list.some(s => s.is_draft) : null)
    setLoading(false)
  }, [year, month])

  const fetchDrafts = useCallback(async () => {
    const r = await fetch(`/api/nurse/draft?year=${year}&month=${month}`)
    const d = await r.json()
    setDrafts(Array.isArray(d) ? d : [])
  }, [year, month])

  useEffect(() => { fetchStaff() }, [fetchStaff])
  useEffect(() => { fetchConfig() }, [fetchConfig])
  useEffect(() => { fetchShifts() }, [fetchShifts])
  useEffect(() => { fetchDrafts() }, [fetchDrafts])

  const daysInMonth = new Date(year, month, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const date = `${year}-${pad(month)}-${pad(day)}`
    const jsDay = new Date(year, month - 1, day).getDay()
    return {
      date, day, wd: WD[jsDay], jsDay,
      sun: jsDay === 0, sat: jsDay === 6,
      holiday: holidays.has(date),
    }
  })

  // shiftMap[date][sid] = symbol
  const shiftMap: Record<string, Record<string, string>> = {}
  for (const s of shifts) {
    if (!shiftMap[s.date]) shiftMap[s.date] = {}
    shiftMap[s.date][s.staff_id] = s.symbol
  }

  // 曜日別 夜勤必要人数
  const needOf = (jsDay: number): number => {
    if (!config) return 3
    const map = [config.need_sun, config.need_mon, config.need_tue, config.need_wed,
      config.need_thu, config.need_fri, config.need_sat]
    return map[jsDay]
  }

  const saveGenParams = async () => {
    await fetch('/api/nurse/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kokyu_target: kokyuInput === '' ? null : Number(kokyuInput),
        seed: seedInput === '' ? null : Number(seedInput),
      }),
    })
  }

  const handleGenerate = async (pattern_name?: string) => {
    if (!pattern_name && !confirm(`${year}年${month}月のシフトを生成しますか？`)) return
    setGenerating(true); setWarnings([])
    await saveGenParams()
    const r = await fetch('/api/nurse/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, pattern_name }),
    })
    const d = await r.json()
    if (d.error) setWarnings([d.error])
    else if (d.warnings?.length) setWarnings(d.warnings)
    if (pattern_name) await fetchDrafts()
    else await fetchShifts()
    setGenerating(false)
  }

  const handleReset = async () => {
    if (!confirm(`${year}年${month}月のシフトをリセットしますか？`)) return
    const first = `${year}-${pad(month)}-01`
    const last = `${year}-${pad(month)}-${daysInMonth}`
    await fetch(`/api/nurse/shift?from=${first}&to=${last}`, { method: 'DELETE' })
    await fetchShifts()
  }

  const handleConfirm = async () => {
    if (!confirm(`${year}年${month}月のシフトを確定しますか？`)) return
    await fetch('/api/nurse/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    setIsDraft(false)
  }

  const openEdit = (date: string, sid: string, sym: string) => {
    setEditSym(sym); setEditCell({ date, sid, sym })
  }

  const handleSave = async () => {
    if (!editCell) return
    await fetch('/api/nurse/shift', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: editCell.date, staff_id: editCell.sid, symbol: editSym }),
    })
    setShifts(prev => {
      const others = prev.filter(s => !(s.date === editCell.date && s.staff_id === editCell.sid))
      return editSym ? [...others, { date: editCell.date, staff_id: editCell.sid, symbol: editSym }] : others
    })
    setEditCell(null)
  }

  const handleLoadDraft = async (p: string) => {
    setLoading(true)
    const r = await fetch(`/api/nurse/draft/load?year=${year}&month=${month}&pattern_name=${encodeURIComponent(p)}`)
    const d = await r.json()
    setShifts(Array.isArray(d) ? d : [])
    setSelectedPattern(p); setViewingDraft(true); setLoading(false)
  }
  const handleBackToMain = async () => {
    await fetchShifts(); setViewingDraft(false); setSelectedPattern('')
  }
  const handleConfirmDraft = async (p: string) => {
    if (!confirm(`「${p}」を本番シフトとして確定しますか？\n現在の本番シフトは上書きされます。`)) return
    await fetch('/api/nurse/draft/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, pattern_name: p }),
    })
    await fetchShifts(); setViewingDraft(false); setSelectedPattern(''); await fetchDrafts()
  }
  const handleDeleteDraft = async (p: string) => {
    if (!confirm(`「${p}」を削除しますか？`)) return
    await fetch(`/api/nurse/draft?year=${year}&month=${month}&pattern_name=${encodeURIComponent(p)}`, { method: 'DELETE' })
    if (selectedPattern === p) await handleBackToMain()
    await fetchDrafts()
  }

  // 個人別集計
  const personStat = (sid: string) => {
    let nichi = 0, sei = 0, fuku = 0, kokyu = 0, nen = 0
    for (const day of allDays) {
      const v = shiftMap[day.date]?.[sid] ?? ''
      if (v === '日') nichi++
      else if (v === '夜正') sei++
      else if (v === '夜副') fuku++
      else if (v === '✕') kokyu++
      else if (v.includes('年')) nen += v === '年' ? 1 : 0.5
      if (v.startsWith('/') || (v.endsWith('/') && v.length > 1)) nichi += 0.5
    }
    return { nichi, sei, fuku, kokyu, nen, yakei: sei + fuku }
  }

  // 日別 夜勤合計
  const nightTotalOf = (date: string) => {
    const m = shiftMap[date] ?? {}
    return Object.values(m).filter(v => v === '夜正' || v === '夜副').length
  }
  const dayTotalOf = (date: string) => {
    const m = shiftMap[date] ?? {}
    return Object.values(m).filter(v => v === '日').length
  }
  // 日勤の目標人数（土日祝のみ固定。平日は -1=固定なし）
  const dayTargetOf = (d: { sat: boolean; sun: boolean; holiday: boolean }) => {
    if (!config) return -1
    if (d.holiday) return config.day_sun_holiday
    if (d.sat) return config.day_sat
    if (d.sun) return config.day_sun_holiday
    return -1
  }

  return (
    <div className="max-w-full">
      {/* ヘッダ */}
      <div className="flex items-center gap-3 mb-3 flex-wrap no-print">
        <span className="font-semibold text-slate-700">👩‍⚕️ 看護師シフト（内科病棟）</span>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-slate-200 rounded px-2 py-1 text-sm">
          {[2025, 2026, 2027, 2028].map(y => <option key={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="border border-slate-200 rounded px-2 py-1 text-sm">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
        </select>
        <button onClick={() => handleGenerate()} disabled={generating}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
          {generating ? '生成中...' : '▶ シフトを生成'}
        </button>
        <a href="/nurse/register" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium">
          ⚙️ スタッフ・設定
        </a>
        <button onClick={handleReset}
          className="bg-red-400 hover:bg-red-500 text-white px-3 py-1.5 rounded text-sm font-medium">
          🗑 リセット
        </button>
        {isDraft === true && (
          <button onClick={handleConfirm}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded text-sm font-medium">
            ✅ 確定する
          </button>
        )}
        {isDraft === true && <span className="bg-yellow-100 text-yellow-700 border border-yellow-300 px-3 py-1 rounded-full text-xs">📝 下書き</span>}
        {isDraft === false && <span className="bg-emerald-100 text-emerald-700 border border-emerald-300 px-3 py-1 rounded-full text-xs">✅ 確定済み</span>}
        <button onClick={() => setShowDraftModal(true)} disabled={generating}
          className="bg-violet-500 hover:bg-violet-600 text-white px-3 py-1.5 rounded text-sm font-medium">
          📋 下書き保存
        </button>
        <button onClick={() => window.print()}
          className="bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-sm font-medium">
          🖨 印刷／PDF
        </button>
      </div>

      {/* 生成パラメータ */}
      <div className="flex items-center gap-3 mb-3 flex-wrap text-sm no-print">
        <span className="text-slate-500">公休目標</span>
        <input value={kokyuInput} onChange={e => setKokyuInput(e.target.value)} placeholder="自動"
          className="border border-slate-200 rounded px-2 py-1 w-16 text-center" />
        <span className="text-slate-500">乱数シード</span>
        <input value={seedInput} onChange={e => setSeedInput(e.target.value)} placeholder="毎回違う"
          className="border border-slate-200 rounded px-2 py-1 w-20 text-center" />
        <span className="text-xs text-slate-400">※空欄でOK。シードを固定すると毎回同じ結果になります</span>
      </div>

      {/* 下書き一覧 */}
      {drafts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 no-print">
          <span className="text-xs text-slate-400">下書き：</span>
          {drafts.map(p => (
            <div key={p} className="flex items-center gap-1">
              <button onClick={() => handleLoadDraft(p)}
                className={`px-3 py-1 rounded text-xs font-medium border ${selectedPattern === p ? 'bg-violet-500 text-white border-violet-500' : 'bg-white text-violet-600 border-violet-300 hover:bg-violet-50'}`}>{p}</button>
              <button onClick={() => handleConfirmDraft(p)} className="px-2 py-1 rounded text-xs bg-emerald-500 hover:bg-emerald-600 text-white">確定</button>
              <button onClick={() => handleDeleteDraft(p)} className="px-2 py-1 rounded text-xs bg-red-400 hover:bg-red-500 text-white">削除</button>
            </div>
          ))}
          {viewingDraft && <button onClick={handleBackToMain} className="px-3 py-1 rounded text-xs bg-slate-500 hover:bg-slate-600 text-white">← 本番に戻る</button>}
        </div>
      )}

      {viewingDraft && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-2 mb-3 text-sm text-violet-700 font-medium no-print">
          📋 下書き表示中：「{selectedPattern}」
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">
          <strong>⚠️ 警告</strong>
          <ul className="mt-1 list-disc list-inside">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      {/* 凡例 */}
      <div className="flex gap-2 flex-wrap mb-2 text-xs items-center no-print">
        {['日', '夜正', '夜副', '非', '✕', '年', '振', '付', '看', '特'].map(s => (
          <span key={s} className={`px-2 py-0.5 rounded border ${symColor(s)}`}>{s}</span>
        ))}
        <span className="text-slate-400 ml-1">セルをクリックで編集</span>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm py-8 text-center">読み込み中...</div>
      ) : shifts.length === 0 ? (
        <div className="text-slate-400 text-sm py-8 text-center">シフトがまだ生成されていません。「▶ シフトを生成」を押してください。</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="border-collapse text-xs whitespace-nowrap">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 border border-slate-200 px-2 py-1 text-left min-w-[88px]">看護師</th>
                  {allDays.map(d => (
                    <th key={d.date} className={`border border-slate-200 px-1 py-1 text-center min-w-[30px] font-medium
                      ${d.sun || d.holiday ? 'bg-red-50 text-red-600' : d.sat ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-600'}`}>
                      {d.day}<br /><span className="text-[10px]">{d.wd}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id}>
                    <td className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1 font-medium">{s.name}</td>
                    {allDays.map(d => {
                      const sym = shiftMap[d.date]?.[s.id] ?? ''
                      return (
                        <td key={d.date}
                          onClick={() => openEdit(d.date, s.id, sym)}
                          className={`border border-slate-200 px-0.5 py-1 text-center cursor-pointer hover:opacity-70 text-[11px] ${symColor(sym)}`}>
                          {sym || '・'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {/* 日勤合計 */}
                <tr>
                  <td className="sticky left-0 z-10 bg-slate-100 border border-slate-200 px-2 py-1 font-semibold text-slate-500">日勤計</td>
                  {allDays.map(d => {
                    const got = dayTotalOf(d.date)
                    const target = dayTargetOf(d)
                    if (target < 0) {
                      // 平日：目標なし（人数だけ表示）
                      return <td key={d.date} className="border border-slate-200 px-0.5 py-1 text-center bg-slate-50 text-slate-500">{got}</td>
                    }
                    const ok = got === target
                    return (
                      <td key={d.date} className={`border border-slate-200 px-0.5 py-1 text-center font-bold ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {got}/{target}
                      </td>
                    )
                  })}
                </tr>
                {/* 夜勤合計 / 必要人数 */}
                <tr>
                  <td className="sticky left-0 z-10 bg-slate-100 border border-slate-200 px-2 py-1 font-semibold text-slate-500">夜勤計/必要</td>
                  {allDays.map(d => {
                    const got = nightTotalOf(d.date)
                    const need = needOf(d.jsDay)
                    const ok = got >= need
                    return (
                      <td key={d.date}
                        className={`border border-slate-200 px-0.5 py-1 text-center font-bold ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {got}/{need}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* 個人別集計 */}
          <div className="mt-6 bg-white rounded-lg border border-slate-200 p-4 no-print">
            <h2 className="text-sm font-semibold mb-3">📊 個人別集計</h2>
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    {['看護師', '日勤', '夜正', '夜副', '夜勤計', '公休✕', '年休', '夜勤上限', '判定'].map(h => (
                      <th key={h} className="border border-slate-200 px-3 py-1.5 bg-slate-50">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => {
                    const st = personStat(s.id)
                    const over = st.yakei > s.max_night
                    return (
                      <tr key={s.id}>
                        <td className="border border-slate-200 px-3 py-1">{s.name}</td>
                        <td className="border border-slate-200 px-3 py-1 text-center">{st.nichi}</td>
                        <td className="border border-slate-200 px-3 py-1 text-center">{st.sei}</td>
                        <td className="border border-slate-200 px-3 py-1 text-center">{st.fuku}</td>
                        <td className="border border-slate-200 px-3 py-1 text-center font-semibold bg-indigo-50">{st.yakei}</td>
                        <td className="border border-slate-200 px-3 py-1 text-center">{st.kokyu}</td>
                        <td className="border border-slate-200 px-3 py-1 text-center">{st.nen}</td>
                        <td className="border border-slate-200 px-3 py-1 text-center text-slate-400">{s.max_night}</td>
                        <td className={`border border-slate-200 px-3 py-1 text-center ${over ? 'text-red-600 font-semibold' : 'text-green-600'}`}>
                          {over ? '⚠️超過' : '✅'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 編集モーダル */}
      {editCell && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditCell(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-500 mb-1">勤務変更</h3>
            <p className="text-xs text-slate-400 mb-3">
              {editCell.date} / {staff.find(s => s.id === editCell.sid)?.name}
            </p>
            <select value={editSym} onChange={e => setEditSym(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3">
              {SHIFT_OPTIONS.map(o => <option key={o} value={o}>{o === '' ? '（空欄）' : o}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditCell(null)} className="px-4 py-1.5 rounded-lg border text-sm hover:bg-slate-50">キャンセル</button>
              <button onClick={handleSave} className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm">変更</button>
            </div>
          </div>
        </div>
      )}

      {/* 下書き保存モーダル */}
      {showDraftModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDraftModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-600 mb-1">下書きとして保存</h3>
            <p className="text-xs text-slate-400 mb-3">パターン名をつけて生成・保存します。複数案を比較できます。</p>
            <input value={newPatternName} onChange={e => setNewPatternName(e.target.value)} placeholder="例：6月案A"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3"
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && newPatternName.trim()) { setShowDraftModal(false); handleGenerate(newPatternName.trim()); setNewPatternName('') } }} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDraftModal(false)} className="px-4 py-1.5 rounded-lg border text-sm hover:bg-slate-50">キャンセル</button>
              <button onClick={() => { if (newPatternName.trim()) { setShowDraftModal(false); handleGenerate(newPatternName.trim()); setNewPatternName('') } }}
                disabled={!newPatternName.trim()}
                className="px-4 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-sm disabled:opacity-50">生成して保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
