import {redirect} from "next/navigation";
import {auth, redirectToSignIn} from "@clerk/nextjs";

import prismadb from "@/lib/prismadb";
import {ChatClient} from "./_components/client";

interface ChatIdPageProps {
    params: {
        chatId: string;
    };
}

const ChatIdPage = async ({params}: ChatIdPageProps) => {
    const {userId} = auth();

    if (!userId) {
        return redirectToSignIn();
    }

    const companion = await prismadb.companion.findUnique({
        where: {
            id: params.chatId
        },
        include: {
            messages: {
                where: {
                    userId
                },
                orderBy: {
                    createdAt: "asc"
                }
            },
            _count: {
                select: {
                    messages: true
                }
            }
        }
    });

    if (!companion) {
        return redirect("/");
    }

    return (
        <div className="flex flex-col h-full p-4 space-y-2">
            <ChatClient companion={companion} />
        </div>
    );
};

export default ChatIdPage;