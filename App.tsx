/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Analytics from './services/analytics';
import Hero from './components/Hero';
import ProductGrid from './components/ProductGrid';
import About from './components/About';
import Experience from './components/Experience';
import Journal from './components/Journal';
import Assistant from './components/Assistant';
import Footer from './components/Footer';
import ProductDetail from './components/ProductDetail';

// import JournalLanding from './components/JournalLanding'; // Removed for unification
import BlogFeed from './components/blog/BlogFeed';
import BlogPost from './components/blog/BlogPost';
import Dashboard from './components/dashboard/Dashboard';
import Login from './components/auth/Login';
import PostEditor from './components/dashboard/PostEditor';
import TicketflowApp from './components/Ticketflow/TicketflowApp';
import InsightsLMApp from './components/InsightsLM/InsightsLMApp';
import { PROJECTS } from './constants';

const RunnerApp = lazy(() => import('./components/Runner/RunnerApp'));

function HomePage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('About');

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '-50% 0px -50% 0px', // Trigger when section is in the middle of viewport
      threshold: 0
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          if (id === 'about') setActiveSection('About');
          if (id === 'work') setActiveSection('Products');
          if (id === 'journal') setActiveSection('Journal');
          if (id === 'contact') setActiveSection('Contact');
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    const sections = document.querySelectorAll('section[id], footer[id]');
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <Hero />
      <About />
      <Experience />
      <ProductGrid onProductClick={(p) => navigate(`/project/${p.id}`)} />
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
      rootMargin: '-40% 0px -40% 0px', // Center of screen
      threshold: 0
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          // Map ID to Nav Item Name
          const map: Record<string, string> = {
            'about': 'About',
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
    <div className="min-h-screen bg-[#F5F2EB] font-sans text-[#2C2A26] selection:bg-[#D6D1C7] selection:text-[#2C2A26]">
      {!['/ticketflow', '/insightslm', '/login'].includes(location.pathname) && <Navbar onNavClick={handleNavClick} activeSection={activeSection} />}


      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/ticketflow" element={<TicketflowApp onBack={() => navigate('/#work')} />} />
          <Route path="/insightslm" element={<InsightsLMApp onBack={() => navigate('/project/insightslm')} />} />
          <Route path="/runner" element={
            <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-black text-white">Loading Game...</div>}>
              <RunnerApp onBack={() => navigate('/project/runner')} />
            </Suspense>
          } />
          <Route path="/project/:id" element={<ProjectPage />} />

          {/* Unified Journal/Blog Routes */}
          <Route path="/journal" element={<BlogFeed />} />
          <Route path="/journal/:slug" element={<BlogPost />} />

          {/* Dashboard Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/create" element={<PostEditor />} />
          <Route path="/dashboard/edit/:id" element={<PostEditor />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {!['/ticketflow', '/insightslm', '/login'].includes(location.pathname) && <Footer onLinkClick={handleNavClick} />}
      {location.pathname !== '/runner' && <Assistant />}
    </div>
  );
}

export default App;