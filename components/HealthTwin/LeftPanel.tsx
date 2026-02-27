import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Plus, FileText, Activity, Watch, UploadCloud, User, X, Check, Loader2, Pencil, ChevronDown } from 'lucide-react';
import { useHealthTwinStore } from '../../store/healthTwin';
import { supabase } from '../../lib/supabaseClient';

type SourceTab = 'upload' | 'wearable' | 'parameter' | 'profile';

const SOURCE_TABS: { key: SourceTab; label: string; icon: React.ReactNode; desc: string }[] = [
    { key: 'upload', label: 'Upload Lab Report', icon: <UploadCloud size={20} />, desc: 'PDF, Images, CSV' },
    { key: 'wearable', label: 'Connect Wearable', icon: <Watch size={20} />, desc: 'Upload CSV data' },
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
        activeTwinId, sources, labParameters, wearableParameters, personalDetails, parameterDefinitions,
        setSources, setLabParameters, setWearableParameters, setPersonalDetails
    } = useHealthTwinStore();

    const [modalOpen, setModalOpen] = useState(false);
    const [activeSourceTab, setActiveSourceTab] = useState<SourceTab>('upload');

    // Upload state
    const [uploading, setUploading] = useState(false);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Parameter state
    const [paramForm, setParamForm] = useState({
        name: '', value: '', unit: '', recorded_at: '', ended_at: '',
        is_present: false, bp_sys: '', bp_dia: '',
        sleep_duration: '', sleep_quality: '',
        sleep_hr: '', sleep_rr: '', sleep_temp_min: '', sleep_temp_max: '',
        sleep_snoring: '', sleep_spo2_avg: '', sleep_spo2_min: '', sleep_low_oxygen: '',
        exercise_type: '', exercise_duration: '',
        hr_z1: '', hr_z2: '', hr_z3: '', hr_z4: '', hr_z5: '',
        meal_type: '', meal_fat: '', meal_carb: '', meal_protein: '', meal_energy: ''
    });
    const [paramSaving, setParamSaving] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownSearch, setDropdownSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const allParameterOptions = useMemo(() => {
        const arr = [
            { id: 'group_bp', name: 'Blood Pressure', isGroup: true, desc: 'Systolic & Diastolic', category: 'vitals' },
            { id: 'group_exercise', name: 'Exercise Session', isGroup: true, desc: 'Type, Duration & HR Zones', category: 'exercise' },
            { id: 'group_sleep', name: 'Sleep Session', isGroup: true, desc: 'Detailed Sleep Stage & Metrics', category: 'sleep' },
            { id: 'group_meal', name: 'Meal Session', isGroup: true, desc: 'Macros & Energy', category: 'nutrition' },
        ];
        parameterDefinitions.forEach(def => {
            if (!arr.some(a => a.id === def.name)) {

                // Identify symptoms for binary boolean UI
                const isSymptom = def.category === 'symptoms' || def.name.includes('Indicator') || def.name.includes('- Presence') || [
                    'Abdominal Pain', 'Acne', 'Appetite Loss', 'Back Pain', 'Bloating', 'Body Ache',
                    'Breast Pain', 'Chills', 'Constipation', 'Cough', 'Craving', 'Diarrhea', 'Dizziness',
                    'Dry Skin', 'Fatigue', 'Fever', 'Headache', 'Heartburn', 'Hot Flashes', 'Insomnia',
                    'Mood Changes', 'Muscle Pain', 'Nausea', 'Night Sweats', 'Numbness', 'Pelvic Pain',
                    'Skin Rash', 'Sore Throat', 'Vomiting', 'Wheezing', 'Vaginal Dryness', 'Cervical Mucus'
                ].includes(def.name);

                arr.push({
                    id: def.name,
                    name: def.name,
                    isGroup: false,
                    category: isSymptom ? 'symptoms' : def.category || '',
                    desc: isSymptom ? 'Preset Indicator' : def.unit
                });
            }
        });
        return arr;
    }, [parameterDefinitions]);

    const filteredParameterOptions = useMemo(() => {
        return allParameterOptions.filter(o => o.name.toLowerCase().includes(dropdownSearch.toLowerCase()) || o.category.toLowerCase().includes(dropdownSearch.toLowerCase()));
    }, [allParameterOptions, dropdownSearch]);

    // Wearable CSV state
    const [wearableCsvFile, setWearableCsvFile] = useState<File | null>(null);
    const [wearableCsvPreview, setWearableCsvPreview] = useState<Record<string, string>[]>([]);
    const [wearableSaving, setWearableSaving] = useState(false);
    const [csvError, setCsvError] = useState('');
    const [csvDragging, setCsvDragging] = useState(false);
    const csvInputRef = useRef<HTMLInputElement>(null);

    // Wearable CSV source names (tracked locally for the sidebar display)
    const [wearableCsvSources, setWearableCsvSources] = useState<string[]>([]);

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
            // Build file path: {userName}/{twinId}/{filename}
            let userName = 'unknown';
            if (personalDetails?.name) {
                userName = personalDetails.name.replace(/[^a-zA-Z0-9_-]/g, '_');
            } else {
                const { data: { session } } = await supabase.auth.getSession();
                userName = (session?.user?.email?.split('@')[0] || session?.user?.id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
            }
            const fileName = `${userName}/${activeTwinId}/${fileToUpload.name}`;

            const { error: uploadError } = await supabase.storage.from('health_documents').upload(fileName, fileToUpload, { upsert: true });
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('health_documents').getPublicUrl(fileName);
            const { data: sourceData, error: dbError } = await supabase
                .from('health_sources')
                .insert({ twin_id: activeTwinId, source_type: 'lab_report', source_name: fileToUpload.name, file_url: publicUrl, status: 'processing' })
                .select().single();
            if (dbError) throw dbError;

            setSources([sourceData, ...sources]);

            // Call Supabase Edge Function to securely route the payload and auth header to n8n
            try {
                const { data: result, error: invokeError } = await supabase.functions.invoke('process-lab-report', {
                    body: { file_url: publicUrl, twin_id: activeTwinId, file_id: sourceData.id }
                });

                if (invokeError) throw invokeError;
                if (!result) throw new Error("No data returned from edge function");

                // Save extracted parameters to health_lab_parameters
                if (result.parameters && Array.isArray(result.parameters) && result.parameters.length > 0) {
                    const paramRows = result.parameters.map((p: { parameter_name: string; parameter_value: number; unit: string; recorded_at: string }) => ({
                        twin_id: activeTwinId,
                        source_id: sourceData.id,
                        parameter_name: p.parameter_name,
                        parameter_value: p.parameter_value,
                        unit: p.unit || '',
                        recorded_at: p.recorded_at || new Date().toISOString(),
                    }));

                    const { data: insertedParams, error: paramError } = await supabase
                        .from('health_lab_parameters')
                        .insert(paramRows)
                        .select();

                    if (paramError) throw paramError;

                    // Merge new parameters into store
                    if (insertedParams) {
                        setLabParameters([...insertedParams, ...labParameters]);
                    }
                }

                // Mark source as completed
                await supabase.from('health_sources').update({ status: 'completed' }).eq('id', sourceData.id);
                setSources([{ ...sourceData, status: 'completed' }, ...sources.filter(s => s.id !== sourceData.id)]);
            } catch (webhookErr) {
                console.error('Webhook/parameter processing error:', webhookErr);
                // Mark source as failed
                await supabase.from('health_sources').update({ status: 'failed', processing_error: String(webhookErr) }).eq('id', sourceData.id);
                setSources([{ ...sourceData, status: 'failed' }, ...sources.filter(s => s.id !== sourceData.id)]);
            }

            setFileToUpload(null);
            setModalOpen(false);
        } catch (err) { console.error('Error uploading report:', err); }
        finally { setUploading(false); }
    };

    // ---------- PARAMETER ----------
    const handleAddParameter = async () => {
        if (!paramForm.name || !activeTwinId) return;
        setParamSaving(true);
        try {
            const selectedOpt = allParameterOptions.find(o => o.id === paramForm.name);
            const rawCategory = selectedOpt?.category || '';
            const normalizedCategory = rawCategory.toLowerCase().replace('wearable - ', '').trim();
            const isWearableCategory = selectedOpt?.isGroup || ['vitals', 'activity', 'sleep', 'exercise', 'nutrition', 'recovery', 'symptoms', 'reproductive'].includes(normalizedCategory);

            const rowsToInsert = [];
            let targetTable = isWearableCategory ? 'health_wearable_parameters' : 'health_lab_parameters';

            // GENERATE UUID for group_id if needed
            const groupId = crypto.randomUUID();

            if (paramForm.name === 'group_bp') {
                rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Blood Pressure Systolic', parameter_value: parseFloat(paramForm.bp_sys), unit: 'mmHg', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'vitals', group_id: groupId });
                rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Blood Pressure Diastolic', parameter_value: parseFloat(paramForm.bp_dia), unit: 'mmHg', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'vitals', group_id: groupId });
            } else if (paramForm.name === 'group_exercise') {
                rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Exercise Type', parameter_text: paramForm.exercise_type, parameter_value: 0, recorded_at: paramForm.recorded_at || new Date().toISOString(), ended_at: paramForm.ended_at || null, category: 'exercise', group_id: groupId });
                rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Exercise Duration', parameter_value: parseFloat(paramForm.exercise_duration), unit: 'min', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'exercise', group_id: groupId });
                if (paramForm.hr_z1) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Exercise % Time in HR Zone 1', parameter_value: parseFloat(paramForm.hr_z1), recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'exercise', group_id: groupId });
                if (paramForm.hr_z2) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Exercise % Time in HR Zone 2', parameter_value: parseFloat(paramForm.hr_z2), recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'exercise', group_id: groupId });
                if (paramForm.hr_z3) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Exercise % Time in HR Zone 3', parameter_value: parseFloat(paramForm.hr_z3), recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'exercise', group_id: groupId });
                if (paramForm.hr_z4) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Exercise % Time in HR Zone 4', parameter_value: parseFloat(paramForm.hr_z4), recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'exercise', group_id: groupId });
                if (paramForm.hr_z5) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Exercise % Time in HR Zone 5', parameter_value: parseFloat(paramForm.hr_z5), recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'exercise', group_id: groupId });
            } else if (paramForm.name === 'group_sleep') {
                rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Sleep Duration', parameter_value: parseFloat(paramForm.sleep_duration), unit: 'hours', recorded_at: paramForm.recorded_at || new Date().toISOString(), ended_at: paramForm.ended_at || null, category: 'sleep', group_id: groupId });
                if (paramForm.sleep_quality) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Sleep Quality', parameter_value: parseFloat(paramForm.sleep_quality), unit: '%', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'sleep', group_id: groupId });
                if (paramForm.sleep_hr) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Sleep Average Heart Rate', parameter_value: parseFloat(paramForm.sleep_hr), unit: 'bpm', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'sleep', group_id: groupId });
                if (paramForm.sleep_rr) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Sleep Average Respiratory Rate', parameter_value: parseFloat(paramForm.sleep_rr), unit: 'breaths/min', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'sleep', group_id: groupId });
                if (paramForm.sleep_temp_min) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Sleep Skin Temperature Min', parameter_value: parseFloat(paramForm.sleep_temp_min), unit: '°C', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'sleep', group_id: groupId });
                if (paramForm.sleep_temp_max) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Sleep Skin Temperature Max', parameter_value: parseFloat(paramForm.sleep_temp_max), unit: '°C', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'sleep', group_id: groupId });
                if (paramForm.sleep_snoring) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Sleep Total Snoring Time', parameter_value: parseFloat(paramForm.sleep_snoring), unit: 'min', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'sleep', group_id: groupId });
                if (paramForm.sleep_spo2_avg) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Sleep Average SPO2', parameter_value: parseFloat(paramForm.sleep_spo2_avg), unit: '%', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'sleep', group_id: groupId });
                if (paramForm.sleep_spo2_min) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Sleep Min SPO2', parameter_value: parseFloat(paramForm.sleep_spo2_min), unit: '%', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'sleep', group_id: groupId });
                if (paramForm.sleep_low_oxygen) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Sleep Minutes Low Oxygen', parameter_value: parseFloat(paramForm.sleep_low_oxygen), unit: 'min', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'sleep', group_id: groupId });
            } else if (paramForm.name === 'group_meal') {
                rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Meal Type', parameter_text: paramForm.meal_type, parameter_value: 0, recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'nutrition', group_id: groupId });
                if (paramForm.meal_fat) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Total Fat', parameter_value: parseFloat(paramForm.meal_fat), unit: 'g', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'nutrition', group_id: groupId });
                if (paramForm.meal_carb) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Total Carbohydrate', parameter_value: parseFloat(paramForm.meal_carb), unit: 'g', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'nutrition', group_id: groupId });
                if (paramForm.meal_protein) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Total Protein', parameter_value: parseFloat(paramForm.meal_protein), unit: 'g', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'nutrition', group_id: groupId });
                if (paramForm.meal_energy) rowsToInsert.push({ twin_id: activeTwinId, parameter_name: 'Total Energy', parameter_value: parseFloat(paramForm.meal_energy), unit: 'kcal', recorded_at: paramForm.recorded_at || new Date().toISOString(), category: 'nutrition', group_id: groupId });
            } else {
                let val = parseFloat(paramForm.value);
                if (selectedOpt?.category === 'symptoms') val = paramForm.is_present ? 1 : 0;

                rowsToInsert.push({
                    twin_id: activeTwinId,
                    parameter_name: paramForm.name,
                    parameter_value: val,
                    unit: paramForm.unit || '',
                    recorded_at: paramForm.recorded_at || new Date().toISOString(),
                    ended_at: paramForm.ended_at || null,
                    category: isWearableCategory ? normalizedCategory : null
                });
            }

            const { data, error } = await supabase.from(targetTable).insert(rowsToInsert).select();
            if (error) throw error;

            if (isWearableCategory) {
                setWearableParameters([...data, ...wearableParameters]);
            } else {
                setLabParameters([...data, ...labParameters]);
            }

            setParamForm({
                name: '', value: '', unit: '', recorded_at: '', ended_at: '',
                is_present: false, bp_sys: '', bp_dia: '',
                sleep_duration: '', sleep_quality: '',
                sleep_hr: '', sleep_rr: '', sleep_temp_min: '', sleep_temp_max: '',
                sleep_snoring: '', sleep_spo2_avg: '', sleep_spo2_min: '', sleep_low_oxygen: '',
                exercise_type: '', exercise_duration: '',
                hr_z1: '', hr_z2: '', hr_z3: '', hr_z4: '', hr_z5: '',
                meal_type: '', meal_fat: '', meal_carb: '', meal_protein: '', meal_energy: ''
            });
            setModalOpen(false);
        } catch (err) { console.error('Error adding parameter:', err); }
        finally { setParamSaving(false); }
    };

    // ---------- CSV PARSER ----------
    const parseCsv = (text: string): Record<string, string>[] => {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        return lines.slice(1).map(line => {
            const values = line.match(/("[^"]*"|[^,]+)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || [];
            const row: Record<string, string> = {};
            headers.forEach((h, i) => { row[h] = values[i] || ''; });
            return row;
        });
    };

    const handleCsvFileSelect = (file: File) => {
        if (!file.name.endsWith('.csv')) { setCsvError('Please upload a .csv file'); return; }
        setWearableCsvFile(file);
        setCsvError('');
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = parseCsv(e.target?.result as string);
                setWearableCsvPreview(parsed.slice(0, 5)); // preview max 5 rows
            } catch (err: any) { setCsvError(err.message); }
        };
        reader.readAsText(file);
    };

    const handleCsvDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setCsvDragging(true); }, []);
    const handleCsvDragLeave = useCallback(() => setCsvDragging(false), []);
    const handleCsvDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setCsvDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleCsvFileSelect(file);
    }, []);

    const downloadSampleCsv = () => {
        const sample = `parameter_name,parameter_value,unit,recorded_at,ended_at,category,group_id,parameter_text
Heart Rate,72,bpm,2026-02-27T10:00:00Z,,vitals,,
Step Count,8450,steps,2026-02-27T06:00:00Z,2026-02-27T22:00:00Z,activity,,
Blood Pressure Systolic,120,mmHg,2026-02-27T08:00:00Z,,vitals,bp-group-1,
Blood Pressure Diastolic,80,mmHg,2026-02-27T08:00:00Z,,vitals,bp-group-1,
Sleep Duration,7.5,hours,2026-02-27T23:00:00Z,2026-02-28T06:30:00Z,sleep,,
Exercise Type,0,,2026-02-27T17:00:00Z,2026-02-27T18:00:00Z,exercise,ex-group-1,Running
Exercise Duration,45,min,2026-02-27T17:00:00Z,,exercise,ex-group-1,
Active Calories Burnt,320,kcal,2026-02-27T06:00:00Z,2026-02-27T22:00:00Z,activity,,`;
        // Add BOM for Excel compatibility
        const blob = new Blob(['\ufeff' + sample], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'wearable_data_sample.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    // ---------- WEARABLE CSV IMPORT ----------
    const handleWearableImport = async () => {
        if (!wearableCsvFile || !activeTwinId) return;
        setWearableSaving(true);
        setCsvError('');
        try {
            const text = await wearableCsvFile.text();
            const parsed = parseCsv(text);
            const rows = parsed.map((item) => ({
                twin_id: activeTwinId,
                parameter_name: item.parameter_name || item.name || '',
                parameter_value: parseFloat(item.parameter_value || item.value || '0'),
                unit: item.unit || '',
                recorded_at: item.recorded_at || item.timestamp || new Date().toISOString(),
                ended_at: item.ended_at || item.end_timestamp || null,
                category: item.category || null,
                group_id: item.group_id || null,
                parameter_text: item.parameter_text || null,
            }));

            const { data, error } = await supabase.from('health_wearable_parameters').insert(rows).select();
            if (error) throw error;

            setWearableParameters([...(data || []), ...wearableParameters]);
            setWearableCsvSources(prev => [...prev, wearableCsvFile.name]);
            setWearableCsvFile(null);
            setWearableCsvPreview([]);
            setModalOpen(false);
        } catch (err: any) {
            console.error('Error importing CSV:', err);
            setCsvError(err.message || 'Failed to import CSV.');
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
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E]">My Profile</h3>
                        {personalDetails && (
                            <button
                                onClick={() => { openModal(); setActiveSourceTab('profile'); }}
                                className="text-xs font-bold text-[#A84A00] hover:underline flex items-center gap-1 transition-colors"
                            >
                                <Pencil size={10} /> Edit
                            </button>
                        )}
                    </div>
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
                            <div className="flex justify-between border-b border-[#EBE7DE] pb-2 mb-2">
                                <span className="text-[#5D5A53]">Blood Type</span>
                                <span className="font-semibold text-rose-600">{personalDetails.blood_type}</span>
                            </div>
                            {personalDetails.height_cm ? (
                                <div className="flex justify-between border-b border-[#EBE7DE] pb-2 mb-2">
                                    <span className="text-[#5D5A53]">Height / Weight</span>
                                    <span className="font-semibold">{personalDetails.height_cm} cm / {personalDetails.weight_kg} kg</span>
                                </div>
                            ) : null}
                            {personalDetails.location ? (
                                <div className="flex justify-between">
                                    <span className="text-[#5D5A53]">Location</span>
                                    <span className="font-semibold">{personalDetails.location}</span>
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="text-xs text-[#A8A29E] italic">Setup your profile to view details.
                            <button onClick={() => { openModal(); setActiveSourceTab('profile'); }} className="ml-1 text-[#A84A00] font-bold hover:underline">Set up now →</button>
                        </div>
                    )}
                </div>

                {/* LAB REPORTS (file names only) */}
                <div className="flex flex-col gap-3 mt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E] mb-2">Lab Reports</h3>
                    {sources.filter(s => s.source_type === 'lab_report').length > 0 ? (
                        sources.filter(s => s.source_type === 'lab_report').map(src => (
                            <div key={src.id} className="flex items-center justify-between p-3 bg-white border border-[#EBE7DE] rounded-xl shadow-sm hover:border-[#A84A00] transition-colors">
                                <div className="flex items-center gap-3">
                                    <FileText size={16} className={src.status === 'processing' ? 'text-amber-500' : 'text-[#A84A00]'} />
                                    <div>
                                        <span className="text-sm font-medium truncate max-w-[150px] block">{src.source_name}</span>
                                        <span className="text-[10px] text-[#A8A29E]">{new Date(src.created_at || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                    </div>
                                </div>
                                {src.status === 'processing' ? (
                                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded-full">Processing</span>
                                ) : (
                                    <span className="text-[10px] font-bold text-[#10b981] uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded-full">Analyzed</span>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="text-xs text-[#A8A29E] italic">No lab reports uploaded yet.</div>
                    )}
                </div>

                {/* WEARABLE DATA SOURCES (CSV file names) */}
                <div className="flex flex-col gap-3 mt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E] mb-2">Wearable Data Sources</h3>
                    {wearableCsvSources.length > 0 ? (
                        wearableCsvSources.map((name, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-white border border-[#EBE7DE] rounded-xl shadow-sm">
                                <Watch size={16} className="text-[#3b82f6]" />
                                <div>
                                    <span className="text-sm font-medium truncate max-w-[150px] block">{name}</span>
                                    <span className="text-[10px] text-[#A8A29E]">CSV import</span>
                                </div>
                            </div>
                        ))
                    ) : wearableParameters.length > 0 ? (
                        <div className="flex items-center gap-3 p-3 bg-white border border-[#EBE7DE] rounded-xl shadow-sm">
                            <Watch size={16} className="text-[#3b82f6]" />
                            <div>
                                <span className="text-sm font-medium">{wearableParameters.length} parameters synced</span>
                                <span className="text-[10px] text-[#A8A29E] block">Pre-loaded data</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-xs text-[#A8A29E] italic">No wearable data synced yet.</div>
                    )}
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

                            {/* ---- TAB: CONNECT WEARABLE (CSV) ---- */}
                            {activeSourceTab === 'wearable' && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-sm text-[#5D5A53]">Upload a CSV with wearable data. Required columns: <code className="bg-[#F5F2EB] px-1.5 py-0.5 rounded text-xs font-mono">parameter_name</code>, <code className="bg-[#F5F2EB] px-1.5 py-0.5 rounded text-xs font-mono">parameter_value</code>, <code className="bg-[#F5F2EB] px-1.5 py-0.5 rounded text-xs font-mono">unit</code>, <code className="bg-[#F5F2EB] px-1.5 py-0.5 rounded text-xs font-mono">recorded_at</code>.</p>
                                    </div>
                                    <button onClick={downloadSampleCsv} className="text-xs text-[#A84A00] hover:underline font-bold mb-4 flex items-center gap-1">
                                        <FileText size={12} /> Download Sample CSV
                                    </button>

                                    {/* Drag & Drop Zone */}
                                    <div
                                        onDragOver={handleCsvDragOver}
                                        onDragLeave={handleCsvDragLeave}
                                        onDrop={handleCsvDrop}
                                        onClick={() => csvInputRef.current?.click()}
                                        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${csvDragging ? 'border-[#A84A00] bg-[#A84A00]/5' : 'border-[#EBE7DE] hover:border-[#A84A00]/40'
                                            } ${wearableCsvFile ? 'bg-[#10b981]/5 border-[#10b981]' : ''}`}
                                    >
                                        <input
                                            ref={csvInputRef}
                                            type="file"
                                            accept=".csv"
                                            className="hidden"
                                            onChange={e => { if (e.target.files?.[0]) handleCsvFileSelect(e.target.files[0]); }}
                                        />
                                        {wearableCsvFile ? (
                                            <>
                                                <Check size={24} className="mx-auto mb-2 text-[#10b981]" />
                                                <p className="font-bold text-[#2C2A26] text-sm">{wearableCsvFile.name}</p>
                                                <p className="text-xs text-[#A8A29E] mt-1">{wearableCsvPreview.length > 0 ? `${wearableCsvPreview.length} rows preview (click to change)` : 'Click to change file'}</p>
                                            </>
                                        ) : (
                                            <>
                                                <UploadCloud size={24} className="mx-auto mb-2 text-[#A8A29E]" />
                                                <p className="text-sm text-[#5D5A53] font-bold">Drop CSV file here or click to browse</p>
                                                <p className="text-xs text-[#A8A29E] mt-1">.csv files only</p>
                                            </>
                                        )}
                                    </div>

                                    {/* Preview Table */}
                                    {wearableCsvPreview.length > 0 && (
                                        <div className="mt-4 overflow-x-auto">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#A8A29E] mb-2">Preview (first {wearableCsvPreview.length} rows)</p>
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="border-b border-[#EBE7DE]">
                                                        {Object.keys(wearableCsvPreview[0]).map(h => (
                                                            <th key={h} className="py-1.5 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#A8A29E]">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {wearableCsvPreview.map((row, i) => (
                                                        <tr key={i} className="border-b border-[#EBE7DE]/50">
                                                            {Object.values(row).map((v, j) => (
                                                                <td key={j} className="py-1.5 pr-3 text-[#5D5A53] truncate max-w-[120px]">{v || '—'}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {csvError && <p className="text-xs text-rose-500 mt-2">{csvError}</p>}
                                    <button
                                        onClick={handleWearableImport}
                                        disabled={!wearableCsvFile || wearableSaving}
                                        className="mt-6 w-full py-3 bg-[#A84A00] hover:bg-[#8A3D00] text-white rounded-xl font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                                    >
                                        {wearableSaving ? <><Loader2 size={16} className="animate-spin" /> Importing...</> : <><Check size={16} /> Import Wearable Data</>}
                                    </button>
                                </div>
                            )}

                            {/* ---- TAB: INDIVIDUAL PARAMETER / MANUAL ENTRY ---- */}
                            {activeSourceTab === 'parameter' && (() => {
                                const selectedEntity = allParameterOptions.find(o => o.id === paramForm.name);
                                const isSymptom = selectedEntity?.category === 'symptoms' && !selectedEntity.isGroup;
                                const isStandardMetric = selectedEntity && !selectedEntity.isGroup && !isSymptom;

                                return (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Metric Type *</label>
                                            <div className="relative" ref={dropdownRef}>
                                                <div
                                                    className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm flex justify-between items-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#A84A00]"
                                                    onClick={() => setDropdownOpen(!dropdownOpen)}
                                                >
                                                    <span className={paramForm.name ? "text-[#2C2A26] font-medium" : "text-[#A8A29E]"}>
                                                        {paramForm.name ? (selectedEntity?.name || paramForm.name) : 'Select metric...'}
                                                    </span>
                                                    <ChevronDown size={16} className="text-[#A8A29E]" />
                                                </div>
                                                {dropdownOpen && (
                                                    <div className="absolute z-50 w-full mt-2 bg-white border border-[#EBE7DE] rounded-xl shadow-xl max-h-64 flex flex-col overflow-hidden">
                                                        <div className="p-2 border-b border-[#EBE7DE]">
                                                            <input
                                                                autoFocus
                                                                type="text"
                                                                placeholder="Search metrics..."
                                                                value={dropdownSearch}
                                                                onChange={e => setDropdownSearch(e.target.value)}
                                                                className="w-full bg-[#FAF9F6] border border-[#EBE7DE] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#A84A00]"
                                                            />
                                                        </div>
                                                        <div className="overflow-y-auto p-1">
                                                            {filteredParameterOptions.length === 0 ? (
                                                                <div className="p-3 text-center text-sm text-[#A8A29E]">No matches found</div>
                                                            ) : filteredParameterOptions.map(opt => (
                                                                <div
                                                                    key={opt.id}
                                                                    onClick={() => {
                                                                        setParamForm(prev => ({
                                                                            ...prev,
                                                                            name: opt.id,
                                                                            unit: opt.isGroup ? '' : (parameterDefinitions.find(d => d.name === opt.id)?.unit || '')
                                                                        }));
                                                                        setDropdownOpen(false);
                                                                        setDropdownSearch('');
                                                                    }}
                                                                    className={`p-2.5 mx-1 my-0.5 rounded-lg flex items-center justify-between cursor-pointer hover:bg-[#F5F2EB] ${paramForm.name === opt.id ? 'bg-[#A84A00]/5 text-[#A84A00] font-medium' : 'text-[#2C2A26]'}`}
                                                                >
                                                                    <div className="flex flex-col">
                                                                        <span className="text-sm">{opt.name}</span>
                                                                        {(opt.desc || opt.category) && <span className="text-[10px] text-[#A8A29E] uppercase tracking-wider">{opt.desc} {opt.category && !opt.isGroup ? `• ${opt.category}` : ''}</span>}
                                                                    </div>
                                                                    {opt.isGroup && <span className="text-[10px] font-bold bg-[#F5F2EB] text-[#A8A29E] px-2 py-0.5 rounded-md">GROUP</span>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* CONDITIONAL FORMS */}
                                        {/* BLOOD PRESSURE */}
                                        {paramForm.name === 'group_bp' && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Systolic (mmHg) *</label>
                                                    <input type="number" value={paramForm.bp_sys} onChange={e => setParamForm({ ...paramForm, bp_sys: e.target.value })} placeholder="e.g. 120" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Diastolic (mmHg) *</label>
                                                    <input type="number" value={paramForm.bp_dia} onChange={e => setParamForm({ ...paramForm, bp_dia: e.target.value })} placeholder="e.g. 80" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                </div>
                                            </div>
                                        )}

                                        {/* EXERCISE */}
                                        {paramForm.name === 'group_exercise' && (
                                            <>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Exercise Type *</label>
                                                        <input type="text" value={paramForm.exercise_type} onChange={e => setParamForm({ ...paramForm, exercise_type: e.target.value })} placeholder="e.g. Running" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Duration (min) *</label>
                                                        <input type="number" value={paramForm.exercise_duration} onChange={e => setParamForm({ ...paramForm, exercise_duration: e.target.value })} placeholder="e.g. 45" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                </div>
                                                <div className="bg-[#F5F2EB] p-4 rounded-xl border border-[#EBE7DE]">
                                                    <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-3">Heart Rate Zones (% of time)</label>
                                                    <div className="grid grid-cols-5 gap-2">
                                                        <div className="flex flex-col gap-1 items-center"><span className="text-[10px] text-[#A8A29E] font-bold">Z1</span><input type="number" value={paramForm.hr_z1} onChange={e => setParamForm({ ...paramForm, hr_z1: e.target.value })} className="w-full bg-white border border-[#EBE7DE] rounded-lg px-2 py-2 text-center text-xs focus:ring-[#A84A00]" /></div>
                                                        <div className="flex flex-col gap-1 items-center"><span className="text-[10px] text-[#A8A29E] font-bold">Z2</span><input type="number" value={paramForm.hr_z2} onChange={e => setParamForm({ ...paramForm, hr_z2: e.target.value })} className="w-full bg-white border border-[#EBE7DE] rounded-lg px-2 py-2 text-center text-xs focus:ring-[#A84A00]" /></div>
                                                        <div className="flex flex-col gap-1 items-center"><span className="text-[10px] text-[#A8A29E] font-bold">Z3</span><input type="number" value={paramForm.hr_z3} onChange={e => setParamForm({ ...paramForm, hr_z3: e.target.value })} className="w-full bg-white border border-[#EBE7DE] rounded-lg px-2 py-2 text-center text-xs focus:ring-[#A84A00]" /></div>
                                                        <div className="flex flex-col gap-1 items-center"><span className="text-[10px] text-[#A8A29E] font-bold">Z4</span><input type="number" value={paramForm.hr_z4} onChange={e => setParamForm({ ...paramForm, hr_z4: e.target.value })} className="w-full bg-white border border-[#EBE7DE] rounded-lg px-2 py-2 text-center text-xs focus:ring-[#A84A00]" /></div>
                                                        <div className="flex flex-col gap-1 items-center"><span className="text-[10px] text-[#A8A29E] font-bold">Z5</span><input type="number" value={paramForm.hr_z5} onChange={e => setParamForm({ ...paramForm, hr_z5: e.target.value })} className="w-full bg-white border border-[#EBE7DE] rounded-lg px-2 py-2 text-center text-xs focus:ring-[#A84A00]" /></div>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {/* SLEEP */}
                                        {paramForm.name === 'group_sleep' && (
                                            <div className="flex flex-col gap-4">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Duration (h) *</label>
                                                        <input type="number" value={paramForm.sleep_duration} onChange={e => setParamForm({ ...paramForm, sleep_duration: e.target.value })} placeholder="7.5" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Quality %</label>
                                                        <input type="number" value={paramForm.sleep_quality} onChange={e => setParamForm({ ...paramForm, sleep_quality: e.target.value })} placeholder="85" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Avg HR (bpm)</label>
                                                        <input type="number" value={paramForm.sleep_hr} onChange={e => setParamForm({ ...paramForm, sleep_hr: e.target.value })} placeholder="60" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Resp Rate</label>
                                                        <input type="number" value={paramForm.sleep_rr} onChange={e => setParamForm({ ...paramForm, sleep_rr: e.target.value })} placeholder="14" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">SpO2 Avg %</label>
                                                        <input type="number" value={paramForm.sleep_spo2_avg} onChange={e => setParamForm({ ...paramForm, sleep_spo2_avg: e.target.value })} placeholder="96" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">SpO2 Min %</label>
                                                        <input type="number" value={paramForm.sleep_spo2_min} onChange={e => setParamForm({ ...paramForm, sleep_spo2_min: e.target.value })} placeholder="92" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3 pb-2 mb-2 border-b border-[#EBE7DE]/50">
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Temp Min (°C)</label>
                                                        <input type="number" value={paramForm.sleep_temp_min} onChange={e => setParamForm({ ...paramForm, sleep_temp_min: e.target.value })} placeholder="35.5" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Temp Max (°C)</label>
                                                        <input type="number" value={paramForm.sleep_temp_max} onChange={e => setParamForm({ ...paramForm, sleep_temp_max: e.target.value })} placeholder="37.2" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Snoring (min)</label>
                                                        <input type="number" value={paramForm.sleep_snoring} onChange={e => setParamForm({ ...paramForm, sleep_snoring: e.target.value })} placeholder="0" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Low O2 (min)</label>
                                                        <input type="number" value={paramForm.sleep_low_oxygen} onChange={e => setParamForm({ ...paramForm, sleep_low_oxygen: e.target.value })} placeholder="0" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* MEAL */}
                                        {paramForm.name === 'group_meal' && (
                                            <div className="flex flex-col gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Meal Type *</label>
                                                    <select value={paramForm.meal_type} onChange={e => setParamForm({ ...paramForm, meal_type: e.target.value })} className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00] appearance-none cursor-pointer">
                                                        <option value="" disabled>Select a meal type...</option>
                                                        <option value="Breakfast">Breakfast</option>
                                                        <option value="Lunch">Lunch</option>
                                                        <option value="Dinner">Dinner</option>
                                                        <option value="Snack">Snack</option>
                                                    </select>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Energy (kcal)</label>
                                                        <input type="number" value={paramForm.meal_energy} onChange={e => setParamForm({ ...paramForm, meal_energy: e.target.value })} placeholder="600" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Protein (g)</label>
                                                        <input type="number" value={paramForm.meal_protein} onChange={e => setParamForm({ ...paramForm, meal_protein: e.target.value })} placeholder="40" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Carbs (g)</label>
                                                        <input type="number" value={paramForm.meal_carb} onChange={e => setParamForm({ ...paramForm, meal_carb: e.target.value })} placeholder="60" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#5D5A53] mb-1 truncate">Fat (g)</label>
                                                        <input type="number" value={paramForm.meal_fat} onChange={e => setParamForm({ ...paramForm, meal_fat: e.target.value })} placeholder="20" className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* SINGLE SYMPTOM */}
                                        {isSymptom && (
                                            <div>
                                                <label className="flex items-center gap-4 cursor-pointer p-4 border border-[#EBE7DE] rounded-xl bg-white hover:border-[#A84A00]/50 transition-colors">
                                                    <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${paramForm.is_present ? 'bg-[#A84A00] border-[#A84A00]' : 'border-[#A8A29E]'}`}>
                                                        {paramForm.is_present && <Check size={16} className="text-white" />}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-[#2C2A26]">Symptom Present</p>
                                                        <p className="text-xs text-[#A8A29E]">Check this if you are experiencing this symptom.</p>
                                                    </div>
                                                    <input type="checkbox" className="hidden" checked={paramForm.is_present} onChange={e => setParamForm({ ...paramForm, is_present: e.target.checked })} />
                                                </label>
                                            </div>
                                        )}

                                        {/* SINGLE STANDARD METRIC */}
                                        {isStandardMetric && (
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
                                        )}

                                        {/* TIMESTAMPS */}
                                        {selectedEntity && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Recorded At *</label>
                                                    <input type="datetime-local" value={paramForm.recorded_at} onChange={e => setParamForm({ ...paramForm, recorded_at: e.target.value })} className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                </div>

                                                {(paramForm.name === 'group_exercise' || paramForm.name === 'group_sleep' || ['Step Count', 'Active Minutes'].includes(paramForm.name)) && (
                                                    <div>
                                                        <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">Ended At</label>
                                                        <input type="datetime-local" value={paramForm.ended_at} onChange={e => setParamForm({ ...paramForm, ended_at: e.target.value })} className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A84A00]" />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <button
                                            onClick={handleAddParameter}
                                            disabled={!paramForm.name || paramSaving}
                                            className="w-full py-3 bg-[#A84A00] hover:bg-[#8A3D00] text-white rounded-xl font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                                        >
                                            {paramSaving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Check size={16} /> Save Reading</>}
                                        </button>
                                    </div>
                                );
                            })()}

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
