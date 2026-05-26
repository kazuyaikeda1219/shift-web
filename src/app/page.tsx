'use client'
import { useEffect, useState, useCallback } from 'react'
import { isClosed } from '@/lib/shiftEngine'
import { getHolidaySet } from '@/lib/holidays'

type Staff = { id: string; name: string; can_us: boolean; sort_order: number }
type ShiftRow = { date: string; staff_id: string; position: string }
type RequestRow = { date: string; staff_id: string; kubun: string }

const E_SLOTS = ['E1','E2','E3','E4']

const POS_BADGE: Record<string, string> = {
  'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D',
  'E1': 'E①', 'E2': 'E②', 'E3': 'E③', 'E4': 'E④',
  '全休': '全休', '午前半休': '午前半休', '午後半休': '午後半休', '－': '－',
}
const POS_LABEL: Record<string, string> = {
  'A': '血液検査', 'B': 'CBC', 'C': '心電図', 'D': '昼１',
  'E1': '専任枠', 'E2': 'エコー枠', 'E3': 'エコー枠', 'E4': 'エコー枠',
  '全休': '全休', '午前半休': '午前半休', '午後半休': '午後半休', '－': '－',
}
const POS_COLOR: Record<string, string> = {
  'A': 'bg-blue-100 border-blue-300',
  'B': 'bg-green-100 border-green-300',
  'C': 'bg-yellow-100 border-yellow-300',
  'D': 'bg-purple-100 border-purple-300',
  'E1': 'bg-orange-200 border-orange-400',
  'E2': 'bg-orange-100 border-orange-300',
  'E3': 'bg-orange-100 border-orange-300',
  'E4': 'bg-orange-100 border-orange-300',
  '全休':    'bg-slate-100 border-slate-300',
  '午前半休': 'bg-pink-100 border-pink-300',
  '午後半休': 'bg-pink-100 border-pink-300',
  '－': 'bg-slate-50 border-slate-200',
}
const EDIT_OPTIONS = ['A','B','C','D','E1','E2','E3','E4','全休','午前半休','午後半休','－']
const WEEKDAY = ['日','月','火','水','木','金','土']

function checkViolations(
  date: string,
  targetSid: string,
  newPos: string,
  allAssignments: Record<string, string>,
  staff: Staff[],
  requests: RequestRow[],
): string[] {
  const violations: string[] = []
  const staffMap = Object.fromEntries(staff.map(s => [s.id, s]))
  const usStaff  = new Set(staff.filter(s => s.can_us).map(s => s.id))
  const proposed = { ...allAssignments, [targetSid]: newPos }

  const dayReq = requests.filter(r => r.date === date)
  const kubunOf = (sid: string) => dayReq.find(r => r.staff_id === sid)?.kubun ?? null

  if (E_SLOTS.includes(newPos)) {
    const eStaff = Object.entries(proposed).filter(([, p]) => E_SLOTS.includes(p)).map(([sid]) => sid)
    const hasUs  = eStaff.some(sid => usStaff.has(sid))
    if (!hasUs) violations.push('Eグループに★（US担当者）が1名も含まれていません')
  }

  const e1Count = Object.entries(proposed).filter(([, p]) => p === 'E1').length
  if (e1Count > 1) violations.push(`E① は1日1名までです（現在 ${e1Count} 名）`)

  const usInAB = Object.entries(proposed).filter(([sid, p]) => (p === 'A' || p === 'B') && usStaff.has(sid)).length
  if (usInAB > 1) violations.push(`★（US担当者）のA/B配置は1日1名までです（現在 ${usInAB} 名）`)

  const kubun = kubunOf(targetSid)
  const name  = staffMap[targetSid]?.name ?? targetSid
  if ((kubun === '午前半休' || kubun === '午後半休') && E_SLOTS.includes(newPos)) {
    violations.push(`${name} は${kubun}のためEグループに配置できません`)
  }
  if (kubun === '午後半休' && newPos === 'D') {
    violations.push(`${name} は午後半休のため D（昼１）に配置できません`)
  }

  return violations
}

export default function ShiftPage() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [staff,      setStaff]      = useState<Staff[]>([])
  const [shifts,     setShifts]     = useState<ShiftRow[]>([])
  const [dayReqs,    setDayReqs]    = useState<RequestRow[]>([])
  const [loading,    setLoading]    = useState(false)
  const [generating, setGenerating] = useState(false)
  const [warnings,   setWarnings]   = useState<string[]>([])
  const [editCell,   setEditCell]   = useState<{date:string;sid:string;pos:string}|null>(null)
  const [editViol,   setEditViol]   = useState<string[]>([])
  const [editPos,    setEditPos]    = useState('')
  const holidays = getHolidaySet()

  const fetchStaff = useCallback(async () => {
    const r    = await fetch('/api/staff')
    const data = await r.json()
    setStaff(Array.isArray(data) ? data : [])
  }, [])

  const fetchShifts = useCallback(async () => {
    setLoading(true)
    const [sr, rr] = await Promise.all([
      fetch(`/api/shift?year=${year}&month=${month}`),
      fetch(`/api/requests?year=${year}&month=${month}`),
    ])
    const sdata = await sr.json()
    const rdata = await rr.json()
    setShifts(Array.isArray(sdata) ? sdata : [])
    if (Array.isArray(rdata)) {
      setDayReqs(rdata.map((r: {year:number;month:number;day:number;staff_id:string;kubun:string}) => ({
        date: `${r.year}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`,
        staff_id: r.staff_id, kubun: r.kubun,
      })))
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => { fetchStaff() },  [fetchStaff])
  useEffect(() => { fetchShifts() }, [fetchShifts])

  const daysInMonth = new Date(year, month, 0).getDate()
  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month - 1, i + 1)
    return {
      date: d.toISOString().slice(0, 10),
      wd:   WEEKDAY[d.getDay()],
      closed:   isClosed(d, holidays),
      heavy:    ['月','水'].includes(WEEKDAY[d.getDay()]),
      saturday: d.getDay() === 6,
    }
  })

  const shiftMap: Record<string, Record<string, string>> = {}
  for (const s of shifts) {
    if (!shiftMap[s.date]) shiftMap[s.date] = {}
    shiftMap[s.date][s.staff_id] = s.position
  }

  const handleGenerate = async () => {
    if (!confirm(`${year}年${month}月のシフトを生成しますか？`)) return
    setGenerating(true); setWarnings([])
    const r    = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    const data = await r.json()
    if (data.warnings?.length) setWarnings(data.warnings)
    await fetchShifts()
    setGenerating(false)
  }

  const handleReset = async () => {
    if (!confirm(`${year}年${month}月のシフトをリセットしますか？\n生成済みのシフトが全て削除されます。`)) return
    const pad   = (n: number) => String(n).padStart(2, '0')
    const first = `${year}-${pad(month)}-01`
    const last  = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`
    await fetch(`/api/shift?from=${first}&to=${last}`, { method: 'DELETE' })
    await fetchShifts()
  }

  const openEdit = (date: string, sid: string, pos: string, closed: boolean) => {
    if (closed) return
    setEditPos(pos)
    setEditViol([])
    setEditCell({ date, sid, pos })
  }

  const onSelectChange = (newPos: string) => {
    setEditPos(newPos)
    if (!editCell) return
    const viol = checkViolations(editCell.date, editCell.sid, newPos, shiftMap[editCell.date] ?? {}, staff, dayReqs)
    setEditViol(viol)
  }

  const handleSave = async () => {
    if (!editCell) return
    if (editViol.length > 0 && !confirm('制約違反があります。それでも保存しますか？')) return
    await fetch('/api/shift', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: editCell.date, staff_id: editCell.sid, position: editPos }),
    })
    setShifts(prev => prev.map(s =>
      s.date === editCell.date && s.staff_id === editCell.sid ? { ...s, position: editPos } : s
    ))
    setEditCell(null); setEditViol([])
  }

  const stats: Record<string, Record<string, number>> = {}
  for (const s of staff) stats[s.id] = {}
  for (const s of shifts) {
    if (!stats[s.staff_id]) stats[s.staff_id] = {}
    stats[s.staff_id][s.position] = (stats[s.staff_id][s.position] ?? 0) + 1
  }

  return (
    <div className="max-w-full">
      {/* ヘッダ */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-slate-200 rounded px-2 py-1 text-sm">
            {[2025,2026,2027,2028].map(y => <option key={y}>{y}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-slate-200 rounded px-2 py-1 text-sm">
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
        <button onClick={handleGenerate} disabled={generating}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
          {generating ? '生成中...' : `▶ ${year}年${month}月のシフトを生成`}
        </button>
        <a href="/register" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium">
          📋 休み申請を登録
        </a>
        <button onClick={handleReset}
          className="bg-red-400 hover:bg-red-500 text-white px-4 py-1.5 rounded text-sm font-medium">
          🗑 シフトをリセット
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          <strong>⚠️ 生成時の警告</strong>
          <ul className="mt-1 list-disc list-inside">{warnings.map((w,i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      {/* 凡例 */}
      <div className="flex gap-2 flex-wrap mb-3 text-xs items-center">
        {(['A','B','C','D','E1','E2','全休','午前半休'] as const).map(pos => (
          <span key={pos} className={`px-2 py-0.5 rounded border ${POS_COLOR[pos]}`}>
            {POS_BADGE[pos]}：{POS_LABEL[pos]}
          </span>
        ))}
        <span className="text-slate-400 ml-1">★=US担当可</span>
        <span className="text-orange-600 font-medium">月・水=入院多</span>
        <span className="text-slate-400 text-[11px]">セルをクリックで編集</span>
      </div>

      {/* シフト表 */}
      {loading ? (
        <div className="text-slate-400 text-sm py-8 text-center">読み込み中...</div>
      ) : shifts.length === 0 ? (
        <div className="text-slate-400 text-sm py-8 text-center">
          シフトがまだ生成されていません。「シフトを生成」ボタンを押してください。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 border border-slate-200 px-3 py-2 text-left min-w-[88px]">スタッフ</th>
                {allDays.map(({ date, wd, closed, heavy, saturday }) => (
                  <th key={date} className={`border border-slate-200 px-2 py-1 text-center min-w-[50px] font-medium
                    ${closed ? 'bg-slate-100 text-slate-400 italic' : heavy ? 'bg-orange-50 text-orange-700' : saturday ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>
                    {Number(date.slice(8))}<br /><span className="text-[10px]">{wd}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1.5 font-medium text-xs">
                    {s.can_us ? <span className="text-orange-500 mr-0.5">★</span> : <span className="mr-3" />}{s.name}
                  </td>
                  {allDays.map(({ date, closed, heavy, saturday }) => {
                    const pos      = shiftMap[date]?.[s.id] ?? '－'
                    const colorCls = closed ? 'bg-slate-100 opacity-60 cursor-default' : (POS_COLOR[pos] ?? 'bg-white border-slate-200')
                    const ringCls  = !closed && heavy ? 'ring-1 ring-orange-300 ring-inset' : !closed && saturday ? 'ring-1 ring-blue-200 ring-inset' : ''
                    return (
                      <td key={date}
                        className={`border border-slate-200 px-1 py-1 text-center cursor-pointer hover:opacity-75 transition-opacity ${colorCls} ${ringCls}`}
                        onClick={() => openEdit(date, s.id, pos, closed)}>
                        <span className="block font-bold text-[11px]">{POS_BADGE[pos] ?? pos}</span>
                        <span className="block text-[9px] text-slate-500 leading-tight">{POS_LABEL[pos] ?? ''}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 集計 */}
      {shifts.length > 0 && (
        <div className="mt-6 bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-semibold mb-3">📊 配置回数集計</h2>
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-slate-200 px-3 py-1.5 bg-slate-50 text-left">スタッフ</th>
                  {['A','B','C','D'].map(p => <th key={p} className="border border-slate-200 px-3 py-1.5 bg-slate-50">{p}</th>)}
                  <th className="border border-slate-200 px-3 py-1.5 bg-orange-100 font-semibold">E合計</th>
                  {E_SLOTS.map(k => <th key={k} className="border border-slate-200 px-3 py-1.5 bg-orange-50">{POS_BADGE[k]}</th>)}
                  {['全休','午前半休','午後半休'].map(p => <th key={p} className="border border-slate-200 px-2 py-1.5 bg-slate-50 text-[10px]">{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id}>
                    <td className="border border-slate-200 px-3 py-1">{s.can_us ? '★' : '　'}{s.name}</td>
                    {['A','B','C','D'].map(p => (
                      <td key={p} className="border border-slate-200 px-3 py-1 text-center">{stats[s.id]?.[p] ?? 0}</td>
                    ))}
                    <td className="border border-slate-200 px-3 py-1 text-center bg-orange-100 font-semibold">
                      {E_SLOTS.reduce((sum, k) => sum + (stats[s.id]?.[k] ?? 0), 0)}
                    </td>
                    {E_SLOTS.map(k => (
                      <td key={k} className="border border-slate-200 px-3 py-1 text-center bg-orange-50">{stats[s.id]?.[k] ?? 0}</td>
                    ))}
                    {['全休','午前半休','午後半休'].map(p => (
                      <td key={p} className="border border-slate-200 px-2 py-1 text-center">{stats[s.id]?.[p] ?? 0}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {editCell && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => { setEditCell(null); setEditViol([]) }}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-500 mb-1">配置変更</h3>
            <p className="text-xs text-slate-400 mb-3">
              {editCell.date} / {staff.find(s => s.id === editCell.sid)?.name}
            </p>
            <select value={editPos} onChange={e => onSelectChange(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3">
              {EDIT_OPTIONS.map(p => (
                <option key={p} value={p}>{POS_BADGE[p]}：{POS_LABEL[p]}</option>
              ))}
            </select>
            {editViol.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                <p className="text-xs font-semibold text-red-600 mb-1">⚠️ 制約違反</p>
                <ul className="text-xs text-red-600 list-disc list-inside space-y-0.5">
                  {editViol.map((v, i) => <li key={i}>{v}</li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setEditCell(null); setEditViol([]) }}
                className="px-4 py-1.5 rounded-lg border text-sm hover:bg-slate-50">キャンセル</button>
              <button onClick={handleSave}
                className={`px-4 py-1.5 rounded-lg text-white text-sm ${editViol.length > 0 ? 'bg-orange-400 hover:bg-orange-500' : 'bg-blue-500 hover:bg-blue-600'}`}>
                {editViol.length > 0 ? '⚠️ 強制保存' : '変更'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}