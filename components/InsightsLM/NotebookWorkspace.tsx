import React from 'react';
import NotebookLayout from './Workspace/NotebookLayout';

interface NotebookWorkspaceProps {
    notebookId: string;
    notebookTitle: string;
    onClose: () => void;
    onLogout: () => void;
}

const NotebookWorkspace: React.FC<NotebookWorkspaceProps> = ({ notebookTitle, onClose, onLogout }) => {
    return (
        <NotebookLayout
            notebookTitle={notebookTitle}
            onBack={onClose}
            onLogout={onLogout}
        />
    );
};

export default NotebookWorkspace;
