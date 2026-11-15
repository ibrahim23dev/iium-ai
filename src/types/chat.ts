export type ModelId = string;
export type Attachment = { id: string; name: string; type: string; url: string; size: number };
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  feedback?: "up" | "down";
};
export type Conversation = { id: string; title: string; updatedAt: number; model: ModelId; messages: Message[] };
