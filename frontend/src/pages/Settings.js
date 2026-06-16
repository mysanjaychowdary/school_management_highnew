import React, { useState, useEffect } from 'react';
import { Save, MessageSquare, Database, CheckCircle, XCircle, GraduationCap, FileCode2 } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
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
];

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [savingWA, setSavingWA] = useState(false);
  const [savingDb, setSavingDb] = useState(false);
  const [savingSchool, setSavingSchool] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const [dbStatus, setDbStatus] = useState(null);
  const [wa, setWa] = useState({ phoneNumberId: '', accessToken: '' });
  const [dbS, setDbS] = useState({ mongoUrl: '', dbName: '' });
  const [school, setSchool] = useState({ schoolName: '', schoolAddress: '', logoUrl: '' });
  const [templates, setTemplates] = useState({
    absent: { name: '', componentsJson: '' },
    fee_paid: { name: '', componentsJson: '' },
    event: { name: '', componentsJson: '' },
  });

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [waR, dbR, schR, tplR] = await Promise.all([
        api.getWhatsAppSettings(),
        api.getDatabaseSettings(),
        api.getSchoolSettings(),
        api.getWhatsAppTemplates(),
      ]);
      setWa(waR.data);
      setDbS({ mongoUrl: dbR.data.mongoUrl || '', dbName: dbR.data.dbName || '' });
      setSchool({ schoolName: schR.data.schoolName || '', schoolAddress: schR.data.schoolAddress || '', logoUrl: schR.data.logoUrl || '' });
      setTemplates({
        absent: tplR.data.absent || { name: '', componentsJson: '' },
        fee_paid: tplR.data.fee_paid || { name: '', componentsJson: '' },
        event: tplR.data.event || { name: '', componentsJson: '' },
      });
    } catch (e) { toast.error('Failed to load settings'); }
    finally { setLoading(false); }
  };

  const handleSaveWA = async (e) => {
    e.preventDefault();
    try { setSavingWA(true); await api.updateWhatsAppSettings(wa); toast.success('WhatsApp settings saved'); } catch (e) { toast.error('Failed'); } finally { setSavingWA(false); }
  };
  const handleSaveDb = async (e) => {
    e.preventDefault();
    try { setSavingDb(true); setDbStatus(null); await api.updateDatabaseSettings(dbS); setDbStatus('success'); toast.success('Database connected!'); } catch (e) { setDbStatus('error'); toast.error(e.response?.data?.detail || 'Failed'); } finally { setSavingDb(false); }
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
      const raw = (templates[def.key]?.componentsJson || '').trim();
      if (raw) {
        try { JSON.parse(raw); }
        catch (err) { toast.error(`Invalid JSON in "${def.label}": ${err.message}`); return; }
      }
    }
    try {
      setSavingTpl(true);
      await api.updateWhatsAppTemplates(templates);
      toast.success('WhatsApp templates saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save templates');
    } finally { setSavingTpl(false); }
  };

  const resetTemplate = (key) => {
    setTemplates((t) => ({ ...t, [key]: { name: '', componentsJson: '' } }));
  };

  const loadExample = (def) => {
    setTemplates((t) => ({ ...t, [def.key]: { name: t[def.key]?.name || '', componentsJson: def.example } }));
  };

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div></div>;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Settings</h1>
        <p className="text-sm sm:text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>Configure school, WhatsApp API, and database</p>
      </div>

      <Tabs defaultValue="school" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl inline-flex flex-wrap gap-1">
          <TabsTrigger value="school" data-testid="tab-school" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 sm:px-6 py-2 font-bold text-sm"><GraduationCap className="w-4 h-4 mr-2" />School</TabsTrigger>
          <TabsTrigger value="whatsapp" data-testid="tab-whatsapp" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 sm:px-6 py-2 font-bold text-sm"><MessageSquare className="w-4 h-4 mr-2" />WhatsApp</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 sm:px-6 py-2 font-bold text-sm"><FileCode2 className="w-4 h-4 mr-2" />Templates</TabsTrigger>
          <TabsTrigger value="database" data-testid="tab-database" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 sm:px-6 py-2 font-bold text-sm"><Database className="w-4 h-4 mr-2" />Database</TabsTrigger>
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

        {/* WhatsApp Templates */}
        <TabsContent value="templates">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-violet-400 to-violet-600 rounded-xl flex items-center justify-center"><FileCode2 className="w-6 h-6 text-white" /></div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">WhatsApp Templates</h2>
                <p className="text-sm text-slate-600">Paste the Meta-approved template JSON for each event. Placeholders like {`{{student_name}}`} are replaced at send time.</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-amber-900 font-medium">
                <b>How it works:</b> Enter the template name registered with Meta and paste the <b>components</b> array (only the components, not the full payload). The system will substitute placeholders such as {`{{student_name}}`} before calling Meta. Leave a template blank to use the system default.
              </p>
            </div>

            <form onSubmit={handleSaveTemplates} className="space-y-6">
              {EVENT_DEFS.map((def) => {
                const t = templates[def.key] || { name: '', componentsJson: '' };
                return (
                  <div key={def.key} data-testid={`tpl-card-${def.key}`} className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-slate-50/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <h3 className="text-lg font-bold text-slate-900">{def.label}</h3>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => loadExample(def)} data-testid={`tpl-example-${def.key}`} className="text-xs font-bold text-sky-600 hover:underline">Load example</button>
                        <span className="text-slate-300">|</span>
                        <button type="button" onClick={() => resetTemplate(def.key)} data-testid={`tpl-reset-${def.key}`} className="text-xs font-bold text-rose-600 hover:underline">Use default</button>
                      </div>
                    </div>

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
                          rows={10}
                          spellCheck={false}
                          value={t.componentsJson}
                          onChange={(e) => setTemplates((s) => ({ ...s, [def.key]: { ...s[def.key], componentsJson: e.target.value } }))}
                          className="rounded-xl mt-2 font-mono text-xs"
                          placeholder={`Paste the components array, e.g., \n${def.example}`}
                        />
                      </div>
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

        {/* Database */}
        <TabsContent value="database">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-xl flex items-center justify-center"><Database className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-xl font-bold text-slate-900">Database Connection</h2><p className="text-sm text-slate-600">Connect your MongoDB</p></div>
            </div>
            <form onSubmit={handleSaveDb} className="space-y-6">
              <div><Label className="text-base font-bold">MongoDB URL *</Label><Input required value={dbS.mongoUrl} onChange={(e) => setDbS({ ...dbS, mongoUrl: e.target.value })} className="rounded-xl h-12 mt-2" placeholder="mongodb+srv://..." /></div>
              <div><Label className="text-base font-bold">Database Name *</Label><Input required value={dbS.dbName} onChange={(e) => setDbS({ ...dbS, dbName: e.target.value })} className="rounded-xl h-12 mt-2" /></div>
              {dbStatus === 'success' && <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl"><CheckCircle className="w-6 h-6 text-emerald-600" /><p className="text-emerald-800 font-bold">Connected!</p></div>}
              {dbStatus === 'error' && <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl"><XCircle className="w-6 h-6 text-rose-600" /><p className="text-rose-800 font-bold">Connection failed</p></div>}
              <div className="flex justify-end"><Button type="submit" disabled={savingDb} className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl px-8"><Database className="w-5 h-5 mr-2" />{savingDb ? 'Connecting...' : 'Connect'}</Button></div>
            </form>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
