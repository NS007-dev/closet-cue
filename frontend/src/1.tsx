import { useCallback, useEffect, useState } from 'react'

type Item = { id: number; image: string; category: string; type: string; colour: string; pattern: string; style: string; season: string; reviewed: number }
type Outfit = { item_ids: number[]; why: string; source: string }
type Entry = { id: number; day: string; occasion: string; items: Item[] }
type Hist = { today: string; entries: Entry[] }
type Profile = { styles: string[]; vibes: string[] }
type Tab = 'today' | 'wardrobe' | 'add' | 'style' | 'history'

const CATS = ['Top', 'Bottom', 'Dress', 'Shoes', 'Outerwear', 'Accessory']
const STYLES = ['Casual', 'Feminine', 'Trendy', 'Minimal', 'Streetwear', 'Sporty', 'Vintage', 'Preppy']
const VIBES = ['Cute', 'Comfortable', 'Simple', 'Put-together', 'Trendy', 'Effortless']
const PATTERNS = ['Solid', 'Striped', 'Floral', 'Plaid', 'Graphic', 'Other']
const SEASONS = ['Spring/Summer', 'Fall/Winter', 'All year']
const REASONS = ["I don't like the colours", "I don't like the outfit", "It doesn't feel like my style", 'It looks uncomfortable', 'Just show me another']

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const r = await fetch('/api' + path, init)
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Something went wrong')
  return r.json()
}
const send = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const img = (i: Item) => `/uploads/${i.image}`

const label = 'text-[10px] font-semibold uppercase tracking-[0.28em]'
const btnDark = 'w-full bg-ink px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-paper transition active:opacity-70 disabled:opacity-40'
const btnLine = 'w-full border border-ink px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-ink transition active:bg-ink active:text-paper'
const field = 'w-full border-0 border-b border-ink bg-transparent px-0 py-2 font-deck text-xl outline-none focus:border-oxblood'

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className={`border px-3 py-2 text-[10px] uppercase tracking-[0.2em] transition ${on ? 'border-ink bg-ink text-paper' : 'border-rule text-ink'}`}>{children}</button>
}

function Section({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <header className="rise border-b border-ink pb-4">
      <p className={label + ' text-oxblood'}>{kicker}</p>
      <h2 className="mt-1 font-display text-[44px] font-semibold leading-[0.95] tracking-tight">{title}</h2>
      {sub && <p className="mt-2 font-deck text-xl italic text-mute">{sub}</p>}
    </header>
  )
}

function Collage({ pieces }: { pieces: Item[] }) {
  const sorted = [...pieces].sort((a, b) => CATS.indexOf(a.category) - CATS.indexOf(b.category))
  const [hero, ...rest] = sorted
  const cap = (p: Item, n: number) => (
    <figcaption className="mt-2 flex items-baseline justify-between gap-2">
      <span className={label}>{String(n).padStart(2, '0')} — {p.category}</span>
      <span className="font-deck text-base italic text-mute">{p.colour} {p.type}</span>
    </figcaption>
  )
  return (
    <div className="rise">
      <figure><img src={img(hero)} className="aspect-[4/5] w-full object-cover" />{cap(hero, 1)}</figure>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6">
        {rest.map((p, i) => <figure key={p.id}><img src={img(p)} className="aspect-[3/4] w-full object-cover" />{cap(p, i + 2)}</figure>)}
      </div>
    </div>
  )
}

function Sheet({ close, children }: { close: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-ink/60" onClick={close}>
      <div className="rise mx-auto max-h-[92vh] w-full max-w-md overflow-auto border-t-2 border-ink bg-paper p-6 pb-10" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

function Today({ items, hist, anchor, setAnchor, reload, aiOn }: { items: Item[]; hist: Hist; anchor: Item | null; setAnchor: (i: Item | null) => void; reload: () => Promise<void>; aiOn: boolean }) {
  const [occasion, setOccasion] = useState('School')
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [idx, setIdx] = useState(0)
  const [seen, setSeen] = useState<number[][]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [regen, setRegen] = useState(false)
  const [asking, setAsking] = useState(false)
  const todays = hist.entries.find(e => e.day === hist.today)
  const showWorn = !!todays && !regen && !anchor
  const byId = new Map(items.map(i => [i.id, i]))
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const generate = useCallback(async (exclude: number[][]) => {
    setLoading(true); setErr('')
    try {
      const r = await api<{ outfits: Outfit[] }>('/outfits', send('POST', { occasion, anchor_id: anchor?.id ?? null, exclude }))
      setOutfits(r.outfits); setIdx(0)
      if (!r.outfits.length) setErr('We need a few more pieces first: at least a top, a bottom and shoes (or a dress).')
    } catch (e) { setErr((e as Error).message) }
    setLoading(false)
  }, [occasion, anchor])

  useEffect(() => { if (!showWorn && items.length) { setSeen([]); generate([]) } }, [showWorn, items.length, generate])

  const current = outfits[idx]
  const pieces = current ? (current.item_ids.map(i => byId.get(i)).filter(Boolean) as Item[]) : []

  const wear = async () => {
    await api('/history', send('POST', { occasion, item_ids: current.item_ids, worn: true }))
    setAnchor(null); setRegen(false); await reload()
  }
  const next = (reason: string) => {
    setAsking(false)
    const ids = [...current.item_ids].sort((a, b) => a - b)
    api('/history', send('POST', { occasion, item_ids: ids, worn: false, reason: reason === REASONS[4] ? '' : reason })).catch(() => {})
    const s = [...seen, ids]; setSeen(s)
    if (idx + 1 < outfits.length) setIdx(idx + 1); else generate(s)
  }

  return (
    <div className="space-y-6">
      <Section kicker={`${hello} — ${showWorn ? 'Filed' : anchor ? 'Built around one piece' : 'The look of the day'}`} title={showWorn ? 'Decided.' : anchor ? 'Around your piece.' : 'Dress for today.'} sub={showWorn ? "Today's look is in the book." : 'Drawn only from clothes you already own.'} />
      {!aiOn && <p className="border border-rule p-3 font-deck text-lg italic">The AI stylist is resting. Simple mode is on. Start Ollama for sharper picks.</p>}
      {!showWorn && (
        <div className="flex flex-wrap gap-2">
          {['School', 'Going out'].map(o => <Chip key={o} on={occasion === o} onClick={() => setOccasion(o)}>{o === 'School' ? 'School' : 'Shopping / Out'}</Chip>)}
          {anchor && <Chip on onClick={() => setAnchor(null)}>✕ {anchor.colour} {anchor.type}</Chip>}
        </div>
      )}
      {!items.length && <p className="border border-rule p-8 text-center font-deck text-2xl italic">The wardrobe is empty. Add your first pieces.</p>}
      {showWorn && todays && (
        <>
          <Collage pieces={todays.items} />
          <button className={btnLine} onClick={() => setRegen(true)}>Choose differently</button>
        </>
      )}
      {!showWorn && loading && <div className="space-y-4"><div className="aspect-[4/5] animate-pulse bg-rule/60" /><p className={label + ' text-center text-mute'}>Styling in progress…</p></div>}
      {!showWorn && !loading && err && <p className="border border-rule p-8 text-center font-deck text-2xl italic">{err}</p>}
      {!showWorn && !loading && current && (
        <>
          <Collage pieces={pieces} />
          <blockquote className="rise border-y border-ink py-6 text-center">
            <p className={label + ' text-oxblood'}>The editor's note</p>
            <p className="mt-3 font-deck text-[26px] italic leading-snug">“{current.why || 'It suits your style and uses pieces you have not worn lately.'}”</p>
          </blockquote>
          <div className="space-y-3">
            <button className={btnDark} onClick={wear}>Wear this</button>
            <button className={btnLine} onClick={() => setAsking(true)}>Try another</button>
          </div>
        </>
      )}
      {asking && (
        <Sheet close={() => setAsking(false)}>
          <p className={label + ' text-oxblood'}>Feedback</p>
          <h3 className="mb-4 mt-1 font-display text-3xl font-semibold">What's not right?</h3>
          <div className="divide-y divide-rule border-y border-rule">{REASONS.map(r => <button key={r} onClick={() => next(r)} className="w-full py-4 text-left font-deck text-xl italic active:text-oxblood">{r}</button>)}</div>
        </Sheet>
      )}
    </div>
  )
}

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return <label className="block"><span className={label + ' text-mute'}>{name}</span>{children}</label>
}

function EditSheet({ item, close, saved, build }: { item: Item; close: () => void; saved: () => void; build: (i: Item) => void }) {
  const [f, setF] = useState(item)
  const set = (k: keyof Item, v: string) => setF({ ...f, [k]: v })
  const pick = (k: keyof Item, opts: string[]) => <select className={field} value={f[k] as string} onChange={e => set(k, e.target.value)}>{opts.map(o => <option key={o}>{o}</option>)}</select>
  const save = async () => { await api(`/items/${item.id}`, send('PATCH', f)); saved(); close() }
  const del = async () => { if (confirm('Remove this piece from your wardrobe?')) { await api(`/items/${item.id}`, { method: 'DELETE' }); saved(); close() } }
  return (
    <Sheet close={close}>
      <img src={img(item)} className="mx-auto mb-5 max-h-72 object-contain" />
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        <Field name="Category">{pick('category', CATS)}</Field>
        <Field name="Type"><input className={field} value={f.type} onChange={e => set('type', e.target.value)} /></Field>
        <Field name="Colour"><input className={field} value={f.colour} onChange={e => set('colour', e.target.value)} /></Field>
        <Field name="Pattern">{pick('pattern', PATTERNS)}</Field>
        <Field name="Style">{pick('style', STYLES)}</Field>
        <Field name="Season">{pick('season', SEASONS)}</Field>
      </div>
      <div className="mt-7 space-y-3">
        <button className={btnDark} onClick={save}>Save</button>
        <button className={btnLine} onClick={() => { build(item); close() }}>Build a look around this</button>
        <button className={label + ' w-full py-3 text-oxblood'} onClick={del}>Remove piece</button>
      </div>
    </Sheet>
  )
}

function Wardrobe({ items, reload, build, go }: { items: Item[]; reload: () => void; build: (i: Item) => void; go: (t: Tab) => void }) {
  const [cat, setCat] = useState('All')
  const [open, setOpen] = useState<Item | null>(null)
  const shown = items.filter(i => cat === 'All' || i.category === cat)
  return (
    <div className="space-y-5">
      <Section kicker="The collection" title="The Closet." sub={`${items.length} piece${items.length === 1 ? '' : 's'}, all yours.`} />
      <div className="flex gap-2 overflow-x-auto pb-1">{['All', ...CATS].map(c => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}</div>
      {!items.length ? (
        <div className="border border-rule p-8 text-center"><p className="font-deck text-2xl italic">Your closet is waiting.</p><button className={btnDark + ' mt-5'} onClick={() => go('add')}>Add your first pieces</button></div>
      ) : (
        <div className="columns-2 gap-4">
          {shown.map(i => (
            <button key={i.id} onClick={() => setOpen(i)} className="rise mb-6 block w-full break-inside-avoid text-left">
              <img src={img(i)} className="w-full" loading="lazy" />
              <p className={label + ' mt-2 flex justify-between'}><span>No. {String(i.id).padStart(2, '0')}</span>{!i.reviewed && <span className="text-oxblood">Check</span>}</p>
              <p className="font-deck text-lg italic leading-tight text-mute">{i.colour} {i.type || i.category}</p>
            </button>
          ))}
        </div>
      )}
      {items.some(i => !i.reviewed) && <p className="text-center font-deck text-lg italic text-oxblood">Tap pieces marked “Check” to confirm what the AI saw.</p>}
      {open && <EditSheet item={open} close={() => setOpen(null)} saved={reload} build={build} />}
    </div>
  )
}

function Add({ done }: { done: (ok: number, bad: string[]) => void }) {
  const [busy, setBusy] = useState('')
  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files); const bad: string[] = []; let ok = 0
    for (let i = 0; i < list.length; i++) {
      setBusy(`Reading piece ${i + 1} of ${list.length}…`)
      const fd = new FormData(); fd.append('file', list[i])
      try { await api('/items', { method: 'POST', body: fd }); ok++ } catch (e) { bad.push((e as Error).message) }
    }
    setBusy(''); done(ok, bad)
  }
  return (
    <div className="space-y-6">
      <Section kicker="New arrivals" title="Add to the closet." sub="One piece per photo, plain background. The AI writes the caption; you edit." />
      <label className={`flex aspect-[4/5] cursor-pointer flex-col items-center justify-center border border-ink text-center ${busy ? 'animate-pulse' : ''}`}>
        <span className="font-display text-8xl font-light">+</span>
        <span className={label + ' mt-2'}>{busy || 'Choose photos'}</span>
        <input type="file" accept="image/*" multiple className="hidden" disabled={!!busy} onChange={e => pick(e.target.files)} />
      </label>
    </div>
  )
}

function StyleScreen({ profile, save }: { profile: Profile; save: (p: Profile) => void }) {
  const toggle = (k: keyof Profile, v: string) => save({ ...profile, [k]: profile[k].includes(v) ? profile[k].filter(x => x !== v) : [...profile[k], v] })
  return (
    <div className="space-y-8">
      <Section kicker="Editor's brief" title="Your style." sub="Choose as many as you like. You are the editor-in-chief." />
      <section><h3 className="mb-3 font-display text-2xl font-semibold"><span className="text-oxblood">I.</span> Styles I love</h3><div className="flex flex-wrap gap-2">{STYLES.map(s => <Chip key={s} on={profile.styles.includes(s)} onClick={() => toggle('styles', s)}>{s}</Chip>)}</div></section>
      <section><h3 className="mb-3 font-display text-2xl font-semibold"><span className="text-oxblood">II.</span> The mood I want</h3><div className="flex flex-wrap gap-2">{VIBES.map(s => <Chip key={s} on={profile.vibes.includes(s)} onClick={() => toggle('vibes', s)}>{s}</Chip>)}</div></section>
    </div>
  )
}

function History({ hist }: { hist: Hist }) {
  return (
    <div className="space-y-2">
      <Section kicker="The archive" title="Back issues." sub="Every look you've worn." />
      {!hist.entries.length && <p className="border border-rule p-8 text-center font-deck text-2xl italic">No issues yet. Tap “Wear this” to file your first look.</p>}
      {hist.entries.map(e => {
        const d = new Date(e.day + 'T12:00')
        return (
          <div key={e.id} className="rise flex gap-4 border-b border-rule py-5">
            <div className="w-16 shrink-0">
              <p className="font-display text-5xl font-semibold leading-none">{d.getDate()}</p>
              <p className={label + ' mt-1'}>{d.toLocaleDateString(undefined, { month: 'short' })}</p>
              <p className="mt-1 font-deck text-base italic text-oxblood">{e.occasion}</p>
            </div>
            <div className="flex gap-2 overflow-x-auto">{e.items.map(i => <img key={i.id} src={img(i)} className="h-28 w-20 shrink-0 object-cover" />)}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [items, setItems] = useState<Item[]>([])
  const [hist, setHist] = useState<Hist>({ today: '', entries: [] })
  const [profile, setProfile] = useState<Profile>({ styles: [], vibes: [] })
  const [aiOn, setAiOn] = useState(true)
  const [anchor, setAnchor] = useState<Item | null>(null)
  const [note, setNote] = useState('')
  const [ready, setReady] = useState(false)

  const loadItems = useCallback(async () => setItems(await api<Item[]>('/items')), [])
  const loadHist = useCallback(async () => setHist(await api<Hist>('/history')), [])
  useEffect(() => {
    Promise.all([loadItems(), loadHist(), api<Profile>('/profile').then(setProfile), api<{ ai: boolean }>('/health').then(h => setAiOn(h.ai))])
      .catch(() => setNote("Can't reach the ClosetCue server. Is the backend running?")).finally(() => setReady(true))
  }, [loadItems, loadHist])
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(''), 5000); return () => clearTimeout(t) } }, [note])

  const build = (i: Item) => { setAnchor(i); setTab('today') }
  const saveProfile = (p: Profile) => { setProfile(p); api('/profile', send('PUT', p)).catch(() => {}) }
  const tabs: [Tab, string][] = [['today', 'Today'], ['wardrobe', 'Closet'], ['add', '+ Add'], ['style', 'Style'], ['history', 'Archive']]
  const now = new Date()
  const issue = Math.floor((+now - +new Date(now.getFullYear(), 0, 0)) / 864e5)

  return (
    <div className="mx-auto min-h-screen max-w-md px-5 pb-28 pt-5">
      {note && <div className="fixed left-1/2 top-4 z-40 w-[90%] max-w-sm -translate-x-1/2 bg-ink px-4 py-3 text-center text-[11px] uppercase tracking-[0.2em] text-paper">{note}</div>}
      <div className="mb-7 text-center">
        <div className={label + ' flex justify-between border-b border-rule pb-2 text-mute'}><span>No. {issue}</span><span>{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></div>
        <h1 className="border-b-[3px] border-double border-ink py-3 font-display text-[46px] font-semibold uppercase leading-none tracking-[0.04em]">ClosetCue</h1>
        <p className={label + ' pt-2 text-oxblood'}>Your wardrobe. Picked for you.</p>
      </div>
      {!ready ? <p className="pt-24 text-center font-deck text-3xl italic">Going to press…</p> : <>
        {tab === 'today' && <Today items={items} hist={hist} anchor={anchor} setAnchor={setAnchor} reload={loadHist} aiOn={aiOn} />}
        {tab === 'wardrobe' && <Wardrobe items={items} reload={() => { loadItems(); loadHist() }} build={build} go={setTab} />}
        {tab === 'add' && <Add done={async (ok, bad) => { await loadItems(); setNote(bad.length ? bad[0] : `${ok} piece${ok === 1 ? '' : 's'} added`); if (ok) setTab('wardrobe') }} />}
        {tab === 'style' && <StyleScreen profile={profile} save={saveProfile} />}
        {tab === 'history' && <History hist={hist} />}
      </>}
      <nav className="fixed inset-x-0 bottom-0 z-20 bg-paper pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md border-t border-ink">
          {tabs.map(([t, name]) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 border-t-2 py-4 text-[10px] font-semibold uppercase tracking-[0.2em] transition ${tab === t ? 'border-oxblood text-oxblood' : 'border-transparent text-mute'}`}>{name}</button>
          ))}
        </div>
      </nav>
    </div>
  )
}
