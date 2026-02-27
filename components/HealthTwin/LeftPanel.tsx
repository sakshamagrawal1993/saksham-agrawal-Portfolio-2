import React, { useState, useCallback, useRef } from 'react';
import { Plus, FileText, Activity, Watch, UploadCloud, User, X, Check, Loader2 } from 'lucide-react';
import { useHealthTwinStore } from '../../store/healthTwin';
import { supabase } from '../../lib/supabaseClient';

type SourceTab = 'upload' | 'wearable' | 'parameter' | 'profile';

const SOURCE_TABS: { key: SourceTab; label: string; icon: React.ReactNode; desc: string }[] = [
    { key: 'upload', label: 'Upload Lab Report', icon: <UploadCloud size={20} />, desc: 'PDF, Images, CSV' },
    { key: 'wearable', label: 'Connect Wearable', icon: <Watch size={20} />, desc: 'Paste JSON data' },
    { key: 'parameter', label: 'Individual Parameter', icon: <Activity size={20} />, desc: 'Add manual readings' },
    { key: 'profile', label: 'Fill Profile', icon: <User size={20} />, desc: 'Personal details' },
];

const PROFILE_FIELDS = [
    { key: 'name', label: 'Full Name', type: 'text', placeholder: 'e.g. John Doe' },
    { key: 'age', label: 'Age', type: 'number', placeholder: 'e.g. 32' },
    { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'] },
    { key: 'blood_type', label: 'Blood Type', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    { key: 'height_cm', label: 'Height (cm)', type: 'number', placeholder: 'e.g. 175' },
    { key: 'weight_kg', label: 'Weight (kg)', type: 'number', placeholder: 'e.g. 72' },
    { key: 'co_morbidities', label: 'Co-Morbidities', type: 'text', placeholder: 'e.g. Diabetes, Hypertension' },
    { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. Mumbai, India' },
];

export const LeftPanel: React.FC = () => {
    const {
        activeTwinId, sources, labParameters, wearableParameters, personalDetails,
        setActiveTab, setSources, setLabParameters, setWearableParameters, setPersonalDetails
    } = useHealthTwinStore();

    const [modalOpen, setModalOpen] = useState(false);
    const [activeSourceTab, setActiveSourceTab] = useState<SourceTab>('upload');

    // Upload state
    const [uploading, setUploading] = useState(false);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Parameter state
    const [paramForm, setParamForm] = useState({ name: '', value: '', unit: '', recorded_at: '' });
    const [paramSaving, setParamSaving] = useState(false);

    // Wearable JSON state
    const [wearableJson, setWearableJson] = useState('');
    const [wearableSaving, setWearableSaving] = useState(false);
    const [jsonError, setJsonError] = useState('');

    // Profile state
    const [profileForm, setProfileForm] = useState<Record<string, string>>({
        name: personalDetails?.name || '',
        age: personalDetails?.age?.toString() || '',
        gender: personalDetails?.gender || '',
        blood_type: personalDetails?.blood_type || '',
        height_cm: personalDetails?.height_cm?.toString() || '',
        weight_kg: personalDetails?.weight_kg?.toString() || '',
        co_morbidities: personalDetails?.co_morbidities?.join(', ') || '',
        location: personalDetails?.location || '',
    });
    const [profileSaving, setProfileSaving] = useState(false);

    // ---------- UPLOAD ----------
    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
    const handleDragLeave = useCallback(() => setIsDragging(false), []);
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) setFileToUpload(file);
    }, []);

    const handleUploadReport = async () => {
        if (!fileToUpload || !activeTwinId) return;
        setUploading(true);
        try {
            const fileName = `${activeTwinId}/${Date.now()}_${fileToUpload.name}`;
            const { error: uploadError } = await supabase.storage.from('health_documents').upload(fileName, fileToUpload);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('health_documents').getPublicUrl(fileName);
            const { data: sourceData, error: dbError } = await supabase
                .from('health_sources')
                .insert({ twin_id: activeTwinId, source_type: 'lab_report', source_name: fileToUpload.name, file_url: publicUrl, status: 'processing' })
                .select().single();
            if (dbError) throw dbError;

            setSources([sourceData, ...sources]);

            const N8N_WEBHOOK = import.meta.env.VITE_N8N_HEALTH_WEBHOOK_URL;
            if (N8N_WEBHOOK) {
                await fetch(N8N_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_id: sourceData.id, twin_id: activeTwinId, file_url: publicUrl }) });
            }
            setFileToUpload(null);
            setModalOpen(false);
        } catch (err) { console.error('Error uploading report:', err); }
        finally { setUploading(false); }
    };

    // ---------- PARAMETER ----------
    const handleAddParameter = async () => {
        if (!paramForm.name || !paramForm.value || !activeTwinId) return;
        setParamSaving(true);
        try {
            const { data, error } = await supabase.from('health_lab_parameters').insert({
                twin_id: activeTwinId,
                parameter_name: paramForm.name,
                parameter_value: parseFloat(paramForm.value),
                unit: paramForm.unit,
                recorded_at: paramForm.recorded_at || new Date().toISOString()
            }).select().single();
            if (error) throw error;

            setLabParameters([data, ...labParameters]);
            setParamForm({ name: '', value: '', unit: '', recorded_at: '' });
            setModalOpen(false);
        } catch (err) { console.error('Error adding parameter:', err); }
        finally { setParamSaving(false); }
    };

    // ---------- WEARABLE JSON ----------
    const handleWearableImport = async () => {
        if (!wearableJson.trim() || !activeTwinId) return;
        setWearableSaving(true);
        setJsonError('');
        try {
            const parsed = JSON.parse(wearableJson);
            const entries = Array.isArray(parsed) ? parsed : [parsed];
            const rows = entries.map((item: any) => ({
                twin_id: activeTwinId,
                parameter_name: item.parameter_name || item.name,
                parameter_value: parseFloat(item.parameter_value || item.value),
                unit: item.unit || '',
                recorded_at: item.recorded_at || item.timestamp || new Date().toISOString(),
                ended_at: item.ended_at || item.end_timestamp || null
            }));

            const { data, error } = await supabase.from('health_wearable_parameters').insert(rows).select();
            if (error) throw error;

            setWearableParameters([...(data || []), ...wearableParameters]);
            setWearableJson('');
            setModalOpen(false);
        } catch (err: any) {
            if (err instanceof SyntaxError) setJsonError('Invalid JSON format. Please check your input.');
            else { console.error('Error importing wearable data:', err); setJsonError(err.message || 'Failed to save.'); }
        }
        finally { setWearableSaving(false); }
    };

    // ---------- PROFILE ----------
    const handleSaveProfile = async () => {
        if (!activeTwinId) return;
        setProfileSaving(true);
        try {
            const payload = {
                twin_id: activeTwinId,
                name: profileForm.name,
                age: parseInt(profileForm.age) || 0,
                gender: profileForm.gender,
                blood_type: profileForm.blood_type,
                height_cm: parseFloat(profileForm.height_cm) || 0,
                weight_kg: parseFloat(profileForm.weight_kg) || 0,
                co_morbidities: profileForm.co_morbidities.split(',').map(s => s.trim()).filter(Boolean),
                location: profileForm.location,
            };

            const { data, error } = await supabase.from('health_personal_details')
                .upsert(payload, { onConflict: 'twin_id' }).select().single();
            if (error) throw error;

            setPersonalDetails(data);
            setModalOpen(false);
        } catch (err) { console.error('Error saving profile:', err); }
        finally { setProfileSaving(false); }
    };

    // ---------- OPEN MODAL ----------
    const openModal = () => {
        // Pre-fill profile form with latest data
        if (personalDetails) {
            setProfileForm({
                name: personalDetails.name || '', age: personalDetails.age?.toString() || '',
                gender: personalDetails.gender || '', blood_type: personalDetails.blood_type || '',
                height_cm: personalDetails.height_cm?.toString() || '', weight_kg: personalDetails.weight_kg?.toString() || '',
                co_morbidities: personalDetails.co_morbidities?.join(', ') || '', location: personalDetails.location || '',
            });
        }
        setActiveSourceTab('upload');
        setModalOpen(true);
    };

    return (
        <div className="flex flex-col h-full bg-[#FAF9F6] text-[#2C2A26] overflow-y-auto">
            <div className="p-4 flex flex-col gap-4">
                {/* ADD SOURCES BUTTON */}
                <button
                    onClick={openModal}
                    className="w-full bg-white border border-[#EBE7DE] text-[#2C2A26] shadow-sm hover:bg-[#EBE7DE]/50 transition-colors flex items-center justify-center gap-2 h-11 rounded-full font-medium text-sm"
                >
                    <Plus size={16} />
                    Add sources
                </button>

                <div className="h-px bg-[#EBE7DE] my-2" />

                {/* SOURCES LIST */}
                <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E] mb-2">My Sources</h3>
                    {sources.length === 0 ? (
                        <div className="p-4 border border-dashed border-[#A8A29E]/50 rounded-xl text-center text-sm text-[#A8A29E]">
                            No sources connected yet. Upload a lab report or connect a wearable to begin establishing your Health Twin.
                        </div>
                    ) : (
                        sources.map(src => (
                            <div key={src.id} className="flex items-center justify-between p-3 bg-white border border-[#EBE7DE] rounded-xl shadow-sm cursor-pointer hover:border-[#A84A00] transition-colors">
                                <div className="flex items-center gap-3">
                                    <FileText size={16} className={src.status === 'processing' ? 'text-amber-500' : 'text-[#A84A00]'} />
                                    <span className="text-sm font-medium truncate max-w-[150px]">{src.source_name}</span>
                                </div>
                                {src.status === 'processing' && (
                                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded-full">Processing</span>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* PERSONAL DETAILS OVERVIEW */}
                <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E] mb-2">My Profile</h3>
                    {personalDetails ? (
                        <div className="bg-white border border-[#EBE7DE] rounded-xl p-4 shadow-sm text-sm">
                            <div className="flex justify-between border-b border-[#EBE7DE] pb-2 mb-2">
                                <span className="text-[#5D5A53]">Name</span>
                                <span className="font-semibold text-[#A84A00]">{personalDetails.name}</span>
                            </div>
                            <div className="flex justify-between border-b border-[#EBE7DE] pb-2 mb-2">
                                <span className="text-[#5D5A53]">Age / Gender</span>
                                <span className="font-semibold">{personalDetails.age} / {personalDetails.gender}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#5D5A53]">Blood Type</span>
                                <span className="font-semibold text-rose-600">{personalDetails.blood_type}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-xs text-[#A8A29E] italic">Setup your profile to view details.</div>
                    )}
                </div>

                {/* LAB PARAMETERS LIST */}
                <div className="flex flex-col gap-3 mt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E] mb-2">Lab Parameters</h3>
                    {labParameters.slice(0, 5).map(b => (
                        <div key={b.id} onClick={() => setActiveTab('graphs')} className="flex justify-between items-center text-sm py-2 px-1 border-b border-[#EBE7DE] last:border-0 hover:bg-[#F5F2EB] cursor-pointer rounded-md transition-colors" title="Click to view details">
                            <span className="text-[#5D5A53]">{b.parameter_name}</span>
                            <span className="font-semibold text-[#A84A00]">{b.parameter_value} <span className="text-xs text-[#A8A29E] font-normal">{b.unit}</span></span>
                        </div>
                    ))}
                    {labParameters.length === 0 && <div className="text-xs text-[#A8A29E] italic">No lab parameters extracted yet.</div>}
                    {labParameters.length > 5 && <button className="text-xs font-medium text-[#A8A29E] hover:text-[#2C2A26] text-left mt-2 transition-colors">View all {labParameters.length} lab parameters...</button>}
                </div>

                {/* WEARABLE PARAMETERS LIST */}
                <div className="flex flex-col gap-3 mt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E] mb-2">Wearable Data</h3>
                    {wearableParameters.slice(0, 5).map(b => (
                        <div key={b.id} onClick={() => setActiveTab('graphs')} className="flex justify-between items-center text-sm py-2 px-1 border-b border-[#EBE7DE] last:border-0 hover:bg-[#F5F2EB] cursor-pointer rounded-md transition-colors" title="Click to view details">
                            <span className="text-[#5D5A53]">{b.parameter_name}</span>
                            <span className="font-semibold text-[#3b82f6]">{b.parameter_value} <span className="text-xs text-[#A8A29E] font-normal">{b.unit}</span></span>
                        </div>
                    ))}
                    {wearableParameters.length === 0 && <div className="text-xs text-[#A8A29E] italic">No wearable data synced yet.</div>}
                    {wearableParameters.length > 5 && <button className="text-xs font-medium text-[#A8A29E] hover:text-[#2C2A26] text-left mt-2 transition-colors">View all {wearableParameters.length} wearables...</button>}
                </div>
            </div>

            {/* ========== UNIFIED ADD SOURCES MODAL ========== */}
            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" style={{ animation: 'fadeIn 0.15s ease-out' }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-2xl border border-[#EBE7DE] overflow-hidden max-h-[85vh] flex flex-col" style={{ animation: 'scaleIn 0.2s ease-out' }}>
                        {/* Header */}
                        <div className="p-6 border-b border-[#EBE7DE] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="bg-[#A84A00] rounded-lg w-8 h-8 flex items-center justify-center text-white font-serif font-bold text-sm">H</div>
                                <span className="font-medium text-[#5D5A53]">Health Twin</span>
                            </div>
                            <button onClick={() => setModalOpen(false)} className="text-[#A8A29E] hover:text-[#2C2A26] transition-colors p-1 rounded-lg hover:bg-[#F5F2EB]">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <h2 className="font-serif text-2xl text-[#2C2A26] mb-2">Add sources</h2>
                            <p className="text-sm text-[#A8A29E] mb-6">Sources let Health Twin base its analysis on the information that matters most to you.</p>

                            {/* Tab Selector — InsightsLM style cards */}
                            <div className="grid grid-cols-2 gap-3 mb-8">
                                {SOURCE_TABS.map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveSourceTab(tab.key)}
                                        className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${activeSourceTab === tab.key
                                            ? 'border-[#A84A00] bg-[#A84A00]/5 shadow-sm'
                                            : 'border-[#EBE7DE] hover:border-[#A8A29E] bg-white'
                                            }`}
                                    >
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${activeSourceTab === tab.key ? 'bg-[#A84A00] text-white' : 'bg-[#F5F2EB] text-[#A8A29E]'
                                            }`}>
                                            {tab.icon}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-medium text-sm text-[#2C2A26] truncate">{tab.label}</div>
                                            <div className="text-xs text-[#A8A29E]">{tab.desc}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="h-px bg-[#EBE7DE] mb-6" />

                            {/* ---- TAB: UPLOAD LAB REPORT ---- */}
                            {activeSourceTab === 'upload' && (
                                <div>
                                    <div
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${isDragging ? 'border-[#A84A00] bg-[#A84A00]/5' : 'border-[#EBE7DE] hover:bg-[#F5F2EB]'
                                            }`}
                                    >
                                        <UploadCloud size={36} className={`mb-4 ${isDragging ? 'text-[#A84A00]' : 'text-[#A8A29E]'}`} />
                                        <p className="text-sm font-medium mb-1">Upload sources</p>
                                        <p className="text-xs text-[#A8A29E]">Drag & drop or <span className="text-[#A84A00] underline">choose file</span> to upload</p>
                                        <p className="text-[11px] text-[#A8A29E] mt-3">Supported file types: PDF, JPG, PNG, CSV (Max 10MB)</p>
                                        <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.csv,image/*" onChange={(e) => setFileToUpload(e.target.files?.[0] || null)} />
                                    </div>
                                    {fileToUpload && (
                                        <div className="flex items-center justify-between p-3 bg-[#F5F2EB] rounded-xl text-sm mt-4 border border-[#EBE7DE]">
                                            <div className="flex items-center gap-3">
                                                <FileText size={16} className="text-[#A84A00]" />
                                                <span className="font-medium truncate max-w-[280px]">{fileToUpload.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-[#A8A29E]">{(fileToUpload.size / 1024 / 1024).toFixed(2)} MB</span>
                                                <button onClick={() => setFileToUpload(null)} className="text-[#A8A29E] hover:text-rose-500"><X size={14} /></button>
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        onClick={handleUploadReport}
                                        disabled={!fileToUpload || uploading}
                                        className="mt-6 w-full py-3 bg-[#A84A00] hover:bg-[#8A3D00] text-white rounded-xl font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                                    >
                                        {uploading ? <><Loader2 size={16} className="animate-spin" /> Uploading...</> : <><Check size={16} /> Upload & Analyze</>}
                                    </button>
                                </div>
                            )}

                            {/* ---- TAB: CONNECT WEARABLE (JSON) ---- */}
                            {activeSourceTab === 'wearable' && (
                                <div>
                                    <p className="text-sm text-[#5D5A53] mb-4">Paste wearable data as JSON. Each entry should have <code className="bg-[#F5F2EB] px-1.5 py-0.5 rounded text-xs font-mono">parameter_name</code>, <code className="bg-[#F5F2EB] px-1.5 py-0.5 rounded text-xs font-mono">parameter_value</code>, <code className="bg-[#F5F2EB] px-1.5 py-0.5 rounded text-xs font-mono">unit</code>, <code className="bg-[#F5F2EB] px-1.5 py-0.5 rounded text-xs font-mono">recorded_at</code>, and optionally <code className="bg-[#F5F2EB] px-1.5 py-0.5 rounded text-xs font-mono">ended_at</code> for range-based data.</p>
                                    <textarea
                                        rows={10}
                                        placeholder={`[\n  {\n    "parameter_name": "Heart Rate",\n    "parameter_value": 72,\n    "unit": "bpm",\n    "recorded_at": "2026-02-27T10:00:00Z"\n  },\n  {\n    "parameter_name": "Steps",\n    "parameter_value": 8450,\n    "unit": "steps",\n    "recorded_at": "2026-02-27T06:00:00Z",\n    "ended_at": "2026-02-27T22:00:00Z"\n  }\n]`}
                                        value={wearableJson}
                                        onChange={(e) => { setWearableJson(e.target.value); setJsonError(''); }}
                                        className="w-full font-mono text-sm bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-[#A84A00] resize-none"
                                    />
                                    {jsonError && <p className="text-xs text-rose-500 mt-2">{jsonError}</p>}
                                    <button
                                        onClick={handleWearableImport}
                                        disabled={!wearableJson.trim() || wearableSaving}
                                        className="mt-6 w-full py-3 bg-[#A84A00] hover:bg-[#8A3D00] text-white rounded-xl font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                                    >
                                        {wearableSaving ? <><Loader2 size={16} className="animate-spin" /> Importing...</> : <><Check size={16} /> Import Wearable Data</>}
                                    </button>
                                </div>
                            )}

                            {/* ---- TAB: INDIVIDUAL PARAMETER ---- */}
                            {activeSourceTab === 'parameter' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Parameter Name *</label>
                                        <input value={paramForm.name} onChange={e => setParamForm({ ...paramForm, name: e.target.value })} placeholder="e.g. HDL Cholesterol, Heart Rate" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Value *</label>
                                            <input type="number" value={paramForm.value} onChange={e => setParamForm({ ...paramForm, value: e.target.value })} placeholder="e.g. 72" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Unit</label>
                                            <input value={paramForm.unit} onChange={e => setParamForm({ ...paramForm, unit: e.target.value })} placeholder="e.g. mg/dL, bpm" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Recorded At</label>
                                        <input type="datetime-local" value={paramForm.recorded_at} onChange={e => setParamForm({ ...paramForm, recorded_at: e.target.value })} className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                    </div>
                                    <button
                                        onClick={handleAddParameter}
                                        disabled={!paramForm.name || !paramForm.value || paramSaving}
                                        className="w-full py-3 bg-[#A84A00] hover:bg-[#8A3D00] text-white rounded-xl font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                                    >
                                        {paramSaving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Check size={16} /> Save Reading</>}
                                    </button>
                                </div>
                            )}

                            {/* ---- TAB: FILL PROFILE ---- */}
                            {activeSourceTab === 'profile' && (
                                <div className="space-y-4">
                                    {PROFILE_FIELDS.map(field => (
                                        <div key={field.key}>
                                            <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">{field.label}</label>
                                            {field.type === 'select' ? (
                                                <select value={profileForm[field.key] || ''} onChange={e => setProfileForm({ ...profileForm, [field.key]: e.target.value })} className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00] appearance-none">
                                                    <option value="">Select...</option>
                                                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            ) : (
                                                <input type={field.type} value={profileForm[field.key] || ''} onChange={e => setProfileForm({ ...profileForm, [field.key]: e.target.value })} placeholder={field.placeholder} className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        onClick={handleSaveProfile}
                                        disabled={profileSaving}
                                        className="w-full py-3 bg-[#A84A00] hover:bg-[#8A3D00] text-white rounded-xl font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                                    >
                                        {profileSaving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Check size={16} /> Save Profile</>}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
            `}</style>
        </div>
    );
};
