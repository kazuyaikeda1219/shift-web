'use client'
import { useEffect, useState, useCallback } from 'react'
import { getHolidaySet } from '@/lib/holidays'
import { POS, EDIT_OPTIONS, RadiationRole } from '@/lib/radiationShiftEngine'

type Staff = { id: string; name: string; role: RadiationRole; sort_order: number }
type ShiftRow = { date: string; staff_id: string; position: string; is_draft: boolean }

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土']

// 勤務文字列 → 表示色（半休付きや (早番) でも前方一致で判定）
function posColor(pos: string): string {
  if (!pos || pos === '－') return 'bg-white border-slate-200'
  if (pos === POS.KOKYU) return 'bg-slate-100 border-slate-300 text-slate-500'
  if (pos.includes('半休')) return 'bg-pink-100 border-pink-300'
  if (pos.includes('早番')) return 'bg-amber-100 border-amber-300'
  if (pos.startsWith('8:00-17:00')) return 'bg-blue-100 border-blue-300'
  if (pos.startsWith('8:30-12:30') || pos.startsWith('8:00-12:30')) return 'bg-teal-100 border-teal-300'
  if (pos.startsWith('8:30-17:30')) return 'bg-green-100 border-green-300'
  return 'bg-white border-slate-200'
}

export default function RadiationPage() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [staff, setStaff] = useState<Staff[]>([])
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [isDraft, setIsDraft] = useState<boolean | null>(null)
  const [editCell, setEditCell] = useState<{ date: string; sid: string; pos: string } | null>(null)
  const [editPos, setEditPos] = useState('')
  const holidays = getHolidaySet()

  const fetchStaff = useCallback(async () => {
    const r = await fetch('/api/radiation/staff')
    const d = await r.json()
    setStaff(Array.isArray(d) ? d : [])
  }, [])

  const fetchShifts = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/radiation/shift?year=${year}&month=${month}`)
    const d = await r.json()
    const list: ShiftRow[] = Array.isArray(d.shifts) ? d.shifts : []
    setShifts(list)
    setIsDraft(list.length > 0 ? list.some(s => s.is_draft) : null)
    setLoading(false)
  }, [year, month])

  useEffect(() => { fetchStaff() }, [fetchStaff])
  useEffect(() => { fetchShifts() }, [fetchShifts])

  const daysInMonth = new Date(year, month, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const date = `${year}-${pad(month)}-${pad(day)}`
    const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    return {
      date, day, wd, wdLabel: WEEKDAY[wd],
      closed: wd === 0 || holidays.has(date),
      saturday: wd === 6,
    }
  })

  const shiftMap: Record<string, Record<string, string>> = {}
  for (const s of shifts) {
    if (!shiftMap[s.date]) shiftMap[s.date] = {}
    shiftMap[s.date][s.staff_id] = s.position
  }

  const handleGenerate = async () => {
    if (!confirm(`${year}年${month}月の放射線室シフトを生成しますか？`)) return
    setGenerating(true); setWarnings([])
    const r = await fetch('/api/radiation/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    const d = await r.json()
    if (d.error) alert(`生成エラー：${d.error}`)
    if (d.warnings?.length) setWarnings(d.warnings)
    await fetchShifts()
    setGenerating(false)
  }

  const handleReset = async () => {
    if (!confirm(`${year}年${month}月のシフトをリセットしますか？`)) return
    const first = `${year}-${pad(month)}-01`
    const last  = `${year}-${pad(month)}-${daysInMonth}`
    await fetch(`/api/radiation/shift?from=${first}&to=${last}`, { method: 'DELETE' })
    await fetchShifts()
  }

  const handleConfirm = async () => {
    if (!confirm(`${year}年${month}月のシフトを確定しますか？\n確定後も編集できますが、再生成すると下書きに戻ります。`)) return
    await fetch('/api/radiation/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    setIsDraft(false)
  }

  const openEdit = (date: string, sid: string, pos: string) => {
    setEditPos(pos === '－' ? '' : pos)
    setEditCell({ date, sid, pos })
  }

  const handleSave = async () => {
    if (!editCell) return
    await fetch('/api/radiation/shift', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: editCell.date, staff_id: editCell.sid, position: editPos }),
    })
    setShifts(prev => {
      const exists = prev.some(s => s.date === editCell.date && s.staff_id === editCell.sid)
      if (!editPos) return prev.filter(s => !(s.date === editCell.date && s.staff_id === editCell.sid))
      if (exists) return prev.map(s =>
        s.date === editCell.date && s.staff_id === editCell.sid ? { ...s, position: editPos } : s)
      return [...prev, { date: editCell.date, staff_id: editCell.sid, position: editPos, is_draft: isDraft ?? true }]
    })
    setEditCell(null)
  }

  // ── CSV出力 ──
  const handleCsv = () => {
    const header = ['日付', '曜日', ...staff.map(s => `${s.role}:${s.name}`)]
    const lines = [header.join(',')]
    for (const d of allDays) {
      const row = [`${month}/${d.day}`, d.wdLabel,
        ...staff.map(s => (shiftMap[d.date]?.[s.id] ?? (d.closed ? POS.KOKYU : '')))]
      lines.push(row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    }
    const bom = '﻿' // Excelで文字化けしないようBOM付き
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `放射線室シフト_${year}年${month}月.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── PDF出力（ブラウザ印刷 → PDF保存）──
  const handlePdf = () => {
    if (isDraft) document.body.classList.add('is-draft')
    window.print()
    document.body.classList.remove('is-draft')
  }

  return (
    <div className="max-w-full">
      <div className="flex items-center gap-3 mb-4 no-print">
        <span className="font-semibold text-slate-700">🩻 放射線室シフト</span>
      </div>

      {/* 操作バー */}
      <div className="flex items-center gap-3 mb-4 flex-wrap no-print">
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-slate-200 rounded px-2 py-1 text-sm">
            {[2025, 2026, 2027, 2028].map(y => <option key={y}>{y}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-slate-200 rounded px-2 py-1 text-sm">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
        <button onClick={handleGenerate} disabled={generating}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
          {generating ? '生成中...' : `▶ ${month}月のシフトを生成`}
        </button>
        <a href="/radiation/register" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium">
          📋 休み申請・設定
        </a>
        <button onClick={handleReset}
          className="bg-red-400 hover:bg-red-500 text-white px-4 py-1.5 rounded text-sm font-medium">
          🗑 リセット
        </button>
        {isDraft === true && (
          <button onClick={handleConfirm}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium">
            ✅ 確定する
          </button>
        )}
        {isDraft === true && (
          <span className="bg-yellow-100 text-yellow-700 border border-yellow-300 px-3 py-1 rounded-full text-xs font-medium">📝 下書き</span>
        )}
        {isDraft === false && (
          <span className="bg-emerald-100 text-emerald-700 border border-emerald-300 px-3 py-1 rounded-full text-xs font-medium">✅ 確定済み</span>
        )}
        <button onClick={handleCsv} disabled={shifts.length === 0}
          className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
          ⬇ CSV出力
        </button>
        <button onClick={handlePdf} disabled={shifts.length === 0}
          className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
          🖨 PDF出力（印刷）
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 no-print">
          <strong>⚠️ 生成時の警告</strong>
          <ul className="mt-1 list-disc list-inside">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      <h2 className="hidden print:block text-base font-semibold mb-2">{year}年{month}月 放射線室シフト</h2>

      {loading ? (
        <div className="text-slate-400 text-sm py-8 text-center">読み込み中...</div>
      ) : shifts.length === 0 ? (
        <div className="text-slate-400 text-sm py-8 text-center">シフトがまだ生成されていません。「シフトを生成」を押してください。</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 border border-slate-200 px-3 py-2 text-left min-w-[96px]">スタッフ</th>
                {allDays.map(d => (
                  <th key={d.date} className={`border border-slate-200 px-2 py-1 text-center min-w-[78px] font-medium
                    ${d.closed ? 'bg-slate-100 text-slate-400 italic' : d.saturday ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>
                    {d.day}<br /><span className="text-[10px]">{d.wdLabel}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1.5 font-medium text-xs">
                    <span className="text-slate-400 mr-1">{s.role}</span>{s.name}
                  </td>
                  {allDays.map(d => {
                    const pos = shiftMap[d.date]?.[s.id] ?? (d.closed ? POS.KOKYU : '－')
                    return (
                      <td key={d.date}
                        className={`border border-slate-200 px-1 py-1 text-center cursor-pointer hover:opacity-75 transition-opacity ${posColor(pos)}`}
                        onClick={() => openEdit(d.date, s.id, pos)}>
                        <span className="block text-[10px] leading-tight font-semibold">{pos}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 凡例 */}
      {shifts.length > 0 && (
        <div className="flex gap-2 flex-wrap mt-3 text-[11px] items-center no-print">
          <span className="px-2 py-0.5 rounded border bg-blue-100 border-blue-300">8:00-17:00（A平日）</span>
          <span className="px-2 py-0.5 rounded border bg-green-100 border-green-300">8:30-17:30（B/C平日）</span>
          <span className="px-2 py-0.5 rounded border bg-amber-100 border-amber-300">(早番)</span>
          <span className="px-2 py-0.5 rounded border bg-teal-100 border-teal-300">土曜（午前のみ）</span>
          <span className="px-2 py-0.5 rounded border bg-pink-100 border-pink-300">半休</span>
          <span className="px-2 py-0.5 rounded border bg-slate-100 border-slate-300">公休</span>
          <span className="text-slate-400 ml-1">セルをクリックで編集</span>
        </div>
      )}

      {/* 編集モーダル */}
      {editCell && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setEditCell(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-500 mb-1">勤務変更</h3>
            <p className="text-xs text-slate-400 mb-3">
              {editCell.date} / {staff.find(s => s.id === editCell.sid)?.name}
            </p>
            <select value={editPos} onChange={e => setEditPos(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3">
              <option value="">（未設定）</option>
              {EDIT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditCell(null)}
                className="px-4 py-1.5 rounded-lg border text-sm hover:bg-slate-50">キャンセル</button>
              <button onClick={handleSave}
                className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm">変更</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
