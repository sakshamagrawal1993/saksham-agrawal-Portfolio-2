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
import JournalDetail from './components/JournalDetail';
import JournalLanding from './components/JournalLanding';
import TicketflowApp from './components/Ticketflow/TicketflowApp';
import InsightsLMApp from './components/InsightsLM/InsightsLMApp';
import { PROJECTS } from './constants';

const RunnerApp = lazy(() => import('./components/Runner/RunnerApp'));

function HomePage() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const targetId = location.hash.replace('#', '');
      scrollToSection(targetId);
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  const scrollToSection = (targetId: string) => {
    if (!targetId) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setTimeout(() => {
      const element = document.getElementById(targetId);
      if (element) {
        const headerOffset = 85;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - headerOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });
      }
    }, 100);
  };

  const navigate = useNavigate();

  return (
    <>
      <Hero />
      <About />
      <Experience />
      <ProductGrid onProductClick={(p) => {
        navigate(`/project/${p.id}`);
      }} />
      <Journal onArticleClick={(a) => {
        navigate(`/journal/${a.id}`);
      }} />
    </>
  );
}

function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = PROJECTS.find(p => p.id === id);

  if (!project) {
    return <Navigate to="/" replace />;
  }

  // Removed direct redirects to allow ProjectPage to render Ticketflow and InsightsLM details first

  return (
    <ProductDetail
      project={project}
      onBack={() => {
        navigate('/#work');
      }}
    />
  );
}

import { journalService } from './services/journal';
import { JournalArticle } from './types';

function JournalPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState<JournalArticle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArticle = async () => {
      if (!id) return;
      try {
        const data = await journalService.getArticle(id);
        if (data) {
          setArticle(data);
        } else {
          // navigate('/'); // Optional: redirect if not found, or show error
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchArticle();
  }, [id, navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F2EB]">Loading...</div>;
  }

  if (!article) {
    return <Navigate to="/" replace />;
  }

  return (
    <JournalDetail
      article={article}
      onBack={() => navigate('/')}
    />
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
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
      {!['/ticketflow', '/insightslm'].includes(location.pathname) && <Navbar onNavClick={handleNavClick} />}

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
          <Route path="/journal" element={<JournalLanding />} />
          <Route path="/journal/:id" element={<JournalPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {!['/ticketflow', '/insightslm'].includes(location.pathname) && <Footer onLinkClick={handleNavClick} />}
      {location.pathname !== '/runner' && <Assistant />}
    </div>
  );
}

export default App;