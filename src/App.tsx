import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Bell, Bot, CheckCircle2, Copy, Eye, Filter, History, Home, KeyRound, LogOut, Pencil, Plus, RefreshCw, Search, Settings, ShieldCheck, Trash2, Webhook, X, Zap } from 'lucide-react';
import { cn } from '@/utils/cn';

type Page = 'overview' | 'bots' | 'integrations' | 'webhooks' | 'vote-logs' | 'audit-logs' | 'settings';
type User = { discordId: string; username: string; avatarUrl?: string; role: string } | null;
type BotRecord = { id: string; name: string; slug: string; botId: string; avatarUrl?: string; status: string; tokenHealth?: string; lastValidatedAt?: string };
type IntegrationRecord = { id: string; botId: string; botName: string; name: string; slug: string; path: string; finalUrl: string; authorizationTokenMasked: string; upvoteURL?: string; iconURL?: string; payloadUserField: string; notificationTarget?: string; enabled: boolean; votesReceived: number; lastVoteAt?: string };
type WebhookRecord = { id: string; botId: string; botName: string; name: string; webhookUrlMasked: string; webhookUsername?: string; webhookAvatar?: string; isDefault: boolean; enabled: boolean };
type VoteLogRecord = { id: string; botName?: string; userId?: string; username?: string; avatarURL?: string; status: string; errorMessage?: string; receivedAt: string; rawPayload?: unknown };
type AuditLogRecord = { id: string; adminUsername?: string; action: string; targetType: string; targetName?: string; ip?: string; userAgent?: string; createdAt: string };

type DashboardData = { bots: BotRecord[]; integrations: IntegrationRecord[]; webhooks: WebhookRecord[]; voteLogs: VoteLogRecord[]; auditLogs: AuditLogRecord[]; settings: { publicBaseUrl: string; authDisabled: boolean } };

type Modal = null | 'bot' | 'integration' | 'edit-integration' | 'webhook' | 'payload' | 'delete';

const nav = [
  ['overview', Home, 'Overview'], ['bots', Bot, 'Bots'], ['integrations', Webhook, 'Vote Integrations'], ['webhooks', Bell, 'Notification Webhooks'], ['vote-logs', Activity, 'Vote Logs'], ['audit-logs', History, 'Audit Logs'], ['settings', Settings, 'Settings'],
] as const;

const emptyData: DashboardData = { bots: [], integrations: [], webhooks: [], voteLogs: [], auditLogs: [], settings: { publicBaseUrl: '', authDisabled: false } };

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `API error ${res.status}`);
  return data;
}

function fmtDate(value?: string) { return value ? new Date(value).toLocaleString('fr-FR') : '-'; }
function initials(name = '?') { return name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase(); }
function slugifyClient(value = '') { return value.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function statusTone(value: string) {
  const v = value.toLowerCase();
  if (['active', 'enabled', 'success', 'healthy'].includes(v)) return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
  if (['failed', 'error'].includes(v)) return 'border-red-400/30 bg-red-400/10 text-red-300';
  if (['unauthorized', 'warning'].includes(v)) return 'border-orange-400/30 bg-orange-400/10 text-orange-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
}

function Badge({ value }: { value: string }) { return <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', statusTone(value))}><span className="h-1.5 w-1.5 rounded-full bg-current" />{value}</span>; }
function Button({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={cn('inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50', className)} {...props}>{children}</button>; }
function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) { return <label className="grid gap-1.5 text-sm font-semibold text-slate-300">{label}{children}{help && <span className="text-xs font-normal text-slate-500">{help}</span>}</label>; }
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-400" {...props} />; }
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-400" {...props} />; }
function Card({ children, className }: { children: React.ReactNode; className?: string }) { return <div className={cn('rounded-3xl border border-slate-800 bg-slate-900/65 p-6 shadow-xl shadow-black/10', className)}>{children}</div>; }

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [user, setUser] = useState<User>(null);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [selectedPayload, setSelectedPayload] = useState<unknown>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'bot' | 'integration' | 'webhook'; id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setError('');
    try {
      const me = await api<{ user: User }>('/api/auth/me');
      setUser(me.user);
      if (me.user) setData(await api<DashboardData>('/api/dashboard'));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    totalBots: data.bots.length,
    activeIntegrations: data.integrations.filter(i => i.enabled).length,
    votesToday: data.voteLogs.filter(v => new Date(v.receivedAt).toDateString() === new Date().toDateString()).length,
    failed: data.voteLogs.filter(v => ['failed', 'unauthorized'].includes(v.status)).length,
    lastVote: data.voteLogs[0]?.receivedAt,
    healthy: data.bots.some(b => b.status === 'error') ? 'Warning' : 'Healthy',
  }), [data]);

  const searchResults = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return [
      ...data.bots.filter(b => b.name.toLowerCase().includes(q) || b.botId.includes(q)).map(b => ({ type: 'Bot', label: b.name, sub: b.botId, page: 'bots' as Page })),
      ...data.integrations.filter(i => i.name.toLowerCase().includes(q) || i.botName.toLowerCase().includes(q)).map(i => ({ type: 'Integration', label: i.name, sub: i.finalUrl, page: 'integrations' as Page })),
      ...data.webhooks.filter(w => w.name.toLowerCase().includes(q)).map(w => ({ type: 'Webhook', label: w.name, sub: w.botName, page: 'webhooks' as Page })),
      ...data.voteLogs.filter(v => (v.username || '').toLowerCase().includes(q) || (v.userId || '').includes(q)).map(v => ({ type: 'Vote log', label: v.username || v.userId || 'Unknown', sub: v.status, page: 'vote-logs' as Page })),
    ].slice(0, 8);
  }, [search, data]);

  if (loading) return <LoginShell title="Loading VoteHub..." />;
  if (!user) return <Login error={error} />;

  const pageTitle = nav.find(n => n[0] === page)?.[2] || 'Dashboard';

  return <div className="min-h-screen bg-[#070b15] text-slate-100">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-800 bg-[#0d1220] p-4 lg:block">
      <div className="mb-10 flex items-center gap-3 px-2 pt-1"><div className="relative grid h-11 w-11 place-items-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30"><ShieldCheck /><span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#0d1220] bg-emerald-400" /></div><div><p className="text-sm font-black uppercase tracking-[0.22em] text-indigo-200">VoteHub</p><p className="text-xs text-slate-500">Webhook Control</p></div></div>
      <nav className="space-y-2">{nav.map(([id, Icon, label]) => <button key={id} onClick={() => setPage(id)} className={cn('flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-400 hover:bg-slate-800 hover:text-white', page === id && 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25')}><Icon className="h-5 w-5" />{label}</button>)}</nav>
      <div className="absolute bottom-5 left-4 right-4 rounded-3xl border border-indigo-500/25 bg-indigo-500/10 p-4 text-sm text-slate-300"><b className="text-white">Fastify connected</b><p className="mt-1 text-xs text-slate-400">API + MongoDB ready. Dynamic config without reboot.</p></div>
    </aside>
    <main className="min-w-0 lg:pl-72">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-[#070b15]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div><p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 sm:text-xs sm:tracking-[0.35em]">VoteHub Dashboard</p><h1 className="text-xl font-black sm:text-2xl">{pageTitle}</h1></div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative order-last w-full md:order-none md:w-auto"><Search className="absolute left-3 top-3 h-5 w-5 text-slate-500" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bots, users, webhooks..." className="w-full pl-10 md:w-80" />{searchResults.length > 0 && <div className="absolute left-0 right-0 top-14 z-50 rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl md:left-auto md:w-[32rem]">{searchResults.map((r, i) => <button key={i} onClick={() => { setPage(r.page); setSearch(''); }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-slate-800"><span className="text-xs text-indigo-300">{r.type}</span><p className="font-semibold">{r.label}</p><p className="truncate text-xs text-slate-500">{r.sub}</p></button>)}</div>}</div>
            <Button onClick={load} className="px-3"><RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Refresh</span></Button>
            <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-2 py-2 sm:px-3"><img src={user.avatarUrl || ''} onError={e => (e.currentTarget.style.display = 'none')} className="h-8 w-8 rounded-xl sm:h-9 sm:w-9" /><div className="min-w-0 max-w-[9rem]"><b className="block truncate text-sm">{user.username}</b><p className="text-xs text-slate-500">{user.role}</p></div></div>
            <Button className="px-3" onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); }}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
        <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">{nav.map(([id, Icon, label]) => <button key={id} onClick={() => setPage(id)} className={cn('flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white', page === id && 'bg-indigo-500 text-white')}><Icon className="h-4 w-4" />{label}</button>)}</nav>
      </header>
      <section className="p-4 sm:p-6">
        {error && <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>}
        {page === 'overview' && <Overview stats={stats} data={data} setPage={setPage} />}
        {page === 'bots' && <Bots data={data} openAdd={() => setModal('bot')} onDelete={(id, name) => { setDeleteTarget({ type: 'bot', id, name }); setModal('delete'); }} onValidate={async id => { await api(`/api/bots/${id}/validate`, { method: 'POST' }); await load(); }} />}
        {page === 'integrations' && <Integrations data={data} openAdd={() => setModal('integration')} onEdit={(integration: IntegrationRecord) => { setSelectedIntegration(integration); setModal('edit-integration'); }} onDelete={(id, name) => { setDeleteTarget({ type: 'integration', id, name }); setModal('delete'); }} onTest={async id => { const result = await api(`/api/integrations/${id}/test`, { method: 'POST' }); alert(`Test webhook: HTTP ${result.statusCode}`); await load(); }} />}
        {page === 'webhooks' && <Webhooks data={data} openAdd={() => setModal('webhook')} onDelete={(id, name) => { setDeleteTarget({ type: 'webhook', id, name }); setModal('delete'); }} onTest={async id => { await api(`/api/notification-targets/${id}/test`, { method: 'POST' }); alert('Test envoyé dans Discord.'); }} />}
        {page === 'vote-logs' && <VoteLogs data={data} viewPayload={(p) => { setSelectedPayload(p); setModal('payload'); }} />}
        {page === 'audit-logs' && <AuditLogs data={data} />}
        {page === 'settings' && <SettingsPage data={data} />}
      </section>
    </main>
    {modal === 'bot' && <AddBotModal close={() => setModal(null)} done={load} />}
    {modal === 'integration' && <AddIntegrationModal bots={data.bots} webhooks={data.webhooks} settings={data.settings} close={() => setModal(null)} done={load} />}
    {modal === 'edit-integration' && selectedIntegration && <EditIntegrationModal integration={selectedIntegration} webhooks={data.webhooks} settings={data.settings} close={() => { setModal(null); setSelectedIntegration(null); }} done={load} />}
    {modal === 'webhook' && <AddWebhookModal bots={data.bots} close={() => setModal(null)} done={load} />}
    {modal === 'payload' && <PayloadModal payload={selectedPayload} close={() => setModal(null)} />}
    {modal === 'delete' && deleteTarget && <DeleteModal target={deleteTarget} close={() => setModal(null)} done={async () => { const url = deleteTarget.type === 'bot' ? `/api/bots/${deleteTarget.id}` : deleteTarget.type === 'integration' ? `/api/integrations/${deleteTarget.id}` : `/api/notification-targets/${deleteTarget.id}`; await api(url, { method: 'DELETE' }); setModal(null); await load(); }} />}
  </div>;
}

function LoginShell({ title }: { title: string }) { return <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[#151b39] via-[#070b15] to-[#06201e] text-slate-100"><Card className="mx-4 w-full max-w-md text-center"><div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30"><ShieldCheck /></div><h1 className="text-3xl font-black">{title}</h1><p className="mt-2 text-slate-400">Secure dashboard for Discord bot vote webhooks</p></Card></div>; }
function Login({ error }: { error: string }) { return <div className="grid min-h-screen place-items-center bg-gradient-to-br from-[#151b39] via-[#070b15] to-[#06201e] text-slate-100"><Card className="mx-4 w-full max-w-md text-center"><div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30"><ShieldCheck /></div><h1 className="text-3xl font-black">VoteHub Dashboard</h1><p className="mt-2 text-slate-400">Secure dashboard for Discord bot vote webhooks</p>{error && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}<a href="/api/auth/discord" className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 font-bold text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-400">Continue with Discord</a><p className="mt-5 text-xs text-emerald-300">Private access only</p></Card></div>; }

function Overview({ stats, data, setPage }: { stats: any; data: DashboardData; setPage: (p: Page) => void }) {
  return <div className="space-y-6"><div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">{[
    ['Total Bots', stats.totalBots, Bot], ['Active Integrations', stats.activeIntegrations, Webhook], ['Votes Today', stats.votesToday, Zap], ['Failed Requests', stats.failed, AlertTriangle], ['Last Vote', stats.lastVote ? fmtDate(stats.lastVote) : '-', Activity], ['System Status', stats.healthy, CheckCircle2],
  ].map(([label, value, Icon]: any) => <Card key={label}><div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p><p className="mt-3 text-3xl font-black">{value}</p></div><div className="rounded-2xl bg-slate-800 p-3"><Icon className="h-5 w-5 text-indigo-300" /></div></div></Card>)}</div>
  <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]"><Card><h2 className="text-xl font-black">Votes per day</h2><div className="mt-8 flex h-64 items-end gap-4 rounded-3xl border border-slate-800 bg-slate-950/50 p-6">{[30,70,45,80,60,95,75].map((h,i)=><div key={i} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-xl bg-indigo-500/80" style={{height:`${h}%`}} /><span className="text-xs text-slate-500">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</span></div>)}</div></Card><Card><h2 className="text-xl font-black">Quick actions</h2><div className="mt-6 grid gap-3"><Button className="bg-indigo-500 hover:bg-indigo-400" onClick={() => setPage('bots')}><Plus />Add Bot</Button><Button onClick={() => setPage('integrations')}><Webhook />Add Vote Integration</Button><Button onClick={() => setPage('webhooks')}><Bell />Add Notification Webhook</Button></div></Card></div>
  <Card><h2 className="text-xl font-black">Recent vote activity</h2><div className="mt-4 space-y-3">{data.voteLogs.slice(0,5).map(v => <div key={v.id} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/30 p-4"><div><b>{v.username || v.userId || 'Unknown user'}</b><p className="text-sm text-slate-500">{fmtDate(v.receivedAt)}</p></div><Badge value={v.status} /></div>)}{!data.voteLogs.length && <Empty title="No votes yet" desc="Votes will appear here after your bot-list webhooks call VoteHub." />}</div></Card></div>;
}

function Bots({ data, openAdd, onDelete, onValidate }: any) { return <div><PageHeader title="Bots" desc="Manage Discord bot identities, token health, and vote integration ownership." action={<Button className="bg-indigo-500 hover:bg-indigo-400" onClick={openAdd}><Plus />Add Bot</Button>} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.bots.map((b: BotRecord) => <Card key={b.id}><div className="flex items-start justify-between"><div className="flex gap-3"><Avatar bot={b}/><div><h3 className="font-black">{b.name}</h3><p className="text-xs text-slate-500">{b.botId}</p></div></div><Badge value={b.status} /></div><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-800/70 p-4"><p className="text-sm text-slate-500">Integrations</p><b>{data.integrations.filter((i: IntegrationRecord)=>i.botId===b.id).length}</b></div><div className="rounded-2xl bg-slate-800/70 p-4"><p className="text-sm text-slate-500">Validation</p><b>{fmtDate(b.lastValidatedAt)}</b></div></div><p className="mt-4 flex items-center gap-2 text-sm text-slate-400"><KeyRound className="h-4 w-4 text-indigo-300" />{b.tokenHealth || 'Not validated'}</p><div className="mt-6 flex gap-2"><Button onClick={()=>onValidate(b.id)}>Validate</Button><Button onClick={()=>onDelete(b.id,b.name)} className="border-red-500/40 bg-red-500/10 text-red-200"><Trash2 className="h-4 w-4" />Delete</Button></div></Card>)}{!data.bots.length && <Empty title="No bots yet" desc="Add a bot token once. VoteHub will fetch its Discord name and avatar automatically." />}</div></div>; }
function Integrations({ data, openAdd, onEdit, onDelete, onTest }: any) { return <div><PageHeader title="Vote Integrations" desc="Configure vote-list webhook endpoints for Top.gg, Discord Bot List and custom providers." action={<Button className="bg-indigo-500 hover:bg-indigo-400" onClick={openAdd}><Plus />Add Integration</Button>} /><div className="mb-4 rounded-2xl border border-indigo-500/25 bg-indigo-500/10 p-4 text-sm text-indigo-100"><b>Top.gg v1:</b> paste the <code className="rounded bg-slate-950/70 px-1">whs_...</code> webhook secret in the token field. VoteHub will verify <code className="rounded bg-slate-950/70 px-1">x-topgg-signature</code> automatically.</div><Table headers={['Vote list','Bot','Final webhook URL','Token / secret','Status','Votes','Last vote','Actions']}>{data.integrations.map((i: IntegrationRecord)=><tr key={i.id}><td><b>{i.name}</b><p className="text-xs text-slate-500">{i.slug}</p></td><td>{i.botName}</td><td><CopyPill text={i.finalUrl} copyValue={i.finalUrl}/></td><td><CopyPill text={i.authorizationTokenMasked} secretUrl={`/api/integrations/${i.id}/copy-data`} secretField="authorizationToken"/></td><td><Badge value={i.enabled?'Enabled':'Disabled'} /></td><td>{i.votesReceived}</td><td>{fmtDate(i.lastVoteAt)}</td><td><div className="flex flex-wrap gap-2"><Button onClick={()=>onEdit(i)}><Pencil className="h-4 w-4" />Edit</Button><Button onClick={()=>onTest(i.id)}>Test</Button><Button onClick={()=>onDelete(i.id,i.name)} className="border-red-500/40 bg-red-500/10 text-red-200">Delete</Button></div></td></tr>)}{!data.integrations.length && <tr><td colSpan={8}><Empty title="No integrations yet" desc="Create one endpoint per bot list." /></td></tr>}</Table></div>; }
function Webhooks({ data, openAdd, onDelete, onTest }: any) { return <div><PageHeader title="Notification Webhooks" desc="Manage Discord channels that receive vote notifications after a vote payload is accepted." action={<Button className="bg-indigo-500 hover:bg-indigo-400" onClick={openAdd}><Plus />Add Notification Webhook</Button>} /><Table headers={['Name','Bot','Webhook URL','Username','Default','Status','Actions']}>{data.webhooks.map((w: WebhookRecord)=><tr key={w.id}><td><b>{w.name}</b></td><td>{w.botName}</td><td><CopyPill text={w.webhookUrlMasked}/></td><td>{w.webhookUsername}</td><td>{w.isDefault?'Yes':'No'}</td><td><Badge value={w.enabled?'Enabled':'Disabled'} /></td><td><div className="flex gap-2"><Button onClick={()=>onTest(w.id)}>Test</Button><Button onClick={()=>onDelete(w.id,w.name)} className="border-red-500/40 bg-red-500/10 text-red-200">Delete</Button></div></td></tr>)}{!data.webhooks.length && <tr><td colSpan={7}><Empty title="No notification webhooks" desc="Add a Discord webhook URL to receive vote notifications." /></td></tr>}</Table></div>; }
function VoteLogs({ data, viewPayload }: any) { return <div><PageHeader title="Vote Logs" desc="Inspect inbound vote events, delivery status, payloads and notification errors." /><Card className="mb-6"><div className="grid gap-3 md:grid-cols-5"><Input placeholder="Discord user ID"/><Select><option>All bots</option></Select><Select><option>All lists</option></Select><Select><option>Any status</option></Select><Button><Filter className="h-4 w-4"/>Apply filters</Button></div></Card><Table headers={['Date','User','User ID','Status','Error','Actions']}>{data.voteLogs.map((v: VoteLogRecord)=><tr key={v.id}><td>{fmtDate(v.receivedAt)}</td><td><b>{v.username || 'unknown'}</b></td><td>{v.userId || '-'}</td><td><Badge value={v.status}/></td><td className="text-red-200">{v.errorMessage || '-'}</td><td><Button onClick={()=>viewPayload(v.rawPayload)}><Eye className="h-4 w-4"/>View payload</Button></td></tr>)}</Table></div>; }
function AuditLogs({ data }: any) { return <div><PageHeader title="Audit Logs" desc="Track private dashboard activity for sensitive bot, token and webhook changes." /><Table headers={['Date','Admin','Action','Target','IP address','User agent']}>{data.auditLogs.map((l: AuditLogRecord)=><tr key={l.id}><td>{fmtDate(l.createdAt)}</td><td><b>{l.adminUsername}</b></td><td>{l.action}</td><td>{l.targetName || l.targetType}</td><td>{l.ip}</td><td>{l.userAgent}</td></tr>)}</Table></div>; }
function SettingsPage({ data }: any) { return <div className="grid gap-6 xl:grid-cols-2"><Card><h2 className="text-xl font-black">General</h2><div className="mt-5 space-y-4"><Field label="Public base URL"><Input value={data.settings.publicBaseUrl || ''} readOnly /></Field><Field label="Dashboard name"><Input value="VoteHub Dashboard" readOnly /></Field></div></Card><Card><h2 className="text-xl font-black">Security</h2><p className="mt-2 text-slate-400">Discord OAuth and allowlist are managed by environment variables.</p><div className="mt-5 space-y-4"><Field label="Auth status"><Input value={data.settings.authDisabled?'Disabled for development':'Discord OAuth required'} readOnly /></Field><Field label="Allowed admins"><Input value="OWNER_DISCORD_IDS" readOnly /></Field></div></Card><Card className="border-red-500/30 bg-red-950/20"><h2 className="text-xl font-black text-red-100">Danger zone</h2><div className="mt-5 grid gap-3"><Button className="border-red-500/40 bg-red-500/10 text-red-200">Clear failed logs</Button><Button className="border-red-500/40 bg-red-500/10 text-red-200">Disable all integrations</Button></div></Card></div>; }

function PageHeader({ title, desc, action }: any) { return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-black">{title}</h2><p className="mt-2 text-sm text-slate-400 sm:text-base">{desc}</p></div>{action && <div className="shrink-0">{action}</div>}</div>; }
function Table({ headers, children }: any) { return <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/65"><table className="min-w-[900px] w-full border-collapse text-left text-sm"><thead><tr className="border-b border-slate-800 bg-slate-800/40">{headers.map((h: string)=><th key={h} className="whitespace-nowrap px-4 py-4 text-xs uppercase tracking-[0.18em] text-slate-500 sm:px-5 sm:tracking-[0.25em]">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-800 [&_td]:px-4 [&_td]:py-3 sm:[&_td]:px-5">{children}</tbody></table></div>; }
async function copyToClipboard(value: string) {
  if (!value) throw new Error('Nothing to copy.');

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) throw new Error('Clipboard copy failed.');
}

function CopyPill({ text, copyValue, secretUrl, secretField }: { text: string; copyValue?: string; secretUrl?: string; secretField?: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const handleCopy = async () => {
    try {
      setCopyError(false);
      let valueToCopy = copyValue || text;

      if (secretUrl && secretField) {
        const data = await api<Record<string, string>>(secretUrl);
        valueToCopy = data[secretField];
        if (!valueToCopy) throw new Error('Secret value not found.');
      }

      await copyToClipboard(valueToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error(error);
      setCopyError(true);
      window.setTimeout(() => setCopyError(false), 2000);
    }
  };

  return <button type="button" onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'} className={cn('inline-flex max-w-md items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 font-mono text-xs text-slate-200 hover:border-indigo-400 hover:bg-slate-900', copied && 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200', copyError && 'border-red-400/50 bg-red-400/10 text-red-200')}><span className="truncate">{copied ? 'Copied!' : copyError ? 'Copy failed' : text}</span>{copied ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4 text-slate-400" />}</button>;
}
function Avatar({ bot }: { bot: BotRecord }) { return bot.avatarUrl ? <img src={bot.avatarUrl} className="h-12 w-12 rounded-2xl" /> : <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500 font-black">{initials(bot.name)}</div>; }
function Empty({ title, desc }: { title: string; desc: string }) { return <div className="rounded-3xl border border-dashed border-slate-700 p-10 text-center"><p className="text-lg font-black">{title}</p><p className="mt-2 text-slate-500">{desc}</p></div>; }

function ModalShell({ title, close, children }: any) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"><Card className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-b-none p-4 sm:rounded-3xl sm:p-6"><div className="mb-6 flex items-center justify-between gap-4"><h2 className="text-xl font-black sm:text-2xl">{title}</h2><button className="rounded-xl p-2 hover:bg-slate-800" onClick={close}><X /></button></div>{children}</Card></div>; }
function AddBotModal({ close, done }: any) { const [form,setForm]=useState({name:'',botId:'',clientId:'',botToken:'',avatarUrl:''}); const [show,setShow]=useState(false); const submit=async()=>{await api('/api/bots',{method:'POST',body:JSON.stringify(form)}); close(); await done();}; return <ModalShell title="Add Bot" close={close}><div className="grid gap-4"><Field label="Bot name"><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Optional, fetched automatically from Discord" /></Field><Field label="Bot ID / Client ID"><Input value={form.botId} onChange={e=>setForm({...form,botId:e.target.value})} placeholder="Discord bot ID" /></Field><Field label="Bot token" help="The backend validates the token via Discord and stores it encrypted."><div className="flex gap-2"><Input type={show?'text':'password'} value={form.botToken} onChange={e=>setForm({...form,botToken:e.target.value})} /><Button onClick={()=>setShow(!show)}>{show?'Hide':'Show'}</Button></div></Field><Field label="Avatar URL"><Input value={form.avatarUrl} onChange={e=>setForm({...form,avatarUrl:e.target.value})} placeholder="Optional" /></Field><div className="flex justify-end gap-3"><Button onClick={close}>Cancel</Button><Button onClick={submit} className="bg-indigo-500 hover:bg-indigo-400">Validate & Save</Button></div></div></ModalShell>; }
function AddIntegrationModal({ bots, webhooks, settings, close, done }: any) {
  const [form, setForm] = useState({
    botId: bots[0]?.id || '',
    name: '',
    slug: '',
    authorizationToken: '',
    upvoteURL: '',
    iconURL: '',
    payloadUserField: '',
    notificationTarget: '',
    enabled: true,
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [formError, setFormError] = useState('');
  const bot = bots.find((b: BotRecord) => b.id === form.botId);
  const finalUrl = `${settings?.publicBaseUrl || window.location.origin}/webhook/${bot?.slug || 'bot'}/${form.slug || 'integration-slug'}`;

  const updateName = (name: string) => {
    setForm((current) => ({
      ...current,
      name,
      slug: slugEdited ? current.slug : slugifyClient(name),
    }));
  };

  const submit = async () => {
    const missing = [];
    if (!form.botId) missing.push('bot');
    if (!form.name.trim()) missing.push('vote list name');
    if (!form.slug.trim()) missing.push('integration slug');
    if (!form.iconURL.trim()) missing.push('icon URL');

    if (missing.length) {
      setFormError(`Missing required field(s): ${missing.join(', ')}.`);
      return;
    }

    setFormError('');
    try {
      const created = await api<IntegrationRecord & { slugAdjusted?: boolean }>(`/api/bots/${form.botId}/integrations`, { method: 'POST', body: JSON.stringify(form) });
      close();
      await done();
      if (created.slugAdjusted) alert(`Integration saved with the available slug: ${created.slug}`);
    } catch (error: any) {
      setFormError(error.message || 'Unable to save this integration.');
    }
  };

  return <ModalShell title="Add Vote Integration" close={close}>
    <div className="grid gap-4">
      <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/10 p-4 text-sm text-indigo-100">
        <b>Pour Top.gg :</b> crée le webhook sur Top.gg, copie le secret <code className="rounded bg-slate-950/70 px-1">whs_...</code>, colle-le dans <b>Webhook secret / token</b>, puis mets l'URL finale ci-dessous dans Top.gg.
      </div>
      {formError && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{formError}</div>}
      <Field label="Select bot"><Select value={form.botId} onChange={e => setForm({ ...form, botId: e.target.value })}>{bots.map((b: BotRecord) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
      <Field label="Vote list name" help="Exemples : Top.gg, discord.com, StellarBot, Discord Bot List..."><Input required value={form.name} onChange={e => updateName(e.target.value)} placeholder="Top.gg" /></Field>
      <Field label="Integration slug" help="Se remplit automatiquement depuis le nom. Tu peux le modifier si besoin."><Input required value={form.slug} onChange={e => { setSlugEdited(true); setForm({ ...form, slug: slugifyClient(e.target.value) }); }} placeholder="topgg" /></Field>
      <Field label="Webhook secret / token" help="Top.gg v1 : colle le secret whs_. Autres listes : colle le token Authorization. Si vide, VoteHub génère un token legacy."><Input value={form.authorizationToken} onChange={e => setForm({ ...form, authorizationToken: e.target.value })} placeholder="whs_... ou token legacy" /></Field>
      <Field label="Upvote URL"><Input value={form.upvoteURL} onChange={e => setForm({ ...form, upvoteURL: e.target.value })} placeholder={bot?.botId ? `https://top.gg/bot/${bot.botId}/vote` : 'https://top.gg/bot/BOT_ID/vote'} /></Field>
      <Field label="Icon URL" help="Obligatoire. Mets l'icône/logo de la bot list pour l'affichage dans Discord et le dashboard."><Input required value={form.iconURL} onChange={e => setForm({ ...form, iconURL: e.target.value })} placeholder="https://exemple.com/icon.png" /></Field>
      <Field label="Payload user field" help="Optionnel. Top.gg v1 : data.user.platform_id. Legacy souvent : user. VoteHub essaie aussi l'auto-détection."><Input value={form.payloadUserField} onChange={e => setForm({ ...form, payloadUserField: e.target.value })} placeholder="data.user.platform_id ou user" /></Field>
      <Field label="Notification webhook" help="All saved webhooks are available. The bot name is shown when a webhook belongs to another bot."><Select value={form.notificationTarget} onChange={e => setForm({ ...form, notificationTarget: e.target.value })}><option value="">Default webhook for {bot?.name || 'the selected bot'}</option>{webhooks.map((w: WebhookRecord) => <option key={w.id} value={w.id}>{w.name}{w.botId !== form.botId ? ` (${w.botName})` : ''}</option>)}</Select></Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-300"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />Enabled</label>
      <div className="overflow-hidden rounded-2xl bg-slate-950/60 p-4 text-sm text-slate-300">
        Final URL to paste in the bot list:
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <b className="break-all rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-indigo-200">{finalUrl}</b>
          <Button onClick={() => copyToClipboard(finalUrl)} className="shrink-0"><Copy className="h-4 w-4" />Copy</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">En local avec ngrok, vérifie que PUBLIC_BASE_URL contient bien ton URL ngrok.</p>
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={close}>Cancel</Button><Button onClick={submit} className="bg-indigo-500 hover:bg-indigo-400">Save Integration</Button></div>
    </div>
  </ModalShell>;
}

function EditIntegrationModal({ integration, webhooks, settings, close, done }: { integration: IntegrationRecord; webhooks: WebhookRecord[]; settings: DashboardData['settings']; close: () => void; done: () => Promise<void> }) {
  const [form, setForm] = useState({
    name: integration.name || '',
    slug: integration.slug || '',
    authorizationToken: '',
    upvoteURL: integration.upvoteURL || '',
    iconURL: integration.iconURL || '',
    payloadUserField: integration.payloadUserField || '',
    notificationTarget: integration.notificationTarget || '',
    enabled: integration.enabled,
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const finalUrl = `${settings?.publicBaseUrl || window.location.origin}/webhook/${dataSafeSlug(integration.botName)}/${form.slug || 'integration-slug'}`;
  const displayedFinalUrl = integration.finalUrl.replace(/\/[^/]+$/, `/${form.slug || integration.slug}`);

  const submit = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      setFormError('Vote list name and integration slug are required.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      await api(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...form, slug: slugifyClient(form.slug) }),
      });
      await done();
      close();
    } catch (error: any) {
      setFormError(error.message || 'Unable to update this integration.');
    } finally {
      setSaving(false);
    }
  };

  return <ModalShell title={`Edit ${integration.name}`} close={close}>
    <div className="grid gap-4">
      {formError && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{formError}</div>}
      <Field label="Bot"><Input value={integration.botName} disabled /></Field>
      <Field label="Vote list name"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Integration slug" help="Changing this value also changes the final webhook URL."><Input value={form.slug} onChange={e => setForm({ ...form, slug: slugifyClient(e.target.value) })} /></Field>
      <Field label="New webhook secret / token" help="Leave empty to keep the secret currently stored in the database."><Input type="password" value={form.authorizationToken} onChange={e => setForm({ ...form, authorizationToken: e.target.value })} placeholder={integration.authorizationTokenMasked || 'Current token kept'} /></Field>
      <Field label="Upvote URL"><Input value={form.upvoteURL} onChange={e => setForm({ ...form, upvoteURL: e.target.value })} /></Field>
      <Field label="Icon URL"><Input value={form.iconURL} onChange={e => setForm({ ...form, iconURL: e.target.value })} /></Field>
      <Field label="Payload user field"><Input value={form.payloadUserField} onChange={e => setForm({ ...form, payloadUserField: e.target.value })} placeholder="data.user.platform_id or user" /></Field>
      <Field label="Notification webhook"><Select value={form.notificationTarget} onChange={e => setForm({ ...form, notificationTarget: e.target.value })}><option value="">Default webhook for {integration.botName}</option>{webhooks.map(w => <option key={w.id} value={w.id}>{w.name}{w.botId !== integration.botId ? ` (${w.botName})` : ''}</option>)}</Select></Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-300"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />Enabled</label>
      <div className="rounded-2xl bg-slate-950/60 p-4 text-sm text-slate-300">
        Final URL after saving:
        <p className="mt-2 break-all rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-indigo-200">{displayedFinalUrl || finalUrl}</p>
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={close} disabled={saving}>Cancel</Button><Button onClick={submit} disabled={saving} className="bg-indigo-500 hover:bg-indigo-400">{saving ? 'Saving...' : 'Save changes'}</Button></div>
    </div>
  </ModalShell>;
}

function dataSafeSlug(value = '') { return slugifyClient(value) || 'bot'; }

function AddWebhookModal({ bots, close, done }: any) { const [form,setForm]=useState({botId:bots[0]?.id||'',name:'Main vote feed',webhookUrl:'',webhookUsername:'VoteHub Relay',webhookAvatar:'',isDefault:true,enabled:true}); const [formError,setFormError]=useState(''); const submit=async()=>{setFormError(''); try { await api(`/api/bots/${form.botId}/notification-targets`,{method:'POST',body:JSON.stringify(form)}); close(); await done(); } catch(error:any) { setFormError(error.message || 'Unable to save this webhook.'); }}; return <ModalShell title="Add Notification Webhook" close={close}><div className="grid gap-4">{formError&&<div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{formError}</div>}<Field label="Select bot"><Select value={form.botId} onChange={e=>setForm({...form,botId:e.target.value})}>{bots.map((b:BotRecord)=><option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field><Field label="Webhook name"><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Discord webhook URL"><Input type="password" value={form.webhookUrl} onChange={e=>setForm({...form,webhookUrl:e.target.value})}/></Field><Field label="Custom username"><Input value={form.webhookUsername} onChange={e=>setForm({...form,webhookUsername:e.target.value})}/></Field><label className="flex items-center gap-2"><input type="checkbox" checked={form.isDefault} onChange={e=>setForm({...form,isDefault:e.target.checked})}/>Default target for this bot</label><div className="flex justify-end gap-3"><Button onClick={close}>Cancel</Button><Button onClick={submit} className="bg-indigo-500 hover:bg-indigo-400">Save Webhook</Button></div></div></ModalShell>; }
function PayloadModal({ payload, close }: any) { return <ModalShell title="Raw payload" close={close}><pre className="overflow-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-300">{JSON.stringify(payload || {}, null, 2)}</pre><div className="mt-4 flex justify-end"><Button onClick={()=>copyToClipboard(JSON.stringify(payload || {}, null, 2))}>Copy JSON</Button></div></ModalShell>; }
function DeleteModal({ target, close, done }: any) { return <ModalShell title="Confirm deletion" close={close}><div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-100">Delete <b>{target.name}</b>? This action cannot be undone.</div><div className="mt-6 flex justify-end gap-3"><Button onClick={close}>Cancel</Button><Button onClick={done} className="border-red-500/40 bg-red-500/20 text-red-100">Delete</Button></div></ModalShell>; }
