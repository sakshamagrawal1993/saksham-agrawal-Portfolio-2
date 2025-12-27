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

const PortfolioPage = lazy(() => import('./components/PortfolioPage'));

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
      rootMargin: '-20% 0px -60% 0px', // Trigger when section hits top 20% of viewport
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
            'work': 'Products',
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
        targetId === 'work' ? 'Products' :
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
            <Route path="/project/:id" element={<ProjectPage />} />

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

        {!['/ticketflow', '/insightslm', '/login'].includes(location.pathname) && <Footer onLinkClick={handleNavClick} />}
        {location.pathname !== '/runner' && <Assistant />}
      </div>
    </AuthProvider>
  );
}

export default App;