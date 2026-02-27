import React, { useState } from 'react';
import { Plus, FileText, Activity, Watch, UploadCloud, FileUp } from 'lucide-react';
import { useHealthTwinStore } from '../../store/healthTwin';
import { Button } from '../ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { supabase } from '../../lib/supabaseClient';

export const LeftPanel: React.FC = () => {
    const { activeTwinId, sources, labParameters, wearableParameters, personalDetails, setActiveTab } = useHealthTwinStore();
    const [reportDialogOpen, setReportDialogOpen] = useState(false);
    const [paramDialogOpen, setParamDialogOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);

    // Example individual parameters
    const [formData, setFormData] = useState({
        name: '', value: '', unit: ''
    });

    const handleUploadReport = async () => {
        if (!fileToUpload || !activeTwinId) return;
        setUploading(true);

        try {
            // 1. Upload to Supabase Storage
            const fileName = `${activeTwinId}/${Date.now()}_${fileToUpload.name}`;
            const { error: uploadError } = await supabase
                .storage
                .from('health_documents')
                .upload(fileName, fileToUpload);

            if (uploadError) throw uploadError;

            // 2. Get Public URL or signed URL (assuming public for simplicity here, secure via RLS later)
            const { data: { publicUrl } } = supabase.storage.from('health_documents').getPublicUrl(fileName);

            // 3. Insert record into health_sources table
            const { data: sourceData, error: dbError } = await supabase
                .from('health_sources')
                .insert({
                    twin_id: activeTwinId,
                    source_type: 'lab_report',
                    source_name: fileToUpload.name,
                    file_url: publicUrl,
                    status: 'processing'
                })
                .select()
                .single();

            if (dbError) throw dbError;

            // 4. Ping n8n Webhook
            const N8N_WEBHOOK = import.meta.env.VITE_N8N_HEALTH_WEBHOOK_URL;
            if (N8N_WEBHOOK) {
                await fetch(N8N_WEBHOOK, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source_id: sourceData.id,
                        twin_id: activeTwinId,
                        file_url: publicUrl
                    })
                });
            }

            setReportDialogOpen(false);
            setFileToUpload(null);
        } catch (err) {
            console.error('Error uploading report:', err);
            // fallback handle error state
        } finally {
            setUploading(false);
        }
    };

    const handleAddParameter = () => {
        // Basic local state update for demo purposes (should go to Supabase normally)
        console.log("Adding individual parameter", formData);
        setParamDialogOpen(false);
        setFormData({ name: '', value: '', unit: '' });
    };

    return (
        <div className="flex flex-col h-full bg-[#FAF9F6] text-[#2C2A26]">
            <div className="p-4 flex flex-col gap-4">
                {/* ADD SOURCES BUTTON */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button className="w-full bg-white border border-[#EBE7DE] text-[#2C2A26] shadow-sm hover:bg-[#EBE7DE]/50 transition-colors flex items-center justify-center gap-2 h-11 rounded-full">
                            <Plus size={16} />
                            <span className="font-medium">Add sources</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64 p-2" align="start">
                        <DropdownMenuItem
                            className="gap-3 p-3 cursor-pointer"
                            onClick={() => setReportDialogOpen(true)}
                        >
                            <FileUp size={18} className="text-[#A84A00]" />
                            <div className="flex flex-col">
                                <span className="font-medium">Upload Lab Report</span>
                                <span className="text-xs text-[#A8A29E]">PDF, Images, CSV</span>
                            </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                            className="gap-3 p-3 cursor-pointer"
                            onClick={() => setParamDialogOpen(true)}
                        >
                            <Activity size={18} className="text-[#A84A00]" />
                            <div className="flex flex-col">
                                <span className="font-medium">Individual Parameter</span>
                                <span className="text-xs text-[#A8A29E]">Add manual readings</span>
                            </div>
                        </DropdownMenuItem>

                        <DropdownMenuItem className="gap-3 p-3 cursor-pointer">
                            <Watch size={18} className="text-[#A84A00]" />
                            <div className="flex flex-col">
                                <span className="font-medium">Connect Wearable</span>
                                <span className="text-xs text-[#A8A29E]">Apple Health, Oura, etc.</span>
                            </div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

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
                        <div
                            key={b.id}
                            onClick={() => setActiveTab('graphs')}
                            className="flex justify-between items-center text-sm py-2 px-1 border-b border-[#EBE7DE] last:border-0 hover:bg-[#F5F2EB] cursor-pointer rounded-md transition-colors"
                            title="Click to view details"
                        >
                            <span className="text-[#5D5A53]">{b.parameter_name}</span>
                            <span className="font-semibold text-[#A84A00]">{b.parameter_value} <span className="text-xs text-[#A8A29E] font-normal">{b.unit}</span></span>
                        </div>
                    ))}
                    {labParameters.length === 0 && (
                        <div className="text-xs text-[#A8A29E] italic">No lab parameters extracted yet.</div>
                    )}
                    {labParameters.length > 5 && (
                        <button className="text-xs font-medium text-[#A8A29E] hover:text-[#2C2A26] text-left mt-2 transition-colors">
                            View all {labParameters.length} lab parameters...
                        </button>
                    )}
                </div>

                {/* WEARABLE PARAMETERS LIST */}
                <div className="flex flex-col gap-3 mt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E] mb-2">Wearable Data</h3>
                    {wearableParameters.slice(0, 5).map(b => (
                        <div
                            key={b.id}
                            onClick={() => setActiveTab('graphs')}
                            className="flex justify-between items-center text-sm py-2 px-1 border-b border-[#EBE7DE] last:border-0 hover:bg-[#F5F2EB] cursor-pointer rounded-md transition-colors"
                            title="Click to view details"
                        >
                            <span className="text-[#5D5A53]">{b.parameter_name}</span>
                            <span className="font-semibold text-[#3b82f6]">{b.parameter_value} <span className="text-xs text-[#A8A29E] font-normal">{b.unit}</span></span>
                        </div>
                    ))}
                    {wearableParameters.length === 0 && (
                        <div className="text-xs text-[#A8A29E] italic">No wearable data synced yet.</div>
                    )}
                    {wearableParameters.length > 5 && (
                        <button className="text-xs font-medium text-[#A8A29E] hover:text-[#2C2A26] text-left mt-2 transition-colors">
                            View all {wearableParameters.length} wearables...
                        </button>
                    )}
                </div>
            </div>

            {/* DIALOGS */}
            {/* Upload Lab Report Dialog */}
            <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Upload Lab Report</DialogTitle>
                        <DialogDescription>
                            Upload PDF or image files of your clinical reports. Our AI will automatically extract and map the biomarkers to your digital twin.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="border-2 border-dashed border-[#EBE7DE] rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-stone-50 transition-colors">
                            <UploadCloud size={32} className="text-[#A8A29E] mb-4" />
                            <p className="text-sm font-medium mb-1">Click to browse or drag file here</p>
                            <p className="text-xs text-[#A8A29E]">Supports PDF, JPG, PNG (Max 10MB)</p>
                            <input
                                type="file"
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                accept=".pdf,image/*"
                                onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                            />
                        </div>
                        {fileToUpload && (
                            <div className="flex items-center justify-between p-3 bg-stone-100 rounded-lg text-sm">
                                <span className="truncate max-w-[200px] font-medium">{fileToUpload.name}</span>
                                <span className="text-xs text-stone-500">{(fileToUpload.size / 1024 / 1024).toFixed(2)} MB</span>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button onClick={handleUploadReport} disabled={!fileToUpload || uploading} className="w-full bg-[#A84A00] hover:bg-[#8A3D00] text-white">
                            {uploading ? 'Uploading...' : 'Upload & Analyze'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Parameter Dialog */}
            <Dialog open={paramDialogOpen} onOpenChange={setParamDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Log Biomarker</DialogTitle>
                        <DialogDescription>
                            Manually add a single health parameter reading to your timeline.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="param-name">Parameter Name</Label>
                            <Input
                                id="param-name"
                                placeholder="e.g. Heart Rate, HDL Cholesterol"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="param-value">Value</Label>
                                <Input
                                    id="param-value"
                                    type="number"
                                    placeholder="e.g. 72"
                                    value={formData.value}
                                    onChange={e => setFormData({ ...formData, value: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="param-unit">Unit</Label>
                                <Input
                                    id="param-unit"
                                    placeholder="e.g. bpm, mg/dL"
                                    value={formData.unit}
                                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleAddParameter} className="w-full bg-[#A84A00] hover:bg-[#8A3D00] text-white">
                            Save Reading
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
