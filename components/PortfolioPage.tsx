/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Navbar from './Navbar';
import ProductGrid from './ProductGrid';
import Footer from './Footer';
import { useNavigate } from 'react-router-dom';

const PortfolioPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#F5F2EB]">
            <Navbar
                onNavClick={(e, targetId) => {
                    e.preventDefault();
                    if (targetId === 'work') return; // stay here
                    navigate(`/#${targetId}`);
                }}
                activeSection="Portfolio"
            />
            <div className="pt-24"> {/* Offset for Fixed Navbar */}
                <ProductGrid
                    onProductClick={(p) => navigate(`/project/${p.id}`)}
                    featuredOnly={false}
                />
            </div>
            <Footer
                onLinkClick={(e, targetId) => {
                    e.preventDefault();
                    navigate(`/#${targetId}`);
                }}
            />
        </div>
    );
};

export default PortfolioPage;
