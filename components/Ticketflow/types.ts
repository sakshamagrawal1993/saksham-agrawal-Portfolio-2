export type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

export interface Remark {
    id: string;
    ticket_id?: string;
    author: string;
    text: string;
    timestamp: number; // BigInt in SQL, number (epoch) in JS
    type: 'comment' | 'action';
}

export interface TicketAction {
    id: string;
    action: string;
    timestamp: number;
    actor: string;
}

export interface Ticket {
    id: string;
    title: string;
    description: string;
    customer_name?: string; // New field
    status: TicketStatus;
    createdAt: number; // BigInt -> number
    updatedAt: number;
    remarks: Remark[];
    actions: TicketAction[]; // We will derive this from the 'remarks' table where type='action'
}
