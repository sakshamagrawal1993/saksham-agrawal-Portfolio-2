
import React from 'react';
import RichTextEditor from './RichTextEditor';

interface PostViewerProps {
    content: any;
}

const PostViewer: React.FC<PostViewerProps> = ({ content }) => {
    return <RichTextEditor content={content} onChange={() => { }} editable={false} />;
};

export default PostViewer;
