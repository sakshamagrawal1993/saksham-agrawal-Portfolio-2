/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import ProductGrid from './components/ProductGrid';
import About from './components/About';
import Experience from './components/Experience';
import Journal from './components/Journal';
import Assistant from './components/Assistant';
import Footer from './components/Footer';
import ProductDetail from './components/ProductDetail';
import JournalDetail from './components/JournalDetail';
import TicketflowApp from './components/Ticketflow/TicketflowApp';
import { PROJECTS, JOURNAL_ARTICLES } from './constants';

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
        if (p.id === 'ticketflow') {
          navigate('/ticketflow');
        } else {
          navigate(`/project/${p.id}`);
        }
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

  // Double check if it's ticketflow redirect (redundant if using /ticketflow route but safe)
  if (project.id === 'ticketflow') {
    return <Navigate to="/ticketflow" replace />;
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

function JournalPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const article = JOURNAL_ARTICLES.find(a => a.id === Number(id));

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
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#F5F2EB] font-sans text-[#2C2A26] selection:bg-[#D6D1C7] selection:text-[#2C2A26]">
      <Navbar onNavClick={handleNavClick} />

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/ticketflow" element={<TicketflowApp onBack={() => navigate('/#work')} />} />
          <Route path="/project/:id" element={<ProjectPage />} />
          <Route path="/journal/:id" element={<JournalPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Footer onLinkClick={handleNavClick} />
      <Assistant />
    </div>
  );
}

export default App;