// SoloAI Inbox Types

export type SenderType = 'customer' | 'ai' | 'agent' | 'system';

export type MessageType = 'text' | 'image' | 'audio';

export type ChatStatus = 'active' | 'bot_handling' | 'human_handling';

export interface Message {
  id: string;
  content: string;
  type: MessageType;
  sender: SenderType;
  senderName?: string;
  timestamp: Date;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document';
}

export interface ChatSession {
  id: string;
  leadId?: string;
  customerName: string;
  customerPhone: string;
  customerAvatar?: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  status: ChatStatus;
  isOnline?: boolean;
  tags: string[];
  crmData: {
    value: number;
    stage: string;
    notes: string;
    email?: string;
    company?: string;
    position?: string;
  };
  messages: Message[];
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
}
