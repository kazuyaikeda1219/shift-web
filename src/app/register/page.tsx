'use client'
import { useEffect, useState, useCallback } from 'react'

type Staff = { id: string; name: string; can_us: boolean }
type Request = { id: number; year: number; month: number; day: number; staff_id: string; kubun: string; staff: { name: string } }
type SaturdayEntry = { id: number; year: number; month: number; day: number; a_staff_id: string; e1_staff_id: string; a_staff: { name: string }; e1_staff: { name: string } }

const KUBUN_COLOR: Record<string, string> = {
  '全休':    'bg-slate-100 text-slate-600',
  '午前半休': 'bg-pink-100 text-pink-700',
  '午後半休': 'bg-pink-100 text-pink-700',
}

function getSaturdays(year: number, month: number): number[] {
  const saturdays: number[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(year, month - 1, day))
    const dow = d.getUTCDay()
    const week = Math.floor((day - 1) / 7) + 1
    if (dow === 6 && week % 2 === 0) saturdays.push(day)
  }
  return saturdays
}

export default function RegisterPage() {
  const now = new Date()
  const [year,    setYear]    = useState(now.getFullYear())
  const [month,   setMonth]   = useState(now.getMonth() + 1)
  const [tab,     setTab]     = useState<'request'|'saturday'>('request')

  // 休み申請
  const [day,     setDay]     = useState(1)
  const [staffId, setStaffId] = useState('')
  const [kubun,   setKubun]   = useState('全休')
  const [staff,   setStaff]   = useState<Staff[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [saving,  setSaving]  = useState(false)
  const [message, setMessage] = useState('')

  // 土曜午後勤務
  const [satDay,      setSatDay]      = useState(0)
  const [satAStaff,   setSatAStaff]   = useState('')
  const [satE1Staff,  setSatE1Staff]  = useState('')
  const [satEntries,  setSatEntries]  = useState<SaturdayEntry[]>([])
  const [satSaving,   setSatSaving]   = useState(false)
  const [satMessage,  setSatMessage]  = useState('')

  const daysInMonth = new Date(year, month, 0).getDate()
  const saturdays   = getSaturdays(year, month)

  const fetchStaff = useCallback(async () => {
    const r    = await fetch('/api/staff')
    const data = await r.json()
    const list = Array.isArray(data) ? data : []
    setStaff(list)
    if (list.length > 0 && !staffId) setStaffId(list[0].id)
    const usList = list.filter((s: Staff) => s.can_us)
    if (usList.length > 0) {
      setSatAStaff(usList[0].id)
      setSatE1Staff(usList[0].id)
    }
  }, [staffId])

  const fetchRequests = useCallback(async () => {
    const r    = await fetch(`/api/requests?year=${year}&month=${month}`)
    const data = await r.json()
    setRequests(Array.isArray(data) ? data : [])
  }, [year, month])

  const fetchSatEntries = useCallback(async () => {
    const r    = await fetch(`/api/saturday?year=${year}&month=${month}`)
    const data = await r.json()
    setSatEntries(Array.isArray(data) ? data : [])
  }, [year, month])

  useEffect(() => { fetchStaff() },      [fetchStaff])
  useEffect(() => { fetchRequests() },   [fetchRequests])
  useEffect(() => { fetchSatEntries() }, [fetchSatEntries])
  useEffect(() => {
    if (saturdays.length > 0 && satDay === 0) setSatDay(saturdays[0])
  }, [saturdays, satDay])

  const handleAdd = async () => {
    setSaving(true); setMessage('')
    const r = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, day, staff_id: staffId, kubun }),
    })
    setMessage(r.ok ? '✅ 登録しました' : '❌ 登録に失敗しました')
    if (r.ok) await fetchRequests()
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('この申請を削除しますか？')) return
    await fetch(`/api/requests?id=${id}`, { method: 'DELETE' })
    await fetchRequests()
  }

  const handleSatAdd = async () => {
    setSatSaving(true); setSatMessage('')
    const r = await fetch('/api/saturday', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, day: satDay, a_staff_id: satAStaff, e1_staff_id: satE1Staff }),
    })
    setSatMessage(r.ok ? '✅ 登録しました' : '❌ 登録に失敗しました')
    if (r.ok) await fetchSatEntries()
    setSatSaving(false)
  }

  const handleSatDelete = async (id: number) => {
    if (!confirm('この登録を削除しますか？')) return
    await fetch(`/api/saturday?id=${id}`, { method: 'DELETE' })
    await fetchSatEntries()
  }

  const usStaff = staff.filter(s => s.can_us)

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-1">📋 登録管理</h1>
      <p className="text-xs text-slate-400 mb-4">登録した内容はすぐにシフト生成に反映されます</p>

      {/* 対象月 */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-4">
        <h2 className="text-sm font-semibold mb-3">対象月</h2>
        <div className="flex gap-3 items-center">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-slate-200 rounded px-3 py-1.5 text-sm">
            {[2025,2026,2027,2028].map(y => <option key={y}>{y}年</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-slate-200 rounded px-3 py-1.5 text-sm">
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
      </div>

      {/* タブ */}
      <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-4">
        <button onClick={() => setTab('request')}
          className={`flex-1 py-2 text-sm font-medium transition-colors
            ${tab === 'request' ? 'bg-blue-500 text-white' : 'bg-white text-slate-500'}`}>
          🏖 休み申請
        </button>
        <button onClick={() => setTab('saturday')}
          className={`flex-1 py-2 text-sm font-medium transition-colors
            ${tab === 'saturday' ? 'bg-orange-500 text-white' : 'bg-white text-slate-500'}`}>
          🏥 土曜午後勤務
        </button>
      </div>

      {/* ── 休み申請タブ ── */}
      {tab === 'request' && (
        <>
          <div className="bg-white rounded-lg border border-slate-200 p-5 mb-4">
            <h2 className="text-sm font-semibold mb-3">{year}年{month}月の休み申請を追加</h2>
            {message && (
              <div className={`text-sm rounded px-3 py-2 mb-3 ${message.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message}
              </div>
            )}
            <div className="flex gap-3 flex-wrap items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">日</label>
                <select value={day} onChange={e => setDay(Number(e.target.value))}
                  className="border border-slate-200 rounded px-3 py-1.5 text-sm">
                  {Array.from({length:daysInMonth},(_,i)=>i+1).map(d => <option key={d} value={d}>{d}日</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">スタッフ</label>
                <select value={staffId} onChange={e => setStaffId(e.target.value)}
                  className="border border-slate-200 rounded px-3 py-1.5 text-sm">
                  {staff.map(s => <option key={s.id} value={s.id}>{s.can_us ? '★' : '　'}{s.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">区分</label>
                <select value={kubun} onChange={e => setKubun(e.target.value)}
                  className="border border-slate-200 rounded px-3 py-1.5 text-sm">
                  <option value="全休">全休</option>
                  <option value="午前半休">午前半休</option>
                  <option value="午後半休">午後半休</option>
                </select>
              </div>
              <button onClick={handleAdd} disabled={saving}
                className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-1.5 rounded text-sm font-medium disabled:opacity-50">
                {saving ? '登録中...' : '追加'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">※ 同じスタッフ・日付で登録すると上書きされます</p>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold mb-3">{year}年{month}月の申請一覧</h2>
            {requests.length === 0 ? (
              <p className="text-sm text-slate-400">申請はありません</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-3 py-2 text-left">日付</th>
                    <th className="border border-slate-200 px-3 py-2 text-left">スタッフ</th>
                    <th className="border border-slate-200 px-3 py-2 text-left">区分</th>
                    <th className="border border-slate-200 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...requests].sort((a,b) => a.day - b.day || a.staff_id.localeCompare(b.staff_id)).map(r => (
                    <tr key={r.id}>
                      <td className="border border-slate-200 px-3 py-1.5">{r.year}/{r.month}/{r.day}</td>
                      <td className="border border-slate-200 px-3 py-1.5">{r.staff?.name ?? r.staff_id}</td>
                      <td className="border border-slate-200 px-3 py-1.5">
                        <span className={`px-2 py-0.5 rounded text-xs ${KUBUN_COLOR[r.kubun] ?? ''}`}>{r.kubun}</span>
                      </td>
                      <td className="border border-slate-200 px-3 py-1.5 text-center">
                        <button onClick={() => handleDelete(r.id)}
                          className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-0.5 rounded">
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── 土曜午後勤務タブ ── */}
      {tab === 'saturday' && (
        <>
          <div className="bg-white rounded-lg border border-slate-200 p-5 mb-4">
            <h2 className="text-sm font-semibold mb-1">{year}年{month}月の土曜午後勤務を登録</h2>
            <p className="text-xs text-slate-400 mb-3">偶数週土曜日のA担当・E①担当（午後まで稼働）を事前登録します</p>
            {satMessage && (
              <div className={`text-sm rounded px-3 py-2 mb-3 ${satMessage.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {satMessage}
              </div>
            )}
            {saturdays.length === 0 ? (
              <p className="text-sm text-slate-400">この月に偶数週土曜日はありません</p>
            ) : (
              <>
                <div className="flex gap-3 flex-wrap items-end mb-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-500">土曜日</label>
                    <select value={satDay} onChange={e => setSatDay(Number(e.target.value))}
                      className="border border-slate-200 rounded px-3 py-1.5 text-sm">
                      {saturdays.map(d => <option key={d} value={d}>{d}日（土）</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-500">A担当（午後まで）</label>
                    <select value={satAStaff} onChange={e => setSatAStaff(e.target.value)}
                      className="border border-slate-200 rounded px-3 py-1.5 text-sm">
                      {usStaff.map(s => <option key={s.id} value={s.id}>★{s.name}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-500">E①担当（午後まで）</label>
                    <select value={satE1Staff} onChange={e => setSatE1Staff(e.target.value)}
                      className="border border-slate-200 rounded px-3 py-1.5 text-sm">
                      {usStaff.map(s => <option key={s.id} value={s.id}>★{s.name}</option>)}
                    </select>
                  </div>
                  <button onClick={handleSatAdd} disabled={satSaving}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-1.5 rounded text-sm font-medium disabled:opacity-50">
                    {satSaving ? '登録中...' : '登録'}
                  </button>
                </div>
                <p className="text-xs text-slate-400">※ 同じ日付で登録すると上書きされます</p>
              </>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold mb-3">{year}年{month}月の土曜午後勤務一覧</h2>
            {satEntries.length === 0 ? (
              <p className="text-sm text-slate-400">登録はありません</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-3 py-2 text-left">日付</th>
                    <th className="border border-slate-200 px-3 py-2 text-left">A担当</th>
                    <th className="border border-slate-200 px-3 py-2 text-left">E①担当</th>
                    <th className="border border-slate-200 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {satEntries.map(e => (
                    <tr key={e.id}>
                      <td className="border border-slate-200 px-3 py-1.5">{e.year}/{e.month}/{e.day}（土）</td>
                      <td className="border border-slate-200 px-3 py-1.5">★{e.a_staff?.name ?? e.a_staff_id}</td>
                      <td className="border border-slate-200 px-3 py-1.5">★{e.e1_staff?.name ?? e.e1_staff_id}</td>
                      <td className="border border-slate-200 px-3 py-1.5 text-center">
                        <button onClick={() => handleSatDelete(e.id)}
                          className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-0.5 rounded">
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <div className="mt-4 text-right">
        <a href="/" className="bg-green-500 hover:bg-green-600 text-white px-5 py-2 rounded text-sm font-medium inline-block">
          → シフト表に戻る
        </a>
      </div>
    </div>
  )
}