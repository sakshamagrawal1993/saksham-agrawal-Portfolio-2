import React from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage as ChatMessageType } from '../../../store/mindCoachStore';
import { DynamicVideoRenderer } from '../DynamicContent/DynamicVideoRenderer';
import { DynamicGameRenderer } from '../DynamicContent/DynamicGameRenderer';
import { DynamicAssessmentRenderer } from '../DynamicContent/DynamicAssessmentRenderer';
import { DynamicExerciseTrigger } from '../DynamicContent/DynamicExerciseTrigger';

interface ChatMessageProps {
  message: ChatMessageType;
  therapistColor: string;
  therapistInitial: string;
  avatarUrl?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  therapistColor,
  therapistInitial,
  avatarUrl,
}) => {
  const isUser = message.role === 'user';
  if (message.role === 'system') return null;

  const bubbleTone = isUser
    ? 'bg-[#6B8F71] text-white rounded-br-md'
    : 'bg-white text-[#2C2A26] border border-[#E8E4DE] rounded-bl-md';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {!isUser && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden shrink-0 mt-1"
          style={{ backgroundColor: therapistColor }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={therapistInitial} className="w-full h-full object-cover" />
          ) : (
            <span className="text-white text-xs font-semibold">{therapistInitial}</span>
          )}
        </div>
      )}

      {isUser ? (
        <div
          className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${bubbleTone}`}
        >
          {message.content}
        </div>
      ) : (
        <div className="flex min-w-0 max-w-[75%] flex-col gap-4">
          <div
            className={`w-fit max-w-full rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${bubbleTone}`}
          >
            <div className="text-[#2C2A26] [&_h1]:my-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-sm [&_h2]:font-semibold [&_p]:my-2 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          </div>
          {message.dynamic_content && (
            <div className="w-full">
              {message.dynamic_content.type === 'video' && (
                <DynamicVideoRenderer payload={message.dynamic_content.payload} />
              )}
              {message.dynamic_content.type === 'game' && (
                <DynamicGameRenderer payload={message.dynamic_content.payload} />
              )}
              {message.dynamic_content.type === 'assessment' && (
                <DynamicAssessmentRenderer payload={message.dynamic_content.payload} />
              )}
              {(message.dynamic_content.type === 'exercise' || message.dynamic_content.type === 'exercise_card') && (
                <DynamicExerciseTrigger
                  payload={message.dynamic_content.payload}
                  messageId={message.id}
                />
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
