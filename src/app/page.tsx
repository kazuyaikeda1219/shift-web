'use client'
import { useEffect, useState, useCallback } from 'react'
import { isClosed } from '@/lib/shiftEngine'
import { getHolidaySet } from '@/lib/holidays'

type Staff = { id: string; name: string; can_us: boolean; sort_order: number }
type ShiftRow = { date: string; staff_id: string; position: string; is_draft: boolean }
type RequestRow = { date: string; staff_id: string; kubun: string }
type SatPmRow = { date: string; staff_id: string }

const E_SLOTS = ['E1','E2','E3','E4']
const e_SLOTS = ['e1','e2','e3','e4']

const POS_BADGE: Record<string, string> = {
  'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D',
  'E1': 'E①', 'E2': 'E②', 'E3': 'E③', 'E4': 'E④',
  'e1': 'e①', 'e2': 'e②', 'e3': 'e③', 'e4': 'e④',
  '全休': '全休', '午前半休': '午前半休', '午後半休': '午後半休', '－': '－',
}
const POS_LABEL: Record<string, string> = {
  'A': '血液検査', 'B': 'CBC', 'C': '心電図', 'D': '昼１',
  'E1': '専任枠', 'E2': 'エコー枠', 'E3': 'エコー枠', 'E4': 'エコー枠',
  'e1': 'エコー枠', 'e2': 'エコー枠', 'e3': 'エコー枠', 'e4': 'エコー枠',
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
  'e1': 'bg-teal-100 border-teal-300',
  'e2': 'bg-teal-50 border-teal-200',
  'e3': 'bg-teal-50 border-teal-200',
  'e4': 'bg-teal-50 border-teal-200',
  '全休':    'bg-slate-100 border-slate-300',
  '午前半休': 'bg-pink-100 border-pink-300',
  '午後半休': 'bg-pink-100 border-pink-300',
  '－': 'bg-slate-50 border-slate-200',
}
const EDIT_OPTIONS = ['A','B','C','D','E1','E2','E3','E4','e1','e2','e3','e4','全休','午前半休','午後半休','－']
const WEEKDAY = ['日','月','火','水','木','金','土']
const WEEKDAY_FULL = ['日曜','月曜','火曜','水曜','木曜','金曜','土曜']

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
  const dayReq   = requests.filter(r => r.date === date)
  const kubunOf  = (sid: string) => dayReq.find(r => r.staff_id === sid)?.kubun ?? null

  const allEPos = ['E1','E2','E3','E4','e1','e2','e3','e4']
  if (allEPos.includes(newPos)) {
    const eStaff = Object.entries(proposed).filter(([, p]) => allEPos.includes(p)).map(([sid]) => sid)
    if (!eStaff.some(sid => usStaff.has(sid)))
      violations.push('Eグループに★（US担当者）が1名も含まれていません')
  }

  const e1Count = Object.entries(proposed).filter(([, p]) => p === 'E1').length
  if (e1Count > 1) violations.push(`E① は1日1名までです（現在 ${e1Count} 名）`)

  const usInA = Object.entries(proposed).some(([sid, p]) => p === 'A' && usStaff.has(sid))
  const usInB = Object.entries(proposed).some(([sid, p]) => p === 'B' && usStaff.has(sid))
  if (usInA && usInB) violations.push('★（US担当者）がAとBの両方に配置されています')

  const kubun = kubunOf(targetSid)
  const name  = staffMap[targetSid]?.name ?? targetSid
  if ((kubun === '午前半休' || kubun === '午後半休') && allEPos.includes(newPos))
    violations.push(`${name} は${kubun}のためEグループに配置できません`)
  if (kubun === '午後半休' && newPos === 'D')
    violations.push(`${name} は午後半休のため D（昼１）に配置できません`)

  return violations
}

export default function ShiftPage() {
  const now = new Date()
  const [year,          setYear]          = useState(now.getFullYear())
  const [month,         setMonth]         = useState(now.getMonth() + 1)
  const [staff,         setStaff]         = useState<Staff[]>([])
  const [shifts,        setShifts]        = useState<ShiftRow[]>([])
  const [satPm,         setSatPm]         = useState<SatPmRow[]>([])
  const [dayReqs,       setDayReqs]       = useState<RequestRow[]>([])
  const [loading,       setLoading]       = useState(false)
  const [generating,    setGenerating]    = useState(false)
  const [warnings,      setWarnings]      = useState<string[]>([])
  const [editCell,      setEditCell]      = useState<{date:string;sid:string;pos:string}|null>(null)
  const [editViol,      setEditViol]      = useState<string[]>([])
  const [editPos,       setEditPos]       = useState('')
  const [editSatPm,     setEditSatPm]     = useState(false)
  const [mobileView,    setMobileView]    = useState<'staff'|'day'>('staff')
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [isDraft,       setIsDraft]       = useState<boolean | null>(null)
  const [draftPatterns,   setDraftPatterns]   = useState<string[]>([])
  const [selectedPattern, setSelectedPattern] = useState<string>('')
  const [viewingDraft,    setViewingDraft]    = useState(false)
  const [showDraftModal,  setShowDraftModal]  = useState(false)
  const [newPatternName,  setNewPatternName]  = useState('')
  const holidays = getHolidaySet()

  const fetchStaff = useCallback(async () => {
    const r    = await fetch('/api/staff')
    const data = await r.json()
    const list = Array.isArray(data) ? data : []
    setStaff(list)
    if (list.length > 0) setSelectedStaff(list[0].id)
  }, [])

  const fetchShifts = useCallback(async () => {
    setLoading(true)
    const [sr, rr] = await Promise.all([
      fetch(`/api/shift?year=${year}&month=${month}`),
      fetch(`/api/requests?year=${year}&month=${month}`),
    ])
    const sdata = await sr.json()
    const rdata = await rr.json()

    const shiftList = Array.isArray(sdata.shifts) ? sdata.shifts : []
    setShifts(shiftList)
    setSatPm(Array.isArray(sdata.saturday_pm) ? sdata.saturday_pm : [])
    if (shiftList.length > 0) {
      setIsDraft(shiftList.some((s: ShiftRow) => s.is_draft))
    } else {
      setIsDraft(null)
    }

    if (Array.isArray(rdata)) {
      setDayReqs(rdata.map((r: {year:number;month:number;day:number;staff_id:string;kubun:string}) => ({
        date: `${r.year}-${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`,
        staff_id: r.staff_id, kubun: r.kubun,
      })))
    }
    setLoading(false)
  }, [year, month])

  const fetchDraftPatterns = useCallback(async () => {
    const r    = await fetch(`/api/draft?year=${year}&month=${month}`)
    const data = await r.json()
    setDraftPatterns(Array.isArray(data) ? data : [])
  }, [year, month])

  useEffect(() => { fetchStaff() },         [fetchStaff])
  useEffect(() => { fetchShifts() },         [fetchShifts])
  useEffect(() => { fetchDraftPatterns() }, [fetchDraftPatterns])

  const daysInMonth = new Date(year, month, 0).getDate()
  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, i + 1))
    return {
      date:     d.toISOString().slice(0, 10),
      wd:       WEEKDAY[d.getUTCDay()],
      wdFull:   WEEKDAY_FULL[d.getUTCDay()],
      day:      i + 1,
      closed:   isClosed(d, holidays),
      heavy:    ['月','水'].includes(WEEKDAY[d.getUTCDay()]),
      saturday: d.getUTCDay() === 6,
    }
  })

  const shiftMap: Record<string, Record<string, string>> = {}
  for (const s of shifts) {
    if (!shiftMap[s.date]) shiftMap[s.date] = {}
    shiftMap[s.date][s.staff_id] = s.position
  }

  const satPmSet = new Set(satPm.map(r => `${r.date}-${r.staff_id}`))
  const isSatPm  = (date: string, sid: string) => satPmSet.has(`${date}-${sid}`)

  const handleGenerate = async () => {
    if (!confirm(`${year}年${month}月のシフトを生成しますか？`)) return
    setGenerating(true); setWarnings([])
    const r = await fetch('/api/generate', {
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
    if (!confirm(`${year}年${month}月のシフトをリセットしますか？`)) return
    const pad   = (n: number) => String(n).padStart(2, '0')
    const first = `${year}-${pad(month)}-01`
    const last  = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`
    await fetch(`/api/shift?from=${first}&to=${last}`, { method: 'DELETE' })
    await fetchShifts()
  }

  const handleConfirm = async () => {
    if (!confirm(`${year}年${month}月のシフトを確定しますか？\n確定後も編集は可能ですが、再生成すると下書きに戻ります。`)) return
    await fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    setIsDraft(false)
  }

  const handleGenerateAsDraft = async () => {
    if (!newPatternName.trim()) return
    setGenerating(true); setWarnings([]); setShowDraftModal(false)
    const r = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, pattern_name: newPatternName.trim() }),
    })
    const data = await r.json()
    if (data.warnings?.length) setWarnings(data.warnings)
    await fetchDraftPatterns()
    setNewPatternName('')
    setGenerating(false)
  }

  const handleLoadDraft = async (pattern_name: string) => {
    setLoading(true)
    const r    = await fetch(`/api/draft/load?year=${year}&month=${month}&pattern_name=${encodeURIComponent(pattern_name)}`)
    const data = await r.json()
    setShifts(Array.isArray(data) ? data : [])
    setSelectedPattern(pattern_name)
    setViewingDraft(true)
    setLoading(false)
  }

  const handleBackToMain = async () => {
    await fetchShifts()
    setViewingDraft(false)
    setSelectedPattern('')
  }

  const handleConfirmDraft = async (pattern_name: string) => {
    if (!confirm(`「${pattern_name}」を本番シフトとして確定しますか？\n現在の本番シフトは上書きされます。`)) return
    await fetch('/api/draft/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, pattern_name }),
    })
    await fetchShifts()
    setViewingDraft(false)
    setSelectedPattern('')
    setIsDraft(false)
    await fetchDraftPatterns()
  }

  const handleDeleteDraft = async (pattern_name: string) => {
    if (!confirm(`「${pattern_name}」を削除しますか？`)) return
    await fetch(`/api/draft?year=${year}&month=${month}&pattern_name=${encodeURIComponent(pattern_name)}`, { method: 'DELETE' })
    if (selectedPattern === pattern_name) await handleBackToMain()
    await fetchDraftPatterns()
  }

  const openEdit = (date: string, sid: string, pos: string, closed: boolean) => {
    if (closed) return
    setEditPos(pos)
    setEditViol([])
    setEditSatPm(isSatPm(date, sid))
    setEditCell({ date, sid, pos })
  }

  const onSelectChange = (newPos: string) => {
    setEditPos(newPos)
    if (!editCell) return
    setEditViol(checkViolations(editCell.date, editCell.sid, newPos, shiftMap[editCell.date] ?? {}, staff, dayReqs))
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

    if (editSatPm) {
      await fetch('/api/saturday_pm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: editCell.date, staff_id: editCell.sid }),
      })
      setSatPm(prev => [...prev.filter(r => !(r.date === editCell.date && r.staff_id === editCell.sid)),
        { date: editCell.date, staff_id: editCell.sid }])
    } else {
      await fetch(`/api/saturday_pm?date=${editCell.date}&staff_id=${editCell.sid}`, { method: 'DELETE' })
      setSatPm(prev => prev.filter(r => !(r.date === editCell.date && r.staff_id === editCell.sid)))
    }

    setEditCell(null); setEditViol([])
  }

  const stats: Record<string, Record<string, number>> = {}
  for (const s of staff) stats[s.id] = {}
  for (const s of shifts) {
    if (!stats[s.staff_id]) stats[s.staff_id] = {}
    stats[s.staff_id][s.position] = (stats[s.staff_id][s.position] ?? 0) + 1
  }

  const MobileStaffView = () => {
    const s = staff.find(s => s.id === selectedStaff)
    return (
      <div>
        <div className="flex gap-2 flex-wrap mb-4">
          {staff.map(s => (
            <button key={s.id} onClick={() => setSelectedStaff(s.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors
                ${selectedStaff === s.id ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200'}`}>
              {s.can_us ? '★' : ''}{s.name}
            </button>
          ))}
        </div>
        {s && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-orange-50 px-4 py-3 border-b border-slate-200">
              <span className="font-semibold text-slate-700">{s.can_us ? '★' : ''}{s.name}</span>
              <span className="text-xs text-slate-400 ml-2">{year}年{month}月</span>
            </div>
            <div className="divide-y divide-slate-100">
              {allDays.map(({ date, day, wd, closed, heavy, saturday }) => {
                const pos  = shiftMap[date]?.[s.id] ?? '－'
                const isPm = isSatPm(date, s.id)
                if (closed) return (
                  <div key={date} className="flex items-center px-4 py-2.5 bg-slate-50 opacity-50">
                    <span className="w-16 text-sm text-slate-400">{day}日（{wd}）</span>
                    <span className="text-xs text-slate-400 ml-3">休診</span>
                  </div>
                )
                return (
                  <div key={date} className={`flex items-center px-4 py-2.5 ${heavy ? 'bg-orange-50' : saturday ? 'bg-blue-50' : ''}`}>
                    <span className={`w-16 text-sm font-medium ${heavy ? 'text-orange-700' : saturday ? 'text-blue-700' : 'text-slate-600'}`}>
                      {day}日（{wd}）
                    </span>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ml-2 ${POS_COLOR[pos] ?? ''}`}>
                      {POS_BADGE[pos] ?? pos}
                      {isPm && <span className="ml-1 text-blue-600">🌙</span>}
                    </span>
                    <span className="text-xs text-slate-400 ml-2">{POS_LABEL[pos] ?? ''}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  const MobileDayView = () => {
    const workDays = allDays.filter(d => !d.closed)
    const todayStr = new Date().toISOString().slice(0, 10)
    return (
      <div className="space-y-3">
        {workDays.map(({ date, day, wd, heavy, saturday }) => {
          const dayAssign = shiftMap[date] ?? {}
          return (
            <div key={date} className={`bg-white rounded-xl border overflow-hidden
              ${heavy ? 'border-orange-300' : saturday ? 'border-blue-200' : 'border-slate-200'}`}>
              <div className={`px-4 py-2 flex items-center gap-2 ${heavy ? 'bg-orange-50' : saturday ? 'bg-blue-50' : 'bg-slate-50'}`}>
                <span className={`font-semibold text-sm ${heavy ? 'text-orange-700' : saturday ? 'text-blue-700' : 'text-slate-700'}`}>
                  {day}日（{wd}）
                </span>
                {heavy && <span className="text-[10px] bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded">入院多</span>}
                {date === todayStr && <span className="text-[10px] bg-green-200 text-green-700 px-1.5 py-0.5 rounded">今日</span>}
              </div>
              <div className="px-4 py-2 space-y-1.5">
                {staff.map(s => {
                  const pos  = dayAssign[s.id] ?? '－'
                  const isPm = isSatPm(date, s.id)
                  if (pos === '全休') return null
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="w-20 text-xs font-medium text-slate-600">
                        {s.can_us ? '★' : '　'}{s.name}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${POS_COLOR[pos] ?? ''}`}>
                        {POS_BADGE[pos] ?? pos}
                        {isPm && <span className="ml-1 text-blue-600">🌙</span>}
                      </span>
                      <span className="text-[11px] text-slate-400">{POS_LABEL[pos] ?? ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="max-w-full">
      {/* PC用ヘッダ */}
      <div className="hidden md:flex items-center gap-4 mb-4 flex-wrap no-print">
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
          📋 登録管理
        </a>
        <button onClick={handleReset}
          className="bg-red-400 hover:bg-red-500 text-white px-4 py-1.5 rounded text-sm font-medium">
          🗑 シフトをリセット
        </button>
        {isDraft === true && (
          <button onClick={handleConfirm}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium">
            ✅ 確定する
          </button>
        )}
        {isDraft === true && (
          <span className="bg-yellow-100 text-yellow-700 border border-yellow-300 px-3 py-1 rounded-full text-xs font-medium">
            📝 下書き
          </span>
        )}
        {isDraft === false && (
          <span className="bg-emerald-100 text-emerald-700 border border-emerald-300 px-3 py-1 rounded-full text-xs font-medium">
            ✅ 確定済み
          </span>
        )}
        <button onClick={() => setShowDraftModal(true)} disabled={generating}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-1.5 rounded text-sm font-medium">
          📋 下書き保存
        </button>
        <button onClick={() => {
            if (isDraft) document.body.classList.add('is-draft')
            else document.body.classList.remove('is-draft')
            window.print()
            document.body.classList.remove('is-draft')
          }}
          className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-1.5 rounded text-sm font-medium">
          🖨 印刷／PDF保存
        </button>

        {/* 下書きパターン一覧 */}
        {draftPatterns.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap w-full">
            <span className="text-xs text-slate-400">下書き：</span>
            {draftPatterns.map(p => (
              <div key={p} className="flex items-center gap-1">
                <button onClick={() => handleLoadDraft(p)}
                  className={`px-3 py-1 rounded text-xs font-medium border transition-colors
                    ${selectedPattern === p
                      ? 'bg-violet-500 text-white border-violet-500'
                      : 'bg-white text-violet-600 border-violet-300 hover:bg-violet-50'}`}>
                  {p}
                </button>
                <button onClick={() => handleConfirmDraft(p)}
                  className="px-2 py-1 rounded text-xs bg-emerald-500 hover:bg-emerald-600 text-white">
                  確定
                </button>
                <button onClick={() => handleDeleteDraft(p)}
                  className="px-2 py-1 rounded text-xs bg-red-400 hover:bg-red-500 text-white">
                  削除
                </button>
              </div>
            ))}
            {viewingDraft && (
              <button onClick={handleBackToMain}
                className="px-3 py-1 rounded text-xs bg-slate-500 hover:bg-slate-600 text-white">
                ← 本番に戻る
              </button>
            )}
          </div>
        )}
      </div>

      {/* スマホ用ヘッダ */}
      <div className="md:hidden mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="border border-slate-200 rounded px-2 py-1.5 text-sm">
              {[2025,2026,2027,2028].map(y => <option key={y}>{y}</option>)}
            </select>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="border border-slate-200 rounded px-2 py-1.5 text-sm">
              {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}月</option>)}
            </select>
          </div>
          <span className="text-xs text-slate-400">確認のみ</span>
        </div>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button onClick={() => setMobileView('staff')}
            className={`flex-1 py-2 text-sm font-medium transition-colors
              ${mobileView === 'staff' ? 'bg-orange-500 text-white' : 'bg-white text-slate-500'}`}>
            👤 スタッフ別
          </button>
          <button onClick={() => setMobileView('day')}
            className={`flex-1 py-2 text-sm font-medium transition-colors
              ${mobileView === 'day' ? 'bg-orange-500 text-white' : 'bg-white text-slate-500'}`}>
            📅 日付別
          </button>
        </div>
      </div>

      {/* 下書き表示中バナー */}
      {viewingDraft && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-2 mb-3 flex items-center justify-between no-print">
          <span className="text-sm text-violet-700 font-medium">
            📋 下書き表示中：「{selectedPattern}」
          </span>
          <div className="flex gap-2">
            <button onClick={() => handleConfirmDraft(selectedPattern)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded text-xs font-medium">
              ✅ これを確定する
            </button>
            <button onClick={handleBackToMain}
              className="bg-slate-500 hover:bg-slate-600 text-white px-3 py-1 rounded text-xs font-medium">
              ← 本番に戻る
            </button>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          <strong>⚠️ 生成時の警告</strong>
          <ul className="mt-1 list-disc list-inside">{warnings.map((w,i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm py-8 text-center">読み込み中...</div>
      ) : shifts.length === 0 ? (
        <div className="text-slate-400 text-sm py-8 text-center">シフトがまだ生成されていません。</div>
      ) : (
        <>
          {/* スマホビュー */}
          <div className="md:hidden mobile-view">
            {mobileView === 'staff' ? <MobileStaffView /> : <MobileDayView />}
          </div>

          {/* PCビュー */}
          <div className="hidden md:block pc-view">
            {/* 凡例 */}
            <div className="flex gap-2 flex-wrap mb-3 text-xs items-center no-print">
              {(['A','B','C','D','E1','E2','e1','全休','午前半休'] as const).map(pos => (
                <span key={pos} className={`px-2 py-0.5 rounded border ${POS_COLOR[pos]}`}>
                  {POS_BADGE[pos]}：{POS_LABEL[pos]}
                </span>
              ))}
              <span className="text-blue-500 font-medium">🌙=土曜午後稼働</span>
              <span className="text-slate-400 ml-1">★=US担当可</span>
              <span className="text-orange-600 font-medium">月・水=入院多</span>
              <span className="text-slate-400 text-[11px]">セルをクリックで編集</span>
            </div>

            {/* シフト表 */}
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
                        const isPm     = isSatPm(date, s.id)
                        const colorCls = closed ? 'bg-slate-100 opacity-60 cursor-default' : (POS_COLOR[pos] ?? 'bg-white border-slate-200')
                        const ringCls  = !closed && heavy ? 'ring-1 ring-orange-300 ring-inset' : !closed && saturday ? 'ring-1 ring-blue-200 ring-inset' : ''
                        return (
                          <td key={date}
                            className={`border border-slate-200 px-1 py-1 text-center cursor-pointer hover:opacity-75 transition-opacity ${colorCls} ${ringCls}`}
                            onClick={() => openEdit(date, s.id, pos, closed)}>
                            <span className="block font-bold text-[11px]">
                              {POS_BADGE[pos] ?? pos}
                              {isPm && <span className="text-blue-500 ml-0.5">🌙</span>}
                            </span>
                            <span className="block text-[9px] text-slate-500 leading-tight">{POS_LABEL[pos] ?? ''}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 集計 */}
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
                      {e_SLOTS.map(k => <th key={k} className="border border-slate-200 px-3 py-1.5 bg-teal-50">{POS_BADGE[k]}</th>)}
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
                          {[...E_SLOTS, ...e_SLOTS].reduce((sum, k) => sum + (stats[s.id]?.[k] ?? 0), 0)}
                        </td>
                        {E_SLOTS.map(k => (
                          <td key={k} className="border border-slate-200 px-3 py-1 text-center bg-orange-50">{stats[s.id]?.[k] ?? 0}</td>
                        ))}
                        {e_SLOTS.map(k => (
                          <td key={k} className="border border-slate-200 px-3 py-1 text-center bg-teal-50">{stats[s.id]?.[k] ?? 0}</td>
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
          </div>
        </>
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
            {allDays.find(d => d.date === editCell.date)?.saturday && (
              <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editSatPm}
                  onChange={e => setEditSatPm(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>🌙 午後も稼働（土曜午後勤務）</span>
              </label>
            )}
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

      {/* 下書き保存モーダル */}
      {showDraftModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShowDraftModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-600 mb-1">下書きとして保存</h3>
            <p className="text-xs text-slate-400 mb-3">
              シフトを生成してパターン名をつけて保存します。<br />
              複数パターンを保存して比較できます。
            </p>
            <input
              type="text"
              value={newPatternName}
              onChange={e => setNewPatternName(e.target.value)}
              placeholder="例：6月案A"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3"
              onKeyDown={e => e.key === 'Enter' && handleGenerateAsDraft()}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDraftModal(false)}
                className="px-4 py-1.5 rounded-lg border text-sm hover:bg-slate-50">
                キャンセル
              </button>
              <button onClick={handleGenerateAsDraft} disabled={!newPatternName.trim()}
                className="px-4 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-sm disabled:opacity-50">
                生成して保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}