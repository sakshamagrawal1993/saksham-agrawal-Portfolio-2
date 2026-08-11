/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Analytics from './services/analytics';
import {
  isLibertyMdClinicalPath,
  syncLibertyMdSessionReplayForPath,
} from './components/LibertyMD/libertymd-session-replay';
import { AuthProvider } from './context/AuthContext';
import Hero from './components/Hero';
import ProductGrid from './components/ProductGrid';
import About from './components/About';
import Experience from './components/Experience';
import Journal from './components/Journal';
import Assistant from './components/Assistant';
import Footer from './components/Footer';
import ProductDetail from './components/ProductDetail';
import SmoothScroll from './components/SmoothScroll';
import GrainOverlay from './components/GrainOverlay';
import { PROJECTS } from './constants';
import { useProjectMetadata } from './hooks/useProjectMetadata';

// Lazy Load Route Components
const BlogFeed = lazy(() => import('./components/blog/BlogFeed'));
const BlogPost = lazy(() => import('./components/blog/BlogPost'));
const Dashboard = lazy(() => import('./components/dashboard/Dashboard'));
const Login = lazy(() => import('./components/auth/Login'));
const PostEditor = lazy(() => import('./components/dashboard/PostEditor'));
const TicketflowApp = lazy(() => import('./components/Ticketflow/TicketflowApp'));
const InsightsLMApp = lazy(() => import('./components/InsightsLM/InsightsLMApp'));
const RunnerApp = lazy(() => import('./components/Runner/RunnerApp'));
const TwinLanding = lazy(() => import('./components/HealthTwin/TwinLanding').then(m => ({ default: m.TwinLanding })));
const HealthTwinDashboard = lazy(() => import('./components/HealthTwin/DashboardLayout'));
const PlaygroundLayout = lazy(() => import('./components/HealthTwin/Playground/PlaygroundLayout').then(m => ({ default: m.PlaygroundLayout })));
const MindCoachLanding = lazy(() => import('./components/MindCoach/MindCoachLanding'));
const MindCoachApp = lazy(() => import('./components/MindCoach/MindCoachApp'));

const MedicalBenchmarkApp = lazy(() => import('./src/components/MedicalBenchmark/MedicalBenchmarkApp'));
const PortfolioPage = lazy(() => import('./components/PortfolioPage'));
const AIGatingApp = lazy(() => import('./components/AIGate/AIGatingApp'));

const UnityCardLanding = lazy(() => import('./components/UnityCard/UnityCardLanding'));
const UnityCardOnboarding = lazy(() => import('./components/UnityCard/UnityCardOnboarding'));
const UnityCardDashboard = lazy(() => import('./components/UnityCard/UnityCardDashboard'));

const TradingAgentsApp = lazy(() => import('./components/TradingAgents/TradingAgentsApp'));
const FnOCopilotApp = lazy(() => import('./components/FnOCopilot/FnOCopilotApp'));

const AICareLanding = lazy(() => import('./components/AICare/AICareLanding').then(m => ({ default: m.AICareLanding })));
const AICareProfile = lazy(() => import('./components/AICare/AICareProfile').then(m => ({ default: m.AICareProfile })));
const AICareChat = lazy(() => import('./components/AICare/AICareChat').then(m => ({ default: m.AICareChat })));
const AICareObservations = lazy(() => import('./components/AICare/AICareObservations').then(m => ({ default: m.AICareObservations })));
const LibertyMDApp = lazy(() => import('./components/LibertyMD/LibertyMDApp'));
const loadLibertyMDChat = () => import('./components/LibertyMD/LibertyMDChat');
const loadLibertyMDReportPage = () => import('./components/LibertyMD/LibertyMDReportPage');
const LibertyMDChat = lazy(loadLibertyMDChat);
const LibertyMDReportRedeemPage = lazy(() => import('./components/LibertyMD/LibertyMDReportRedeemPage'));
const LibertyMDReportPage = lazy(loadLibertyMDReportPage);
const LibertyMDFollowupCheckinPage = lazy(() => import('./components/LibertyMD/LibertyMDFollowupCheckinPage'));
const LibertyMDFollowupUnsubscribePage = lazy(() => import('./components/LibertyMD/LibertyMDFollowupUnsubscribePage'));

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#F5F2EB] font-serif italic text-[#2C2A26]/50">
    Loading...
  </div>
);

/** P4-09 — LibertyMD Suspense fallback; never Saksham cream/ink on `/liberty-md*`. */
const LibertyMDLoadingFallback = () => (
  <div
    role="status"
    aria-live="polite"
    className="flex min-h-[100svh] flex-col items-center justify-center bg-[#f4f8fd] px-6 text-center font-sans text-[#17325f]"
  >
    <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2563eb] text-4xl font-light text-white shadow-[0_16px_40px_rgba(37,99,235,0.28)]">
      <span aria-hidden="true">+</span>
      <span className="absolute -inset-2 -z-10 animate-pulse rounded-3xl bg-[#2563eb]/15" aria-hidden="true" />
    </div>
    <p className="font-serif text-2xl font-semibold text-[#0f274a]">LibertyMD</p>
    <p className="mt-2 text-sm font-medium text-[#526784]">Opening your private care experience…</p>
    <span className="mt-5 h-6 w-6 animate-spin rounded-full border-2 border-[#b9caf0] border-t-[#2563eb]" aria-hidden="true" />
  </div>
);

function HomePage() {
  const navigate = useNavigate();


  return (
    <>
      <Hero />
      <About />
      <Experience />
      <ProductGrid onProductClick={(p) => navigate(`/project/${p.id}`)} featuredOnly={true} />
      <Journal />
    </>
  );
}

function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const metadataMap = useProjectMetadata();
  const project = PROJECTS.find((p) => p.id === id);

  if (!project) {
    return <Navigate to="/" replace />;
  }

  const meta = id ? metadataMap[id] : null;
  const slideDeckUrl = (meta?.slide_deck_url || project.slideDeckUrl || '').trim();
  const mergedProject = {
    ...project,
    imageUrl: meta?.image_url || project.imageUrl,
    slideDeckUrl: slideDeckUrl || undefined,
  };

  return (
    <ProductDetail
      project={mergedProject}
      onBack={() => {
        navigate('/#work');
      }}
    />
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState('About');

  // Scroll Spy Logic
  useEffect(() => {
    if (location.pathname !== '/') return;

    const observerOptions = {
      root: null,
      rootMargin: '-40% 0px -40% 0px', // Center-focused intersection for better accuracy
      threshold: 0
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          // Map ID to Nav Item Name
          const map: Record<string, string> = {
            'about': 'About',
            'experience': 'About', // Treat Experience as distinct section that maps to About
            'work': 'Portfolio',
            'journal': 'Journal',
            'contact': 'Contact'
          };
          if (map[id]) setActiveSection(map[id]);
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    // Slight delay to ensure DOM is ready
    setTimeout(() => {
      const sections = document.querySelectorAll('section[id], footer[id]');
      sections.forEach((section) => observer.observe(section));
    }, 500);

    return () => observer.disconnect();
  }, [location.pathname]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    setActiveSection(
      targetId === 'about' ? 'About' :
        targetId === 'work' ? 'Portfolio' :
          targetId === 'journal' ? 'Journal' :
            targetId === 'contact' ? 'Contact' : 'About'
    );

    if (location.pathname !== '/') {
      navigate('/#' + targetId);
    } else {
      // If already on home, just update hash or scroll
      window.history.pushState(null, '', `#${targetId}`);
      const element = document.getElementById(targetId);
      if (element) {
        const headerOffset = 85;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - headerOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  // Scroll to top on route change
  useEffect(() => {
    // If not a hash link, scroll to top
    if (!location.hash) {
      window.scrollTo(0, 0);
    }
    // Track Page View
    Analytics.trackPageView(location.pathname + location.hash + location.search);
  }, [location.pathname, location.hash, location.search]);

  // P1-18 — Session Replay clinical gate SoT (pathname prefix `/liberty-md*`).
  // Runs before/without waiting on lazy Chat; Chat remount calls the same helper.
  useEffect(() => {
    syncLibertyMdSessionReplayForPath(location.pathname);
  }, [location.pathname]);

  // Warm the next LibertyMD route while the patient is reading the current
  // screen. This removes the lazy-chunk gap that can otherwise look like a
  // blank white page on slower mobile connections.
  useEffect(() => {
    if (location.pathname === '/liberty-md' || location.pathname.startsWith('/liberty-md/t/')) {
      void loadLibertyMDChat();
    } else if (location.pathname === '/liberty-md/chat') {
      void loadLibertyMDReportPage();
    }
  }, [location.pathname]);

  // P4-09 — deliberate boundary: isolate `/liberty-md*` from Saksham cream / Grain.
  const isLibertyMdRoute = isLibertyMdClinicalPath(location.pathname);

  return (
    <AuthProvider>
      {/* Lenis is the single scrolling experience across the portfolio. */}
      <SmoothScroll />
      {/* Grain is portfolio-only — skip on LibertyMD so routes do not mix visual languages. */}
      {!isLibertyMdRoute && <GrainOverlay />}
      <div
        className={
          isLibertyMdRoute
            ? 'min-h-screen bg-[image:var(--libertymd-surface-wash)] font-sans text-libertymd-ink selection:bg-libertymd-blue-50 selection:text-libertymd-ink'
            : 'min-h-screen bg-[#F5F2EB] font-sans text-[#2C2A26] selection:bg-[#D6D1C7] selection:text-[#2C2A26]'
        }
      >
        {location.pathname === '/' && <Navbar onNavClick={handleNavClick} activeSection={activeSection} />}


        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/liberty-md" element={
              <Suspense fallback={<LibertyMDLoadingFallback />}>
                <LibertyMDApp />
              </Suspense>
            } />
            {/* P3-06 — topic path preferred paid destination; same App chrome. */}
            <Route path="/liberty-md/t/:topicSlug" element={
              <Suspense fallback={<LibertyMDLoadingFallback />}>
                <LibertyMDApp />
              </Suspense>
            } />
            <Route path="/liberty-md/chat" element={
              <Suspense fallback={<LibertyMDLoadingFallback />}>
                <LibertyMDChat />
              </Suspense>
            } />
            {/* P5-REPORT — dedicated report surface. Declared BEFORE the bare
                /report redeem route so the id segment is not swallowed. */}
            <Route path="/liberty-md/report/:consultationId" element={
              <Suspense fallback={<LibertyMDLoadingFallback />}>
                <LibertyMDReportPage />
              </Suspense>
            } />
            <Route path="/liberty-md/report" element={
              <Suspense fallback={<LibertyMDLoadingFallback />}>
                <LibertyMDReportRedeemPage />
              </Suspense>
            } />
            <Route path="/liberty-md/checkin/unsubscribe" element={
              <Suspense fallback={<LibertyMDLoadingFallback />}>
                <LibertyMDFollowupUnsubscribePage />
              </Suspense>
            } />
            <Route path="/liberty-md/checkin" element={
              <Suspense fallback={<LibertyMDLoadingFallback />}>
                <LibertyMDFollowupCheckinPage />
              </Suspense>
            } />
            <Route path="/portfolio" element={
              <Suspense fallback={<LoadingFallback />}>
                <PortfolioPage />
              </Suspense>
            } />
            <Route path="/ticketflow" element={
              <Suspense fallback={<LoadingFallback />}>
                <TicketflowApp onBack={() => navigate('/#work')} />
              </Suspense>
            } />
            <Route path="/insightslm" element={
              <Suspense fallback={<LoadingFallback />}>
                <InsightsLMApp onBack={() => navigate('/project/insightslm')} />
              </Suspense>
            } />
            <Route path="/runner" element={
              <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-black text-white">Loading Game...</div>}>
                <RunnerApp onBack={() => navigate('/project/runner')} />
              </Suspense>
            } />
            <Route path="/health-twin" element={
              <Suspense fallback={<LoadingFallback />}>
                <TwinLanding />
              </Suspense>
            } />
            <Route path="/health-twin/:id" element={
              <Suspense fallback={<LoadingFallback />}>
                <HealthTwinDashboard />
              </Suspense>
            } />
            <Route path="/health-twin/:id/playground" element={
              <Suspense fallback={<LoadingFallback />}>
                <PlaygroundLayout />
              </Suspense>
            } />
            <Route path="/mind-coach" element={
              <Suspense fallback={<LoadingFallback />}>
                <MindCoachLanding />
              </Suspense>
            } />
            <Route path="/mind-coach/login" element={
              <Suspense fallback={<LoadingFallback />}>
                <Login title="Mind Coach" subtitle="Log in to start your wellness journey" redirectPath="/mind-coach" />
              </Suspense>
            } />
            <Route path="/mind-coach/:profileId" element={
              <Suspense fallback={<LoadingFallback />}>
                <MindCoachApp />
              </Suspense>
            } />
            <Route path="/project/:id" element={<ProjectPage />} />
            <Route path="/medical-benchmark" element={
              <Suspense fallback={<LoadingFallback />}>
                <MedicalBenchmarkApp onBack={() => navigate('/#work')} />
              </Suspense>
            } />
            <Route path="/ai-gate" element={
              <Suspense fallback={<LoadingFallback />}>
                <AIGatingApp onBack={() => navigate('/#work')} />
              </Suspense>
            } />
            
            {/* Unity Card Demo Routes */}
            <Route path="/unity-card" element={
              <Suspense fallback={<LoadingFallback />}>
                <UnityCardLanding />
              </Suspense>
            } />
            <Route path="/unity-card/onboarding" element={
              <Suspense fallback={<LoadingFallback />}>
                <UnityCardOnboarding />
              </Suspense>
            } />
            <Route path="/unity-card/dashboard" element={
              <Suspense fallback={<LoadingFallback />}>
                <UnityCardDashboard />
              </Suspense>
            } />

            {/* Trading Agents Routes */}
            <Route path="/trading-agents" element={
              <Suspense fallback={<LoadingFallback />}>
                <TradingAgentsApp onBack={() => navigate('/#work')} />
              </Suspense>
            } />

            <Route path="/fno-copilot" element={
              <Suspense fallback={<LoadingFallback />}>
                <FnOCopilotApp />
              </Suspense>
            } />
            <Route path="/fno-copilot/agent" element={
              <Suspense fallback={<LoadingFallback />}>
                <FnOCopilotApp initialWorkspaceMode="agent" />
              </Suspense>
            } />

            {/* AI Care Routes */}
            <Route path="/ai-care" element={
              <Suspense fallback={<LoadingFallback />}>
                <AICareLanding />
              </Suspense>
            } />
            <Route path="/ai-care/profile" element={
              <Suspense fallback={<LoadingFallback />}>
                <AICareProfile />
              </Suspense>
            } />
            <Route path="/ai-care/chat" element={
              <Suspense fallback={<LoadingFallback />}>
                <AICareChat />
              </Suspense>
            } />
            <Route path="/ai-care/observations" element={
              <Suspense fallback={<LoadingFallback />}>
                <AICareObservations />
              </Suspense>
            } />

            {/* Unified Journal/Blog Routes */}
            <Route path="/journal" element={
              <Suspense fallback={<LoadingFallback />}>
                <BlogFeed />
              </Suspense>
            } />
            <Route path="/journal/:slug" element={
              <Suspense fallback={<LoadingFallback />}>
                <BlogPost />
              </Suspense>
            } />

            {/* Dashboard Routes */}
            <Route path="/login" element={
              <Suspense fallback={<LoadingFallback />}>
                <Login redirectPath="/dashboard" />
              </Suspense>
            } />
            <Route path="/dashboard" element={
              <Suspense fallback={<LoadingFallback />}>
                <Dashboard />
              </Suspense>
            } />
            <Route path="/dashboard/create" element={
              <Suspense fallback={<LoadingFallback />}>
                <PostEditor />
              </Suspense>
            } />
            <Route path="/dashboard/edit/:id" element={
              <Suspense fallback={<LoadingFallback />}>
                <PostEditor />
              </Suspense>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {!['/liberty-md', '/ticketflow', '/insightslm', '/login', '/medical-benchmark', '/trading-agents', '/ai-gate', '/fno-copilot'].includes(location.pathname) && !location.pathname.startsWith('/liberty-md') && !location.pathname.startsWith('/health-twin') && !location.pathname.startsWith('/mind-coach') && !location.pathname.startsWith('/unity-card') && !location.pathname.startsWith('/ai-care') && <Footer onLinkClick={handleNavClick} />}
        {!['/liberty-md', '/runner', '/medical-benchmark', '/trading-agents', '/ai-gate', '/fno-copilot'].includes(location.pathname) && !location.pathname.startsWith('/liberty-md') && !location.pathname.startsWith('/health-twin') && !location.pathname.startsWith('/mind-coach') && !location.pathname.startsWith('/unity-card') && !location.pathname.startsWith('/ai-care') && <Assistant />}
      </div>
    </AuthProvider>
  );
}

export default App;
