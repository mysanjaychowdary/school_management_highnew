import React, { useState, useEffect } from 'react';
import { Save, MessageSquare, GraduationCap, FileCode2, Smartphone, Radio } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const EVENT_DEFS = [
  {
    key: 'absent',
    label: 'Attendance — Absent Alert',
    placeholders: ['{{student_name}}', '{{class_name}}', '{{date}}'],
    example: `[
  {
    "type": "body",
    "parameters": [
      {"type": "text", "text": "{{student_name}}"},
      {"type": "text", "text": "{{class_name}}"},
      {"type": "text", "text": "{{date}}"}
    ]
  }
]`,
  },
  {
    key: 'fee_paid',
    label: 'Fee — Payment Receipt',
    placeholders: ['{{amount}}', '{{fee_name}}', '{{student_name}}', '{{invoice_url}}'],
    example: `[
  {
    "type": "header",
    "parameters": [
      {"type": "document", "document": {"link": "{{invoice_url}}"}}
    ]
  },
  {
    "type": "body",
    "parameters": [
      {"type": "text", "text": "{{amount}}"},
      {"type": "text", "text": "{{fee_name}}"},
      {"type": "text", "text": "{{student_name}}"}
    ]
  }
]`,
  },
  {
    key: 'event',
    label: 'Calendar — Event Notification',
    placeholders: ['{{event_name}}', '{{event_date}}'],
    example: `[
  {
    "type": "body",
    "parameters": [
      {"type": "text", "text": "{{event_name}}"},
      {"type": "text", "text": "{{event_date}}"}
    ]
  }
]`,
  },
  {
    key: 'marks',
    label: 'Marks — Exam Result',
    placeholders: ['{{student_name}}', '{{exam_name}}', '{{class_name}}', '{{section}}', '{{marks_summary}}'],
    example: `[
  {
    "type": "body",
    "parameters": [
      {"type": "text", "text": "{{student_name}}"},
      {"type": "text", "text": "{{exam_name}}"},
      {"type": "text", "text": "{{class_name}}-{{section}}"},
      {"type": "text", "text": "{{marks_summary}}"}
    ]
  }
]`,
  },
  {
    key: 'fee_reminder',
    label: 'Fee — Payment Reminder',
    placeholders: ['{{student_name}}', '{{fee_name}}', '{{amount}}', '{{due_date}}'],
    smsOnly: true,
  },
];

const CHANNEL_OPTIONS = [
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'both', label: 'Both' },
];

const EMPTY_SMS_TPL = { message: '', tpid: '', enabled: true };

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [savingWA, setSavingWA] = useState(false);
  const [savingSMS, setSavingSMS] = useState(false);
  const [savingSchool, setSavingSchool] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  const [wa, setWa] = useState({ phoneNumberId: '', accessToken: '' });
  const [sms, setSms] = useState({ userid: '', password: '', sender: '', peid: '' });
  const [channel, setChannel] = useState('whatsapp');
  const [school, setSchool] = useState({ schoolName: '', schoolAddress: '', logoUrl: '' });
  const [templates, setTemplates] = useState({
    absent: { name: '', componentsJson: '', enabled: true },
    fee_paid: { name: '', componentsJson: '', enabled: true },
    event: { name: '', componentsJson: '', enabled: true },
    marks: { name: '', componentsJson: '', enabled: true },
  });
  const [smsTemplates, setSmsTemplates] = useState({
    absent: { ...EMPTY_SMS_TPL },
    fee_paid: { ...EMPTY_SMS_TPL },
    event: { ...EMPTY_SMS_TPL },
    marks: { ...EMPTY_SMS_TPL },
    fee_reminder: { ...EMPTY_SMS_TPL },
  });

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [waR, smsR, schR, tplR, smsTplR, chR] = await Promise.all([
        api.getWhatsAppSettings(),
        api.getSMSSettings(),
        api.getSchoolSettings(),
        api.getWhatsAppTemplates(),
        api.getSMSTemplates(),
        api.getNotificationChannel(),
      ]);
      setWa(waR.data);
      setSms(smsR.data);
      setSchool({ schoolName: schR.data.schoolName || '', schoolAddress: schR.data.schoolAddress || '', logoUrl: schR.data.logoUrl || '' });
      setTemplates({
        absent: { enabled: true, ...(tplR.data.absent || {}) },
        fee_paid: { enabled: true, ...(tplR.data.fee_paid || {}) },
        event: { enabled: true, ...(tplR.data.event || {}) },
        marks: { enabled: true, ...(tplR.data.marks || {}) },
      });
      setSmsTemplates({
        absent: { ...EMPTY_SMS_TPL, ...(smsTplR.data.absent || {}) },
        fee_paid: { ...EMPTY_SMS_TPL, ...(smsTplR.data.fee_paid || {}) },
        event: { ...EMPTY_SMS_TPL, ...(smsTplR.data.event || {}) },
        marks: { ...EMPTY_SMS_TPL, ...(smsTplR.data.marks || {}) },
        fee_reminder: { ...EMPTY_SMS_TPL, ...(smsTplR.data.fee_reminder || {}) },
      });
      setChannel(chR.data.channel || 'whatsapp');
    } catch (e) { toast.error('Failed to load settings'); }
    finally { setLoading(false); }
  };

  const handleSaveWA = async (e) => {
    e.preventDefault();
    try { setSavingWA(true); await api.updateWhatsAppSettings(wa); toast.success('WhatsApp settings saved'); } catch (e) { toast.error('Failed'); } finally { setSavingWA(false); }
  };
  const handleSaveSMS = async (e) => {
    e.preventDefault();
    try { setSavingSMS(true); await api.updateSMSSettings(sms); toast.success('SMS settings saved'); } catch (e) { toast.error('Failed'); } finally { setSavingSMS(false); }
  };
  const handleSaveChannel = async () => {
    try { setSavingChannel(true); await api.updateNotificationChannel({ channel }); toast.success('Notification channel saved'); } catch (e) { toast.error('Failed'); } finally { setSavingChannel(false); }
  };
  const handleSaveSchool = async (e) => {
    e.preventDefault();
    try { setSavingSchool(true); await api.updateSchoolSettings(school); toast.success('School settings saved'); } catch (e) { toast.error('Failed'); } finally { setSavingSchool(false); }
  };
  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { const r = await api.uploadFile(file); setSchool({ ...school, logoUrl: r.data.url }); toast.success('Logo uploaded'); } catch (e) { toast.error('Upload failed'); }
  };

  const handleSaveTemplates = async (e) => {
    e.preventDefault();
    // Pre-validate JSON locally for fast feedback
    for (const def of EVENT_DEFS) {
      if (def.smsOnly) continue;
      const raw = (templates[def.key]?.componentsJson || '').trim();
      if (raw) {
        try { JSON.parse(raw); }
        catch (err) { toast.error(`Invalid JSON in "${def.label}": ${err.message}`); return; }
      }
    }
    try {
      setSavingTpl(true);
      await Promise.all([
        api.updateWhatsAppTemplates(templates),
        api.updateSMSTemplates(smsTemplates),
      ]);
      toast.success('Templates saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save templates');
    } finally { setSavingTpl(false); }
  };

  const resetTemplate = (key) => {
    setTemplates((t) => ({ ...t, [key]: { name: '', componentsJson: '', enabled: t[key]?.enabled ?? true } }));
  };

  const loadExample = (def) => {
    setTemplates((t) => ({ ...t, [def.key]: { ...(t[def.key] || {}), name: t[def.key]?.name || '', componentsJson: def.example, enabled: t[def.key]?.enabled ?? true } }));
  };

  const toggleEnabled = (key) => {
    setTemplates((t) => ({ ...t, [key]: { ...(t[key] || {}), enabled: !(t[key]?.enabled ?? true) } }));
  };

  const toggleSmsEnabled = (key) => {
    setSmsTemplates((t) => ({ ...t, [key]: { ...(t[key] || EMPTY_SMS_TPL), enabled: !(t[key]?.enabled ?? true) } }));
  };

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div></div>;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Settings</h1>
        <p className="text-sm sm:text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>Configure school, SMS, WhatsApp API, and database</p>
      </div>

      {/* Global notification channel */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center flex-shrink-0"><Radio className="w-6 h-6 text-white" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Notification Channel</h2>
              <p className="text-sm text-slate-600">Choose how alerts, receipts, and reminders are sent to parents</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1">
              {CHANNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  data-testid={`channel-option-${opt.key}`}
                  onClick={() => setChannel(opt.key)}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${channel === opt.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button data-testid="save-channel-btn" onClick={handleSaveChannel} disabled={savingChannel} className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl px-6 active:scale-95 transition-transform">
              <Save className="w-4 h-4 mr-2" />{savingChannel ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="school" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl inline-flex flex-wrap gap-1">
          <TabsTrigger value="school" data-testid="tab-school" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 sm:px-6 py-2 font-bold text-sm"><GraduationCap className="w-4 h-4 mr-2" />School</TabsTrigger>
          <TabsTrigger value="whatsapp" data-testid="tab-whatsapp" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 sm:px-6 py-2 font-bold text-sm"><MessageSquare className="w-4 h-4 mr-2" />WhatsApp</TabsTrigger>
          <TabsTrigger value="sms" data-testid="tab-sms" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 sm:px-6 py-2 font-bold text-sm"><Smartphone className="w-4 h-4 mr-2" />SMS</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 sm:px-6 py-2 font-bold text-sm"><FileCode2 className="w-4 h-4 mr-2" />Templates</TabsTrigger>
        </TabsList>

        {/* School Settings */}
        <TabsContent value="school">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-sky-400 to-sky-600 rounded-xl flex items-center justify-center"><GraduationCap className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-slate-900">School Information</h2><p className="text-sm text-slate-600">Used in fee receipts and invoices</p></div>
            </div>
            <form onSubmit={handleSaveSchool} className="space-y-6">
              <div>
                <Label className="text-base font-bold">School Name *</Label>
                <Input required value={school.schoolName} onChange={(e) => setSchool({ ...school, schoolName: e.target.value })} className="rounded-xl h-12 mt-2" placeholder="e.g., High Five International Pre-School" />
              </div>
              <div>
                <Label className="text-base font-bold">School Address</Label>
                <Input value={school.schoolAddress} onChange={(e) => setSchool({ ...school, schoolAddress: e.target.value })} className="rounded-xl h-12 mt-2" placeholder="Full address" />
              </div>
              <div>
                <Label className="text-base font-bold">School Logo</Label>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-sky-100 file:text-sky-700 hover:file:bg-sky-200" />
                {school.logoUrl && <img src={school.logoUrl} alt="Logo" className="mt-3 h-16 rounded-xl border border-slate-200" />}
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                <p className="text-sm text-sky-800">This name, address, and logo will appear on all fee receipt PDFs.</p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={savingSchool} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl px-8 active:scale-95 transition-transform"><Save className="w-5 h-5 mr-2" />{savingSchool ? 'Saving...' : 'Save'}</Button>
              </div>
            </form>
          </div>
        </TabsContent>

        {/* WhatsApp */}
        <TabsContent value="whatsapp">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center"><MessageSquare className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-slate-900">WhatsApp API</h2><p className="text-sm text-slate-600">Configure messaging for alerts and receipts</p></div>
            </div>
            <form onSubmit={handleSaveWA} className="space-y-6">
              <div><Label className="text-base font-bold">Phone Number ID *</Label><Input required value={wa.phoneNumberId} onChange={(e) => setWa({ ...wa, phoneNumberId: e.target.value })} className="rounded-xl h-12 mt-2" placeholder="e.g., 488774804320252" /></div>
              <div><Label className="text-base font-bold">Access Token *</Label><Input required type="password" value={wa.accessToken} onChange={(e) => setWa({ ...wa, accessToken: e.target.value })} className="rounded-xl h-12 mt-2" /></div>
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                <h3 className="font-bold text-sky-900 mb-2">Templates:</h3>
                <ul className="text-sm text-sky-800 space-y-1 list-disc list-inside">
                  <li><b>fee_paid_bill</b> - Invoice PDF + amount + fee name + student name</li>
                  <li><b>absent_hifg</b> - Student name + class + date</li>
                  <li><b>holi</b> - Event name + date</li>
                </ul>
              </div>
              <div className="flex justify-end"><Button type="submit" disabled={savingWA} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl px-8"><Save className="w-5 h-5 mr-2" />{savingWA ? 'Saving...' : 'Save'}</Button></div>
            </form>
          </div>
        </TabsContent>

        {/* SMS */}
        <TabsContent value="sms">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-xl flex items-center justify-center"><Smartphone className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-slate-900">SMS Gateway</h2><p className="text-sm text-slate-600">Configure your DLT-registered SMS account</p></div>
            </div>
            <form onSubmit={handleSaveSMS} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div><Label className="text-base font-bold">User ID *</Label><Input required value={sms.userid} onChange={(e) => setSms({ ...sms, userid: e.target.value })} className="rounded-xl h-12 mt-2" placeholder="e.g., hamsini" /></div>
                <div><Label className="text-base font-bold">Password *</Label><Input required type="password" value={sms.password} onChange={(e) => setSms({ ...sms, password: e.target.value })} className="rounded-xl h-12 mt-2" /></div>
                <div><Label className="text-base font-bold">Sender ID *</Label><Input required value={sms.sender} onChange={(e) => setSms({ ...sms, sender: e.target.value })} className="rounded-xl h-12 mt-2" placeholder="e.g., HAMSNI" /></div>
                <div><Label className="text-base font-bold">Entity ID (PEID) *</Label><Input required value={sms.peid} onChange={(e) => setSms({ ...sms, peid: e.target.value })} className="rounded-xl h-12 mt-2" placeholder="DLT Principal Entity ID" /></div>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <p className="text-sm text-indigo-900">Each notification type also needs its own DLT-approved <b>Template ID (tpid)</b> and message text — set those up per event in the <b>Templates</b> tab.</p>
              </div>
              <div className="flex justify-end"><Button type="submit" disabled={savingSMS} className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl px-8"><Save className="w-5 h-5 mr-2" />{savingSMS ? 'Saving...' : 'Save'}</Button></div>
            </form>
          </div>
        </TabsContent>

        {/* Templates (WhatsApp + SMS) */}
        <TabsContent value="templates">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-violet-400 to-violet-600 rounded-xl flex items-center justify-center"><FileCode2 className="w-6 h-6 text-white" /></div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Message Templates</h2>
                <p className="text-sm text-slate-600">One card per notification type. Placeholders like {`{{student_name}}`} are replaced at send time.</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-amber-900 font-medium">
                <b>WhatsApp:</b> enter the Meta-approved template name and paste its <b>components</b> array. <b>SMS:</b> enter the exact DLT-approved message text and its Template ID (tpid) — the gateway rejects text that doesn't match the registered template. Leave a section blank/disabled to skip that channel for that event.
              </p>
            </div>

            <form onSubmit={handleSaveTemplates} className="space-y-6">
              {EVENT_DEFS.map((def) => {
                const t = templates[def.key] || { name: '', componentsJson: '', enabled: true };
                const waEnabled = t.enabled !== false;
                const st = smsTemplates[def.key] || EMPTY_SMS_TPL;
                const smsEnabled = st.enabled !== false;
                return (
                  <div key={def.key} data-testid={`tpl-card-${def.key}`} className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-slate-50/40">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">{def.label}</h3>

                    {/* WhatsApp sub-section */}
                    {!def.smsOnly && (
                      <div className={`rounded-xl border p-4 mb-4 transition-colors ${waEnabled ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-slate-100/70 opacity-80'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm font-extrabold text-slate-800">WhatsApp</span>
                            <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full ${waEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{waEnabled ? 'On' : 'Off'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Switch data-testid={`tpl-toggle-${def.key}`} checked={waEnabled} onCheckedChange={() => toggleEnabled(def.key)} />
                            <span className="text-slate-300 hidden sm:inline">|</span>
                            <button type="button" onClick={() => loadExample(def)} data-testid={`tpl-example-${def.key}`} className="text-xs font-bold text-sky-600 hover:underline">Load example</button>
                            <span className="text-slate-300">·</span>
                            <button type="button" onClick={() => resetTemplate(def.key)} data-testid={`tpl-reset-${def.key}`} className="text-xs font-bold text-rose-600 hover:underline">Use default</button>
                          </div>
                        </div>
                        <fieldset disabled={!waEnabled} className={waEnabled ? '' : 'opacity-50 pointer-events-none'}>
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="lg:col-span-1">
                              <Label className="text-sm font-bold">Template Name</Label>
                              <Input
                                data-testid={`tpl-name-${def.key}`}
                                value={t.name}
                                onChange={(e) => setTemplates((s) => ({ ...s, [def.key]: { ...s[def.key], name: e.target.value } }))}
                                className="rounded-xl h-11 mt-2"
                                placeholder="e.g., absent_hifg"
                              />
                              <div className="mt-3">
                                <p className="text-xs font-bold text-slate-500 mb-1">Available placeholders</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {def.placeholders.map((p) => (
                                    <code key={p} className="text-[11px] px-2 py-0.5 bg-violet-100 text-violet-700 rounded font-mono">{p}</code>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="lg:col-span-2">
                              <Label className="text-sm font-bold">Components JSON</Label>
                              <Textarea
                                data-testid={`tpl-json-${def.key}`}
                                rows={8}
                                spellCheck={false}
                                value={t.componentsJson}
                                onChange={(e) => setTemplates((s) => ({ ...s, [def.key]: { ...s[def.key], componentsJson: e.target.value } }))}
                                className="rounded-xl mt-2 font-mono text-xs"
                                placeholder={`Paste the components array, e.g., \n${def.example}`}
                              />
                            </div>
                          </div>
                        </fieldset>
                      </div>
                    )}

                    {/* SMS sub-section */}
                    <div className={`rounded-xl border p-4 transition-colors ${smsEnabled ? 'border-indigo-200 bg-white' : 'border-slate-200 bg-slate-100/70 opacity-80'}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-4 h-4 text-indigo-600" />
                          <span className="text-sm font-extrabold text-slate-800">SMS</span>
                          <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full ${smsEnabled ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>{smsEnabled ? 'On' : 'Off'}</span>
                        </div>
                        <Switch data-testid={`sms-tpl-toggle-${def.key}`} checked={smsEnabled} onCheckedChange={() => toggleSmsEnabled(def.key)} />
                      </div>
                      <fieldset disabled={!smsEnabled} className={smsEnabled ? '' : 'opacity-50 pointer-events-none'}>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          <div className="lg:col-span-1">
                            <Label className="text-sm font-bold">Template ID (tpid)</Label>
                            <Input
                              data-testid={`sms-tpl-tpid-${def.key}`}
                              value={st.tpid}
                              onChange={(e) => setSmsTemplates((s) => ({ ...s, [def.key]: { ...(s[def.key] || EMPTY_SMS_TPL), tpid: e.target.value } }))}
                              className="rounded-xl h-11 mt-2"
                              placeholder="e.g., 1207161794091669905"
                            />
                            <div className="mt-3">
                              <p className="text-xs font-bold text-slate-500 mb-1">Available placeholders</p>
                              <div className="flex flex-wrap gap-1.5">
                                {def.placeholders.map((p) => (
                                  <code key={p} className="text-[11px] px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded font-mono">{p}</code>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="lg:col-span-2">
                            <Label className="text-sm font-bold">Message Text (must match the DLT-approved template)</Label>
                            <Textarea
                              data-testid={`sms-tpl-message-${def.key}`}
                              rows={4}
                              value={st.message}
                              onChange={(e) => setSmsTemplates((s) => ({ ...s, [def.key]: { ...(s[def.key] || EMPTY_SMS_TPL), message: e.target.value } }))}
                              className="rounded-xl mt-2 text-sm"
                              placeholder="e.g., Dear Parent, {{student_name}} was absent on {{date}}. Regards, School"
                            />
                          </div>
                        </div>
                      </fieldset>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-end">
                <Button data-testid="save-templates-btn" type="submit" disabled={savingTpl} className="bg-violet-500 hover:bg-violet-600 text-white font-bold rounded-xl px-8 active:scale-95 transition-transform">
                  <Save className="w-5 h-5 mr-2" />{savingTpl ? 'Saving...' : 'Save Templates'}
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
};

export default Settings;
