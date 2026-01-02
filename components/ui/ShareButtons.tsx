import React, { useState } from 'react';
import { Twitter, Linkedin, Link2, Check } from 'lucide-react';

interface ShareButtonsProps {
    title: string;
    url?: string;
}

const ShareButtons: React.FC<ShareButtonsProps> = ({ title, url = window.location.href }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const shareOnTwitter = () => {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, '_blank');
    };

    const shareOnLinkedin = () => {
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
    };

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-gray mr-2">Share</span>
            <button
                onClick={shareOnTwitter}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-brand-dark transition-colors"
                title="Share on X (Twitter)"
            >
                <Twitter className="w-4 h-4" />
            </button>
            <button
                onClick={shareOnLinkedin}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-brand-dark transition-colors"
                title="Share on LinkedIn"
            >
                <Linkedin className="w-4 h-4" />
            </button>
            <button
                onClick={handleCopy}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-brand-dark transition-colors"
                title="Copy Link"
            >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Link2 className="w-4 h-4" />}
            </button>
        </div>
    );
};

export default ShareButtons;
