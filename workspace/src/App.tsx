import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Bot, Building2, Check, ChevronDown,
  CreditCard, FileText, Files, Gauge, GitBranch, Layers3, LockKeyhole, LogOut, Menu,
  MoreHorizontal, Network, Send, Settings2, ShieldCheck, Sparkles, Trash2, KeyRound,
  UsersRound, Workflow, X,
} from 'lucide-react';
import { api, errorText, updateCsrfToken, type Organization, type Session } from './api.ts';

type Section = 'dashboard' | 'agents' | 'marketplace' | 'automations' | 'tasks' | 'documents' | 'knowledge' | 'integrations' | 'analytics' | 'team' | 'billing' | 'settings';
type Member = { user_id: string; full_name: string; email: string; role: Organization['role']; created_at: string };
type AgentRun = { id: string; status: 'running' | 'completed' | 'failed'; prompt: string; response: string | null; error_code: string | null; model: string; created_at: string };
type AgentTemplate = { slug: string; version: number; name: string; category: string; description: string; default_model: string; required_provider: string };

const sections: { id: Section; label: string; icon: typeof Gauge; group: string; ready: boolean }[] = [
  { id: 'dashboard', label: 'Übersicht', icon: Gauge, group: 'Arbeitsbereich', ready: true },
  { id: 'agents', label: 'Meine Agenten', icon: Bot, group: 'KI-Team', ready: true },
  { id: 'marketplace', label: 'Agentenkatalog', icon: Layers3, group: 'KI-Team', ready: false },
  { id: 'automations', label: 'Automatisierungen', icon: Workflow, group: 'Abläufe', ready: false },
  { id: 'tasks', label: 'Aufgaben', icon: GitBranch, group: 'Abläufe', ready: false },
  { id: 'documents', label: 'Dokumente', icon: FileText, group: 'Wissen', ready: false },
  { id: 'knowledge', label: 'Unternehmenswissen', icon: Files, group: 'Wissen', ready: false },
  { id: 'integrations', label: 'Verbindungen', icon: Network, group: 'Verwaltung', ready: false },
  { id: 'analytics', label: 'Analysen', icon: Activity, group: 'Verwaltung', ready: false },
  { id: 'team', label: 'Team', icon: UsersRound, group: 'Verwaltung', ready: true },
  { id: 'billing', label: 'Abrechnung', icon: CreditCard, group: 'Verwaltung', ready: false },
  { id: 'settings', label: 'Einstellungen', icon: Settings2, group: 'Verwaltung', ready: true },
];

const sectionFromPath = (): Section => {
  const slug = window.location.pathname.replace(/^\/app\/?/, '').split('/')[0];
  return sections.find((section) => section.id === slug)?.id ?? 'dashboard';
};

function Brand({ small = false }: { small?: boolean }) {
  return <span className={`brand-lockup${small ? ' brand-lockup-small' : ''}`}>
    <span className="brand-symbol" aria-hidden="true"><Sparkles size={18} strokeWidth={2.7} /></span>
    <span className="brand-word">Firmspace<span>AI</span></span>
  </span>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await api<{ authenticated: boolean; csrfToken: string }>(`/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST', body: JSON.stringify(values),
      });
      updateCsrfToken(result.csrfToken);
      const session = await api<Session>('/auth/session');
      updateCsrfToken(session.csrfToken);
      onAuthenticated(session);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell">
    <aside className="auth-story">
      <a href="/" className="story-brand"><Brand /></a>
      <div className="story-copy">
        <span className="eyebrow"><i /> DER GESCHÜTZTE ARBEITSBEREICH</span>
        <h1>Ihr Unternehmen.<br /><em>Ein intelligenter</em><br />Arbeitsraum.</h1>
        <p>Ein sicherer Ort, an dem Ihr Team später Agenten, Abläufe und Unternehmenswissen zusammenführt.</p>
        <div className="story-signal"><span className="signal-orbit"><Sparkles size={22} /></span><div><strong>Kontrolle bleibt bei Ihrem Team</strong><small>Rollen, Freigaben und nachvollziehbare Schritte</small></div></div>
      </div>
      <div className="story-footer"><span>© {new Date().getFullYear()} Firmspace AI</span><span>Unternehmensarbeitsbereich</span></div>
    </aside>
    <section className="auth-panel">
      <div className="auth-top"><span>Firmspace AI Workspace</span><a href="/">Zur Website <ArrowRight size={14} /></a></div>
      <div className="auth-card-wrap">
        <div className="auth-heading"><span className="auth-kicker">{mode === 'login' ? 'WILLKOMMEN ZURÜCK' : 'IHR NEUER ARBEITSBEREICH'}</span><h2>{mode === 'login' ? 'Anmelden' : 'Konto erstellen'}</h2><p>{mode === 'login' ? 'Melden Sie sich an, um Ihren Arbeitsbereich zu öffnen.' : 'Erstellen Sie Ihr Konto und die erste Organisation.'}</p></div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && <>
            <label>Ihr Name<input autoComplete="name" name="fullName" required minLength={1} maxLength={120} placeholder="Vor- und Nachname" /></label>
            <label>Unternehmen<input autoComplete="organization" name="organizationName" required minLength={2} maxLength={160} placeholder="Beispiel GmbH" /></label>
          </>}
          <label>E-Mail-Adresse<input autoComplete="email" name="email" type="email" required maxLength={254} placeholder="name@unternehmen.de" /></label>
          <label>Passwort<input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} name="password" type="password" required minLength={mode === 'register' ? 12 : 1} maxLength={128} placeholder={mode === 'register' ? 'Mindestens 12 Zeichen' : 'Ihr Passwort'} /></label>
          {error && <div className="form-error" role="alert"><ShieldCheck size={16} />{error}</div>}
          <button className="button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Einen Moment …' : mode === 'login' ? 'Sicher anmelden' : 'Konto und Unternehmen erstellen'}<ArrowRight size={16} /></button>
        </form>
        <div className="auth-switch">{mode === 'login' ? 'Noch kein Konto?' : 'Sie haben bereits ein Konto?'} <button type="button" onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}>{mode === 'login' ? 'Konto erstellen' : 'Anmelden'}</button></div>
        <div className="auth-security"><LockKeyhole size={14} /><span>Geschützte Verbindung · Organisationsdaten bleiben getrennt</span></div>
      </div>
      <div className="auth-legal"><span>Datenschutz</span><span>·</span><span>Impressum</span><span className="auth-build">Früher Zugang · Funktionen werden schrittweise aktiviert</span></div>
    </section>
  </main>;
}

function Workspace({ initialSession, onLogout }: { initialSession: Session; onLogout: (session: Session) => void }) {
  const [session, setSession] = useState(initialSession);
  const [section, setSection] = useState(sectionFromPath);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [orgMenu, setOrgMenu] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [auditEvents, setAuditEvents] = useState<{ id: string; action: string; full_name: string | null; created_at: string }[]>([]);
  const [organizationName, setOrganizationName] = useState(session.activeOrganization?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  const user = session.user!;
  const organizations = session.organizations ?? [];
  const activeOrganization = session.activeOrganization ?? null;
  const role = activeOrganization?.role ?? 'member';
  const canManage = role === 'owner' || role === 'admin';
  const initials = user.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

  const refreshSession = useCallback(async () => {
    const next = await api<Session>('/auth/session');
    updateCsrfToken(next.csrfToken);
    if (!next.authenticated) { onLogout(next); return; }
    setSession(next);
    setOrganizationName(next.activeOrganization?.name ?? '');
  }, [onLogout]);

  useEffect(() => {
    const handlePopState = () => setSection(sectionFromPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (section !== 'team' && section !== 'settings') return;
    let alive = true;
    api<{ members: Member[] }>('/organizations/current/members').then((result) => { if (alive) setMembers(result.members); }).catch((cause: unknown) => { if (alive) setError(errorText(cause)); });
    if (section === 'settings') {
      api<{ events: typeof auditEvents }>('/organizations/current/audit').then((result) => { if (alive) setAuditEvents(result.events); }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [section, session.activeOrganization?.id]);

  function navigate(next: Section) {
    const target = next === 'dashboard' ? '/app/' : `/app/${next}`;
    window.history.pushState({}, '', target);
    setSection(next);
    setMobileMenu(false);
    setError('');
    setNotice('');
  }

  async function switchOrganization(organization: Organization) {
    setBusy(true);
    setError('');
    try {
      await api('/organizations/select', { method: 'POST', body: JSON.stringify({ organizationId: organization.id }) });
      await refreshSession();
      setOrgMenu(false);
      setNotice(`Arbeitsbereich „${organization.name}“ geöffnet.`);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api('/organizations', { method: 'POST', body: JSON.stringify({ name: form.get('name') }) });
      await refreshSession();
      setCreateOrgOpen(false);
      setNotice('Ihre Organisation wurde angelegt.');
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingName(true);
    setError('');
    try {
      await api('/organizations/current', { method: 'PATCH', body: JSON.stringify({ name: organizationName }) });
      await refreshSession();
      setNotice('Die Organisationseinstellungen wurden gespeichert.');
    } catch (cause) { setError(errorText(cause)); }
    finally { setSavingName(false); }
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: '{}' });
      const anonymous = await api<Session>('/auth/session');
      updateCsrfToken(anonymous.csrfToken);
      onLogout(anonymous);
    } catch (cause) { setError(errorText(cause)); }
  }

  const title = sections.find((item) => item.id === section)?.label ?? 'Übersicht';
  const grouped = useMemo(() => [...new Set(sections.map((item) => item.group))].map((group) => ({ group, items: sections.filter((item) => item.group === group) })), []);

  return <div className={`workspace-app${collapsed ? ' sidebar-collapsed' : ''}${mobileMenu ? ' mobile-menu-open' : ''}`}>
    {mobileMenu && <button className="mobile-scrim" aria-label="Menü schließen" onClick={() => setMobileMenu(false)} />}
    <aside className="workspace-sidebar">
      <div className="sidebar-brand"><a href="/app/" onClick={(event) => { event.preventDefault(); navigate('dashboard'); }}><Brand small={collapsed} /></a><button className="icon-button collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Menü erweitern' : 'Menü einklappen'}><ArrowLeft size={16} /></button></div>
      <button className="org-select" onClick={() => setOrgMenu(!orgMenu)} aria-expanded={orgMenu} title={activeOrganization?.name ?? 'Organisation auswählen'}>
        <span className="org-glyph"><Building2 size={16} /></span><span className="org-copy"><small>AKTIVE ORGANISATION</small><strong>{activeOrganization?.name ?? 'Organisation wählen'}</strong></span><ChevronDown size={15} />
      </button>
      {orgMenu && <div className="org-menu">{organizations.map((organization) => <button key={organization.id} onClick={() => void switchOrganization(organization)} disabled={busy} className={organization.id === activeOrganization?.id ? 'selected' : ''}><span className="org-menu-icon"><Building2 size={15} /></span><span><strong>{organization.name}</strong><small>{roleLabel(organization.role)}</small></span>{organization.id === activeOrganization?.id && <Check size={15} />}</button>)}<button className="new-organization" onClick={() => { setCreateOrgOpen(true); setOrgMenu(false); }}><span className="org-menu-icon add-icon">+</span><span><strong>Organisation hinzufügen</strong><small>Neuen Arbeitsbereich erstellen</small></span></button></div>}
      <nav className="side-navigation" aria-label="Arbeitsbereich">
        {grouped.map(({ group, items }) => <div className="nav-group" key={group}><span className="nav-group-label">{group}</span>{items.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={`nav-item${section === item.id ? ' active' : ''}`} onClick={() => navigate(item.id)} title={collapsed ? item.label : undefined} aria-current={section === item.id ? 'page' : undefined}>
            <Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{!item.ready && <i className="nav-soon" title="Noch nicht verfügbar" />}
          </button>;
        })}</div>)}
      </nav>
      <div className="sidebar-bottom"><div className="privacy-note"><span className="privacy-icon"><ShieldCheck size={15} /></span><span><strong>Geschützter Bereich</strong><small>Organisationszugriff wird geprüft</small></span></div><button className="profile-button" onClick={() => navigate('settings')}><span className="user-avatar">{initials || 'U'}</span><span className="profile-copy"><strong>{user.fullName}</strong><small>{user.email}</small></span><MoreHorizontal size={17} /></button></div>
    </aside>

    <div className="workspace-main">
      <header className="workspace-topbar"><div className="topbar-left"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Menü öffnen"><Menu size={18} /></button><span className="breadcrumb">Arbeitsbereich</span><span className="breadcrumb-divider">/</span><span className="breadcrumb-current">{title}</span></div><div className="topbar-actions"><span className="secure-indicator"><i /> Geschützt</span><button className="user-avatar top-avatar" onClick={() => navigate('settings')} aria-label="Kontoeinstellungen">{initials || 'U'}</button></div></header>
      <main className="content-area">
        {(error || notice) && <div className={`notice-banner${error ? ' notice-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}<button aria-label="Meldung schließen" onClick={() => { setError(''); setNotice(''); }}><X size={15} /></button></div>}
        {section === 'dashboard' && <Dashboard user={user} organization={activeOrganization} onNavigate={navigate} />}
        {section === 'agents' && <AssistantArea key={activeOrganization?.id} canManage={canManage} onSettings={() => navigate('settings')} />}
        {section === 'team' && <TeamPage organization={activeOrganization} members={members} canManage={canManage} />}
        {section === 'settings' && <SettingsPage user={user} organization={activeOrganization} name={organizationName} setName={setOrganizationName} canManage={canManage} onSave={saveOrganization} saving={savingName} auditEvents={auditEvents} onLogout={() => void logout()} />}
        {section === 'settings' && <OpenAiSettings key={activeOrganization?.id} canManage={canManage} />}
        {section !== 'dashboard' && section !== 'agents' && section !== 'team' && section !== 'settings' && <UnavailablePage section={section} onBack={() => navigate('dashboard')} />}
      </main>
      <footer className="workspace-footer"><span><Brand small /> Arbeitsbereich</span><span>Funktionen werden nach Freigabe schrittweise aktiviert.</span></footer>
    </div>

    {createOrgOpen && <Modal title="Organisation hinzufügen" onClose={() => setCreateOrgOpen(false)}><p className="modal-intro">Erstellen Sie einen separaten Arbeitsbereich für ein weiteres Unternehmen.</p><form className="modal-form" onSubmit={createOrganization}><label>Name der Organisation<input autoFocus name="name" minLength={2} maxLength={160} required placeholder="Beispiel GmbH" /></label>{error && <p className="modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setCreateOrgOpen(false)}>Abbrechen</button><button type="submit" className="button-primary" disabled={busy}>{busy ? 'Wird erstellt …' : 'Organisation erstellen'}<ArrowRight size={15} /></button></div></form></Modal>}
  </div>;
}

function Dashboard({ user, organization, onNavigate }: { user: NonNullable<Session['user']>; organization: Organization | null; onNavigate: (section: Section) => void }) {
  const firstName = user.fullName.trim().split(/\s+/)[0] || user.fullName;
  return <div className="dashboard-page">
    <div className="page-heading"><div><span className="page-eyebrow"><span className="live-dot" /> IHR FIRMSPACE-ARBEITSBEREICH</span><h1>Guten Tag, {firstName}.</h1><p>{organization ? `${organization.name} · ${roleLabel(organization.role)}` : 'Für Ihr Konto ist noch keine Organisation hinterlegt.'}</p></div><span className="date-pill">{new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(new Date())}</span></div>
    <section className="welcome-card"><div className="welcome-orb orb-a" /><div className="welcome-orb orb-b" /><div className="welcome-content"><span className="welcome-mark"><Sparkles size={20} /></span><div className="welcome-copy"><span className="welcome-kicker">IHR ARBEITSBEREICH IST BEREIT</span><h2>Ein guter Anfang beginnt<br />mit einem klaren Überblick.</h2><p>Hier entsteht Ihr geschützter Bereich für Team, Agenten und Unternehmensabläufe. Noch nicht verfügbare Funktionen bleiben ausdrücklich gekennzeichnet.</p></div><div className="welcome-status"><span className="status-ring"><Check size={17} /></span><span><strong>Konto eingerichtet</strong><small>Organisation und Zugriff sind aktiv</small></span></div></div><div className="welcome-bottom"><span><ShieldCheck size={15} /> Organisationsdaten werden getrennt verwaltet.</span><button onClick={() => onNavigate('settings')}>Organisation prüfen <ArrowRight size={15} /></button></div></section>
    <div className="section-title-row"><div><span className="section-kicker">ÜBERBLICK</span><h2>Ihr Arbeitsbereich</h2></div><span className="live-data-label"><i /> Echte Kontodaten</span></div>
    <section className="workspace-overview-grid">
      <article className="overview-card account-card"><div className="overview-card-heading"><span className="overview-icon icon-lime"><Building2 size={17} /></span><span className="card-label">ORGANISATION</span><button onClick={() => onNavigate('settings')} aria-label="Organisationseinstellungen öffnen"><ArrowRight size={16} /></button></div><strong className="overview-primary">{organization?.name ?? 'Keine Organisation'}</strong><span className="overview-caption">{organization ? `${roleLabel(organization.role)} · Zugriff aktiv` : 'Bitte kontaktieren Sie die Plattformadministration.'}</span><div className="overview-separator" /><div className="overview-meta"><span>Organisationsrolle</span><b>{organization ? roleLabel(organization.role) : '—'}</b></div><div className="overview-meta"><span>Agentenläufe</span><b className="not-recorded">Im Assistenten verfügbar</b></div></article>
      <article className="overview-card workforce-card"><div className="overview-card-heading"><span className="overview-icon icon-blue"><Bot size={17} /></span><span className="card-label">KI-TEAM</span><span className="status-chip status-planned">ERSTER AGENT AKTIV</span></div><div className="empty-illustration"><div className="empty-orbit orbit-one" /><div className="empty-orbit orbit-two" /><span><Sparkles size={24} /></span><i className="empty-node node-one"><Bot size={13} /></i><i className="empty-node node-two"><Workflow size={12} /></i></div><h3>Arbeitsassistent bereit</h3><p>Der sichere Textassistent ist verfügbar. Hinterlegen Sie zuerst Ihren OpenAI-Zugang in den Einstellungen, um ihn auszuführen.</p><button className="text-action" onClick={() => onNavigate('agents')}>Assistent öffnen <ArrowRight size={15} /></button></article>
      <article className="overview-card activity-card-main"><div className="overview-card-heading"><span className="overview-icon icon-violet"><Activity size={17} /></span><span className="card-label">AKTIVITÄT</span><span className="status-chip status-empty">KEINE AUSFÜHRUNGEN</span></div><div className="activity-empty"><span className="empty-line line-one" /><span className="empty-line line-two" /><span className="empty-line line-three" /><span className="empty-center"><Activity size={20} /></span></div><h3>Hier erscheint echte Aktivität</h3><p>Dieser Bereich zeigt später nachvollziehbare Ereignisse aus Aufgaben, Freigaben und Agentenläufen.</p><button className="text-action" onClick={() => onNavigate('tasks')}>Aufgabenbereich ansehen <ArrowRight size={15} /></button></article>
    </section>
    <section className="setup-card"><div className="setup-icon"><LockKeyhole size={18} /></div><div><span className="section-kicker">SICHERHEIT VOR AUTOMATISIERUNG</span><h3>Der erste Schritt ist bereit.</h3><p>Kontoverwaltung und Organisationszugriff sind aktiv. Verbindungen, Agenten und Workflows werden erst angeboten, wenn ihre serverseitigen Berechtigungen und Schutzmechanismen vorhanden sind.</p></div><button className="button-secondary" onClick={() => onNavigate('settings')}>Einstellungen öffnen <ArrowRight size={15} /></button></section>
  </div>;
}

function TeamPage({ organization, members, canManage }: { organization: Organization | null; members: Member[]; canManage: boolean }) {
  return <div className="subpage"><div className="page-heading"><div><span className="page-eyebrow"><span className="live-dot" /> ORGANISATION</span><h1>Team</h1><p>Mitglieder und ihre Rollen in {organization?.name ?? 'Ihrer Organisation'}.</p></div></div><section className="panel-card"><div className="panel-title"><div><h2>Mitglieder</h2><p>Diese Liste stammt aus der aktuellen Organisation.</p></div><span className="panel-count">{members.length} {members.length === 1 ? 'Mitglied' : 'Mitglieder'}</span></div><div className="member-table"><div className="member-table-head"><span>PERSON</span><span>ROLLE</span><span>SEIT</span></div>{members.map((member) => <div className="member-row" key={member.user_id}><span className="member-person"><i className="member-avatar">{member.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}</i><span><b>{member.full_name}</b><small>{member.email}</small></span></span><span><i className={`role-pill role-${member.role}`}>{roleLabel(member.role)}</i></span><span className="member-date">{new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(member.created_at))}</span></div>)}</div><div className="panel-footnote"><ShieldCheck size={14} /> Mitglieder werden nur innerhalb der Organisation angezeigt. {canManage ? 'Einladungen folgen, sobald der sichere E-Mail-Versand eingerichtet ist.' : 'Ihre Rolle erlaubt die Ansicht der Mitglieder.'}</div></section></div>;
}

function SettingsPage({ user, organization, name, setName, canManage, onSave, saving, auditEvents, onLogout }: {
  user: NonNullable<Session['user']>; organization: Organization | null; name: string; setName: (value: string) => void; canManage: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void; saving: boolean;
  auditEvents: { id: string; action: string; full_name: string | null; created_at: string }[]; onLogout: () => void;
}) {
  return <div className="subpage"><div className="page-heading"><div><span className="page-eyebrow"><span className="live-dot" /> KONTOVERWALTUNG</span><h1>Einstellungen</h1><p>Kontoinformationen, Organisation und Sicherheitsereignisse.</p></div></div><div className="settings-grid"><section className="panel-card settings-panel"><div className="panel-title"><div><h2>Persönliches Konto</h2><p>Diese Angaben gehören zu Ihrem Benutzerkonto.</p></div><span className="overview-icon icon-lime"><UsersRound size={17} /></span></div><div className="settings-field"><span>Name</span><strong>{user.fullName}</strong></div><div className="settings-field"><span>E-Mail-Adresse</span><strong>{user.email}</strong></div><div className="settings-field"><span>Zugriff</span><strong>Authentifizierte Sitzung · HttpOnly-Cookie</strong></div><button className="button-secondary logout-button" onClick={onLogout}><LogOut size={15} /> Sicher abmelden</button></section><section className="panel-card settings-panel"><div className="panel-title"><div><h2>Organisation</h2><p>{organization?.name ?? 'Keine aktive Organisation'}</p></div><span className="overview-icon icon-blue"><Building2 size={17} /></span></div><form onSubmit={onSave} className="settings-form"><label>Name des Unternehmens<input value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage || saving} minLength={2} maxLength={160} required /></label><label>Ihre Rolle<input value={organization ? roleLabel(organization.role) : '—'} readOnly /></label>{canManage && <button className="button-primary" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Änderungen speichern'}<ArrowRight size={15} /></button>}</form><div className="panel-footnote"><ShieldCheck size={14} /> Organisationsänderungen werden serverseitig autorisiert und protokolliert.</div></section></div><section className="panel-card audit-panel"><div className="panel-title"><div><h2>Sicherheitsprotokoll</h2><p>Die letzten erfassten Konto- und Organisationsereignisse.</p></div><span className="overview-icon icon-violet"><Activity size={17} /></span></div>{auditEvents.length ? <div className="audit-list">{auditEvents.map((event) => <div className="audit-row" key={event.id}><span className="audit-icon"><Check size={14} /></span><span><b>{auditLabel(event.action)}</b><small>{event.full_name ?? 'System'} · {new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.created_at))}</small></span></div>)}</div> : <div className="empty-inline">Für diese Organisation sind noch keine Protokolleinträge vorhanden.</div>}</section></div>;
}

function OpenAiSettings({ canManage }: { canManage: boolean }) {
  const [configured, setConfigured] = useState(false);
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    api<{ configured: boolean; keyHint: string | null }>('/integrations/openai')
      .then((result) => { if (alive) { setConfigured(result.configured); setKeyHint(result.keyHint); } })
      .catch(() => { if (alive) setMessage('Der Verbindungsstatus konnte nicht geladen werden.'); });
    return () => { alive = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const result = await api<{ configured: boolean; keyHint: string | null }>('/integrations/openai', { method: 'PUT', body: JSON.stringify({ apiKey: apiKey.trim() }) });
      setConfigured(result.configured); setKeyHint(result.keyHint); setApiKey('');
      setMessage('Die Verbindung wurde geprüft und sicher gespeichert.');
    } catch (cause) { setMessage(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setMessage('');
    try { await api('/integrations/openai', { method: 'DELETE' }); setConfigured(false); setKeyHint(null); setMessage('Die Verbindung wurde entfernt.'); }
    catch (cause) { setMessage(errorText(cause)); }
    finally { setBusy(false); }
  }

  return <section className="panel-card provider-panel"><div className="panel-title"><div><h2>OpenAI-Verbindung</h2><p>Organisationsschlüssel für den KI-Assistenten.</p></div><span className={`status-chip ${configured ? 'status-connected' : 'status-planned'}`}>{configured ? 'VERBUNDEN' : 'NICHT VERBUNDEN'}</span></div>{configured && <div className="provider-current"><span><KeyRound size={15} /> Gespeicherter Schlüssel</span><strong>{keyHint}</strong></div>}{canManage ? <form className="provider-form" onSubmit={(event) => void save(event)}><label>{configured ? 'Schlüssel ersetzen' : 'OpenAI-Projektschlüssel'}<input type="password" autoComplete="new-password" spellCheck={false} minLength={20} maxLength={512} pattern="sk-[A-Za-z0-9_-]+" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-proj-…" required /></label><button className="button-primary" type="submit" disabled={busy || !apiKey.trim()}>{busy ? 'Wird geprüft …' : 'Sicher verbinden'}<ArrowRight size={15} /></button></form> : <p className="panel-footnote">Nur Inhaber und Administratoren können den KI-Schlüssel ändern.</p>}{configured && canManage && <button className="provider-remove" onClick={() => void remove()} disabled={busy}><Trash2 size={14} /> Verbindung entfernen</button>}<p className="panel-footnote"><ShieldCheck size={14} /> Der Schlüssel wird serverseitig verschlüsselt und nie wieder im Browser angezeigt. Prompts und Antworten werden in Ihrer Organisation gespeichert und an OpenAI gesendet.</p>{message && <div className="provider-message" role="status">{message}</div>}</section>;
}

function AssistantArea({ canManage, onSettings }: { canManage: boolean; onSettings: () => void }) {
  const [configured, setConfigured] = useState(false);
  const [agent, setAgent] = useState<AgentTemplate | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [connection, history, catalog] = await Promise.all([
      api<{ configured: boolean }>('/integrations/openai'),
      api<{ runs: AgentRun[] }>('/agents/assistant/runs'),
      api<{ agents: AgentTemplate[] }>('/agents'),
    ]);
    setConfigured(connection.configured);
    setRuns(history.runs);
    setAgent(catalog.agents.find((item) => item.slug === 'workspace-assistant') ?? null);
  }, []);

  useEffect(() => { void refresh().catch((cause: unknown) => setError(errorText(cause))); }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const submittedPrompt = prompt;
    try {
      const result = await api<{ run: { id: string; status: 'completed'; response: string; model: string } }>('/agents/assistant/run', { method: 'POST', body: JSON.stringify({ prompt: submittedPrompt }) });
      setRuns((current) => [{ id: result.run.id, status: 'completed', prompt: submittedPrompt, response: result.run.response, error_code: null, model: result.run.model, created_at: new Date().toISOString() }, ...current]);
      setPrompt('');
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  return <div className="subpage assistant-page"><div className="page-heading"><div><span className="page-eyebrow"><span className="live-dot" /> KI-TEAM · OPENAI</span><h1>{agent?.name ?? 'Agentenkatalog wird geladen …'}</h1><p>{agent?.description ?? 'Der Agent wird geladen.'}</p></div><span className="model-badge">{agent?.default_model ?? '—'}</span></div>{!configured && <section className="provider-needed"><KeyRound size={19} /><div><strong>OpenAI ist noch nicht verbunden</strong><p>{canManage ? 'Hinterlegen Sie einen Projektschlüssel in den Einstellungen. Ohne Verbindung wird keine Antwort simuliert.' : 'Ein Inhaber oder Administrator muss den Projektschlüssel in den Einstellungen hinterlegen.'}</p></div>{canManage && <button className="button-secondary" onClick={onSettings}>Einstellungen öffnen <ArrowRight size={14} /></button>}</section>}<section className="assistant-compose panel-card"><label htmlFor="assistant-prompt">Wobei kann ich helfen?</label><p>Der Assistent hat keinen Zugriff auf E-Mail, CRM, Dateien oder andere Unternehmenssysteme.</p><form onSubmit={(event) => void submit(event)}><textarea id="assistant-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={6000} placeholder="Beschreiben Sie die Aufgabe …" disabled={!configured || busy || !agent} required /><div className="assistant-compose-footer"><span>{prompt.length} / 6.000 Zeichen · Antwort auf Deutsch</span><button className="button-primary" type="submit" disabled={!configured || busy || !agent || !prompt.trim()}>{busy ? 'Wird ausgeführt …' : 'Anfrage senden'}<Send size={15} /></button></div></form><div className="panel-footnote"><ShieldCheck size={14} /> Anfragen werden an OpenAI gesendet, in Ihrer Organisation gespeichert und lösen keine externen Aktionen aus.</div></section>{error && <div className="form-error" role="alert">{error}</div>}<section className="agent-history"><div className="panel-title"><div><h2>Ihre letzten Anfragen</h2><p>Nur Ihre eigenen Ausführungen in dieser Organisation.</p></div><span className="panel-count">{runs.length}</span></div>{runs.length === 0 ? <div className="panel-card empty-inline">Nach Ihrer ersten Anfrage erscheinen hier Eingabe, Antwort und Status.</div> : runs.map((run) => <article className="panel-card agent-run-card" key={run.id}><div className="agent-run-meta"><span className={`status-chip ${run.status === 'completed' ? 'status-connected' : run.status === 'running' ? 'status-planned' : 'status-empty'}`}>{run.status === 'completed' ? 'ABGESCHLOSSEN' : run.status === 'running' ? 'LÄUFT' : 'FEHLGESCHLAGEN'}</span><time>{new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.created_at))}</time></div><h3>{run.prompt}</h3>{run.response && <p className="agent-answer">{run.response}</p>}{run.error_code && <p className="agent-error">Der Aufruf ist fehlgeschlagen ({run.error_code}). Bitte prüfen Sie die Verbindung und versuchen Sie es erneut.</p>}</article>)}</section></div>;
}

function UnavailablePage({ section, onBack }: { section: Section; onBack: () => void }) {
  const item = sections.find((entry) => entry.id === section)!;
  const Icon = item.icon;
  return <div className="unavailable-page"><div className="unavailable-card"><div className="unavailable-art"><div /><div /><span><Icon size={26} /></span></div><span className="page-eyebrow"><span className="live-dot" /> SCHRITTWEISE EINFÜHRUNG</span><h1>{item.label}</h1><p>Dieser Bereich ist in Firmspace AI vorgesehen, aber noch nicht freigeschaltet. Wir zeigen hier keine Demo-Daten und bieten keine Aktionen an, die noch nicht mit einem echten Backend verbunden sind.</p><div className="availability-note"><span className="availability-dot" /><span><strong>Aktueller Status</strong><small>Die Funktion befindet sich in Umsetzung.</small></span></div><button className="button-secondary" onClick={onBack}><ArrowLeft size={15} /> Zur Übersicht</button></div></div>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="section-kicker">ARBEITSBEREICH</span><h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Dialog schließen"><X size={17} /></button></div>{children}</section></div>;
}

function roleLabel(role: Organization['role']): string {
  return ({ owner: 'Inhaber', admin: 'Administrator', member: 'Mitglied', viewer: 'Betrachter' })[role];
}

function auditLabel(action: string): string {
  return ({
    'account.registered': 'Konto erstellt',
    'account.login': 'Anmeldung',
    'account.logout': 'Abmeldung',
    'organization.created': 'Organisation erstellt',
    'organization.switched': 'Organisation gewechselt',
    'organization.updated': 'Organisation geändert',
    'integration.openai.connected': 'OpenAI verbunden',
    'integration.openai.removed': 'OpenAI-Zugang entfernt',
    'agent.run.completed': 'Agentenausführung abgeschlossen',
    'agent.run.failed': 'Agentenausführung fehlgeschlagen',
  } as Record<string, string>)[action] ?? 'Sicherheitsereignis';
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const onLogout = useCallback((next: Session) => setSession(next), []);

  useEffect(() => {
    let alive = true;
    api<Session>('/auth/session').then((result) => {
      if (!alive) return;
      updateCsrfToken(result.csrfToken);
      setSession(result);
    }).catch(() => {
      if (alive) setSession({ authenticated: false, csrfToken: '' });
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const refreshAfterExpiry = () => {
      api<Session>('/auth/session').then((next) => {
        updateCsrfToken(next.csrfToken);
        setSession(next);
      }).catch(() => setSession({ authenticated: false, csrfToken: '' }));
    };
    window.addEventListener('firmspace-auth-expired', refreshAfterExpiry);
    return () => window.removeEventListener('firmspace-auth-expired', refreshAfterExpiry);
  }, []);

  if (loading) return <div className="app-loading"><span className="loading-mark"><Sparkles size={20} /></span><span>Arbeitsbereich wird geschützt geöffnet …</span></div>;
  if (!session?.authenticated) return <AuthScreen onAuthenticated={setSession} />;
  return <Workspace key={session.user?.id} initialSession={session} onLogout={onLogout} />;
}
