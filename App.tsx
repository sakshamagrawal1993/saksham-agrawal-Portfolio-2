/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Analytics from './services/analytics';
import { AuthProvider } from './context/AuthContext';
import Hero from './components/Hero';
import ProductGrid from './components/ProductGrid';
import About from './components/About';
import Experience from './components/Experience';
import Journal from './components/Journal';
import Assistant from './components/Assistant';
import Footer from './components/Footer';
import ProductDetail from './components/ProductDetail';
import { PROJECTS } from './constants';

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

const UnityCardLanding = lazy(() => import('./components/UnityCard/UnityCardLanding'));
const UnityCardOnboarding = lazy(() => import('./components/UnityCard/UnityCardOnboarding'));
const UnityCardDashboard = lazy(() => import('./components/UnityCard/UnityCardDashboard'));

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#F5F2EB] font-serif italic text-[#2C2A26]/50">
    Loading...
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
  const project = PROJECTS.find((p) => p.id === id);

  if (!project) {
    return <Navigate to="/" replace />;
  }

  return (
    <ProductDetail
      project={project}
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

  return (
    <AuthProvider>
      <div className="min-h-screen bg-[#F5F2EB] font-sans text-[#2C2A26] selection:bg-[#D6D1C7] selection:text-[#2C2A26]">
        {location.pathname === '/' && <Navbar onNavClick={handleNavClick} activeSection={activeSection} />}


        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
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
                <Login />
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

        {!['/ticketflow', '/insightslm', '/login', '/medical-benchmark'].includes(location.pathname) && !location.pathname.startsWith('/health-twin') && !location.pathname.startsWith('/mind-coach') && !location.pathname.startsWith('/unity-card') && <Footer onLinkClick={handleNavClick} />}
        {!['/runner', '/medical-benchmark'].includes(location.pathname) && !location.pathname.startsWith('/health-twin') && !location.pathname.startsWith('/mind-coach') && !location.pathname.startsWith('/unity-card') && <Assistant />}
      </div>
    </AuthProvider>
  );
}

export default App;