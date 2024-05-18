"use client";

import {Companion, Message} from "@prisma/client";

import {ChatHeader} from "./chat-header";

interface ChatClientProps {
    companion: Companion & {
        messages: Message[];
        _count: {
            messages: number;
        };
    };
}

export const ChatClient = ({companion}: ChatClientProps) => {
    return (
        <div>
            <ChatHeader companion={companion} />
        </div>
    );
};