import React, { useEffect } from 'react';
import ProductGrid from './ProductGrid';
import Footer from './Footer';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const PortfolioPage: React.FC = () => {
    const navigate = useNavigate();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="min-h-screen bg-[#F5F2EB]">
            <div className="pt-8 md:pt-16 pb-12 px-6 md:px-12 max-w-[1800px] mx-auto">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#2C2A26] hover:opacity-60 transition-opacity mb-8"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Home
                </button>
                <div className="mt-8">
                    <ProductGrid
                        onProductClick={(p) => navigate(`/project/${p.id}`)}
                        featuredOnly={false}
                    />
                </div>
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
