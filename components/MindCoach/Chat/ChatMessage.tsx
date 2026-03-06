import React from 'react';
import { motion } from 'framer-motion';
import type { ChatMessage as ChatMessageType } from '../../../store/mindCoachStore';
import { DynamicVideoRenderer } from '../DynamicContent/DynamicVideoRenderer';
import { DynamicGameRenderer } from '../DynamicContent/DynamicGameRenderer';
import { DynamicAssessmentRenderer } from '../DynamicContent/DynamicAssessmentRenderer';

interface ChatMessageProps {
  message: ChatMessageType;
  therapistColor: string;
  therapistInitial: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  therapistColor,
  therapistInitial,
}) => {
  const isUser = message.role === 'user';
  if (message.role === 'system') return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {!isUser && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 mt-1"
          style={{ backgroundColor: therapistColor }}
        >
          {therapistInitial}
        </div>
      )}

      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${isUser
            ? 'bg-[#6B8F71] text-white rounded-br-md'
            : 'bg-white text-[#2C2A26] border border-[#E8E4DE] rounded-bl-md'
          }`}
      >
        {message.content}
      </div>

      {!isUser && message.dynamic_content && (
        <div className="w-full mt-1 mb-2">
          {message.dynamic_content.type === 'video' && (
            <DynamicVideoRenderer payload={message.dynamic_content.payload} />
          )}
          {message.dynamic_content.type === 'game' && (
            <DynamicGameRenderer payload={message.dynamic_content.payload} />
          )}
          {message.dynamic_content.type === 'assessment' && (
            <DynamicAssessmentRenderer payload={message.dynamic_content.payload} />
          )}
        </div>
      )}
    </motion.div>
  );
};
