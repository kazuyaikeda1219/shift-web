'use client'
import { useEffect, useState, useCallback } from 'react'

type Staff = { id: string; name: string; can_us: boolean }
type Request = { id: number; year: number; month: number; day: number; staff_id: string; kubun: string; staff: { name: string } }

const KUBUN_COLOR: Record<string, string> = {
  '全休':    'bg-slate-100 text-slate-600',
  '午前半休': 'bg-pink-100 text-pink-700',
  '午後半休': 'bg-pink-100 text-pink-700',
}

export default function RegisterPage() {
  const now = new Date()
  const [year,    setYear]    = useState(now.getFullYear())
  const [month,   setMonth]   = useState(now.getMonth() + 1)
  const [day,     setDay]     = useState(1)
  const [staffId, setStaffId] = useState('')
  const [kubun,   setKubun]   = useState('全休')
  const [staff,   setStaff]   = useState<Staff[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [saving,  setSaving]  = useState(false)
  const [message, setMessage] = useState('')

  const daysInMonth = new Date(year, month, 0).getDate()

  const fetchStaff = useCallback(async () => {
    const r = await fetch('/api/staff')
    const data = await r.json()
    setStaff(data)
    if (data.length > 0 && !staffId) setStaffId(data[0].id)
  }, [staffId])

  const fetchRequests = useCallback(async () => {
    const r = await fetch(`/api/requests?year=${year}&month=${month}`)
    const data = await r.json()
    setRequests(Array.isArray(data) ? data : [])
  }, [year, month])

  useEffect(() => { fetchStaff() },    [fetchStaff])
  useEffect(() => { fetchRequests() }, [fetchRequests])

  const handleAdd = async () => {
    setSaving(true)
    setMessage('')
    const r = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, day, staff_id: staffId, kubun }),
    })
    if (r.ok) {
      setMessage('✅ 登録しました')
      await fetchRequests()
    } else {
      setMessage('❌ 登録に失敗しました')
    }
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('この申請を削除しますか？')) return
    await fetch(`/api/requests?id=${id}`, { method: 'DELETE' })
    await fetchRequests()
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-1">📋 休み申請登録</h1>
      <p className="text-xs text-slate-400 mb-6">登録した内容はすぐにシフト生成に反映されます</p>

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

      {/* 申請追加 */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-4">
        <h2 className="text-sm font-semibold mb-3">{year}年{month}月の申請を追加</h2>
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

      {/* 申請一覧 */}
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

      {/* シフト生成ボタン */}
      <div className="mt-4 text-right">
        <a href="/" className="bg-green-500 hover:bg-green-600 text-white px-5 py-2 rounded text-sm font-medium inline-block">
          → シフト表に戻る
        </a>
      </div>
    </div>
  )
}
