import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Globe, 
  Send, 
  UserCheck, 
  Sparkles, 
  Clock, 
  ArrowLeft, 
  HeartPulse, 
  FileText, 
  Video, 
  CheckCircle2, 
  AlertTriangle,
  Activity,
  Lock
} from 'lucide-react';
import LibertyMDFooterRibbon from './LibertyMDFooterRibbon';
import { PatientOathEmblem } from './LibertyMDFooterBadges';
import LibertyMD3DBlobLogo from './LibertyMD3DBlobLogo';
import LibertyMDMedicalCrossLogo from './LibertyMDMedicalCrossLogo';

interface LibertyMDAppProps {
  onBack?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  triageData?: {
    severity: 'low' | 'moderate' | 'urgent';
    possibleCauses: string[];
    actionPlan: string[];
    redFlags: string[];
  };
}

export default function LibertyMDApp({ onBack }: LibertyMDAppProps) {
  const [region, setRegion] = useState<'EU' | 'US'>('EU');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'ai',
      text: `Hello! I am LibertyMD, your confidential AI primary and urgent care physician built on peer-reviewed clinical medicine. Describe your symptoms, or select a scenario below to explore a live differential diagnosis.`
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'chat' | 'doctors'>('chat');

  const SAMPLE_CASES = [
    {
      label: 'Sharp lower right abdominal pain & mild fever',
      symptom: 'I have sharp pain in my lower right abdomen that started 6 hours ago near my belly button, with nausea and low fever.',
      response: {
        text: 'Based on your presentation of acute right lower quadrant (RLQ) abdominal pain originating periumbilically with associated nausea and low-grade pyrexia, acute appendicitis is a primary clinical differential that must be urgently evaluated.',
        triageData: {
          severity: 'urgent' as const,
          possibleCauses: [
            'Acute Appendicitis (McBurney point tenderness)',
            'Mesenteric Lymphadenitis',
            'Right-sided Renal Colic / Nephrolithiasis'
          ],
          actionPlan: [
            'Seek immediate evaluation at an Urgent Care or Emergency Department.',
            'Do not consume solid foods or analgesics that mask peritoneal signs prior to surgical consult.',
            'Connect with a LibertyMD physician below for an instant priority referral.'
          ],
          redFlags: [
            'Rebound tenderness or rigid abdomen',
            'Temperature exceeding 38.5°C (101.3°F)',
            'Inability to stand upright or walk without severe guarding'
          ]
        }
      }
    },
    {
      label: 'Persistent 3-day migraine & photophobia',
      symptom: 'I have had a throbbing unilateral headache on my left temple for 3 days with sensitivity to bright lights and nausea.',
      response: {
        text: 'Your symptoms align closely with Acute Migraine with Photophobia. Because symptoms have persisted for 72 hours (Status Migrainosus risk), targeted abortive therapy or a clinical evaluation is recommended.',
        triageData: {
          severity: 'moderate' as const,
          possibleCauses: [
            'Migraine Headache without Aura',
            'Tension-type Headache with nausea overlay',
            'Cervicogenic Headache'
          ],
          actionPlan: [
            'Rest in a dark, quiet room and maintain hydration with electrolytes.',
            'Consider NSAIDs or Triptans if previously prescribed by your doctor.',
            'Book a €39 / $39 LibertyMD video consultation for immediate prescription refill or rescue medication.'
          ],
          redFlags: [
            'Sudden thunderclap onset reaching maximum intensity within 60 seconds',
            'Associated limb weakness, slurred speech, or vision loss',
            'Headache following recent head trauma'
          ]
        }
      }
    },
    {
      label: 'Mild dry cough & scratchy throat',
      symptom: 'I have had a mild dry cough and a scratchy throat for 2 days. No high fever or shortness of breath.',
      response: {
        text: 'This presentation is most consistent with an uncomplicated Viral Upper Respiratory Tract Infection (Common Cold or early Pharyngitis).',
        triageData: {
          severity: 'low' as const,
          possibleCauses: [
            'Viral Upper Respiratory Infection (URI)',
            'Seasonal Allergic Rhinitis / Post-nasal drip',
            'Mild Acute Pharyngitis'
          ],
          actionPlan: [
            'Supportive care: warm salt-water gargles, honey tea, and adequate rest.',
            'Monitor for secondary bacterial symptoms over the next 48-72 hours.',
            'Request a digital doctor note for work/university if needed.'
          ],
          redFlags: [
            'Difficulty breathing or wheezing at rest',
            'Fever > 39°C persisting beyond 3 days',
            'Inability to swallow fluids due to severe throat swelling'
          ]
        }
      }
    }
  ];

  const handleSend = (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setIsTyping(true);

    setTimeout(() => {
      // Check if matched a sample case
      const matchedCase = SAMPLE_CASES.find(c => c.symptom === text);
      if (matchedCase) {
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'ai',
            text: matchedCase.response.text,
            triageData: matchedCase.response.triageData
          }
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'ai',
            text: `I have analyzed your symptoms ("${text.slice(0, 80)}..."). Based on clinical diagnostic criteria, here is your preliminary assessment and recommended next steps.`,
            triageData: {
              severity: 'moderate',
              possibleCauses: [
                'Primary Differential Assessment',
                'Secondary Diagnostic Consideration',
                'Environmental / Lifestyle Overlay'
              ],
              actionPlan: [
                'Log symptom progression and vital signs twice daily.',
                'Stay well-hydrated and avoid strenuous physical exertion.',
                `Consult a licensed ${region === 'EU' ? 'European GDPR-Certified' : 'US HIPAA-Licensed'} doctor below for a verified treatment plan.`
              ],
              redFlags: [
                'Sudden onset of severe chest pain or shortness of breath',
                'New confusion or dizziness on standing'
              ]
            }
          }
        ]);
      }
      setIsTyping(false);
    }, 900);
  };

  const dockZoneRef = useRef<HTMLDivElement | null>(null);
  const [logoTransform, setLogoTransform] = useState({
    y: 280,
    scale: 1.25,
    rotate: 0,
    opacity: 0.88,
    isDocked: false
  });

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;

      if (dockZoneRef.current) {
        const dockRect = dockZoneRef.current.getBoundingClientRect();
        const dockCenterY = dockRect.top + dockRect.height / 2;

        // Check if the dock section is arriving in viewport
        if (dockCenterY <= windowHeight * 0.72 && dockCenterY >= windowHeight * 0.15) {
          setLogoTransform({
            y: dockCenterY,
            scale: 0.95,
            rotate: 0,
            opacity: 1,
            isDocked: true
          });
        } else {
          // Traverses down smoothly from top hero area
          const progress = Math.min(1, scrollY / 1400);
          const currentY = 280 + progress * (windowHeight * 0.34);
          setLogoTransform({
            y: currentY,
            scale: 1.25 - progress * 0.2,
            rotate: 0,
            opacity: 0.88,
            isDocked: false
          });
        }
      } else {
        const progress = Math.min(1, scrollY / 1400);
        const currentY = 280 + progress * (windowHeight * 0.34);
        setLogoTransform({
          y: currentY,
          scale: 1.25 - progress * 0.2,
          rotate: 0,
          opacity: 0.88,
          isDocked: false
        });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0E1117] relative text-[#E6EDF3] font-sans flex flex-col selection:bg-[#2563EB] selection:text-white overflow-x-hidden">
      {/* Moving Central 3D LibertyMD Patient Oath Emblem (Traverses behind semi-transparent frosted cards!) */}
      <div
        style={{
          position: 'fixed',
          top: `${logoTransform.y}px`,
          left: '50%',
          transform: `translate(-50%, -50%) scale(${logoTransform.scale}) rotate(${logoTransform.rotate}deg)`,
          opacity: logoTransform.opacity,
          zIndex: 1,
          pointerEvents: 'none',
          transition: 'top 0.12s cubic-bezier(0.16, 1, 0.3, 1), transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="flex items-center justify-center select-none"
      >
        <div className="relative flex items-center justify-center">
          <LibertyMDMedicalCrossLogo size={350} />
        </div>
      </div>

      {/* Top Banner & Navigation */}
      <header className="border-b border-[#21262D] bg-[#161B22]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 rounded-lg text-[#8B949E] hover:text-white hover:bg-[#21262D] transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Portfolio
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#10B981] flex items-center justify-center shadow-lg shadow-[#2563EB]/20">
                <HeartPulse className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-[#93C5FD] to-[#6EE7B7] bg-clip-text text-transparent">
                  LibertyMD
                </span>
                <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#238636]/20 text-[#3FB950] border border-[#238636]/40">
                  100% PRIVATE AI DOCTOR
                </span>
              </div>
            </div>
          </div>

          {/* Region Toggle: EU vs US */}
          <div className="flex items-center gap-3">
            <div className="bg-[#0D1117] border border-[#30363D] p-1 rounded-xl flex items-center text-xs font-medium">
              <button
                onClick={() => setRegion('EU')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  region === 'EU'
                    ? 'bg-[#21262D] text-white shadow-sm border border-[#30363D]'
                    : 'text-[#8B949E] hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-[#6EE7B7]" />
                <span>EU (GDPR Vault)</span>
              </button>
              <button
                onClick={() => setRegion('US')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  region === 'US'
                    ? 'bg-[#21262D] text-white shadow-sm border border-[#30363D]'
                    : 'text-[#8B949E] hover:text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-[#60A5FA]" />
                <span>US (HIPAA Certified)</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-10 border-b border-[#21262D] bg-gradient-to-b from-[#161B22]/60 to-transparent">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1F2937]/80 border border-[#374151] text-xs font-medium text-[#9CA3AF] mb-6">
            <ShieldCheck className="w-4 h-4 text-[#10B981]" />
            <span>
              {region === 'EU'
                ? 'End-to-End GDPR Compliant • Anonymous Sovereign EU Storage'
                : 'HIPAA Compliant • 50-State Physician Network • Zero Data Resale'}
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
            Free, Instant Medical Intelligence.<br />
            <span className="bg-gradient-to-r from-[#60A5FA] via-[#34D399] to-[#A78BFA] bg-clip-text text-transparent">
              Real Doctors When You Need Them.
            </span>
          </h1>
          <p className="text-lg text-[#8B949E] max-w-2xl mx-auto mb-8">
            Describe your symptoms to LibertyMD for immediate triage based on peer-reviewed research. Need a prescription or work note? See a licensed physician for{' '}
            <strong className="text-white font-semibold">{region === 'EU' ? '€39' : '$39'}</strong>.
          </p>

          {/* Mode Switcher Tabs */}
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setSelectedTab('chat')}
              className={`px-6 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 ${
                selectedTab === 'chat'
                  ? 'bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white shadow-lg shadow-[#2563EB]/25 border border-[#3B82F6]/30'
                  : 'bg-[#161B22] border border-[#30363D] text-[#8B949E] hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              AI Symptom & Triage Chat
            </button>
            <button
              onClick={() => setSelectedTab('doctors')}
              className={`px-6 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 ${
                selectedTab === 'doctors'
                  ? 'bg-gradient-to-r from-[#10B981] to-[#059669] text-white shadow-lg shadow-[#10B981]/25 border border-[#34D399]/30'
                  : 'bg-[#161B22] border border-[#30363D] text-[#8B949E] hover:text-white'
              }`}
            >
              <Video className="w-4 h-4" />
              See Licensed Doctors ({region === 'EU' ? '€39' : '$39'})
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {selectedTab === 'chat' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Sample Cases & Clinical Trust Info */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B949E] mb-3">
                  Interactive Clinical Cases
                </h3>
                <p className="text-xs text-[#8B949E] mb-4">
                  Click any verified presentation below to test LibertyMD's diagnostic accuracy:
                </p>
                <div className="space-y-2.5">
                  {SAMPLE_CASES.map((c, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(c.symptom)}
                      className="w-full text-left p-3 rounded-xl bg-[#0D1117] border border-[#21262D] hover:border-[#3B82F6]/50 hover:bg-[#1E293B]/30 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-white group-hover:text-[#60A5FA] transition-colors">
                          Case #{idx + 1}
                        </span>
                        <Activity className="w-3.5 h-3.5 text-[#34D399]" />
                      </div>
                      <p className="text-xs text-[#9CA3AF] line-clamp-2">
                        {c.label}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Privacy Guarantee Card */}
              <div className="bg-gradient-to-br from-[#161B22] to-[#1E293B]/40 border border-[#30363D] rounded-2xl p-5">
                <div className="flex items-center gap-2.5 text-white font-semibold text-sm mb-2">
                  <ShieldCheck className="w-5 h-5 text-[#34D399]" />
                  <span>Sovereign Privacy Architecture</span>
                </div>
                <p className="text-xs text-[#8B949E] leading-relaxed">
                  Unlike conventional search engines, LibertyMD does not store PII or sell query logs to third-party insurers. All consultations operate within strict {region === 'EU' ? 'EU GDPR Article 9' : 'HIPAA Safe Harbor'} encryption boundaries.
                </p>
              </div>
            </div>

            {/* Right Column: Interactive Chat Interface */}
            <div className="lg:col-span-2 flex flex-col bg-[#161B22] border border-[#30363D] rounded-2xl overflow-hidden h-[640px]">
              {/* Chat Header */}
              <div className="px-5 py-3.5 border-b border-[#21262D] bg-[#0D1117]/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3FB950] animate-pulse" />
                  <span className="text-sm font-semibold text-white">LibertyMD Clinical Engine</span>
                  <span className="text-xs text-[#8B949E] font-mono">v2.4 (Peer-Reviewed RAG)</span>
                </div>
                <button
                  onClick={() =>
                    setMessages([
                      {
                        id: '1',
                        sender: 'ai',
                        text: `Hello! I am LibertyMD, your confidential AI primary and urgent care physician built on peer-reviewed clinical medicine. Describe your symptoms, or select a scenario below to explore a live differential diagnosis.`
                      }
                    ])
                  }
                  className="text-xs text-[#8B949E] hover:text-white transition-colors"
                >
                  Reset Consultation
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl p-4.5 ${
                        m.sender === 'user'
                          ? 'bg-[#2563EB] text-white rounded-br-none'
                          : 'bg-[#0D1117] border border-[#21262D] text-[#E6EDF3] rounded-bl-none'
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-line mb-3">
                        {m.text}
                      </p>

                      {/* Structured Triage Output if present */}
                      {m.triageData && (
                        <div className="mt-4 pt-4 border-t border-[#21262D] space-y-4">
                          {/* Severity Badge */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider">
                              Triage Acuity:
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                                m.triageData.severity === 'urgent'
                                  ? 'bg-[#DC2626]/20 text-[#F87171] border border-[#DC2626]/40'
                                  : m.triageData.severity === 'moderate'
                                  ? 'bg-[#F59E0B]/20 text-[#FBBF24] border border-[#F59E0B]/40'
                                  : 'bg-[#10B981]/20 text-[#34D399] border border-[#10B981]/40'
                              }`}
                            >
                              {m.triageData.severity}
                            </span>
                          </div>

                          {/* Possible Differential Causes */}
                          <div>
                            <span className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider block mb-2">
                              Primary Clinical Differentials
                            </span>
                            <ul className="space-y-1">
                              {m.triageData.possibleCauses.map((item, i) => (
                                <li key={i} className="text-xs text-white flex items-center gap-2">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#3B82F6] shrink-0" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Recommended Action Plan */}
                          <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-3">
                            <span className="text-xs font-semibold text-[#34D399] block mb-2">
                              Recommended Medical Action Plan
                            </span>
                            <ul className="space-y-1.5">
                              {m.triageData.actionPlan.map((act, i) => (
                                <li key={i} className="text-xs text-[#D1D5DB] flex items-start gap-2">
                                  <span className="text-[#34D399] font-bold">•</span>
                                  <span>{act}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Red Flags */}
                          {m.triageData.redFlags.length > 0 && (
                            <div className="bg-[#450A0A]/30 border border-[#991B1B]/50 rounded-xl p-3">
                              <span className="text-xs font-semibold text-[#F87171] flex items-center gap-1.5 mb-2">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Urgent Red Flag Symptoms (Seek ER Care if present)
                              </span>
                              <ul className="space-y-1">
                                {m.triageData.redFlags.map((flag, i) => (
                                  <li key={i} className="text-xs text-[#FECACA]">
                                    - {flag}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-[#0D1117] border border-[#21262D] rounded-2xl px-4 py-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#8B949E] animate-bounce" />
                      <span className="w-2 h-2 rounded-full bg-[#8B949E] animate-bounce [animation-delay:0.2s]" />
                      <span className="w-2 h-2 rounded-full bg-[#8B949E] animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-[#21262D] bg-[#0D1117]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Describe symptoms (e.g. sharp headache, sinus pressure, fever)..."
                    className="flex-1 bg-[#161B22] border border-[#30363D] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6E7681] focus:outline-none focus:border-[#3B82F6]"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="px-5 py-3 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 rounded-xl text-white font-medium text-sm transition-all flex items-center gap-2 shadow-lg shadow-[#2563EB]/20"
                  >
                    <span>Analyze</span>
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          /* Doctors Telemedicine Panel */
          <div className="space-y-6">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">
                Licensed Physicians Ready in Under 30 Minutes
              </h2>
              <p className="text-sm text-[#8B949E]">
                LibertyMD doctors already have access to your AI symptom triage summary — saving you time explaining and letting you focus on recovery.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  name: region === 'EU' ? 'Dr. Elena Rostova, MD' : 'Dr. Jeffrey Jones, MD',
                  specialty: 'Emergency Medicine & Urgent Care',
                  credentials: region === 'EU' ? 'Charité Universitätsmedizin Berlin • 18y Exp' : 'Indiana University School of Medicine • 22y Exp',
                  rating: '4.98',
                  availableIn: '9 mins'
                },
                {
                  name: region === 'EU' ? 'Dr. Marco Rossi, MD' : 'Dr. Rajiv Patel, MD',
                  specialty: 'Internal Medicine & Cardiovascular Care',
                  credentials: region === 'EU' ? 'Università di Milano • 21y Exp' : 'Indiana-Purdue IUPUI • 25y Exp',
                  rating: '4.95',
                  availableIn: '14 mins'
                },
                {
                  name: region === 'EU' ? 'Dr. Astrid Lindqvist, MD' : 'Dr. Barry Pevner, MD',
                  specialty: 'Family Medicine & Primary Care',
                  credentials: region === 'EU' ? 'Karolinska Institutet Stockholm • 19y Exp' : 'Hahnemann University Drexel • 25y Exp',
                  rating: '4.97',
                  availableIn: '18 mins'
                }
              ].map((doc, idx) => (
                <div
                  key={idx}
                  className="bg-[#161B22] border border-[#30363D] rounded-2xl p-6 flex flex-col justify-between hover:border-[#3B82F6]/50 transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#10B981]/20 text-[#34D399] border border-[#10B981]/30 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        Available in {doc.availableIn}
                      </span>
                      <span className="text-xs text-[#E6EDF3] font-bold">★ {doc.rating}</span>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">{doc.name}</h3>
                    <p className="text-xs font-semibold text-[#60A5FA] mb-3">{doc.specialty}</p>
                    <p className="text-xs text-[#8B949E] leading-relaxed mb-6">{doc.credentials}</p>
                  </div>

                  <button
                    onClick={() => alert(`Starting simulated secure video visit with ${doc.name} for ${region === 'EU' ? '€39' : '$39'}.`)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] hover:from-[#1D4ED8] hover:to-[#1E40AF] text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#2563EB]/25"
                  >
                    <Video className="w-4 h-4" />
                    <span>Start Visit ({region === 'EU' ? '€39' : '$39'})</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- Doctronic-Inspired Expansive Body Sections (With semi-transparent glassmorphic backdrop so text remains readable as the 3D logo traverses behind!) --- */}
        <div className="pt-24 space-y-28">
          {/* Section 1: How LibertyMD Autonomous Clinical Triage Works */}
          <section className="relative z-10 bg-[#0D1117]/85 backdrop-blur-md border border-[#30363D] rounded-3xl p-8 sm:p-12 shadow-2xl">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1F2937]/80 border border-[#374151] text-xs font-semibold text-[#60A5FA] mb-4">
                <Activity className="w-3.5 h-3.5 text-[#34D399]" />
                <span>Autonomous Medical Engine</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
                How LibertyMD Autonomous Clinical Triage Works
              </h2>
              <p className="text-[#8B949E] text-base sm:text-lg leading-relaxed">
                Traditional healthcare fragments triage, diagnostics, and prescription refills. LibertyMD unifies peer-reviewed medical intelligence with live 50-state and European physician networks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  step: '01',
                  title: 'Symptom Ingestion & NLP Parsing',
                  desc: 'Structured extraction of primary complaints, onset duration, and co-morbidities using clinical natural language processing.'
                },
                {
                  step: '02',
                  title: 'Peer-Reviewed Diagnostic Engine',
                  desc: 'Cross-referenced against 40M+ Cochrane systematic reviews, PubMed literature, and international clinical guidelines.'
                },
                {
                  step: '03',
                  title: 'Sovereign Encrypted Enclave',
                  desc: 'Full isolation under EU GDPR Article 9 & US HIPAA Safe Harbor. Your data never trains public LLMs or gets resold.'
                },
                {
                  step: '04',
                  title: 'Physician Verification & Prescription',
                  desc: 'Instant review by a licensed human physician with e-prescription dispatch to your local pharmacy in under 15 minutes.'
                }
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="bg-[#161B22]/90 border border-[#21262D] hover:border-[#3B82F6]/50 rounded-2xl p-6 flex flex-col justify-between transition-all group"
                >
                  <div>
                    <span className="text-3xl font-black text-[#2563EB]/40 group-hover:text-[#60A5FA] transition-colors font-mono">
                      {item.step}
                    </span>
                    <h3 className="text-lg font-bold text-white mt-3 mb-2">
                      {item.title}
                    </h3>
                    <p className="text-xs text-[#8B949E] leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 2: Enterprise Healthcare Spend Governance */}
          <section className="relative z-10 bg-[#0D1117]/85 backdrop-blur-md border border-[#30363D] rounded-3xl p-8 sm:p-12 shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-[#34D399] mb-2 block">
                  Enterprise Spend Governance
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
                  Recover employee productivity & healthcare margins
                </h2>
                <p className="text-[#8B949E] text-base leading-relaxed mb-6">
                  Employers lose up to 12 days per employee annually waiting for primary care appointments and unnecessary emergency room visits. LibertyMD provides instant, autonomous clinical triage and telehealth resolution at a fraction of traditional insurance claims.
                </p>
                <div className="space-y-3 text-sm text-[#E6EDF3]">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0" />
                    <span>100% auditable diagnostic logs with physician sign-off</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0" />
                    <span>Zero out-of-pocket surprise bills or deductible barriers</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0" />
                    <span>Seamless integration with European and US employer health plans</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#161B22]/90 border border-[#21262D] rounded-2xl p-6 text-center">
                  <div className="text-4xl font-black text-[#60A5FA] mb-2">99.4%</div>
                  <div className="text-sm font-semibold text-white">Diagnostic Concordance</div>
                  <p className="text-xs text-[#8B949E] mt-1">Matched against board-certified human panel</p>
                </div>
                <div className="bg-[#161B22]/90 border border-[#21262D] rounded-2xl p-6 text-center">
                  <div className="text-4xl font-black text-[#34D399] mb-2">&lt; 15m</div>
                  <div className="text-sm font-semibold text-white">Physician Response</div>
                  <p className="text-xs text-[#8B949E] mt-1">From initial triage to prescription dispatch</p>
                </div>
                <div className="bg-[#161B22]/90 border border-[#21262D] rounded-2xl p-6 text-center">
                  <div className="text-4xl font-black text-[#A78BFA] mb-2">40M+</div>
                  <div className="text-sm font-semibold text-white">Clinical Citations</div>
                  <p className="text-xs text-[#8B949E] mt-1">Indexed peer-reviewed medical literature</p>
                </div>
                <div className="bg-[#161B22]/90 border border-[#21262D] rounded-2xl p-6 text-center">
                  <div className="text-4xl font-black text-[#F43F5E] mb-2">0%</div>
                  <div className="text-sm font-semibold text-white">Data Resale</div>
                  <p className="text-xs text-[#8B949E] mt-1">Encrypted zero-knowledge storage vault</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Sovereign Diagnostic Architecture */}
          <section className="relative z-10 bg-[#0D1117]/85 backdrop-blur-md border border-[#30363D] rounded-3xl p-8 sm:p-12 shadow-2xl">
            <div className="max-w-3xl mx-auto text-center mb-10">
              <h2 className="text-3xl font-extrabold text-white tracking-tight mb-3">
                Peer-Reviewed Clinical Protocol Architecture
              </h2>
              <p className="text-sm text-[#8B949E]">
                Every recommendation generated by LibertyMD is backed by explicit citations from major medical institutions.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#161B22]/90 border border-[#21262D] rounded-2xl p-6">
                <FileText className="w-8 h-8 text-[#60A5FA] mb-4" />
                <h3 className="text-base font-bold text-white mb-2">Cochrane & PubMed Grounding</h3>
                <p className="text-xs text-[#8B949E] leading-relaxed">
                  Real-time retrieval augmented generation over authoritative randomized controlled trials and clinical meta-analyses.
                </p>
              </div>
              <div className="bg-[#161B22]/90 border border-[#21262D] rounded-2xl p-6">
                <AlertTriangle className="w-8 h-8 text-[#FBBF24] mb-4" />
                <h3 className="text-base font-bold text-white mb-2">Automated Red-Flag Screening</h3>
                <p className="text-xs text-[#8B949E] leading-relaxed">
                  Continuous evaluation for high-risk presentations including Status Migrainosus, Sepsis criteria, and acute ischemia.
                </p>
              </div>
              <div className="bg-[#161B22]/90 border border-[#21262D] rounded-2xl p-6">
                <Lock className="w-8 h-8 text-[#34D399] mb-4" />
                <h3 className="text-base font-bold text-white mb-2">Sovereign Patient Ownership</h3>
                <p className="text-xs text-[#8B949E] leading-relaxed">
                  Your medical profile is stored in an encrypted tenant belonging exclusively to you under strict EU & US compliance.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4: Sovereign Clinical Care & Patient Oath Docking Destination Area */}
          <section
            ref={dockZoneRef}
            className="relative z-10 bg-[#0D1117]/85 backdrop-blur-md border-2 border-[#2563EB]/40 rounded-3xl p-10 sm:p-16 shadow-2xl text-center overflow-hidden"
          >
            {/* Docking Landing Area Height Placeholder for the Moving Central 3D Logo */}
            <div className="h-72 sm:h-80 w-full flex items-center justify-center relative mb-6">
              {/* Subtle target ring showing where the 3D logo docks */}
              <div className="w-64 h-64 sm:w-72 sm:h-72 rounded-full border border-dashed border-[#3B82F6]/30 flex items-center justify-center animate-pulse" />
            </div>

            <div className="max-w-2xl mx-auto">
              <span className="text-xs font-black tracking-widest text-[#60A5FA] uppercase block mb-2">
                SOVEREIGN CLINICAL CARE PLEDGE
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-4">
                The LibertyMD Patient Oath
              </h2>
              <p className="text-sm sm:text-base text-[#9CA3AF] leading-relaxed">
                We pledge that every clinical triage assessment is grounded strictly in peer-reviewed medical science, isolated within a private encrypted enclave, and verified by a licensed human physician before intervention. Your health is sovereign.
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Exact Doctronic-Style 3D Volumetric Ribbon Footer in Blue */}
      <footer className="relative mt-24 bg-gradient-to-b from-[#EFF6FF] via-[#F0F9FF] to-[#E0F2FE] text-[#0F172A] overflow-hidden min-h-[720px] flex flex-col justify-between">
        {/* Three.js WebGL 3D Silk Wave Ribbon (Blue Theme) */}
        <LibertyMDFooterRibbon />

        {/* Top Content: Links + Trust Badges */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 pt-16 w-full">
          <div className="flex flex-col lg:flex-row justify-between items-start gap-12">
            {/* Left Columns */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-xs font-medium text-[#334155]">
              <div className="space-y-4">
                <p className="font-semibold text-sm text-[#0F172A]">Clinical Care</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-[#2563EB] cursor-pointer">Symptom Checker</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">Urgent Care Specialist</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">Primary Telehealth</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">Prescription Refills</li>
                </ul>

                <p className="font-semibold text-sm text-[#0F172A] pt-4">Help & Privacy</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-[#2563EB] cursor-pointer">FAQs</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">GDPR Privacy Policy</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">HIPAA Compliance</li>
                </ul>
              </div>

              <div className="space-y-4">
                <p className="font-semibold text-sm text-[#0F172A]">Company</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-[#2563EB] cursor-pointer">About LibertyMD</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">Careers</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">Medical Reviewers</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">Team</li>
                </ul>
              </div>

              <div className="space-y-4">
                <p className="font-semibold text-sm text-[#0F172A]">Conditions</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-[#2563EB] cursor-pointer">Respiratory Care</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">Cardiovascular</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">Neurology & Migraine</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">All Conditions</li>
                </ul>

                <p className="font-semibold text-sm text-[#0F172A] pt-4">Research</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-[#2563EB] cursor-pointer">Clinical Blog</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">Peer-Reviewed RAG</li>
                </ul>
              </div>

              <div className="space-y-4">
                <p className="font-semibold text-sm text-[#0F172A]">Partnerships</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-[#2563EB] cursor-pointer">Become a Partner</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">EU Health Systems</li>
                  <li className="hover:text-[#2563EB] cursor-pointer">US Insurance Network</li>
                </ul>
              </div>
            </div>

            {/* Right Side: CARIN / HIPAA / LegitScript Badges using real image URLs */}
            <div className="flex items-center gap-6 shrink-0 self-start">
              <img
                src="https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/libertymd-assets/carin-accredited.png"
                alt="CARIN Accredited Code of Conduct"
                className="h-16 w-auto object-contain hover:scale-105 transition-transform drop-shadow-sm"
              />
              <img
                src="https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/libertymd-assets/hipaa-certified.png"
                alt="HIPAA Certified"
                className="h-16 w-auto object-contain hover:scale-105 transition-transform drop-shadow-sm"
              />
              <img
                src="https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/libertymd-assets/legit_script.png"
                alt="LegitScript Certified"
                className="h-16 w-auto object-contain hover:scale-105 transition-transform drop-shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Center Patient Oath Emblem + Floating Medical Input Pill */}
        <div className="relative z-10 flex flex-col items-center justify-center py-12 px-4">
          {/* Patient Oath Circle Seal Emblem */}
          <div className="mb-10 hover:scale-105 transition-transform">
            <PatientOathEmblem className="w-48 h-48" />
          </div>

          {/* Floating Pill Search Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="w-full max-w-2xl bg-white/90 backdrop-blur-md rounded-full p-2 pl-6 shadow-2xl border border-white/80 flex items-center gap-3 transition-all hover:shadow-3xl hover:bg-white"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your health..."
              className="flex-1 bg-transparent border-none text-base text-[#0F172A] placeholder-[#64748B] focus:outline-none"
            />
            <button
              type="submit"
              className="w-12 h-12 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white flex items-center justify-center shadow-lg shadow-[#2563EB]/30 transition-transform active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>

        {/* Bottom Copyright */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 py-6 w-full flex flex-col sm:flex-row items-center justify-between text-xs text-[#475569] border-t border-[#CBD5E1]/60">
          <p>© {new Date().getFullYear()} LibertyMD Health Technologies. All rights reserved.</p>
          <p>Privacy-first AI triage • EU GDPR Article 9 & US HIPAA Safe Harbor</p>
        </div>
      </footer>
    </div>
  );
}
